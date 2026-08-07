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
 * Uses the last (up to) 3 ranked seasons. Gap seasons (missed year, no rank)
 * are skipped, not interpolated. Moves are scored as log(prevRank / nextRank)
 * — positive = improving — because rank improvements compress near the top:
 * RB8 -> RB6 is a real jump while RB44 -> RB40 is noise, and a ratio measure
 * treats both honestly where an absolute spot count cannot. The most recent
 * move is weighted 2x over the prior one. The ±0.45 threshold is roughly a
 * sustained ~25% recency-weighted rank improvement; it classifies the spec's
 * canonical example (James Cook RB12 -> RB8 -> RB6) as ascending while a
 * back-of-the-pack drift (WR44 -> WR40 -> WR36) stays flat.
 */
export function classifyTrend(seasons: SeasonRankPoint[]): TrendDirection {
  const sorted = [...seasons]
    .filter((s) => Number.isFinite(s.rank) && s.rank >= 1)
    .sort((a, b) => a.season - b.season)
    .slice(-3);

  if (sorted.length < 2) return "insufficient";

  const moves: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    moves.push(Math.log(sorted[i - 1].rank / sorted[i].rank));
  }

  const mostRecent = moves[moves.length - 1];
  const prior = moves.length > 1 ? moves[moves.length - 2] : 0;
  const trendScore = 2 * mostRecent + prior;

  if (trendScore >= 0.45) return "ascending";
  if (trendScore <= -0.45) return "descending";
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
