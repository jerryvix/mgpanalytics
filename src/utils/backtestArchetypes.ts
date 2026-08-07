// Archetype bucket definitions for the projection backtester. These pool
// player-seasons across many players so the sample carries the signal a
// single player's history can't - and they sidestep individual ADP being
// distorted by depth-chart competition. Raw attributes come from the
// nfl_backtest_player_season view; bucketing lives here so it's unit-tested.
//
// NOTE the two draft concepts are unrelated and must never be conflated:
// draft capital = the player's NFL draft round (draft_round, NULL = UDFA);
// ADP = where fantasy leagues draft them. Different numbers, different
// buckets.

export type ExperienceBucket = "year_1" | "year_2" | "year_3" | "veteran";

/** Experience year = season - rookie_season + 1 (computed in SQL). */
export function experienceBucket(experienceYear: number | null | undefined): ExperienceBucket | null {
  if (experienceYear == null || experienceYear < 1) return null;
  if (experienceYear === 1) return "year_1";
  if (experienceYear === 2) return "year_2";
  if (experienceYear === 3) return "year_3";
  return "veteran";
}

// The spec's headline comparison is rounds 1-2 vs Day 3/UDFA. Round 3 is
// genuinely ambiguous under that grouping (Day 2 = rounds 2-3, Day 3 =
// rounds 4-7), so it gets its own bucket rather than being silently lumped -
// the UI leads with the two spec buckets and shows round 3 as its own column.
export type DraftCapitalBucket = "rounds_1_2" | "round_3" | "day3_udfa";

export function draftCapitalBucket(draftRound: number | null | undefined): DraftCapitalBucket {
  if (draftRound == null) return "day3_udfa"; // undrafted
  if (draftRound <= 2) return "rounds_1_2";
  if (draftRound === 3) return "round_3";
  return "day3_udfa";
}

export type SituationBucket = "new_team" | "same_team";

/**
 * Situation change from the modal-team comparison (nfl_player_seasons view).
 * null = no prior season in the data window (rookie or pre-backfill) - those
 * rows are excluded from this bucket rather than guessed.
 *
 * "New starting job" is a Phase 4 fast-follow: it needs snap-count data
 * (nflverse snap_counts ingest pending) to see a role change the roster
 * can't show. Not faked in the meantime.
 */
export function situationBucket(newTeam: boolean | null | undefined): SituationBucket | null {
  if (newTeam == null) return null;
  return newTeam ? "new_team" : "same_team";
}

// Role type (bell-cow vs committee via snap share >= 60%) is Phase 4,
// blocked on the snap_counts ingest; slot-vs-outside additionally needs
// alignment data (NGS/FTN charting) that snap counts don't carry.
export type RoleBucket = "bell_cow" | "committee";

export function roleBucket(snapShare: number | null | undefined): RoleBucket | null {
  if (snapShare == null) return null; // data not ingested yet (Phase 4)
  return snapShare >= 0.6 ? "bell_cow" : "committee";
}
