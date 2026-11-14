// 读取 Mac 端写入的捕获记录，并与 DSH 侧的复盘记录按 note_id 合并。
//
// 数据模型（方案 C）：
//   creation-log.jsonl  Mac 端唯一写入，只追加，内容是「捕获」
//   triage.jsonl        DSH 端唯一写入，只追加，内容是「复盘」
// 两个文件互不覆盖，读时按 note_id 合并。
//
// 隐私车道：my_take / speculations / evidence 属于 private，
// 永远不进入这个模块的返回值，也就不可能进模型上下文。

import { readFile, appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_DIR = join(
  homedir(),
  "Library",
  "Application Support",
  "AnimeBar",
);

export const CAPTURE_FILE = "creation-log.jsonl";
export const TRIAGE_FILE = "triage.jsonl";
// 删除墓碑：DSH 自己写的文件，永远不去改 Mac 的 creation-log.jsonl
export const DELETES_FILE = "capture-deletes.jsonl";
// Mac 版也能复盘，写自己的文件；两边按时间戳后写覆盖（LWW）合并
export const TRIAGE_MAC_FILE = "triage-mac.jsonl";
export const DELETES_MAC_FILE = "capture-deletes-mac.jsonl";

// 把两个 triage 文件的行合成「每条捕获最终是否复盘、用哪条记录」
function mergeTriageRows(rows) {
  const latest = new Map();
  for (const row of rows) {
    if (!row || !row.note_id) continue;
    const ts = Date.parse(row.triaged_at || row.cleared_at || "") || 0;
    const current = latest.get(row.note_id);
    if (!current || ts >= current.ts) latest.set(row.note_id, { ts, row });
  }
  const out = new Map();
  for (const [id, entry] of latest) {
    out.set(id, entry.row.cleared === true ? null : entry.row);
  }
  return out;
}

// 允许出现在工具返回值里的字段（public-safe）
const PUBLIC_FIELDS = [
  "note_id",
  "created_at",
  "source",
  "title",
  "episode",
  "scope",
  "t_start",
  "status",
  "phenomena",
];

// 明确列出来，就是为了让「这些字段不能外传」这件事在代码里看得见
const PRIVATE_FIELDS = ["my_take", "speculations", "evidence"];

async function readJSONL(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return { rows: [], missing: true };
  }
  const rows = [];
  let bad = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const row = JSON.parse(line);
      if (row && typeof row === "object") rows.push(row);
    } catch {
      bad += 1; // 坏行跳过，不让一行脏数据毁掉整次读取
    }
  }
  return { rows, missing: false, bad };
}

function publicView(capture, triage) {
  const out = {};
  for (const key of PUBLIC_FIELDS) {
    if (capture[key] !== undefined) out[key] = capture[key];
  }
  // 复盘时补的现象标签覆盖捕获时的空数组，否则「按标签检索」查不到东西
  if (triage && Array.isArray(triage.phenomena)) out.phenomena = triage.phenomena;
  out.triaged = !!triage;
  return out;
}

export async function readCaptures(options = {}) {
  const dir = options.dir || DEFAULT_DIR;
  const limit = Number.isFinite(options.limit) ? options.limit : 20;
  const only = options.only || "all";

  const captureRes = await readJSONL(join(dir, CAPTURE_FILE));
  const triageRes = await readJSONL(join(dir, TRIAGE_FILE));
  const triageMacRes = await readJSONL(join(dir, TRIAGE_MAC_FILE));
  const deleteRes = await readJSONL(join(dir, DELETES_FILE));
  const deleteMacRes = await readJSONL(join(dir, DELETES_MAC_FILE));
  const deletedIDs = new Set(
    deleteRes.rows.concat(deleteMacRes.rows)
      .map((row) => row && row.note_id)
      .filter(Boolean),
  );

  const merged = mergeTriageRows(triageRes.rows.concat(triageMacRes.rows));
  const triageByID = new Map();
  for (const [id, row] of merged) {
    if (row) triageByID.set(id, row);
  }

  let items = captureRes.rows
    .filter((row) => row.note_id && !deletedIDs.has(row.note_id))
    .map((row) => publicView(row, triageByID.get(row.note_id)));

  const totalVisible = items.length;

  if (only === "untriaged") items = items.filter((i) => !i.triaged);
  else if (only === "triaged") items = items.filter((i) => i.triaged);

  // note_id 是时间前缀的，倒序即最新在前
  items.sort((a, b) => String(b.note_id).localeCompare(String(a.note_id)));
  items = items.slice(0, limit);

  return {
    dir,
    total: totalVisible,
    // 只数「有对应捕获」的复盘：triage.jsonl 里可能有孤儿行
    // （例如手工 POST 的测试 note_id），算进来会虚高
    triaged: items.filter((i) => i.triaged).length,
    returned: items.length,
    missing: {
      capture: captureRes.missing ? CAPTURE_FILE : null,
      triage: triageRes.missing && triageMacRes.missing ? TRIAGE_FILE : null,
    },
    badLines: (captureRes.bad || 0) + (triageRes.bad || 0),
    items,
  };
}

// 删除捕获：只追加墓碑，不碰 creation-log.jsonl
export async function appendDeletedCapture(noteID, dir) {
  const id = typeof noteID === "string" ? noteID.trim() : "";
  if (!id) throw new Error("缺少 note_id");
  const target = dir || DEFAULT_DIR;
  await mkdir(target, { recursive: true });
  await appendFile(
    join(target, DELETES_FILE),
    JSON.stringify({ note_id: id, deleted_at: new Date().toISOString() }) + "\n",
    { encoding: "utf8", mode: 0o600 },
  );
}

export { PUBLIC_FIELDS, PRIVATE_FIELDS };

// 给面板用的原始视图：包含 private 字段，因为要在界面上回填编辑。
// 这条路径只走宿主路由，返回值不进模型上下文；
// 一旦被工具调用就会破坏隐私车道，所以不要把它接到任何 tool 上。
export async function readAllRaw(options = {}) {
  const dir = options.dir || DEFAULT_DIR;
  const cap = await readJSONL(join(dir, CAPTURE_FILE));
  const tri = await readJSONL(join(dir, TRIAGE_FILE));
  const triMac = await readJSONL(join(dir, TRIAGE_MAC_FILE));
  const del = await readJSONL(join(dir, DELETES_FILE));
  const delMac = await readJSONL(join(dir, DELETES_MAC_FILE));
  const deletedIDs = new Set(
    del.rows.concat(delMac.rows)
      .map((row) => row && row.note_id)
      .filter(Boolean),
  );

  const mergedTriage = mergeTriageRows(tri.rows.concat(triMac.rows));
  const triageByID = new Map();
  for (const [id, row] of mergedTriage) {
    if (row) triageByID.set(id, row);
  }

  const items = cap.rows
    .filter((row) => row && row.note_id && !deletedIDs.has(row.note_id))
    .map((row) => ({
      capture: row,
      triage: triageByID.get(row.note_id) || null,
    }));

  items.sort((a, b) =>
    String(b.capture.note_id).localeCompare(String(a.capture.note_id)),
  );

  return {
    dir,
    total: items.length,
    missing: {
      capture: cap.missing ? CAPTURE_FILE : null,
      triage: tri.missing ? TRIAGE_FILE : null,
    },
    items,
  };
}
