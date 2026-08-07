// NFL season arithmetic for the projection backtester. The season labeled Y
// runs September Y through the Super Bowl in February Y+1, so "the most
// recently completed season" is not simply "last year": in January 2027 the
// 2026 season is still live and the answer is 2025.
//
// IMPORTANT: keep this file in lockstep with
// supabase/functions/_shared/nfl-season.ts (Deno functions cannot import from
// src/). src/test/nflSeason.test.ts asserts the two stay equivalent.

/**
 * The most recently *completed* NFL season as of `now`.
 *
 * March is the boundary: any date in March or later means the season that
 * started the previous calendar year has fully finished (the Super Bowl is
 * played in early February; using March keeps the rule to one month compare
 * with no Super Bowl date table). Jan/Feb belong to the still-running season
 * that started the year before, so the last completed one is two years back.
 */
export function mostRecentCompletedNflSeason(now: Date = new Date()): number {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0 = Jan
  return month >= 2 ? year - 1 : year - 2;
}
