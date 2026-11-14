import { defineTool } from "@deepseek-ai/dsh-tools";
import { readCaptures } from "./captures.js";
import { buildTriageRecord, appendTriageRecord } from "./triage.js";

const MAX_TRIAGE_BODY = 256 * 1024;

function readBody(req, limitBytes = MAX_TRIAGE_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

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

  // 复盘写入走宿主路由，不经过模型：
  // my_take / speculations 属于 private，一旦作为工具参数就会进云端上下文。
  // 这里用 ctx.inject 而不是写进 inject，是为了在没有 webServer 的 profile 里
  // 插件仍能提供 anime_today / anime_captures，而不是整体失活。
  ctx.inject(["webServer"], (webCtx) => {
    webCtx.webServer.register({
      kind: "exact",
      path: "/animebar/triage",
      handler: async (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "只接受 POST" }));
          return;
        }
        try {
          const raw = await readBody(req);
          const body = JSON.parse(raw || "{}");
          const record = buildTriageRecord(body);
          await appendTriageRecord(record, config?.dataDir || undefined);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true, note_id: record.note_id }));
        } catch (err) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
        }
      },
    });
  });
}
