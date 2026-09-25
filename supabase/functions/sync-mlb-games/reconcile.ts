// Pure helpers for sync-mlb-games: pairing ESPN's scoreboard, MLB's schedule
// and our rows, and finding games that left their date. No Deno or Supabase
// imports, so src/test/mlbReschedule.test.ts pins the rules.
//
// Sep 24 2026: Saturday's Orioles @ Yankees was moved to Friday as
// doubleheader game 1. ESPN kept event 401817088 and re-dated it, but the
// cdn.espn.com scoreboard mirror the sync reads dropped it from Saturday hours
// before listing it on Friday. No step rewrote the row, so the slate kept a
// phantom Saturday card and Friday had no game 1. A row the scoreboard stops
// listing where we have it is now looked up in ESPN's core API, which moves
// with the schedule, and corrected in place: same row and event id, so odds
// stay attached and the mirror's eventual listing updates that same row.

import { etDate, matchupKey, type MlbScheduleGame } from "../_shared/mlb-statsapi.ts";
import { isCalledOffStatus } from "../_shared/game-status.ts";

const PAIR_WINDOW_MS = 3 * 3600_000;

/** A date string that names a real instant (etDate throws on anything else). */
const readable = (d: string | null | undefined): d is string => typeof d === "string" && Number.isFinite(Date.parse(d));

/**
 * Pair two lists of the same matchup on the same day. Equal counts pair in
 * start order (doubleheader game 1 with game 1). If the sources disagree on the
 * count (one has not posted game 2 yet), pair by closest first pitch within 3h,
 * closest pairs first, and leave the rest unpaired: never give one game's
 * result to both. First-come pairing let MLB's game 1 (4:05 PM) claim ESPN's
 * only row, game 2 (7:05 PM), because game 1 is listed first. MLB's side is
 * timed by expectedStart, so game 2's TBD placeholder never outbids game 1.
 */
export function pairGames<A, B>(as: A[], bs: B[], timeA: (a: A) => number, timeB: (b: B) => number): Map<A, B> {
  const out = new Map<A, B>();
  if (as.length === bs.length) {
    as.forEach((a, i) => out.set(a, bs[i]));
    return out;
  }
  const near: Array<{ a: A; b: B; gap: number }> = [];
  for (const a of as) {
    for (const b of bs) {
      const gap = Math.abs(timeA(a) - timeB(b));
      if (gap <= PAIR_WINDOW_MS) near.push({ a, b, gap });
    }
  }
  near.sort((x, y) => x.gap - y.gap);
  const used = new Set<B>();
  for (const { a, b } of near) {
    if (out.has(a) || used.has(b)) continue;
    out.set(a, b);
    used.add(b);
  }
  return out;
}

/** Group games by scoreboard day + matchup, each group in start order. */
export function groupByMatchup<T>(items: T[], keyOf: (t: T) => string, timeOf: (t: T) => number): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = keyOf(it);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(it);
  }
  for (const list of map.values()) list.sort((a, b) => timeOf(a) - timeOf(b));
  return map;
}

/** MLB game types the sync writes: regular season and postseason (ESPN's MLB board carries the same). */
export const COUNTED_GAME_TYPES: ReadonlySet<string> = new Set(["R", "F", "D", "L", "W"]);

/** Which matchups MLB lists on which days, counted games only. */
export interface MlbDayIndex {
  /** Days MLB lists at least one counted game (postponed placeholders included). */
  days: ReadonlySet<string>;
  /** matchupKey of every counted game actually on its day (no placeholders). */
  keys: ReadonlySet<string>;
}

export function indexMlbSchedule(games: MlbScheduleGame[]): MlbDayIndex {
  const counted = games.filter((g) => COUNTED_GAME_TYPES.has(g.gameType));
  return {
    days: new Set(counted.map((g) => g.scheduleDay)),
    keys: new Set(counted.filter((g) => !g.isPlaceholder).map((g) => matchupKey(g.scheduleDay, g.away.name, g.home.name))),
  };
}

/**
 * Does MLB list this matchup on this day? null when MLB lists no counted game
 * that day (unreachable, spring training, the All-Star break, the offseason):
 * its silence is then no evidence. An empty schedule in spring training made
 * every ESPN listing unconfirmed and, with ESPN down, every row missing.
 */
export function mlbLists(mlb: MlbDayIndex, day: string, away: string, home: string): boolean | null {
  return mlb.days.has(day) ? mlb.keys.has(matchupKey(day, away, home)) : null;
}

/** The fields of an mlb_games row these rules read. */
export interface SyncRow {
  id: string;
  external_id: string | null;
  date: string;
  status: string | null;
  is_final: boolean | null;
  home_team_name: string;
  visitor_team_name: string;
}

const ESPN_PREFIX = "espn_mlb_";

/** ESPN event id of an espn_mlb_ row; null for statsapi-sourced (mlbapi_) rows. */
export function espnEventId(externalId: string | null | undefined): string | null {
  return externalId?.startsWith(ESPN_PREFIX) ? externalId.slice(ESPN_PREFIX.length) : null;
}

/**
 * ESPN rows whose game may have left its date: not final, dated fromDay
 * through toDay (Eastern), and on no scoreboard ESPN served this run although
 * ESPN served the row's own day. On a day ESPN could not serve, MLB's schedule
 * stands in: only a row MLB positively does not list that day qualifies
 * (mlbLists false). Normally there are none.
 */
export function strandedRows<R extends SyncRow>(
  rows: R[],
  o: {
    fromDay: string;
    toDay: string;
    servedDays: ReadonlySet<string>;
    listedIds: ReadonlySet<string>;
    mlb: MlbDayIndex;
  },
): R[] {
  return rows.filter((r) => {
    const id = espnEventId(r.external_id);
    if (!id || r.is_final || !readable(r.date)) return false;
    const day = etDate(r.date);
    if (day < o.fromDay || day > o.toDay || o.listedIds.has(id)) return false;
    if (o.servedDays.has(day)) return true;
    return mlbLists(o.mlb, day, r.visitor_team_name, r.home_team_name) === false;
  });
}

/** The fields of an ESPN scoreboard event these rules read. */
export interface Listing {
  id: string;
  date: string;
  status?: { type?: { name?: string; state?: string } };
  competitions?: Array<{
    timeValid?: boolean;
    competitors?: Array<{ team?: { id?: string; displayName?: string } }>;
  }>;
}

/**
 * A postseason slot whose teams ESPN has not set: a side that is "TBD" (team
 * id -1 or -2, or none at all), as in "TBD at TBD" or "TBD at New York
 * Yankees". Only the teams decide this, never the time.
 */
export function hasPlaceholderTeam(e: Listing): boolean {
  const sides = e.competitions?.[0]?.competitors ?? [];
  return sides.length < 2 || sides.some((s) => !/^[1-9]\d*$/.test(s.team?.id ?? "") || s.team?.displayName === "TBD");
}

/**
 * ESPN's stand-in for a game not set yet: a slot with a TBD side
 * (hasPlaceholderTeam) or no first pitch (timeValid false, listed at
 * midnight Eastern). MLB names these slots its own way ("AL Wild Card #2 @
 * New York Yankees"), so they never pair, and checking them would spend a
 * core lookup per slot per run (12, the cap, from Sep 27).
 */
export function isPlaceholderListing(e: Listing): boolean {
  return e.competitions?.[0]?.timeValid === false || hasPlaceholderTeam(e);
}

/**
 * The listings to store in mlb_games: all but slots with a TBD side, which
 * are not games (the lead's call, Sep 25 2026: no "TBD @ TBD" cards). A real
 * game with no first pitch yet (timeValid false, as doubleheader game 2 can
 * be) is stored, and a slot is stored under its event id once ESPN names
 * both teams.
 */
export function listingsToStore<E extends Listing>(events: E[]): E[] {
  return events.filter((e) => !hasPlaceholderTeam(e));
}

/**
 * May the statsapi fallback store this game on a day ESPN could not serve?
 * Only between clubs ESPN knows by name: MLB's postseason slots ("AL Wild
 * Card #2", "NL 4/5 Winner", team ids 4613 and up) are its version of ESPN's
 * TBD sides, and ESPN's own listing takes over once the teams are set.
 */
export function isStorableMlbGame(g: Pick<MlbScheduleGame, "away" | "home">, espnTeams: ReadonlySet<string>): boolean {
  return espnTeams.has(g.away.name) && espnTeams.has(g.home.name);
}

/**
 * Pre-game listings, fromDay through toDay, that MLB does not confirm: no MLB
 * game pairs with them (`hasTwin`) although MLB lists games that day. A moved
 * game the mirror still shows on its old day looks like this. ESPN's
 * placeholders never qualify.
 */
export function unconfirmedListings<E extends Listing>(
  events: E[],
  o: { fromDay: string; toDay: string; hasTwin: (e: E) => boolean; mlb: MlbDayIndex },
): E[] {
  return events.filter((e) => {
    if (!readable(e.date) || e.status?.type?.state !== "pre" || o.hasTwin(e) || isPlaceholderListing(e)) return false;
    const day = etDate(e.date);
    return day >= o.fromDay && day <= o.toDay && o.mlb.days.has(day);
  });
}

/** The events to ask ESPN's core API about this run: stranded rows first, at most `cap`. */
export function coreLookupIds(stranded: SyncRow[], unconfirmed: Listing[], cap: number): string[] {
  const ids = [...stranded.flatMap((r) => espnEventId(r.external_id) ?? []), ...unconfirmed.map((e) => e.id)];
  return [...new Set(ids)].slice(0, cap);
}

/** ESPN's core API record of an event: when it is now, and its status (null if unread). */
export interface CoreEvent {
  date: string;
  status: string | null;
}

/** The date of a core API event, or null when it is not a readable instant (the event then counts as unread). */
export function coreEventDate(event: unknown): string | null {
  const date = (event as { date?: unknown } | null)?.date;
  return typeof date === "string" && readable(date) ? date : null;
}

/**
 * A core API URL that skips its cache (max-age 600, stale-while-revalidate
 * 7200): a new query key each minute forces a fresh copy, as mgpts does for
 * the scoreboard mirror (espn-fetch.ts). $ref links come back as http.
 */
export function freshCoreUrl(url: string, now: number = Date.now()): string {
  const u = new URL(url.replace(/^http:/, "https:"));
  u.searchParams.set("mgpts", String(Math.floor(now / 60_000)));
  return u.toString();
}

export interface RowFix {
  date?: string;
  status?: string;
}

// ESPN and MLB can list the same first pitch a few minutes apart (the sync
// stores MLB's), so only a bigger shift on the same day counts as a move.
const MOVE_MS = 3600_000;

/**
 * What to write for a stranded row, given ESPN's core record of the event:
 * "missing" when ESPN has no such event, null when ESPN could not be asked
 * (or answered with no readable date). `mlbHasGame` is mlbLists for the
 * row's day (null: no evidence either way).
 *
 * - ESPN has it on another day or at another time: move the row there.
 * - ESPN has it where we do, postponed or canceled: take that status.
 * - ESPN has it where we do otherwise: leave it (the mirror just missed it).
 * - ESPN has no such event and MLB does not list the game that day (or cannot
 *   say), or ESPN cannot be asked and MLB lists no such game that day: the
 *   game is not on this date any more. It is marked STATUS_POSTPONED, which
 *   the slate, the board and the chat hide, not deleted: odds hang off the row
 *   (mlb_odds cascades), and ESPN's next listing of the event rewrites both
 *   date and status.
 */
export function planStranded(
  row: Pick<SyncRow, "date" | "status">,
  core: CoreEvent | "missing" | null,
  mlbHasGame: boolean | null,
): RowFix | null {
  if (core && core !== "missing" && readable(core.date) && readable(row.date)) {
    const moved = etDate(core.date) !== etDate(row.date) || Math.abs(Date.parse(core.date) - Date.parse(row.date)) > MOVE_MS;
    const status = core.status && core.status !== row.status ? core.status : null;
    if (moved) return status ? { date: core.date, status } : { date: core.date };
    return status && isCalledOffStatus(status) ? { status } : null;
  }
  const gone = core === "missing" ? mlbHasGame !== true : mlbHasGame === false;
  return gone && row.status !== "STATUS_POSTPONED" ? { status: "STATUS_POSTPONED" } : null;
}

/**
 * planStranded for a listing MLB does not confirm, which is never hidden (the
 * mirror lists it). `storedDate` is the date the row has now. A core answer
 * repeating that stored date while the mirror has moved the game is a stale
 * cached copy, not a correction: it is ignored, so it can never undo the
 * fresher move.
 */
export function planListing(
  listing: Pick<SyncRow, "date" | "status">,
  core: CoreEvent | "missing" | null,
  storedDate: string | null,
): RowFix | null {
  const fix = planStranded(listing, core, true);
  const same = (a: string, b: string) => Date.parse(a) === Date.parse(b);
  if (fix?.date && readable(storedDate) && same(fix.date, storedDate) && !same(listing.date, storedDate)) return null;
  return fix;
}
