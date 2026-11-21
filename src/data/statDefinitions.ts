// NFL Advanced Stat Definitions with tooltips and explanations.
//
// Only metrics that advancedStatsCalculator computes from stored season stats are listed.
// Don't add a definition for a metric that needs data we don't store (play-by-play,
// tracking, snap counts, team totals): the player page must not show estimated or
// random numbers (docs/positioning.md). League averages are left out until they can be
// computed from stored data too.

export interface StatDefinition {
  key: string;
  name: string;
  shortName: string;
  description: string;
  format: "number" | "decimal" | "percent" | "rate";
  higherIsBetter: boolean;
  leagueAverage?: number;
  unit?: string;
}

export const QB_ADVANCED_STATS: StatDefinition[] = [
  {
    key: "passer_rating",
    name: "Passer Rating",
    shortName: "Rating",
    description: "Traditional NFL passer rating combining completion %, yards, TDs, and INTs. Max is 158.3.",
    format: "decimal",
    higherIsBetter: true,
  },
];

// Nothing for running backs can be computed from stored stats yet.
export const RB_ADVANCED_STATS: StatDefinition[] = [];

export const WR_TE_ADVANCED_STATS: StatDefinition[] = [
  {
    key: "catch_rate",
    name: "Catch Rate",
    shortName: "Catch%",
    description: "Receptions divided by targets. Measures hands and route precision.",
    format: "percent",
    higherIsBetter: true,
    unit: "%",
  },
];

export const DEF_ADVANCED_STATS: StatDefinition[] = [
  {
    key: "tackles_per_game",
    name: "Tackles per Game",
    shortName: "Tkl/G",
    description: "Average tackles per game played.",
    format: "decimal",
    higherIsBetter: true,
  },
  {
    key: "qb_hits",
    name: "QB Hits",
    shortName: "QB Hits",
    description: "Number of times the defender hit the QB after a throw. Key pass rush metric.",
    format: "number",
    higherIsBetter: true,
  },
];

export function getStatDefinitions(positionGroup: string): StatDefinition[] {
  switch (positionGroup) {
    case "QB":
      return QB_ADVANCED_STATS;
    case "RB":
      return RB_ADVANCED_STATS;
    case "WR_TE":
      return WR_TE_ADVANCED_STATS;
    case "DEF":
      return DEF_ADVANCED_STATS;
    default:
      return [];
  }
}
