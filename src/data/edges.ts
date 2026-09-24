// Daily Edge - a rotating pool of verifiable "did you know" insights that give
// users a fresh reason to open the app every day (the habit loop). Each item is
// a real, sourced fact; the picker rotates deterministically by day so everyone
// sees the same edge on a given date without needing new data daily. A future
// insight-generation engine appends to this pool from live synced data.
//
// RULE: evergreen, verifiable facts only. Year ranges use ('YY-'YY) style.
// A fact that a known future result could make false ("none since...") and
// every attached market line carry `validThrough` (last Eastern day it holds);
// only activeEdges() may feed a screen.

export interface Edge {
  id: string;
  sport: "NFL" | "NCAAF" | "MLB" | "NBA" | "General";
  headline: string; // short hook
  detail: string; // the did-you-know
  source: string;
  // The wager this edge informs - lines from the curated Trending Bets board
  // (same verification rules). Ties the insight to an action.
  market?: { label: string; line: string; book: string; validThrough?: string };
  validThrough?: string;
  // Optional confidence badge - only set when the underlying fact is a clean,
  // well-sourced record (not a probabilistic call).
  confidence?: "high";
  // Optional supporting comparison, e.g. a record vs. the closest runner-up.
  stat?: {
    label: string;
    rows: { label: string; value: string; highlight?: boolean }[];
  };
}

// Same boundaries as src/data/trendingBets.ts: the July preseason boards stop
// being the market once games are played (NFL opener Sep 9, NCAAF Aug 29).
const NFL_PRESEASON = "2026-09-09";
const NCAAF_PRESEASON = "2026-08-28";
// The 2026 NFL MVP is announced at NFL Honors, the Thursday before the Feb 14
// 2027 Super Bowl: "last 13 MVPs" and "none since Rodgers" can change then.
const BEFORE_NFL_HONORS = "2027-02-10";
// The 2026 college title game falls in the CFP window (Dec 18 - Jan 28 per
// ESPN's calendar); "the last two crowns" holds until it is played.
const BEFORE_CFP_TITLE = "2027-01-17";
// The 2026 Heisman is presented in mid-December; "no one has matched it" holds
// until then.
const BEFORE_HEISMAN_2026 = "2026-12-11";

export const EDGE_POOL: Edge[] = [
  {
    id: "edge-heisman-griffin",
    sport: "NCAAF",
    headline: "The Heisman's 50-year record",
    detail:
      "Only one player has ever won the Heisman twice - Archie Griffin, back-to-back in ('74-'75). In half a century since, no one has matched it.",
    source: "Heisman Trust records",
    validThrough: BEFORE_HEISMAN_2026,
    market: { label: "2026 Heisman favorite: CJ Carr (ND)", line: "+700", book: "DraftKings", validThrough: NCAAF_PRESEASON },
  },
  {
    id: "edge-mvp-qb",
    sport: "NFL",
    headline: "The MVP is a QB's award",
    detail:
      "The last 13 NFL MVPs have all been quarterbacks. Since 2001, only three non-QBs have won - all of them running backs.",
    source: "AP MVP winners since 2001",
    validThrough: BEFORE_NFL_HONORS,
    market: { label: "2026 MVP favorite: Josh Allen (BUF)", line: "+550", book: "DraftKings", validThrough: NFL_PRESEASON },
  },
  {
    id: "edge-mvp-repeat",
    sport: "NFL",
    headline: "Repeating as MVP is nearly impossible",
    detail:
      "Only five players in NFL history have won back-to-back MVP, and none since Aaron Rodgers in ('20-'21).",
    source: "AP MVP voting history",
    validThrough: BEFORE_NFL_HONORS,
    market: { label: "Reigning MVP Josh Allen to repeat", line: "+550", book: "DraftKings", validThrough: NFL_PRESEASON },
  },
  {
    id: "edge-garrett-unanimous",
    sport: "NFL",
    headline: "A rare unanimous honor",
    detail:
      "Myles Garrett is just the second player ever to win Defensive Player of the Year unanimously, after J.J. Watt in '14.",
    source: "AP DPOY history",
    // "just the second": a unanimous 2026 DPOY at NFL Honors would make it three
    validThrough: BEFORE_NFL_HONORS,
    market: { label: "2026 DPOY favorite: Myles Garrett (CLE)", line: "+400", book: "DraftKings", validThrough: NFL_PRESEASON },
  },
  {
    id: "edge-indiana-title",
    sport: "NCAAF",
    headline: "A perfect season for the ages",
    detail:
      "Indiana went 16-0 to win the '25 national title - just the third 16-0 champion in history, joining 1894 Yale and 2019 North Dakota State.",
    source: "2025 CFP; NCAA records",
    // "just the third 16-0 champion": a 16-0 champion in the 2026 title game would make it four
    validThrough: BEFORE_CFP_TITLE,
    market: { label: "2026 national title favorite: Ohio State", line: "+600", book: "DraftKings", validThrough: NCAAF_PRESEASON },
  },
  {
    id: "edge-sec-dominance",
    sport: "NCAAF",
    headline: "The SEC's championship stranglehold",
    detail:
      "Since 2006, SEC programs have won more national titles than the rest of college football combined - though the last two crowns both went to the Big Ten.",
    source: "National championship history",
    validThrough: BEFORE_CFP_TITLE,
    market: { label: "2026 SEC title favorite: Texas", line: "+300", book: "DraftKings", validThrough: NCAAF_PRESEASON },
  },
  {
    id: "edge-alabama-streak",
    sport: "NCAAF",
    headline: "Sixteen years of double digits",
    detail:
      "Under Nick Saban, Alabama won 10+ games in 16 straight seasons ('08-'23) - a run that ended the year after he retired.",
    source: "Alabama football records",
    market: { label: "Alabama 2026 win total", line: "O/U 8.5 (Over -118)", book: "DraftKings", validThrough: NCAAF_PRESEASON },
  },
  {
    id: "edge-wr-heisman",
    sport: "NCAAF",
    headline: "Receivers rarely win it",
    detail:
      "Before DeVonta Smith in 2020, no wide receiver had won the Heisman since Desmond Howard in 1991 - the award almost always goes to a QB or RB.",
    source: "Heisman winners by position",
    market: { label: "Best non-QB on the Heisman board: Jeremiah Smith (OSU)", line: "+1400", book: "DraftKings", validThrough: NCAAF_PRESEASON },
  },
  {
    id: "edge-bills-afceast",
    sport: "NFL",
    headline: "A division dynasty, interrupted",
    detail:
      "Buffalo won five straight AFC East titles ('20-'24) before New England - behind second-year QB Drake Maye - ended the run in '25 and reached Super Bowl LX.",
    source: "NFL division champions",
    market: { label: "Bills to win the AFC East back", line: "-125", book: "DraftKings", validThrough: NFL_PRESEASON },
  },
  {
    id: "edge-dimaggio",
    sport: "MLB",
    headline: "Baseball's most untouchable record",
    detail:
      "Joe DiMaggio's 56-game hitting streak (1941) is the longest in MLB history - no one has come closer than 12 games (Pete Rose, 44 in 1978) in over 80 years.",
    source: "MLB record book",
    confidence: "high",
    stat: {
      label: "Longest Hitting Streaks",
      rows: [
        { label: "Joe DiMaggio ('41)", value: "56", highlight: true },
        { label: "Pete Rose ('78)", value: "44" },
      ],
    },
  },
];

const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });

/**
 * The pool as of `now`: edges past their validThrough are dropped and expired
 * market lines are stripped (the evergreen fact stays, the July price goes).
 */
export function activeEdges(pool: Edge[] = EDGE_POOL, now: Date = new Date()): Edge[] {
  const today = ET_DAY.format(now);
  return pool
    .filter((e) => !e.validThrough || today <= e.validThrough)
    .map((e) =>
      e.market?.validThrough && today > e.market.validThrough ? { ...e, market: undefined } : e
    );
}

// Deterministic day-of-year rotation so the "edge of the day" is stable for
// everyone on a given date and cycles through the whole (active) pool.
export function edgeOfTheDay(pool?: Edge[], date = new Date()): Edge {
  pool = pool ?? activeEdges(EDGE_POOL, date);
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const diff = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start;
  const dayOfYear = Math.floor(diff / 86_400_000);
  return pool[dayOfYear % pool.length];
}
