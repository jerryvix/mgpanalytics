// Deno twin of src/utils/nflSeason.ts: keep the two in lockstep.
// src/test/nflSeason.test.ts imports both and asserts identical output.

/**
 * The most recently *completed* NFL season as of `now`. Season Y runs Sep Y
 * through the Super Bowl in Feb Y+1; March is the "it's over" boundary.
 */
export function mostRecentCompletedNflSeason(now: Date = new Date()): number {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0 = Jan
  return month >= 2 ? year - 1 : year - 2;
}
