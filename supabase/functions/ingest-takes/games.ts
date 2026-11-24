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
  teamIds: string[]; // ESPN team ids, away then home, for roster lookups
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
        teamIds: [String(away.id), String(home.id)],
        line: `${e.id} | ${sport} | ${etLabel(e.date)} | ${away.displayName} ${sep} ${home.displayName}`,
      });
    }
  })));
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * The teams ("NFL|28": league and ESPN id, since ids repeat across leagues) whose game
 * started between `from` (the episode's publish time) and `now`. An episode that came out before such a game most likely talked about it,
 * and that game is no longer a candidate, so a pick on one of these teams may have
 * been matched to the team's next game instead. Empty when ESPN can't be read.
 */
export async function teamsPlayedSince(sports: TakesSport[], from: Date, now = new Date()): Promise<Set<string>> {
  const out = new Set<string>();
  if (!(from.getTime() < now.getTime())) return out;
  const dates: string[] = [];
  for (let t = from.getTime(); dates.length < 6; t += 86_400_000) {
    const d = ymd(new Date(Math.min(t, now.getTime())));
    if (!dates.includes(d)) dates.push(d);
    if (t >= now.getTime()) break;
  }
  await Promise.all(sports.flatMap((sport) => dates.map(async (date) => {
    const { path, query } = PATHS[sport];
    const res = await espnFetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${date}${query}`).catch(() => null);
    if (!res?.ok) return;
    const body = await res.json().catch(() => ({}));
    for (const e of body.events ?? []) {
      const start = Date.parse(e.date);
      if (!(start >= from.getTime() && start <= now.getTime())) continue;
      for (const c of e.competitions?.[0]?.competitors ?? []) if (c?.team?.id) out.add(`${sport}|${c.team.id}`);
    }
  })));
  return out;
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

/** Every player name on both teams' ESPN rosters, for correcting transcription misspellings. */
export async function rosterNames(game: UpcomingGame): Promise<string[]> {
  const { path } = PATHS[game.sport];
  const names: string[] = [];
  await Promise.all(game.teamIds.map(async (id) => {
    const res = await espnFetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${id}/roster`);
    if (!res.ok) return;
    const body = await res.json();
    // NFL rosters come grouped by position; basketball rosters as a flat list.
    const groups = Array.isArray(body.athletes) ? body.athletes : [];
    for (const g of groups) {
      const items = Array.isArray(g?.items) ? g.items : [g];
      for (const a of items) if (typeof a?.fullName === "string") names.push(a.fullName);
    }
  }));
  return names;
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/**
 * Fix a misspelled player name at the start of a pick ("Jaden Daniels Anytime TD" ->
 * "Jayden Daniels Anytime TD") by matching its first two or three words to the two
 * teams' rosters. Only a close match is applied; anything else is left as written.
 */
export function correctName(pick: string, roster: string[]): string {
  const words = pick.split(/\s+/);
  let best: { name: string; take: number; score: number } | null = null;
  for (const take of [2, 3]) {
    if (words.length < take) continue;
    const said = norm(words.slice(0, take).join(" "));
    if (said.length < 5) continue;
    for (const name of roster) {
      const n = norm(name);
      const score = 1 - lev(said, n) / Math.max(said.length, n.length);
      if (!best || score > best.score) best = { name, take, score };
    }
  }
  if (!best || best.score < 0.8 || best.score === 1) return pick;
  return [best.name, ...words.slice(best.take)].join(" ");
}
