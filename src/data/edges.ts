// Daily Edge — a rotating pool of verifiable "did you know" insights that give
// users a fresh reason to open the app every day (the habit loop). Each item is
// a real, sourced fact; the picker rotates deterministically by day so everyone
// sees the same edge on a given date without needing new data daily. A future
// insight-generation engine appends to this pool from live synced data.
//
// RULE: evergreen, verifiable facts only. Year ranges use ('YY-'YY) style.

export interface Edge {
  id: string;
  sport: "NFL" | "NCAAF" | "MLB" | "NBA" | "General";
  headline: string; // short hook
  detail: string; // the did-you-know
  source: string;
}

export const EDGE_POOL: Edge[] = [
  {
    id: "edge-heisman-griffin",
    sport: "NCAAF",
    headline: "The Heisman's 50-year record",
    detail:
      "Only one player has ever won the Heisman twice — Archie Griffin, back-to-back in ('74-'75). In half a century since, no one has matched it.",
    source: "Heisman Trust records",
  },
  {
    id: "edge-mvp-qb",
    sport: "NFL",
    headline: "The MVP is a QB's award",
    detail:
      "The last 13 NFL MVPs have all been quarterbacks. Since 2001, only three non-QBs have won — all of them running backs.",
    source: "AP MVP winners since 2001",
  },
  {
    id: "edge-mvp-repeat",
    sport: "NFL",
    headline: "Repeating as MVP is nearly impossible",
    detail:
      "Only five players in NFL history have won back-to-back MVP, and none since Aaron Rodgers in ('20-'21).",
    source: "AP MVP voting history",
  },
  {
    id: "edge-garrett-unanimous",
    sport: "NFL",
    headline: "A rare unanimous honor",
    detail:
      "Myles Garrett is just the second player ever to win Defensive Player of the Year unanimously, after J.J. Watt in '14.",
    source: "AP DPOY history",
  },
  {
    id: "edge-indiana-title",
    sport: "NCAAF",
    headline: "A perfect season for the ages",
    detail:
      "Indiana went 16-0 to win the '25 national title — just the third 16-0 champion in history, joining 1894 Yale and 2019 North Dakota State.",
    source: "2025 CFP; NCAA records",
  },
  {
    id: "edge-sec-dominance",
    sport: "NCAAF",
    headline: "The SEC's championship stranglehold",
    detail:
      "Since 2006, SEC programs have won more national titles than the rest of college football combined — though the last two crowns both went to the Big Ten.",
    source: "National championship history",
  },
  {
    id: "edge-alabama-streak",
    sport: "NCAAF",
    headline: "Sixteen years of double digits",
    detail:
      "Under Nick Saban, Alabama won 10+ games in 16 straight seasons ('08-'23) — a run that ended the year after he retired.",
    source: "Alabama football records",
  },
  {
    id: "edge-wr-heisman",
    sport: "NCAAF",
    headline: "Receivers rarely win it",
    detail:
      "Before DeVonta Smith in 2020, no wide receiver had won the Heisman since Desmond Howard in 1991 — the award almost always goes to a QB or RB.",
    source: "Heisman winners by position",
  },
  {
    id: "edge-bills-afceast",
    sport: "NFL",
    headline: "A division dynasty, interrupted",
    detail:
      "Buffalo won five straight AFC East titles ('20-'24) before New England — behind rookie Drake Maye — ended the run in '25 and reached Super Bowl LX.",
    source: "NFL division champions",
  },
  {
    id: "edge-dimaggio",
    sport: "MLB",
    headline: "Baseball's most untouchable record",
    detail:
      "Joe DiMaggio's 56-game hitting streak (1941) is the longest in MLB history — no one has come within 12 games of it in over 80 years.",
    source: "MLB record book",
  },
];

// Deterministic day-of-year rotation so the "edge of the day" is stable for
// everyone on a given date and cycles through the whole pool.
export function edgeOfTheDay(pool: Edge[] = EDGE_POOL, date = new Date()): Edge {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const diff = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start;
  const dayOfYear = Math.floor(diff / 86_400_000);
  return pool[dayOfYear % pool.length];
}
