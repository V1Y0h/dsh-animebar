// 标签注册表：slug + kind + facet + 三语 label。
//
// 为什么不能自由输入：同一个现象三种写法（still_heavy / 静止画多 / sdawda）
// 就永远没法做确定性过滤。标签主键只认英文 stable slug，展示层再查三语 label。
//
// 存储：~/Library/Application Support/AnimeBar/tags.json
// 文件不存在时返回内置种子，不落盘（读操作不该有副作用）。

import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_DIR } from "./captures.js";

export const TAGS_FILE = "tags.json";

export const SEED_TAGS = [
  { slug: "still_heavy", kind: "phenomenon", facet: "staging", label: { zh: "静止画多", en: "Still-heavy", ja: "止め多め" } },
  { slug: "long_take", kind: "phenomenon", facet: "staging", label: { zh: "长镜头", en: "Long take", ja: "長回し" } },
  { slug: "layout_complex", kind: "phenomenon", facet: "staging", label: { zh: "构图复杂", en: "Complex layout", ja: "レイアウト複雑" } },
  { slug: "art_style_shift", kind: "phenomenon", facet: "art", label: { zh: "画风突变", en: "Art style shift", ja: "作画スタイル変化" } },
  { slug: "effects_heavy", kind: "phenomenon", facet: "art", label: { zh: "特效多", en: "Effects-heavy", ja: "エフェクト多め" } },
  { slug: "off_model", kind: "phenomenon", facet: "art", label: { zh: "走形", en: "Off-model", ja: "作画崩れ" } },
  { slug: "sound_design", kind: "phenomenon", facet: "sound", label: { zh: "音效突出", en: "Notable sound design", ja: "音響強調" } },
  { slug: "outsourcing", kind: "speculation", facet: "production", label: { zh: "疑似外包", en: "Likely outsourced", ja: "外注の疑い" } },
  { slug: "schedule_crunch", kind: "speculation", facet: "production", label: { zh: "工期紧张", en: "Schedule crunch", ja: "工程逼迫" } },
  { slug: "guest_animator", kind: "speculation", facet: "production", label: { zh: "客串原画", en: "Guest animator", ja: "ゲスト原画" } },
];

export const KINDS = ["phenomenon", "speculation"];

const SLUG_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

export function isValidSlug(slug) {
  return typeof slug === "string" && SLUG_PATTERN.test(slug);
}

export async function readTags(dir) {
  const target = dir || DEFAULT_DIR;
  let text;
  try {
    text = await readFile(join(target, TAGS_FILE), "utf8");
  } catch {
    return { source: "seed", tags: SEED_TAGS };
  }
  try {
    const parsed = JSON.parse(text);
    const tags = Array.isArray(parsed.tags) ? parsed.tags : SEED_TAGS;
    return { source: TAGS_FILE, tags };
  } catch {
    // 文件坏了就退回种子，并把问题报出去，不静默
    return { source: "seed", tags: SEED_TAGS, corrupt: TAGS_FILE };
  }
}

export async function addTag(input, dir) {
  const slug = typeof input?.slug === "string" ? input.slug.trim().toLowerCase() : "";
  if (!isValidSlug(slug)) {
    throw new Error("slug 只能是小写字母开头，含小写字母/数字/下划线，2–40 位");
  }
  const kind = KINDS.includes(input?.kind) ? input.kind : "phenomenon";
  const facet = typeof input?.facet === "string" && input.facet.trim() ? input.facet.trim() : "general";

  const current = await readTags(dir);
  const tags = current.tags.slice();
  if (tags.some((x) => x.slug === slug)) {
    return { tags, existed: true };
  }

  const label = { zh: slug, en: slug, ja: slug };
  if (input?.label && typeof input.label === "object") {
    for (const k of ["zh", "en", "ja"]) {
      if (typeof input.label[k] === "string" && input.label[k].trim()) label[k] = input.label[k].trim();
    }
  }

  tags.push({ slug, kind, facet, label });

  const target = dir || DEFAULT_DIR;
  const path = join(target, TAGS_FILE);
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify({ schema_version: 1, tags }, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(tmp, path); // 临时文件 + rename，避免写一半损坏

  return { tags, existed: false };
}
