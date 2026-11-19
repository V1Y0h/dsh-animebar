import { defineTool } from "@deepseek-ai/dsh-tools";
import { readCaptures, readAllRaw, appendDeletedCapture } from "./captures.js";
import { buildTriageRecord, buildClearRecord, appendTriageRecord } from "./triage.js";
import { readTags, addTag, deleteTag } from "./tags.js";
import { filteredCalendar } from "./schedule.js";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const name = "animebar";
export const inject = ["tools"];

// 反共识打捞：只看 Bangumi /calendar 已返回的字段，不额外请求。
// 信号含义：
//   polarized  评价撕裂（σ 高）        trainwreck 高热低分
//   blindspot  几乎无人评分            lowprofile 低分且不热
//   overlooked 及格线边缘、低关注      consensus  主流高分（打捞模式下垫底）
const SALVAGE = {
  SIGMA: 1.9,      // 标准差阈值
  MIN_VOTES: 15,   // 低于此视为盲区
  HOT_VOTES: 80,   // 高热低分的评分人数门槛
  HOT_DOING: 300,  // 或「在看」人数
  OVERLOOKED_TOP: 6.9,
  OVERLOOKED_VOTES: 80,
};

function scoreStdDev(rating) {
  const total = Number(rating?.total) || 0;
  const count = rating?.count;
  const mean = Number(rating?.score) || 0;
  if (!count || !total || total < 10) return 0;
  let sum = 0;
  for (let s = 1; s <= 10; s += 1) {
    sum += (Number(count[String(s)]) || 0) * (s - mean) ** 2;
  }
  return Math.sqrt(sum / total);
}

function classifySalvage(item) {
  const rating = item.rating || {};
  const score = Number(rating.score) || 0;
  const votes = Number(rating.total) || 0;
  const doing = Number(item.collection?.doing) || 0;
  const sigma = scoreStdDev(rating);

  if (score === 0 || votes < SALVAGE.MIN_VOTES) {
    return {
      bucket: 2, signal: "blindspot",
      reason: votes === 0 ? "暂无评分" : `仅 ${votes} 人评分 · 视线盲区`,
    };
  }
  if (sigma >= SALVAGE.SIGMA) {
    return {
      bucket: 1, signal: "polarized",
      reason: `均分 ${score.toFixed(1)} · 评价撕裂 (σ=${sigma.toFixed(2)}, ${votes}人)`,
    };
  }
  if (score < 6.0) {
    if (votes >= SALVAGE.HOT_VOTES || doing >= SALVAGE.HOT_DOING) {
      return {
        bucket: 1, signal: "trainwreck",
        reason: `低分 ${score.toFixed(1)} · ${votes}人评分 / ${doing}人在看`,
      };
    }
    return {
      bucket: 3, signal: "lowprofile",
      reason: `低分 ${score.toFixed(1)} · 关注度低 (${votes}人)`,
    };
  }
  if (score < SALVAGE.OVERLOOKED_TOP && votes < SALVAGE.OVERLOOKED_VOTES) {
    return {
      bucket: 3, signal: "overlooked",
      reason: `边缘均分 ${score.toFixed(1)} · 仅 ${votes} 人关注`,
    };
  }
  return { bucket: 4, signal: "consensus", reason: `主流共识 ${score.toFixed(1)} (${votes}人)` };
}

const CALENDAR = "https://api.bgm.tv/calendar";
const UA = "dsh-animebar/0.1 (+https://github.com/)";

async function fetchMovies(pages = 4) {
  const all = [];
  for (let page = 0; page < pages; page += 1) {
    const res = await fetch(`https://api.bgm.tv/v0/search/subjects?limit=20&offset=${page * 20}`, {
      method: "POST",
      headers: { "user-agent": UA, "content-type": "application/json" },
      body: JSON.stringify({ keyword: "劇場版", filter: { type: [2] }, sort: "heat" }),
    });
    if (!res.ok) break;
    const data = await res.json();
    const rows = data.data ?? [];
    if (rows.length === 0) break;
    all.push(...rows.map((item) => ({
      title: item.name_cn || item.name,
      score: item.rating?.score ?? 0,
      date: item.date ?? "",
      url: `https://bgm.tv/subject/${item.id}`,
    })));
  }
  return all;
}

async function fetchCalendar() {
  const res = await fetch(CALENDAR, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`Bangumi API returned ${res.status}`);
  return res.json();
}

export function apply(ctx, config) {
  const minScore = Number(config?.minScore ?? 0);
  const limit = Number(config?.limit ?? 8);

  ctx.tools.register(defineTool({
    name: "anime_today",
    description: "List every anime airing on a given weekday (default: today) from Bangumi, ranked by rating. Low-rated titles are included; raise minScore in the bundle config to filter.",
    parameters: {
      weekday: {
        type: "number",
        description: "ISO weekday, 1 = Monday through 7 = Sunday. Defaults to today. Ignored when kind is movie.",
      },
      kind: {
        type: "string",
        enum: ["tv", "movie"],
        description: "tv lists the weekly broadcast schedule; movie lists theatrical films sorted by rating.",
      },
      mode: {
        type: "string",
        enum: ["standard", "salvage"],
        description:
          "standard ranks by score. salvage surfaces ignored or controversial titles: "
          + "polarized (ratings split), trainwreck (high attention, low score), "
          + "blindspot (barely rated), lowprofile, overlooked. Each item carries signal and reason.",
      },
      hideConsensus: {
        type: "boolean",
        description: "In salvage mode, drop mainstream high-score titles so only salvaged items remain.",
      },
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
    },
    async execute(args) {
      if (args?.kind === "movie") {
        const films = (await fetchMovies())
          .filter((f) => f.score >= minScore)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
        return { kind: "movie", total: films.length, items: films };
      }
      const { calendar: data } = await filteredCalendar({ dir: config?.dataDir || undefined });
      const weekday = Number(args?.weekday) || new Date().getDay() || 7;
      const raw = data
        .filter((day) => day?.weekday?.id === weekday)
        .flatMap((day) => day.items ?? []);

      if (args?.mode === "salvage") {
        // 打捞模式：按桶排，桶内规则见 classifySalvage；不加评分下限，
        // 否则「低分但有故事」的作品第一刀就被滤掉了
        const ranked = raw.map((item) => {
          const meta = classifySalvage(item);
          return {
            title: item.name_cn || item.name,
            original: item.name_cn ? item.name : "",
            score: Number(item.rating?.score) || 0,
            votes: Number(item.rating?.total) || 0,
            doing: Number(item.collection?.doing) || 0,
            signal: meta.signal,
            reason: meta.reason,
            url: item.url,
            _bucket: meta.bucket,
            _sub: meta.signal === "blindspot" ? (item.rating?.total || 0)
              : -(item.rating?.total || 0) + (item.rating?.score || 0),
          };
        })
          .filter((item) => args?.hideConsensus ? item.signal !== "consensus" : true)
          .sort((a, b) => (a._bucket !== b._bucket ? a._bucket - b._bucket : a._sub - b._sub))
          .slice(0, limit)
          .map(({ _bucket, _sub, ...rest }) => rest);
        return { weekday, mode: "salvage", total: ranked.length, items: ranked };
      }

      const items = raw
        .map((item) => ({
          title: item.name_cn || item.name,
          original: item.name_cn ? item.name : undefined,
          score: item.rating?.score ?? 0,
          url: item.url,
        }))
        .filter((item) => item.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return { weekday, total: items.length, items };
    },
  }));

  ctx.tools.register(defineTool({
    name: "anime_captures",
    description:
      "List captures recorded from the local AnimeBar capture log (IINA and other players), newest first. Only public-safe fields are returned: timecode, source, title, episode, scope and observed phenomena. Private fields (personal reflection and speculation) are deliberately excluded and never leave the machine.",
    parameters: {
      only: {
        type: "string",
        enum: ["all", "untriaged", "triaged"],
        description: "Filter by whether a capture already has a triage entry. Defaults to all.",
      },
      limit: {
        type: "number",
        description: "Maximum number of captures to return. Defaults to 20.",
      },
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
    },
    async execute(args) {
      return readCaptures({
        dir: config?.dataDir || undefined,
        only: args?.only ?? "all",
        limit: args?.limit ?? 20,
      });
    },
  }));

  // 复盘写入 / 面板读取走宿主的 exact Fetch 路由，不经过模型：
  // my_take / speculations 属于 private，一旦作为工具参数就会进云端上下文。
  // 路径是相对 /api 的，实际地址为 /api/animebar/...
  // 用 ctx.inject 而不是写进 inject，是为了在没有 connection 服务的 profile 里
  // 插件仍能提供 anime_today / anime_captures，而不是整体失活。
  ctx.inject(["connection"], (connCtx) => {
    // 必须定义在 try 外面：下面的 tags 路由注册在 try/catch 之后，
    // 写在 try 里会导致 ReferenceError: json is not defined
    const json = (status, payload) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    try {

    connCtx.connection.fetch.register({
      path: "/api/animebar/triage",
      methods: ["POST"],
      requestBody: "buffered",
      fetch: async (request) => {
        try {
          const body = await request.json();
          const record = body && body.clear === true ? buildClearRecord(body) : buildTriageRecord(body);
          await appendTriageRecord(record, config?.dataDir || undefined);
          return json(200, { ok: true, note_id: record.note_id });
        } catch (err) {
          return json(400, { ok: false, error: String(err?.message || err) });
        }
      },
    });

    // 面板读取用：含 private 字段，供界面回填。不进模型，不要接到工具上。
    connCtx.connection.fetch.register({
      path: "/api/animebar/captures",
      methods: ["GET", "DELETE"],
      requestBody: "buffered",
      fetch: async (request) => {
        try {
          if (request.method === "DELETE") {
            const noteID = new URL(request.url, "http://localhost").searchParams.get("note_id");
            await appendDeletedCapture(noteID, config?.dataDir || undefined);
            return json(200, { ok: true });
          }
          return json(200, await readAllRaw({ dir: config?.dataDir || undefined }));
        } catch (err) {
          return json(400, { ok: false, error: String(err?.message || err) });
        }
      },
    });
    } catch (e) {
      console.error("animebar: 路由注册失败", e);
    }
    // 面板用的放送表：宿主已过滤掉非周更条目，前端不必自己拉分集数据
    connCtx.connection.fetch.register({
      path: "/api/animebar/schedule",
      methods: ["GET"],
      requestBody: "buffered",
      fetch: async () => {
        try {
          return json(200, await filteredCalendar({ dir: config?.dataDir || undefined }));
        } catch (err) {
          return json(502, { ok: false, error: String(err?.message || err) });
        }
      },
    });

    // 档案：内容由 Mac 端生成并写入共享目录，这里只读
    connCtx.connection.fetch.register({
      path: "/api/animebar/archive",
      methods: ["GET"],
      requestBody: "buffered",
      fetch: async () => {
        const dir = config?.dataDir || join(homedir(), "Library", "Application Support", "AnimeBar");
        // 优先用 Mac 端生成的最新版本；没装 App 就回落到包内快照
        for (const path of [join(dir, "shared", "madb-early.json"),
                            join(import.meta.dirname, "data", "madb-early.json")]) {
          try {
            return json(200, { ok: true, items: JSON.parse(await readFile(path, "utf8")) });
          } catch {
            // 换下一个来源
          }
        }
        return json(200, { ok: true, items: [] });
      },
    });

    // 标签注册表：面板只从 slug 里选，不自由输入
    connCtx.connection.fetch.register({
      path: "/api/animebar/tags",
      methods: ["GET", "POST", "DELETE"],
      requestBody: "buffered",
      fetch: async (request) => {
        try {
          if (request.method === "GET") {
            return json(200, await readTags(config?.dataDir || undefined));
          }
          if (request.method === "DELETE") {
            const slug = new URL(request.url, "http://localhost").searchParams.get("slug");
            const result = await deleteTag(slug, config?.dataDir || undefined);
            return json(200, { ok: true, ...result });
          }
          const body = await request.json();
          const result = await addTag(body, config?.dataDir || undefined);
          return json(200, { ok: true, ...result });
        } catch (err) {
          return json(400, { ok: false, error: String(err?.message || err) });
        }
      },
    });
  });
}
