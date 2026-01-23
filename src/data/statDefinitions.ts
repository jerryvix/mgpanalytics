// NFL Advanced Stat Definitions with tooltips and explanations

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
    key: "epa_per_play",
    name: "EPA per Play",
    shortName: "EPA/Play",
    description: "Expected Points Added measures the value a player adds on each play. Positive means above average.",
    format: "decimal",
    higherIsBetter: true,
    leagueAverage: 0.08,
  },
  {
    key: "cpoe",
    name: "Completion % Over Expected",
    shortName: "CPOE",
    description: "How much better or worse a QB's completion rate is compared to expectation based on throw difficulty.",
    format: "percent",
    higherIsBetter: true,
    leagueAverage: 0,
    unit: "%",
  },
  {
    key: "air_yards_per_attempt",
    name: "Air Yards per Attempt",
    shortName: "AY/A",
    description: "Average distance the ball travels in the air per pass attempt. Indicates deep passing ability.",
    format: "decimal",
    higherIsBetter: true,
    leagueAverage: 7.8,
  },
  {
    key: "pressure_rate",
    name: "Pressure Rate",
    shortName: "Press%",
    description: "Percentage of dropbacks where the QB was pressured. Lower is better (better protection/quick release).",
    format: "percent",
    higherIsBetter: false,
    leagueAverage: 32,
    unit: "%",
  },
  {
    key: "passer_rating",
    name: "Passer Rating",
    shortName: "Rating",
    description: "Traditional NFL passer rating combining completion %, yards, TDs, and INTs. Max is 158.3.",
    format: "decimal",
    higherIsBetter: true,
    leagueAverage: 93,
  },
  {
    key: "red_zone_td_pct",
    name: "Red Zone TD%",
    shortName: "RZ TD%",
    description: "Touchdown percentage when passing in the red zone (inside 20-yard line).",
    format: "percent",
    higherIsBetter: true,
    leagueAverage: 52,
    unit: "%",
  },
  {
    key: "third_down_conv_rate",
    name: "3rd Down Conv Rate",
    shortName: "3rd%",
    description: "Percentage of 3rd down passing attempts that result in a first down or touchdown.",
    format: "percent",
    higherIsBetter: true,
    leagueAverage: 42,
    unit: "%",
  },
  {
    key: "sack_rate",
    name: "Sack Rate",
    shortName: "Sack%",
    description: "Percentage of dropbacks that result in a sack. Lower indicates better pocket presence.",
    format: "percent",
    higherIsBetter: false,
    leagueAverage: 6.5,
    unit: "%",
  },
];

export const RB_ADVANCED_STATS: StatDefinition[] = [
  {
    key: "yards_after_contact",
    name: "Yards After Contact",
    shortName: "YAC",
    description: "Average yards gained after initial contact with a defender. Measures power and elusiveness.",
    format: "decimal",
    higherIsBetter: true,
    leagueAverage: 2.8,
  },
  {
    key: "yards_before_contact",
    name: "Yards Before Contact",
    shortName: "YBC",
    description: "Average yards gained before first contact. Indicates offensive line performance and vision.",
    format: "decimal",
    higherIsBetter: true,
    leagueAverage: 1.9,
  },
  {
    key: "broken_tackles",
    name: "Broken Tackles",
    shortName: "BTkl",
    description: "Total number of tackles broken or avoided during the season.",
    format: "number",
    higherIsBetter: true,
  },
  {
    key: "explosive_run_rate",
    name: "Explosive Run Rate",
    shortName: "Exp%",
    description: "Percentage of carries that go for 10+ yards. Measures big-play ability.",
    format: "percent",
    higherIsBetter: true,
    leagueAverage: 11,
    unit: "%",
  },
  {
    key: "goal_line_efficiency",
    name: "Goal Line Efficiency",
    shortName: "GL Eff",
    description: "Touchdown rate on carries from the 1-5 yard line.",
    format: "percent",
    higherIsBetter: true,
    leagueAverage: 55,
    unit: "%",
  },
  {
    key: "snap_share",
    name: "Snap Share",
    shortName: "Snap%",
    description: "Percentage of team offensive snaps played. Key workload indicator.",
    format: "percent",
    higherIsBetter: true,
    leagueAverage: 45,
    unit: "%",
  },
  {
    key: "route_participation",
    name: "Route Participation",
    shortName: "Route%",
    description: "Percentage of passing plays where the RB ran a route. Important for PPR value.",
    format: "percent",
    higherIsBetter: true,
    leagueAverage: 65,
    unit: "%",
  },
  {
    key: "target_share",
    name: "Target Share",
    shortName: "Tgt%",
    description: "Percentage of team targets that go to this player.",
    format: "percent",
    higherIsBetter: true,
    leagueAverage: 8,
    unit: "%",
  },
];

export const WR_TE_ADVANCED_STATS: StatDefinition[] = [
  {
    key: "target_share",
    name: "Target Share",
    shortName: "Tgt%",
    description: "Percentage of team passing targets that go to this player. Key volume indicator.",
    format: "percent",
    higherIsBetter: true,
    leagueAverage: 18,
    unit: "%",
  },
  {
    key: "air_yards_share",
    name: "Air Yards Share",
    shortName: "AY%",
    description: "Percentage of team air yards allocated to this receiver. Indicates downfield usage.",
    format: "percent",
    higherIsBetter: true,
    leagueAverage: 22,
    unit: "%",
  },
  {
    key: "catch_rate",
    name: "Catch Rate",
    shortName: "Catch%",
    description: "Receptions divided by targets. Measures hands and route precision.",
    format: "percent",
    higherIsBetter: true,
    leagueAverage: 65,
    unit: "%",
  },
  {
    key: "yards_after_catch",
    name: "Yards After Catch",
    shortName: "YAC",
    description: "Average yards gained after the catch. Measures run-after-catch ability.",
    format: "decimal",
    higherIsBetter: true,
    leagueAverage: 4.2,
  },
  {
    key: "contested_catch_rate",
    name: "Contested Catch Rate",
    shortName: "CC%",
    description: "Catch rate on contested passes where a defender is in position. Measures physicality.",
    format: "percent",
    higherIsBetter: true,
    leagueAverage: 48,
    unit: "%",
  },
  {
    key: "separation",
    name: "Separation",
    shortName: "Sep",
    description: "Average yards of separation from the nearest defender at the catch point.",
    format: "decimal",
    higherIsBetter: true,
    leagueAverage: 2.8,
  },
  {
    key: "red_zone_target_share",
    name: "RZ Target Share",
    shortName: "RZ Tgt%",
    description: "Percentage of team red zone targets that go to this player.",
    format: "percent",
    higherIsBetter: true,
    leagueAverage: 15,
    unit: "%",
  },
  {
    key: "routes_run",
    name: "Routes Run",
    shortName: "Routes",
    description: "Total number of routes run during the season. Key volume indicator.",
    format: "number",
    higherIsBetter: true,
  },
];

export const DEF_ADVANCED_STATS: StatDefinition[] = [
  {
    key: "pressure_rate",
    name: "Pressure Rate",
    shortName: "Press%",
    description: "Percentage of pass rushes that result in a pressure (hurry, hit, or sack).",
    format: "percent",
    higherIsBetter: true,
    leagueAverage: 12,
    unit: "%",
  },
  {
    key: "coverage_snaps",
    name: "Coverage Snaps",
    shortName: "Cov Snaps",
    description: "Number of snaps spent in pass coverage. Indicates defensive role.",
    format: "number",
    higherIsBetter: true,
  },
  {
    key: "missed_tackle_rate",
    name: "Missed Tackle Rate",
    shortName: "MTkl%",
    description: "Percentage of tackle attempts that are missed. Lower is better.",
    format: "percent",
    higherIsBetter: false,
    leagueAverage: 12,
    unit: "%",
  },
  {
    key: "pass_rush_win_rate",
    name: "Pass Rush Win Rate",
    shortName: "PRWR",
    description: "Percentage of pass rushes where the defender beats the blocker within 2.5 seconds.",
    format: "percent",
    higherIsBetter: true,
    leagueAverage: 14,
    unit: "%",
  },
  {
    key: "run_stop_rate",
    name: "Run Stop Rate",
    shortName: "RSR",
    description: "Percentage of run snaps that result in a defensive stop (tackle at or behind line of scrimmage).",
    format: "percent",
    higherIsBetter: true,
    leagueAverage: 6,
    unit: "%",
  },
  {
    key: "passer_rating_allowed",
    name: "Passer Rating Allowed",
    shortName: "PR Allow",
    description: "Passer rating against when targeted in coverage. Lower is better for coverage players.",
    format: "decimal",
    higherIsBetter: false,
    leagueAverage: 95,
  },
  {
    key: "tackles_per_game",
    name: "Tackles per Game",
    shortName: "Tkl/G",
    description: "Average tackles per game played.",
    format: "decimal",
    higherIsBetter: true,
    leagueAverage: 5.5,
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
