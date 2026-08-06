// Pure classifiers for the fantasy trajectory analyzer. Ranks are positional
// finishes (RB6 = 6), so LOWER is better throughout.

export type TrendDirection = "ascending" | "descending" | "flat" | "insufficient";
export type MomentumVerdict = "strong_closer" | "faded" | "steady" | "insufficient";

export interface SeasonRankPoint {
  season: number;
  rank: number;
}

/**
 * Classify a player's multi-season trajectory from positional finishes.
 *
 * Uses the last (up to) 3 ranked seasons. Deltas between consecutive available
 * seasons are computed as prevRank - nextRank (positive = improving). Gap
 * seasons (missed year, no rank) are skipped, not interpolated. The score
 * weights the most recent move 2x over the prior one; ±9 works out to a
 * sustained ~3-spots-per-season move, or a single recent 5-spot leap.
 */
export function classifyTrend(seasons: SeasonRankPoint[]): TrendDirection {
  const sorted = [...seasons]
    .filter((s) => Number.isFinite(s.rank))
    .sort((a, b) => a.season - b.season)
    .slice(-3);

  if (sorted.length < 2) return "insufficient";

  const deltas: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    deltas.push(sorted[i - 1].rank - sorted[i].rank);
  }

  const mostRecent = deltas[deltas.length - 1];
  const prior = deltas.length > 1 ? deltas[deltas.length - 2] : 0;
  const trendScore = 2 * mostRecent + prior;

  if (trendScore >= 9) return "ascending";
  if (trendScore <= -9) return "descending";
  return "flat";
}

/**
 * Classify prior-season closing momentum: full-season finish vs the player's
 * positional rank over weeks 10-18. A 6-spot improvement (half a 12-team
 * starter tier) flags a strong closer; the mirror image flags a fade.
 */
export function classifyMomentum(
  fullSeasonRank: number | null | undefined,
  secondHalfRank: number | null | undefined,
  secondHalfGames: number | null | undefined
): MomentumVerdict {
  if (
    fullSeasonRank == null ||
    secondHalfRank == null ||
    secondHalfGames == null ||
    secondHalfGames < 4
  ) {
    return "insufficient";
  }
  const improvement = fullSeasonRank - secondHalfRank;
  if (improvement >= 6) return "strong_closer";
  if (improvement <= -6) return "faded";
  return "steady";
}

/** Map a players.position value (full name or abbreviation) to a fantasy rank group. */
export function getFantasyPosGroup(position: string | null | undefined): "QB" | "RB" | "WR" | "TE" | null {
  switch ((position ?? "").trim().toUpperCase()) {
    case "QB":
    case "QUARTERBACK":
      return "QB";
    case "RB":
    case "FB":
    case "RUNNING BACK":
    case "FULLBACK":
      return "RB";
    case "WR":
    case "WIDE RECEIVER":
      return "WR";
    case "TE":
    case "TIGHT END":
      return "TE";
    default:
      return null;
  }
}

/**
 * Normalize a player name for cross-source matching (BDL "AJ Brown" vs
 * nflverse "A.J. Brown"): lowercase, strip punctuation, drop suffixes.
 */
export function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'’-]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
