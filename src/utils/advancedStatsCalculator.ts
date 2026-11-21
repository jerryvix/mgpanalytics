// Advanced stats for the NFL player page.
//
// Every value here is computed directly from stored season stats
// (player_season_stats). No estimates, assumed league ratios or random values:
// if a number can't be computed from stored data, it is left out rather than
// approximated. Project rule: no mock or random data on user-facing surfaces
// (docs/positioning.md).

import { getPositionGroup } from "@/utils/nflStatsFormatters";

export interface AdvancedStats {
  // QB
  passer_rating?: number;
  // WR/TE
  catch_rate?: number;
  // DEF
  tackles_per_game?: number;
  qb_hits?: number;
}

/** Stored values arrive from the DB as number | null; anything else counts as missing. */
type StoredValue = number | null | undefined;

/** The stored season-stat fields the calculator reads. Fits player_season_stats rows and NFLPlayerStats. */
export interface AdvancedStatsInput {
  games_played?: StoredValue;
  passer_rating?: StoredValue;
  targets?: StoredValue;
  receptions?: StoredValue;
  tackles?: StoredValue;
  qb_hits?: StoredValue;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Stored count above zero. Defensive columns default to 0 and no sync writes them yet,
 *  so a stored 0 can't be told apart from "never synced" and is treated as missing. */
function positiveCount(value: StoredValue): number | undefined {
  return isNumber(value) && value > 0 ? value : undefined;
}

/** Receptions divided by targets, as a percentage. Undefined without targets. */
export function calcCatchRate(targets?: StoredValue, receptions?: StoredValue): number | undefined {
  if (!isNumber(targets) || targets <= 0 || !isNumber(receptions)) return undefined;
  return (receptions / targets) * 100;
}

/**
 * Calculate advanced stats for a player based on their position.
 * Only fields that can be computed from stored stats are set.
 */
export function calculateAdvancedStats(
  stats: AdvancedStatsInput | null | undefined,
  position: string
): AdvancedStats {
  const advanced: AdvancedStats = {};
  if (!stats) return advanced;

  const games = isNumber(stats.games_played) && stats.games_played > 0 ? stats.games_played : undefined;

  // Normalize position: DB may store "Quarterback" but the switch expects "QB"
  switch (getPositionGroup(position)) {
    case "QB":
      // Computed at sync time from completions, attempts, yards, TDs and INTs (official NFL formula)
      if (isNumber(stats.passer_rating)) advanced.passer_rating = stats.passer_rating;
      break;

    case "WR_TE": {
      const catchRate = calcCatchRate(stats.targets, stats.receptions);
      if (catchRate !== undefined) advanced.catch_rate = catchRate;
      break;
    }

    case "DEF": {
      const tackles = positiveCount(stats.tackles);
      if (tackles !== undefined && games !== undefined) advanced.tackles_per_game = tackles / games;
      const qbHits = positiveCount(stats.qb_hits);
      if (qbHits !== undefined) advanced.qb_hits = qbHits;
      break;
    }
  }

  return advanced;
}

/** True when at least one advanced stat can be shown for this player. */
export function hasAdvancedStats(stats: AdvancedStatsInput | null | undefined, position: string): boolean {
  return Object.values(calculateAdvancedStats(stats, position)).some(isNumber);
}
