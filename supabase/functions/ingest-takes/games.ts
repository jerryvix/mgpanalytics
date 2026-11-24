// Upcoming games from ESPN's public scoreboards, the candidate list the extractor
// must match each pick to. By default only games that have not started are returned,
// so a pick for a game already under way or final can never be stored (D-065).
// Pass `{ includeInProgress: true }` to also return games ESPN lists as in progress
// (X posts can arrive after kickoff, D-102). Final games are never returned.

import { espnFetch } from "../_shared/espn-fetch.ts";

export type TakesSport = "NFL" | "NBA" | "NCAAF" | "NCAAB";

export interface UpcomingGame {
  id: string;
  sport: TakesSport;
  startsAt: string; // ISO
  matchup: string; // "Cavaliers at Bulls", "VCU vs Providence"
  teams: string[]; // display, short, location, name, abbreviation for both sides (lowercase)
  awayWords: string[]; // same fields, away side only, for matching a post to this game
  homeWords: string[];
  awayName: string; // ESPN display name, "Cincinnati Bengals"
  homeName: string;
  teamIds: string[]; // ESPN team ids, away then home, for roster lookups
  line: string; // one line for the prompt
  state: "pre" | "in";
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
  return p.replace(/-/g, "");
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

/**
 * A game can be matched when it has not started, or when it is in progress and
 * the caller asked for those. Final, postponed and other states are left out.
 */
export function gameIsMatchable(state: string, startsAt: string, now: Date, includeInProgress: boolean): boolean {
  if (state === "in") return includeInProgress;
  if (state === "pre") return Date.parse(startsAt) > now.getTime();
  return false;
}

/** Games from now to `days` days ahead (ET dates). In-progress games are off unless asked for. */
export async function upcomingGames(
  sports: TakesSport[],
  days = 4,
  now = new Date(),
  opts?: { includeInProgress?: boolean },
): Promise<UpcomingGame[]> {
  const includeInProgress = Boolean(opts?.includeInProgress);
  const dates: string[] = [];
  // Yesterday too, so a game that started before midnight and is still on is in the list
  const startDay = includeInProgress ? -1 : 0;
  for (let i = startDay; i < days; i++) dates.push(ymd(new Date(now.getTime() + i * 86_400_000)));
  const out: UpcomingGame[] = [];
  const seen = new Set<string>();
  await Promise.all(sports.flatMap((sport) => dates.map(async (date) => {
    const { path, query } = PATHS[sport];
    const res = await espnFetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${date}${query}`);
    if (!res.ok) return;
    const body = await res.json();
    for (const e of body.events ?? []) {
      const c = e.competitions?.[0];
      const state = String(c?.status?.type?.state ?? "");
      if (!c || !gameIsMatchable(state, e.date, now, includeInProgress)) continue;
      const home = c.competitors?.find((x: { homeAway: string }) => x.homeAway === "home")?.team;
      const away = c.competitors?.find((x: { homeAway: string }) => x.homeAway === "away")?.team;
      if (!home || !away || seen.has(e.id)) continue;
      seen.add(e.id);
      const sep = c.neutralSite ? "vs" : "at";
      const matchup = `${away.shortDisplayName} ${sep} ${home.shortDisplayName}`;
      const awayWords = teamWords(away);
      const homeWords = teamWords(home);
      out.push({
        id: String(e.id),
        sport,
        startsAt: new Date(e.date).toISOString(),
        matchup,
        teams: [...awayWords, ...homeWords],
        awayWords,
        homeWords,
        awayName: String(away.displayName ?? away.shortDisplayName ?? ""),
        homeName: String(home.displayName ?? home.shortDisplayName ?? ""),
        teamIds: [String(away.id), String(home.id)],
        line: `${e.id} | ${sport} | ${etLabel(e.date)} | ${away.displayName} ${sep} ${home.displayName}`,
        state: state === "in" ? "in" : "pre",
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

// How sure a post-to-game match is. Both team names, and nobody else mentioned, is the
// high mark. A single distinctive name is enough when only one game has it.
export const MATCH_BOTH = 0.95;
export const MATCH_BOTH_TIEBREAK = 0.9;
export const MATCH_ONE = 0.75;

// A lone "State" or "Carolina" is shared by too many schools to pick a game.
const GENERIC = new Set([
  "state", "tech", "southern", "northern", "eastern", "western", "central",
  "university", "college", "carolina",
]);

function padded(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9&' ]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

/** Longest team phrase in `hay` that is not only a generic school word. 0 when nothing hits. */
function specificLength(words: string[], hay: string): number {
  let best = 0;
  for (const word of words) {
    const n = word.toLowerCase().replace(/[^a-z0-9&' ]+/g, " ").replace(/\s+/g, " ").trim();
    if (n.length < 4 || !hay.includes(` ${n} `)) continue;
    if (n.split(" ").every((p) => GENERIC.has(p))) continue;
    if (n.length > best) best = n.length;
  }
  return best;
}

export type GameMatch =
  | { ok: true; game: UpcomingGame; confidence: number }
  | { ok: false; reason: string };

/**
 * Match a post to one game in `games` (already limited to upcoming and, when wanted,
 * in-progress games). Both sides named, with no other game scoring as high, wins.
 * One side wins only when that game's name is a strictly longer hit than every other
 * game, so "LSU Tigers" beats a second "Tigers" and "Tigers" alone matches neither.
 */
export function matchToGame(
  games: UpcomingGame[],
  input: { sport?: string | null; text?: string | null },
): GameMatch {
  const hay = padded(input.text ?? "");
  const sport = (input.sport ?? "").trim();
  const pool = sport ? games.filter((g) => g.sport === sport) : games;
  const scored: { game: UpcomingGame; both: boolean; score: number }[] = [];
  for (const game of pool) {
    const away = specificLength(game.awayWords, hay);
    const home = specificLength(game.homeWords, hay);
    const both = away >= 4 && home >= 4;
    const score = both ? away + home : Math.max(away, home);
    if (score >= 4) scored.push({ game, both, score });
  }
  if (!scored.length) return { ok: false, reason: "no upcoming or in-progress game" };
  const best = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === best);
  if (top.length !== 1) return { ok: false, reason: "matched more than one game" };
  const winner = top[0];
  const confidence = winner.both ? (scored.length > 1 ? MATCH_BOTH_TIEBREAK : MATCH_BOTH) : MATCH_ONE;
  return { ok: true, game: winner.game, confidence };
}
