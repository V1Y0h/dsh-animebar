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
// Mac 端生成页面时会把匹配好的放送时间写到这里；读到就直接用。
// 读不到（只装了插件）时，用下面 syoboiTimes 自己算一份：
// 逻辑与 board/syoboi.py 保持一致，改动时两边都要动。
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

  let times = await readSharedTimes(dir);
  if (!Object.keys(times).length) {
    try {
      // 只装了插件：自己算一份（结果缓存 6 小时）
      times = await syoboiTimes(dir, calendar.flatMap((d) => d?.items ?? []));
    } catch {
      times = {}; // 取不到就不显示，不影响其他功能
    }
  }
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


// ---------- 只装插件时的自给路径 ----------
// しょぼいカレンダー 只返回 XML（没有 JSON 选项），结构简单，用正则取字段。
const SYOBOI = "https://cal.syoboi.jp/db.php";
const SYOBOI_UA = { "user-agent": "dsh-animebar/0.7 (+https://github.com/V1Y0h/dsh-animebar)" };

function xmlUnescape(text) {
  return String(text || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function xmlBlocks(xml, tag) {
  return [...String(xml).matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1]);
}

function xmlText(block, tag) {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(block || "");
  return m ? xmlUnescape(m[1]).trim() : "";
}

async function syoboiGet(query) {
  const res = await fetch(`${SYOBOI}?${query}`, { headers: SYOBOI_UA });
  if (!res.ok) throw new Error(`Syoboi ${res.status}`);
  return res.text();
}

function normTitle(text) {
  return [...String(text || "")].filter((ch) => /[0-9a-z\u3040-\u30ff\u4e00-\u9fff]/i.test(ch)).join("").toLowerCase();
}

// 与 Python 端一致的匹配：完全相等优先，其次长度接近的包含关系
function matchTitle(table, name) {
  const key = normTitle(name);
  if (!key || key.length < 4) return null;
  if (table[key]) return table[key];
  let best = null;
  for (const [other, value] of Object.entries(table)) {
    if (other.length < 5) continue;
    if (other.includes(key) || key.includes(other)) {
      if (Math.abs(key.length - other.length) <= 3) {
        if (!best || other.length > best[2].length) best = [value[0], value[1], other];
      }
    }
  }
  return best ? [best[0], best[1]] : null;
}

async function syoboiTimes(dir, items) {
  const cachePath = join(dir, "syoboi-js.json");
  let cache = {};
  try {
    cache = JSON.parse(await readFile(cachePath, "utf8"));
  } catch {
    cache = {};
  }
  const now = Date.now();

  if (!cache.titles || now - (cache.titles_at || 0) > 7 * 86400000) {
    const xml = await syoboiGet("Command=TitleLookup&TID=*&Fields=TID,Title");
    const table = {};
    for (const block of xmlBlocks(xml, "TitleItem")) {
      const tid = xmlText(block, "TID");
      const title = xmlText(block, "Title");
      if (tid && title) table[normTitle(title)] = [tid, title];
    }
    cache.titles = table;
    cache.titles_at = now;
  }

  // 标题匹配
  const matched = {};
  for (const it of items) {
    const hit = matchTitle(cache.titles, it.name || it.name_cn || "");
    if (hit) matched[String(it.id)] = { tid: hit[0], title: hit[1], wd: it.air_weekday };
  }
  const tids = [...new Set(Object.values(matched).map((m) => m.tid))];
  if (!tids.length) return {};

  // 首播频道：FirstCh 是频道名，节目里是 ChID，必须反查
  let firstCh = cache.first_ch || {};
  if (now - (cache.first_ch_at || 0) > 7 * 86400000) {
    const chunks = [];
    for (let i = 0; i < tids.length; i += 90) chunks.push(tids.slice(i, i + 90).join(","));
    firstCh = {};
    for (const chunk of chunks) {
      const xml = await syoboiGet(`Command=TitleLookup&TID=${chunk}&Fields=TID,FirstCh`);
      for (const block of xmlBlocks(xml, "TitleItem")) {
        const tid = xmlText(block, "TID");
        const ch = xmlText(block, "FirstCh");
        if (tid && ch && ch !== "0") firstCh[tid] = ch;
      }
    }
    cache.first_ch = firstCh;
    cache.first_ch_at = now;
  }

  let channels = cache.channels || {};
  if (!Object.keys(channels).length) {
    const xml = await syoboiGet("Command=ChLookup&Fields=ChID,ChName");
    channels = {};
    for (const block of xmlBlocks(xml, "ChItem")) {
      const id = xmlText(block, "ChID");
      const name = xmlText(block, "ChName");
      if (id && name) channels[id] = name;
    }
    cache.channels = channels;
  }
  const chIds = Object.fromEntries(Object.entries(channels).map(([id, name]) => [name, id]));

  // 未来两周的节目
  const start = new Date(now - 8 * 86400000);
  const end = new Date(now + 20 * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, "") + "_000000";
  const progXml = await syoboiGet(
    `Command=ProgLookup&TID=${tids.join(",")}&Range=${fmt(start)}-${fmt(end)}&Fields=TID,StTime,ChID`,
  );
  const progs = {};
  for (const block of xmlBlocks(progXml, "ProgItem")) {
    const tid = xmlText(block, "TID");
    const st = xmlText(block, "StTime");
    const chid = xmlText(block, "ChID");
    if (tid && st) (progs[tid] = progs[tid] || []).push({ st, chid });
  }

  const entries = {};
  for (const [bgmId, m] of Object.entries(matched)) {
    const main = chIds[firstCh[m.tid]];
    let rows = (progs[m.tid] || []).slice().sort((a, b) => a.st.localeCompare(b.st));
    if (main) {
      const onlyMain = rows.filter((r) => r.chid === main);
      if (onlyMain.length) rows = onlyMain;
    }
    const nowKey = new Date().toISOString().slice(0, 19).replace("T", " ");
    const next = rows.find((r) => r.st >= nowKey);
    if (!next) continue;
    const when = new Date(next.st.replace(" ", "T") + "+09:00");
    if (Number.isNaN(when.getTime())) continue;
    // JS 的 getDay 是 0=周日，ISO 是 1=周一
    const wd = when.getDay() === 0 ? 7 : when.getDay();
    // 与 Bangumi 的星期不一致就不显示：宁可少一行，也不要两条矛盾信息
    if (m.wd && wd !== m.wd) continue;
    entries[bgmId] = {
      time: `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`,
      channel: channels[next.chid] || "",
      weekday: wd,
      title: m.title,
    };
  }

  try {
    cache.entries = entries;
    cache.entries_at = now;
    await mkdir(dir, { recursive: true });
    await writeFile(cachePath, JSON.stringify(cache), "utf8");
  } catch {
    // 缓存写不进去不影响本次显示
  }
  return entries;
}
