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

import { etDate, matchupKey } from "../_shared/mlb-statsapi.ts";

const PAIR_WINDOW_MS = 3 * 3600_000;

/**
 * Pair two lists of the same matchup on the same day. Equal counts pair in
 * start order (doubleheader game 1 with game 1). If the sources disagree on the
 * count (one has not posted game 2 yet), pair by closest first pitch within 3h,
 * closest pairs first, and leave the rest unpaired: never give one game's
 * result to both. First-come pairing let MLB's game 1 (4:05 PM) claim ESPN's
 * only row, game 2 (7:05 PM), because game 1 is listed first.
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
 * stands in: only a row MLB lists no game for that day qualifies (`mlbKeys`:
 * the matchupKey of every MLB game, null when MLB was unreachable). Normally
 * there are none.
 */
export function strandedRows<R extends SyncRow>(
  rows: R[],
  o: {
    fromDay: string;
    toDay: string;
    servedDays: ReadonlySet<string>;
    listedIds: ReadonlySet<string>;
    mlbKeys: ReadonlySet<string> | null;
  },
): R[] {
  return rows.filter((r) => {
    const id = espnEventId(r.external_id);
    if (!id || r.is_final) return false;
    const day = etDate(r.date);
    if (day < o.fromDay || day > o.toDay || o.listedIds.has(id)) return false;
    if (o.servedDays.has(day)) return true;
    return !!o.mlbKeys && !o.mlbKeys.has(matchupKey(day, r.visitor_team_name, r.home_team_name));
  });
}

/** ESPN's core API record of an event: when it is now, and its status (null if unread). */
export interface CoreEvent {
  date: string;
  status: string | null;
}

export interface RowFix {
  date?: string;
  status?: string;
}

const CALLED_OFF = /POSTPONED|CANCELED|CANCELLED/i;
// ESPN and MLB can list the same first pitch a few minutes apart (the sync
// stores MLB's), so only a bigger shift on the same day counts as a move.
const MOVE_MS = 3600_000;

/**
 * What to write for a stranded row (or a mirror listing MLB does not
 * confirm), given ESPN's core record of the event: "missing" when ESPN has no
 * such event, null when ESPN could not be asked. `mlbHasGame` says whether MLB
 * lists a game for that matchup on the row's day (null: MLB unreachable).
 *
 * - ESPN has it on another day or at another time: move the row there.
 * - ESPN has it where we do, postponed or canceled: take that status.
 * - ESPN has it where we do otherwise: leave it (the mirror just missed it).
 * - ESPN has no such event and MLB does not list the game that day (or cannot
 *   be read), or ESPN cannot be asked and MLB lists no such game that day: the
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
  if (core && core !== "missing") {
    const moved = etDate(core.date) !== etDate(row.date) || Math.abs(Date.parse(core.date) - Date.parse(row.date)) > MOVE_MS;
    const status = core.status && core.status !== row.status ? core.status : null;
    if (moved) return status ? { date: core.date, status } : { date: core.date };
    return status && CALLED_OFF.test(status) ? { status } : null;
  }
  const gone = core === "missing" ? mlbHasGame !== true : mlbHasGame === false;
  return gone && row.status !== "STATUS_POSTPONED" ? { status: "STATUS_POSTPONED" } : null;
}
