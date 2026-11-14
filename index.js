import { defineTool } from "@deepseek-ai/dsh-tools";
import { readCaptures, readAllRaw, appendDeletedCapture } from "./captures.js";
import { buildTriageRecord, buildClearRecord, appendTriageRecord } from "./triage.js";
import { readTags, addTag, deleteTag } from "./tags.js";

export const name = "animebar";
export const inject = ["tools"];

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
      const data = await fetchCalendar();
      const weekday = Number(args?.weekday) || new Date().getDay() || 7;
      const items = data
        .filter((day) => day?.weekday?.id === weekday)
        .flatMap((day) => day.items ?? [])
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
