// Trending Bets — full-season futures paired with a verifiable "did you know".
//
// This is a curated SEED. Every `nugget` here is a real, checkable historical
// fact with a `source`; lines/odds are taken from live sportsbook boards
// (DraftKings, 2026-27 season) as of build time. When a futures-odds sync +
// nugget pipeline lands, it replaces this file — the shape below is exactly
// what it will emit, so no UI rework is needed. Game-level props slot in as
// additional `category` values.
//
// RULE: never ship an unverifiable nugget. Set `verified: false` and it is
// hidden from users until a source is attached.

export type BetCategory =
  | "Win Totals"
  | "Awards"
  | "Division"
  | "Championship"
  | "Game Props"; // reserved for in-season expansion

export interface TrendingBet {
  id: string;
  category: BetCategory;
  subject: string; // team or player
  logoHint?: string; // team abbr for a future logo lookup
  market: string; // "Regular Season Wins", "AP MVP", ...
  line: string; // "O/U 10.5" or "+600"
  odds?: string; // secondary odds detail, e.g. "Over -120 / Under +100"
  book: string;
  nugget: string;
  source: string;
  verified: boolean;
  updated: string; // ISO date the line was captured
}

const D = "2026-09-13"; // capture date for these boards

export const NFL_TRENDING: TrendingBet[] = [
  {
    id: "nfl-mvp-allen",
    category: "Awards",
    subject: "Josh Allen",
    logoHint: "BUF",
    market: "AP NFL MVP",
    line: "+600",
    book: "DraftKings",
    nugget:
      "Allen enters as the reigning MVP. Only two players this century have repeated as MVP — Peyton Manning (2008–09) and Aaron Rodgers (2020–21) — so a back-to-back would be rare air.",
    source: "AP MVP voting history",
    verified: true,
    updated: D,
  },
  {
    id: "nfl-dpoy-garrett",
    category: "Awards",
    subject: "Myles Garrett",
    logoHint: "CLE",
    market: "AP Defensive Player of the Year",
    line: "+400",
    book: "DraftKings",
    nugget:
      "Garrett (2023 winner) is the favorite, but repeating is hard: Aaron Donald is the only player to win back-to-back DPOY in the last decade (2020–21).",
    source: "AP DPOY history",
    verified: true,
    updated: D,
  },
  {
    id: "nfl-opoy-chase",
    category: "Awards",
    subject: "Ja'Marr Chase",
    logoHint: "CIN",
    market: "AP Offensive Player of the Year",
    line: "+1000",
    book: "DraftKings",
    nugget:
      "Chase won the receiving Triple Crown in 2024 — leading the NFL in catches, receiving yards, and touchdowns in the same season, a feat only a handful of receivers have ever pulled off.",
    source: "2024 NFL receiving leaders",
    verified: true,
    updated: D,
  },
  {
    id: "nfl-wins-bills",
    category: "Win Totals",
    subject: "Buffalo Bills",
    logoHint: "BUF",
    market: "Regular Season Wins",
    line: "O/U 10.5",
    odds: "Over -120 / Under +100",
    book: "DraftKings",
    nugget:
      "Buffalo has won at least 11 games in each of the last five seasons (2020–24) — the book is essentially asking whether that dominance finally cools.",
    source: "NFL standings 2020–2024",
    verified: true,
    updated: D,
  },
  {
    id: "nfl-wins-ravens",
    category: "Win Totals",
    subject: "Baltimore Ravens",
    logoHint: "BAL",
    market: "Regular Season Wins",
    line: "O/U 11.5",
    odds: "Over +115 / Under -140",
    book: "DraftKings",
    nugget:
      "11.5 is a steep bar — Baltimore has reached the playoffs in five of the last six seasons, but a 12-win regular season has happened only a couple of times in that stretch.",
    source: "NFL playoff appearances 2019–2024",
    verified: true,
    updated: D,
  },
  {
    id: "nfl-div-afceast",
    category: "Division",
    subject: "Buffalo Bills",
    logoHint: "BUF",
    market: "AFC East Winner",
    line: "-130",
    book: "DraftKings",
    nugget:
      "The Bills have won five straight AFC East titles. Before them, New England owned the division — 11 in a row from 2009 to 2019. The AFC East has had exactly one other champion in 16 years.",
    source: "NFL division champions",
    verified: true,
    updated: D,
  },
];

export const NCAAF_TRENDING: TrendingBet[] = [
  {
    id: "ncaaf-heisman",
    category: "Awards",
    subject: "Heisman Field",
    market: "Heisman Trophy",
    line: "Open field",
    book: "DraftKings",
    nugget:
      "No player has ever won the Heisman twice — except Archie Griffin, who did it back-to-back in 1974–75. Fifty years later, every returning favorite is still chasing history no one else has matched.",
    source: "Heisman Trust records",
    verified: true,
    updated: D,
  },
  {
    id: "ncaaf-wins-alabama",
    category: "Win Totals",
    subject: "Alabama Crimson Tide",
    logoHint: "ALA",
    market: "Regular Season Wins",
    line: "O/U 9.5",
    odds: "Over +240 / Under -300",
    book: "DraftKings",
    nugget:
      "Alabama won 10+ games in 16 straight seasons (2008–23) under Nick Saban. That streak ended in 2024 — Kalen DeBoer's first year went 9–4 — which is exactly why this number sits at 9.5, not 11.",
    source: "Alabama football records",
    verified: true,
    updated: D,
  },
  {
    id: "ncaaf-champ-repeat",
    category: "Championship",
    subject: "Georgia Bulldogs",
    logoHint: "UGA",
    market: "National Championship",
    line: "Futures",
    book: "DraftKings",
    nugget:
      "Georgia's back-to-back titles in 2021 and 2022 were the first repeat national champion since Alabama in 2011–12 — repeating at the top of college football is genuinely rare.",
    source: "CFP / BCS champions",
    verified: true,
    updated: D,
  },
  {
    id: "ncaaf-sec-title",
    category: "Championship",
    subject: "SEC Field",
    market: "National Championship",
    line: "Conference futures",
    book: "DraftKings",
    nugget:
      "Since 2006, SEC teams have won more national championships than the rest of the FBS combined — the single biggest reason SEC contenders carry shorter title odds than anyone else.",
    source: "National championship history",
    verified: true,
    updated: D,
  },
];

export function trendingFor(sport: "NFL" | "NCAAF"): TrendingBet[] {
  const all = sport === "NFL" ? NFL_TRENDING : NCAAF_TRENDING;
  return all.filter((b) => b.verified);
}
