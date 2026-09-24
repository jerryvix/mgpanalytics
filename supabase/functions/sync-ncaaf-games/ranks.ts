// AP Top 25 resolution and row building for ncaaf_games.
//
// Pure (no Deno, network or Supabase APIs) so vitest can import it:
// src/test/ncaafRanks.test.ts. collect.ts does the fetching.
//
// Sep 23 2026: the NCAAF slate showed Texas A&M at #8 while the AP poll had
// them at #23. Every ncaaf_games row had been frozen since Aug 19 (the last
// sync before ESPN's TLS block), so the site was still printing the preseason
// poll four weeks into the season. The rank rules this module pins down:
// - a game that has not kicked off shows the teams' CURRENT AP rank;
// - a game that has kicked off keeps the rank the teams carried into it (the
//   AP poll for that game's week), so history does not drift when the next
//   poll comes out;
// - unranked is null, never ESPN's 99 placeholder (every 99 made its game
//   count as "ranked" on the slate);
// - only the AP Top 25 counts: never the Coaches, FCS or CFP rankings.

export type RankMap = Map<string, number>;

export interface EspnPoll {
  id?: string | number | null;
  name?: string | null;
  shortName?: string | null;
  type?: string | null;
  ranks?: Array<{ current?: unknown; team?: { id?: unknown } | null } | null> | null;
}

export interface EspnCompetitor {
  homeAway?: string;
  score?: string | number | null;
  curatedRank?: { current?: unknown } | null;
  team?: {
    id?: string | number | null;
    name?: string;
    displayName?: string;
    abbreviation?: string;
  } | null;
}

export interface EspnEvent {
  id: string;
  date: string;
  season?: { year?: number; type?: number } | null;
  week?: { number?: number } | null;
  status?: { type?: { name?: string; state?: string; completed?: boolean } | null } | null;
  competitions?: Array<{
    venue?: { fullName?: string } | null;
    competitors?: EspnCompetitor[] | null;
    /**
     * False until the networks pick a kickoff time (ESPN shows "TBD"); the
     * date then holds a placeholder of midnight Eastern on the game's day.
     * Same field in the site.api and CDN scoreboard shapes.
     */
    timeValid?: boolean | null;
  }> | null;
}

/** 1 to 25, else null. ESPN marks unranked teams 99 (curatedRank) or 0 (receiving votes). */
export function top25(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 25 ? n : null;
}

/**
 * The AP Top 25 out of an ESPN rankings payload, or null when it is not there.
 * Matches the site.api type ("ap"), ESPN's AP poll id (1) or the exact name,
 * never a substring: the old `name.includes("Poll")` test would have ranked
 * games off the FCS Coaches Poll in any week the AP poll was missing.
 */
export function findApPoll(rankings: unknown): EspnPoll | null {
  if (!Array.isArray(rankings)) return null;
  for (const poll of rankings as Array<EspnPoll | null>) {
    if (!poll || typeof poll !== "object") continue;
    if (poll.type === "ap" || String(poll.id ?? "") === "1" || poll.name === "AP Top 25") return poll;
  }
  return null;
}

/** ESPN team id to rank for the ranked teams; null when the poll is missing or empty. */
export function apRankMap(poll: EspnPoll | null): RankMap | null {
  const ranks = poll?.ranks;
  if (!Array.isArray(ranks)) return null;
  const map: RankMap = new Map();
  for (const r of ranks) {
    const rank = top25(r?.current);
    const id = r?.team?.id;
    if (rank === null || id === undefined || id === null || String(id) === "") continue;
    map.set(String(id), rank);
  }
  return map.size > 0 ? map : null;
}

export interface ServedPoll {
  season: number | null;
  seasonType: number | null;
  week: number | null;
}

function num(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Which poll week a rankings payload actually holds, from site.api's
 * requestedSeason (the CDN fallback in _shared/espn-fetch.ts fills the same
 * field). Lets the caller refuse a payload that answered a different week.
 */
export function servedPoll(payload: unknown): ServedPoll {
  const rs = (payload as {
    requestedSeason?: { year?: unknown; type?: { type?: unknown } | null; week?: { number?: unknown } | null } | null;
  } | null)?.requestedSeason;
  return {
    season: num(rs?.year),
    seasonType: num(rs?.type?.type),
    week: num(rs?.week?.number),
  };
}

/** Kicked off, final or called off: from here on its rank is the one it carried into kickoff. */
export function hasStarted(ev: EspnEvent): boolean {
  const t = ev.status?.type;
  return t?.completed === true || t?.state === "in" || t?.state === "post";
}

export interface PollSet {
  /** The newest AP poll and the season it belongs to. */
  latest: { season: number | null; ranks: RankMap } | null;
  /** The AP poll in effect for each regular-season week, keyed by weekKey(). */
  byWeek: Map<string, RankMap>;
}

export function weekKey(season: number, week: number): string {
  return `${season}:${week}`;
}

/** The AP poll that should rank this game, or null when there is none to use. */
export function pollForEvent(ev: EspnEvent, polls: PollSet): RankMap | null {
  const season = typeof ev.season?.year === "number" ? ev.season.year : null;
  if (hasStarted(ev)) {
    const week = ev.week?.number;
    if (ev.season?.type !== 2 || season === null || typeof week !== "number") return null;
    return polls.byWeek.get(weekKey(season, week)) ?? null;
  }
  const latest = polls.latest;
  if (!latest) return null;
  // Between January and the preseason poll the newest AP poll is last
  // season's final one, which must not rank next season's games.
  if (latest.season !== null && season !== null && latest.season !== season) return null;
  return latest.ranks;
}

/** AP rank for one side of a game: 1 to 25, or null when unranked. */
export function rankForSide(ev: EspnEvent, side: EspnCompetitor | undefined, polls: PollSet): number | null {
  if (!side) return null;
  const teamId = side.team?.id;
  const poll = pollForEvent(ev, polls);
  if (poll && teamId !== undefined && teamId !== null && String(teamId) !== "") {
    return poll.get(String(teamId)) ?? null;
  }
  // No AP poll to use: ESPN has none for regular-season Week 1 (the preseason
  // poll governs it) and the rankings fetch can fail. ESPN's curatedRank is
  // the rank ESPN itself prints on that game (the AP poll in effect that
  // week, until the CFP rankings replace it in November).
  return top25(side.curatedRank?.current);
}

export interface CalendarEntry {
  value?: string;
  startDate?: string;
  endDate?: string;
}

export interface CalendarPart {
  value?: string;
  entries?: CalendarEntry[] | null;
}

export interface ScoreboardWeek {
  year: number;
  seasonType: number;
  week: number;
}

/**
 * Regular-season (2) and postseason (3) weeks from an ESPN scoreboard calendar
 * whose date range overlaps [start, end]. Football scoreboards are week-scoped,
 * so the sync fetches each week once instead of walking individual dates.
 */
export function weeksInWindow(calendar: unknown, year: number, start: Date, end: Date): ScoreboardWeek[] {
  if (!Array.isArray(calendar)) return [];
  const out: ScoreboardWeek[] = [];
  const seen = new Set<string>();
  for (const part of calendar as Array<CalendarPart | null>) {
    const seasonType = Number(part?.value);
    if (seasonType !== 2 && seasonType !== 3) continue;
    for (const entry of part?.entries ?? []) {
      const from = Date.parse(entry?.startDate ?? "");
      const to = Date.parse(entry?.endDate ?? "");
      const week = Number(entry?.value);
      if (Number.isNaN(from) || Number.isNaN(to) || !Number.isInteger(week)) continue;
      if (to < start.getTime() || from > end.getTime()) continue;
      const key = `${seasonType}:${week}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ year, seasonType, week });
    }
  }
  return out;
}

/** Distinct regular-season weeks with at least one game underway or finished. */
export function startedRegularSeasonWeeks(events: EspnEvent[]): Array<{ season: number; week: number }> {
  const out: Array<{ season: number; week: number }> = [];
  const seen = new Set<string>();
  for (const ev of events) {
    const season = ev.season?.year;
    const week = ev.week?.number;
    if (!hasStarted(ev) || ev.season?.type !== 2 || typeof season !== "number" || typeof week !== "number") continue;
    const key = weekKey(season, week);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ season, week });
  }
  return out;
}

/** Keep only what the sync reads: CDN scoreboard events run about 19 KB each. */
export function slimEvent(ev: EspnEvent, fallback: { year?: number; type?: number; week?: number } = {}): EspnEvent {
  const comp = ev.competitions?.[0];
  return {
    id: String(ev.id),
    date: ev.date,
    season: {
      year: ev.season?.year ?? fallback.year,
      type: ev.season?.type ?? fallback.type,
    },
    week: { number: ev.week?.number ?? fallback.week },
    status: {
      type: {
        name: ev.status?.type?.name,
        state: ev.status?.type?.state,
        completed: ev.status?.type?.completed,
      },
    },
    competitions: [{
      venue: comp?.venue?.fullName ? { fullName: comp.venue.fullName } : null,
      timeValid: typeof comp?.timeValid === "boolean" ? comp.timeValid : null,
      competitors: (comp?.competitors ?? []).map((c) => ({
        homeAway: c.homeAway,
        score: c.score ?? null,
        curatedRank: c.curatedRank ? { current: c.curatedRank.current } : null,
        team: c.team
          ? {
            id: c.team.id,
            name: c.team.name,
            displayName: c.team.displayName,
            abbreviation: c.team.abbreviation,
          }
          : null,
      })),
    }],
  };
}

export interface NcaafGameRow {
  external_id: string;
  date: string;
  season: number;
  status: string;
  home_team_name: string;
  visitor_team_name: string;
  home_team_id: string | null;
  visitor_team_id: string | null;
  home_team_rank: number | null;
  visitor_team_rank: number | null;
  venue: string | null;
  is_featured: boolean;
  home_score: number | null;
  away_score: number | null;
  is_final: boolean;
  /** Kickoff not set yet: `date` is a midnight-ET placeholder, show the day plus "TBD". */
  time_tbd: boolean;
  updated_at: string;
}

function teamId(c: EspnCompetitor | undefined): string | null {
  const id = c?.team?.id;
  return id === undefined || id === null || String(id) === "" ? null : String(id);
}

/**
 * Scores exist once a game is underway or final. ESPN reports "0" for games
 * not yet played (and for postponed or canceled ones), which stored a fake
 * 0-0 on every scheduled row; those are null, as the NFL sync writes them.
 */
function hasScore(ev: EspnEvent): boolean {
  const t = ev.status?.type;
  return t?.completed === true || t?.state === "in";
}

function score(ev: EspnEvent, c: EspnCompetitor | undefined): number | null {
  if (!hasScore(ev)) return null;
  const n = parseInt(String(c?.score ?? ""), 10);
  return Number.isNaN(n) ? null : n;
}

export function toGameRow(ev: EspnEvent, polls: PollSet, updatedAt: string): NcaafGameRow {
  const comp = ev.competitions?.[0];
  const home = comp?.competitors?.find((c) => c.homeAway === "home");
  const away = comp?.competitors?.find((c) => c.homeAway === "away");
  const homeRank = rankForSide(ev, home, polls);
  const awayRank = rankForSide(ev, away, polls);
  const gameDate = new Date(ev.date);
  return {
    external_id: `espn_ncaaf_${ev.id}`,
    date: ev.date,
    // Season labeled by START year (the 2026 season runs Aug 2026 to Jan 2027)
    season: gameDate.getUTCMonth() >= 6 ? gameDate.getUTCFullYear() : gameDate.getUTCFullYear() - 1,
    status: ev.status?.type?.name || "scheduled",
    home_team_name: home?.team?.displayName || home?.team?.name || "TBD",
    visitor_team_name: away?.team?.displayName || away?.team?.name || "TBD",
    home_team_id: teamId(home),
    visitor_team_id: teamId(away),
    home_team_rank: homeRank,
    visitor_team_rank: awayRank,
    venue: comp?.venue?.fullName || null,
    is_featured: homeRank !== null || awayRank !== null,
    home_score: score(ev, home),
    away_score: score(ev, away),
    is_final: ev.status?.type?.completed === true,
    time_tbd: comp?.timeValid === false,
    updated_at: updatedAt,
  };
}
