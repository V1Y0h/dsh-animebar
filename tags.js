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

export const SEED_VERSION = 2;

// 种子来自两处并成一套：复盘用的现象/推测，加上「记录」页原有的 19 个中文标签。
// 之前两边各说各话（记录页中文、复盘 slug），这里统一成 slug 主键 + 三语 label。
export const SEED_TAGS = [
  // --- 现象 ---
  { slug: "still_heavy", kind: "phenomenon", facet: "staging", label: { zh: "静止画多", en: "Many stills", ja: "静止画が多い" } },
  { slug: "long_take", kind: "phenomenon", facet: "staging", label: { zh: "长镜头", en: "Long take", ja: "長回し" } },
  { slug: "layout_complex", kind: "phenomenon", facet: "staging", label: { zh: "构图复杂", en: "Complex layout", ja: "レイアウト複雑" } },
  { slug: "repeated_shots", kind: "phenomenon", facet: "staging", label: { zh: "重复镜头", en: "Repeated shots", ja: "繰り返しカット" } },
  { slug: "standout_episode", kind: "phenomenon", facet: "staging", label: { zh: "演出神回", en: "Standout episode", ja: "神回の演出" } },
  { slug: "art_style_shift", kind: "phenomenon", facet: "art", label: { zh: "画风突变", en: "Style shift", ja: "絵柄の変化" } },
  { slug: "quality_drop", kind: "phenomenon", facet: "art", label: { zh: "精度落差", en: "Quality drop", ja: "精度の落差" } },
  { slug: "effects_heavy", kind: "phenomenon", facet: "art", label: { zh: "特效多", en: "Effects-heavy", ja: "エフェクト多め" } },
  { slug: "off_model", kind: "phenomenon", facet: "art", label: { zh: "走形", en: "Off-model", ja: "作画崩れ" } },
  { slug: "sound_design", kind: "phenomenon", facet: "sound", label: { zh: "音效突出", en: "Notable sound design", ja: "音響強調" } },
  { slug: "score_divergence", kind: "phenomenon", facet: "audience", label: { zh: "评分分歧", en: "Score divergence", ja: "評価の乖離" } },
  // --- 推测 ---
  { slug: "outsourcing", kind: "speculation", facet: "production", label: { zh: "疑似外包", en: "Suspected outsourcing", ja: "外注の可能性" } },
  { slug: "schedule_crunch", kind: "speculation", facet: "production", label: { zh: "工期紧张", en: "Schedule crunch", ja: "工期逼迫" } },
  { slug: "ad_carried", kind: "speculation", facet: "production", label: { zh: "作监尽力", en: "AD carried it", ja: "作監の踏ん張り" } },
  { slug: "producer_meddling", kind: "speculation", facet: "production", label: { zh: "资方干预", en: "Producer meddling", ja: "出資者の介入" } },
  { slug: "guest_animator", kind: "speculation", facet: "production", label: { zh: "客串原画", en: "Guest animator", ja: "ゲスト原画" } },
  // --- 评价（记录页的维度取值）---
  { slug: "worth_studying", kind: "note", facet: "art", label: { zh: "值得学习", en: "Worth studying", ja: "参考になる" } },
  { slug: "by_the_book", kind: "note", facet: "art", label: { zh: "中规中矩", en: "By the book", ja: "可もなく不可もなく" } },
  { slug: "needs_work", kind: "note", facet: "art", label: { zh: "有待提高", en: "Needs work", ja: "要改善" } },
  { slug: "clever", kind: "note", facet: "staging", label: { zh: "有巧思", en: "Clever", ja: "工夫がある" } },
  { slug: "flat", kind: "note", facet: "staging", label: { zh: "平淡", en: "Flat", ja: "平凡" } },
  { slug: "overwrought", kind: "note", facet: "staging", label: { zh: "用力过猛", en: "Overwrought", ja: "やりすぎ" } },
  { slug: "adds_value", kind: "note", facet: "sound", label: { zh: "加分项", en: "Adds value", ja: "加点" } },
  { slug: "forgettable", kind: "note", facet: "sound", label: { zh: "无感", en: "Forgettable", ja: "響かない" } },
  { slug: "breaks_immersion", kind: "note", facet: "sound", label: { zh: "出戏", en: "Breaks immersion", ja: "没入できない" } },
];

export const KINDS = ["phenomenon", "speculation", "note"];

const SLUG_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

export function isValidSlug(slug) {
  return typeof slug === "string" && SLUG_PATTERN.test(slug);
}

// 老文件没有 seed_version，合并时只补「缺的 slug」，不覆盖用户改过的
function mergeSeeds(tags, seedVersion) {
  if ((seedVersion || 1) >= SEED_VERSION) return tags;
  const have = new Set(tags.map((x) => x && x.slug));
  const merged = tags.slice();
  for (const seed of SEED_TAGS) {
    if (!have.has(seed.slug)) merged.push(seed);
  }
  return merged;
}

async function writeRegistry(tags, target) {
  const path = join(target || DEFAULT_DIR, TAGS_FILE);
  const tmp = `${path}.tmp`;
  await writeFile(
    tmp,
    JSON.stringify({ schema_version: 1, seed_version: SEED_VERSION, tags }, null, 2) + "\n",
    { encoding: "utf8", mode: 0o600 },
  );
  await rename(tmp, path); // 临时文件 + rename，避免写一半损坏
}

export async function readTags(dir) {
  const target = dir || DEFAULT_DIR;
  let text;
  try {
    text = await readFile(join(target, TAGS_FILE), "utf8");
  } catch {
    return { source: "seed", seed_version: SEED_VERSION, tags: SEED_TAGS };
  }
  try {
    const parsed = JSON.parse(text);
    const raw = Array.isArray(parsed.tags) ? parsed.tags : [];
    return {
      source: TAGS_FILE,
      seed_version: parsed.seed_version || 1,
      tags: mergeSeeds(raw, parsed.seed_version),
    };
  } catch {
    // 文件坏了就退回种子，并把问题报出去，不静默
    return { source: "seed", seed_version: SEED_VERSION, tags: SEED_TAGS, corrupt: TAGS_FILE };
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

  await writeRegistry(tags, dir);

  return { tags, existed: false };
}

export async function deleteTag(slug, dir) {
  const key = typeof slug === "string" ? slug.trim().toLowerCase() : "";
  if (!key) throw new Error("缺少 slug");
  const current = await readTags(dir);
  const tags = current.tags.filter((x) => x && x.slug !== key);
  if (tags.length === current.tags.length) {
    return { tags, removed: false };
  }
  await writeRegistry(tags, dir);
  return { tags, removed: true };
}
