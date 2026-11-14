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

function publicView(capture, triaged) {
  const out = {};
  for (const key of PUBLIC_FIELDS) {
    if (capture[key] !== undefined) out[key] = capture[key];
  }
  out.triaged = triaged;
  return out;
}

export async function readCaptures(options = {}) {
  const dir = options.dir || DEFAULT_DIR;
  const limit = Number.isFinite(options.limit) ? options.limit : 20;
  const only = options.only || "all";

  const captureRes = await readJSONL(join(dir, CAPTURE_FILE));
  const triageRes = await readJSONL(join(dir, TRIAGE_FILE));

  const triagedIDs = new Set(
    triageRes.rows.map((row) => row.note_id).filter(Boolean),
  );

  let items = captureRes.rows
    .filter((row) => row.note_id)
    .map((row) => publicView(row, triagedIDs.has(row.note_id)));

  if (only === "untriaged") items = items.filter((i) => !i.triaged);
  else if (only === "triaged") items = items.filter((i) => i.triaged);

  // note_id 是时间前缀的，倒序即最新在前
  items.sort((a, b) => String(b.note_id).localeCompare(String(a.note_id)));
  items = items.slice(0, limit);

  return {
    dir,
    total: captureRes.rows.length,
    triaged: triagedIDs.size,
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
