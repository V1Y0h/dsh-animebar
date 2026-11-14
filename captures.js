// 读取 Mac 端写入的捕获记录，并与 DSH 侧的复盘记录按 note_id 合并。
//
// 数据模型（方案 C）：
//   creation-log.jsonl  Mac 端唯一写入，只追加，内容是「捕获」
//   triage.jsonl        DSH 端唯一写入，只追加，内容是「复盘」
// 两个文件互不覆盖，读时按 note_id 合并。
//
// 隐私车道：my_take / speculations / evidence 属于 private，
// 永远不进入这个模块的返回值，也就不可能进模型上下文。

import { readFile } from "node:fs/promises";
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

  const triageByID = new Map();
  for (const row of triageRes.rows) {
    if (!row || !row.note_id) continue;
    if (row.cleared === true) triageByID.delete(row.note_id);
    else triageByID.set(row.note_id, row);
  }

  let items = captureRes.rows
    .filter((row) => row.note_id)
    .map((row) => publicView(row, triageByID.get(row.note_id)));

  if (only === "untriaged") items = items.filter((i) => !i.triaged);
  else if (only === "triaged") items = items.filter((i) => i.triaged);

  // note_id 是时间前缀的，倒序即最新在前
  items.sort((a, b) => String(b.note_id).localeCompare(String(a.note_id)));
  items = items.slice(0, limit);

  return {
    dir,
    total: captureRes.rows.length,
    // 只数「有对应捕获」的复盘：triage.jsonl 里可能有孤儿行
    // （例如手工 POST 的测试 note_id），算进来会虚高
    triaged: items.filter((i) => i.triaged).length,
    returned: items.length,
    missing: {
      capture: captureRes.missing ? CAPTURE_FILE : null,
      triage: triageRes.missing ? TRIAGE_FILE : null,
    },
    badLines: (captureRes.bad || 0) + (triageRes.bad || 0),
    items,
  };
}

export { PUBLIC_FIELDS, PRIVATE_FIELDS };

// 给面板用的原始视图：包含 private 字段，因为要在界面上回填编辑。
// 这条路径只走宿主路由，返回值不进模型上下文；
// 一旦被工具调用就会破坏隐私车道，所以不要把它接到任何 tool 上。
export async function readAllRaw(options = {}) {
  const dir = options.dir || DEFAULT_DIR;
  const cap = await readJSONL(join(dir, CAPTURE_FILE));
  const tri = await readJSONL(join(dir, TRIAGE_FILE));

  const triageByID = new Map();
  for (const row of tri.rows) {
    if (!row || !row.note_id) continue;
    if (row.cleared === true) triageByID.delete(row.note_id);
    else triageByID.set(row.note_id, row);
  }

  const items = cap.rows
    .filter((row) => row && row.note_id)
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
