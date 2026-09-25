// Game states every surface agrees on. Pure and import-free: the edge
// functions import it directly and the app re-exports it
// (src/lib/gameStatus.ts), so the two can never disagree.

/**
 * Postponed or canceled: no game at the listed time, so lists of upcoming
 * games leave it out like a final. ESPN keeps a rainout on its original date
 * as STATUS_POSTPONED and cancels an "if necessary" postseason game that is
 * not needed; sync-mlb-games marks a game that neither ESPN nor MLB lists on
 * its date any more as postponed. Queries that limit or count rows apply the
 * same rule in the query (src/lib/gameStatus.ts excludeCalledOff).
 */
export function isCalledOffStatus(status: string | null | undefined): boolean {
  return /postpone|cancel/i.test(status || "");
}
