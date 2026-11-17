// 放送表过滤：与 Mac 端同一套判定规则。
//
// Bangumi 的 /calendar 返回「作品在星期几播出」，不是「本周有没有新一集」，
// 已完结和一次性放出的作品会一直留在表里。判定只看分集数据：
//
//   一次性放出 = 所有集放送日期相同 且 总集数 > 1
//   已完结     = 收录集数 ≥ 总集数 且 最后一集日期 + 7 天 ≤ 今天
//
// 拿不到分集数据的条目保留（判不了就不删）。
// 结果缓存 6 小时，避免每次打开面板都发两百多个请求。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CALENDAR = "https://api.bgm.tv/calendar";
const UA = { "user-agent": "dsh-animebar/0.7 (+https://github.com/V1Y0h/dsh-animebar)" };
const CACHE_TTL = 6 * 3600 * 1000;

export const DEFAULT_DIR = join(homedir(), "Library", "Application Support", "AnimeBar");
const CACHE_FILE = "dsh-schedule-status.json";

const WEEKLY = "weekly";
const ENDED = "ended";
const BATCH = "batch";
const UNKNOWN = "unknown";

async function getJSON(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

function parseDate(value) {
  if (!value) return null;
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], (m[2] ? +m[2] : 1) - 1, m[3] ? +m[3] : 1));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function loadCache(dir) {
  try {
    const raw = await readFile(join(dir, CACHE_FILE), "utf8");
    const data = JSON.parse(raw);
    if (data && typeof data.entries === "object") return data;
  } catch {
    // 没有缓存是正常情况，下面的重新查询会补上
  }
  return { checked_at: 0, entries: {} };
}

async function saveCache(dir, entries) {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, CACHE_FILE),
    JSON.stringify({ checked_at: Date.now(), entries }),
    { encoding: "utf8", mode: 0o600 },
  );
}

async function classifyOne(id, today) {
  const sub = await getJSON(`https://api.bgm.tv/v0/subjects/${id}`);
  const eps = await getJSON(`https://api.bgm.tv/v0/episodes?subject_id=${id}&type=0&limit=100`);
  const data = Array.isArray(eps?.data) ? eps.data : [];
  const total = Number(sub?.total_episodes) || 0;
  const dates = data
    .map((e) => parseDate(e?.airdate))
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (!dates.length) return { kind: UNKNOWN, total, epcount: data.length };

  const first = dates[0];
  const last = dates[dates.length - 1];
  const uniqueDays = new Set(dates.map((d) => d.toISOString().slice(0, 10))).size;

  if (uniqueDays === 1 && total > 1) return { kind: BATCH, total, epcount: data.length };
  if (first > today) return { kind: UNKNOWN, total, epcount: data.length };
  const weekAfterLast = new Date(last.getTime() + 7 * 86400000);
  if (total > 0 && data.length >= total && weekAfterLast <= today) {
    return { kind: ENDED, total, epcount: data.length };
  }
  return { kind: WEEKLY, total, epcount: data.length };
}

// 返回过滤后的 Bangumi 放送表（结构不变，前端无需改动字段）
// Mac 端生成页面时会把匹配好的放送时间写到这里。
// 这里只读取，不在 JS 里重写标题匹配——两套实现必然漂移。
async function readSharedTimes(dir) {
  try {
    const raw = await readFile(join(dir, "shared", "schedule-times.json"), "utf8");
    const data = JSON.parse(raw);
    return data && typeof data.items === "object" ? data.items : {};
  } catch {
    return {};
  }
}

export async function filteredCalendar(options = {}) {
  const dir = options.dir || DEFAULT_DIR;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const calendar = await getJSON(CALENDAR);
  const ids = [];
  for (const day of calendar) {
    for (const it of day?.items ?? []) if (it?.id) ids.push(it.id);
  }

  const cache = await loadCache(dir);
  const fresh = Date.now() - (cache.checked_at || 0) < CACHE_TTL;
  const missing = ids.filter((id) => !(String(id) in cache.entries));

  if (!(fresh && missing.length === 0)) {
    const todo = options.force ? ids : missing;
    for (const id of todo) {
      try {
        cache.entries[String(id)] = await classifyOne(id, today);
      } catch {
        cache.entries[String(id)] = { kind: UNKNOWN }; // 查不到就算未知，保留
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    await saveCache(dir, cache.entries);
  }

  const times = await readSharedTimes(dir);
  const dropped = [];
  const kept = [];
  for (const day of calendar) {
    const items = [];
    for (const it of day?.items ?? []) {
      const kind = cache.entries[String(it?.id)]?.kind ?? UNKNOWN;
      if (kind === ENDED || kind === BATCH) {
        dropped.push({ id: it.id, kind });
        continue;
      }
      const syo = times[String(it?.id)];
      items.push(syo ? { ...it, syo } : it);
    }
    kept.push({ ...day, items });
  }

  return { calendar: kept, dropped: dropped.length, checked_at: cache.checked_at };
}
