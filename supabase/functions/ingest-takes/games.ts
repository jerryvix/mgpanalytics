// Upcoming games from ESPN's public scoreboards, the candidate list the extractor
// must match each pick to. Only games that have not started are returned, so a
// pick for a game already under way or final can never be stored (D-065).

import { espnFetch } from "../_shared/espn-fetch.ts";

export type TakesSport = "NFL" | "NBA" | "NCAAF" | "NCAAB";

export interface UpcomingGame {
  id: string;
  sport: TakesSport;
  startsAt: string; // ISO
  matchup: string; // "Cavaliers at Bulls", "VCU vs Providence"
  teams: string[]; // display, short, location, name, abbreviation for both sides (lowercase)
  line: string; // one line for the prompt
}

const PATHS: Record<TakesSport, { path: string; query: string }> = {
  NFL: { path: "football/nfl", query: "" },
  NBA: { path: "basketball/nba", query: "" },
  NCAAF: { path: "football/college-football", query: "&groups=80&limit=300" },
  NCAAB: { path: "basketball/mens-college-basketball", query: "&groups=50&limit=400" },
};

const ET = "America/New_York";

function ymd(d: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return p.replaceAll("-", "");
}

export function etLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ET, weekday: "short", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso)) + " ET";
}

// deno-lint-ignore no-explicit-any
function teamWords(t: any): string[] {
  return [t?.displayName, t?.shortDisplayName, t?.location, t?.name, t?.abbreviation]
    .filter((x) => typeof x === "string" && x.length > 1)
    .map((x: string) => x.toLowerCase());
}

/** Games from now to `days` days ahead (ET dates), not yet started. */
export async function upcomingGames(sports: TakesSport[], days = 4, now = new Date()): Promise<UpcomingGame[]> {
  const dates: string[] = [];
  for (let i = 0; i < days; i++) dates.push(ymd(new Date(now.getTime() + i * 86_400_000)));
  const out: UpcomingGame[] = [];
  const seen = new Set<string>();
  await Promise.all(sports.flatMap((sport) => dates.map(async (date) => {
    const { path, query } = PATHS[sport];
    const res = await espnFetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${date}${query}`);
    if (!res.ok) return;
    const body = await res.json();
    for (const e of body.events ?? []) {
      const c = e.competitions?.[0];
      if (!c || c.status?.type?.state !== "pre") continue;
      if (Date.parse(e.date) <= now.getTime()) continue;
      const home = c.competitors?.find((x: { homeAway: string }) => x.homeAway === "home")?.team;
      const away = c.competitors?.find((x: { homeAway: string }) => x.homeAway === "away")?.team;
      if (!home || !away || seen.has(e.id)) continue;
      seen.add(e.id);
      const sep = c.neutralSite ? "vs" : "at";
      const matchup = `${away.shortDisplayName} ${sep} ${home.shortDisplayName}`;
      out.push({
        id: String(e.id),
        sport,
        startsAt: new Date(e.date).toISOString(),
        matchup,
        teams: [...teamWords(away), ...teamWords(home)],
        line: `${e.id} | ${sport} | ${etLabel(e.date)} | ${away.displayName} ${sep} ${home.displayName}`,
      });
    }
  })));
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * Pro leagues are short lists, so every game goes to the model. College lists run to
 * hundreds of games, so a college game goes only when the transcript names one of
 * its teams, which keeps the prompt small without missing a pick.
 */
export function candidatesFor(games: UpcomingGame[], transcript: string): UpcomingGame[] {
  const text = ` ${transcript.toLowerCase().replace(/[^a-z0-9&' ]+/g, " ")} `;
  return games.filter((g) => {
    if (g.sport === "NFL" || g.sport === "NBA") return true;
    return g.teams.some((w) => w.length >= 4 && text.includes(` ${w.replace(/[^a-z0-9&' ]+/g, " ")} `));
  });
}
