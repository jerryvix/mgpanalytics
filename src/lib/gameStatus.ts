// Central status normalization. Sync functions store provider-raw status
// strings - ESPN writes "STATUS_IN_PROGRESS"/"STATUS_FINAL", BDL writes
// "Final"/"InProgress" - so every UI check must go through these helpers
// instead of comparing literals.

export function isLiveStatus(status: string | null | undefined): boolean {
  const s = (status || "").toLowerCase();
  if (!s) return false;
  return (
    s === "live" ||
    s === "inprogress" ||
    s.includes("in progress") ||
    s.includes("in_progress") ||
    s.includes("halftime") ||
    s.includes("half_time") ||
    s.includes("end_period") ||
    s.includes("end_of_period")
  );
}

export function isFinalStatus(status: string | null | undefined): boolean {
  return (status || "").toLowerCase().includes("final");
}

// Postponed or canceled: one rule for the app and the edge functions
export { isCalledOffStatus } from "../../supabase/functions/_shared/game-status";

/**
 * isCalledOffStatus applied in a query (status is NOT NULL on the game
 * tables), for reads that limit or count rows: filtered after the read, the
 * dashboard's 10-game window could fill with called-off games and come back
 * empty, and the chat's game count would include them.
 */
export function excludeCalledOff<Q extends { not(column: string, operator: string, value: unknown): Q }>(query: Q): Q {
  return query.not("status", "ilike", "%postpone%").not("status", "ilike", "%cancel%");
}
