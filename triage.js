// 写入复盘记录（triage.jsonl）。
//
// 只追加，不重写：和 Mac 端的 creation-log.jsonl 一样保持 append-only，
// 两边各自单写、互不覆盖（方案 C）。
//
// 这个模块只会被宿主路由调用，不会出现在任何工具返回值里，
// 所以 private 字段（my_take / speculations / evidence）不会进模型上下文。

import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_DIR, TRIAGE_FILE } from "./captures.js";

export function buildTriageRecord(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("请求体必须是 JSON 对象");
  }
  const noteID = typeof body.note_id === "string" ? body.note_id.trim() : "";
  if (!noteID) throw new Error("缺少 note_id");

  const record = {
    schema_version: 1,
    note_id: noteID,
    triaged_at: new Date().toISOString(),
  };

  if (Array.isArray(body.phenomena)) {
    record.phenomena = body.phenomena.filter((x) => typeof x === "string" && x);
  }
  if (Array.isArray(body.speculations)) {
    record.speculations = body.speculations.filter(
      (x) => x && typeof x === "object" && typeof x.tag === "string",
    );
  }
  if (typeof body.my_take === "string") record.my_take = body.my_take;
  if (Array.isArray(body.evidence)) {
    record.evidence = body.evidence.filter(
      (x) => x && typeof x === "object" && typeof x.type === "string",
    );
  }
  return record;
}

// 清空复盘：追加墓碑而不是抹掉历史行，读取时后者覆盖前者
export function buildClearRecord(body) {
  const noteID = typeof body?.note_id === "string" ? body.note_id.trim() : "";
  if (!noteID) throw new Error("缺少 note_id");
  return {
    schema_version: 1,
    note_id: noteID,
    cleared_at: new Date().toISOString(),
    cleared: true,
  };
}

export async function appendTriageRecord(record, dir) {
  const target = dir || DEFAULT_DIR;
  await mkdir(target, { recursive: true });
  await appendFile(join(target, TRIAGE_FILE), JSON.stringify(record) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
}
