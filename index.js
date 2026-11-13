import { defineTool } from "@deepseek-ai/dsh-tools";

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
}
