import { defineTool } from "@deepseek-ai/dsh-tools";

export const name = "animebar";
export const inject = ["tools"];

const CALENDAR = "https://api.bgm.tv/calendar";
const UA = "dsh-animebar/0.1 (+https://github.com/)";

async function fetchCalendar() {
  const res = await fetch(CALENDAR, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`Bangumi API returned ${res.status}`);
  return res.json();
}

export function apply(ctx, config) {
  const minScore = Number(config?.minScore ?? 7);
  const limit = Number(config?.limit ?? 8);

  ctx.tools.register(defineTool({
    name: "anime_today",
    description: "List the anime airing on a given weekday (default: today) from Bangumi, ranked by rating.",
    parameters: {
      weekday: {
        type: "number",
        description: "ISO weekday, 1 = Monday through 7 = Sunday. Defaults to today.",
      },
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
    },
    async execute(args) {
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
