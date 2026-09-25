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

/**
 * Postponed or canceled: no game at the listed time, so upcoming lists hide it
 * like a final. ESPN keeps a rainout on its original date as STATUS_POSTPONED,
 * and sync-mlb-games marks a game that neither ESPN nor MLB lists on its date
 * any more the same way (supabase/functions/sync-mlb-games/reconcile.ts).
 */
export function isCalledOffStatus(status: string | null | undefined): boolean {
  return /postpone|cancel/i.test(status || "");
}
