// Pure metrics for the projection accuracy backtester. All grading semantics
// that the UI displays are defined (and unit-tested) here.
//
// PUSH HANDLING (documented decision, mirrored in the SQL view comments and
// the UI footnote): a push - actual landing exactly on the line - is the book
// being exactly right. Pushes are EXCLUDED from the hit-rate denominator and
// reported as a separate count; folding them into either side would bias the
// accuracy estimate, and exclusion matches the stake-returned betting
// convention. hit rates here are therefore overs / (overs + unders).

import { impliedPair } from "@/lib/odds";

export type LineResult = "over" | "under" | "push" | "ungraded";

export interface GradedLine {
  result: LineResult;
  line: number;
  actual: number | null;
  overOdds: number | null;
  underOdds: number | null;
}

export interface HitRateSummary {
  graded: number; // overs + unders (pushes excluded from the denominator)
  overs: number;
  unders: number;
  pushes: number;
  ungraded: number;
  /** overs / (overs + unders); null when nothing graded */
  overRate: number | null;
  /** mean |actual - line| across over/under/push rows */
  meanAbsError: number | null;
  /** mean |actual - line| / line (props only make sense relative) */
  meanAbsErrorPct: number | null;
  /** Of lines where the juice favored a side (no-vig prob != 0.5), how often
   * that favored side hit. The market-calibration number. */
  favoredSideHitRate: number | null;
  favoredSideSample: number;
}

export function summarizeLines(rows: GradedLine[]): HitRateSummary {
  let overs = 0, unders = 0, pushes = 0, ungraded = 0;
  let absErrSum = 0, absErrCount = 0;
  let absErrPctSum = 0, absErrPctCount = 0;
  let favoredHits = 0, favoredSample = 0;

  for (const r of rows) {
    if (r.result === "ungraded") { ungraded++; continue; }
    if (r.result === "push") pushes++;
    else if (r.result === "over") overs++;
    else unders++;

    if (r.actual !== null) {
      const err = Math.abs(r.actual - r.line);
      absErrSum += err;
      absErrCount++;
      if (r.line > 0) {
        absErrPctSum += err / r.line;
        absErrPctCount++;
      }
    }

    // Favored side per the no-vig implied pair: over price is "home",
    // under is "away". Ties at exactly 0.5 carry no market lean - skipped.
    if (r.result !== "push" && r.overOdds !== null && r.underOdds !== null) {
      const pair = impliedPair(r.overOdds, r.underOdds);
      if (pair && pair.home !== pair.away) {
        const favored = pair.home > pair.away ? "over" : "under";
        favoredSample++;
        if (r.result === favored) favoredHits++;
      }
    }
  }

  const graded = overs + unders;
  return {
    graded,
    overs,
    unders,
    pushes,
    ungraded,
    overRate: graded > 0 ? overs / graded : null,
    meanAbsError: absErrCount > 0 ? absErrSum / absErrCount : null,
    meanAbsErrorPct: absErrPctCount > 0 ? absErrPctSum / absErrPctCount : null,
    favoredSideHitRate: favoredSample > 0 ? favoredHits / favoredSample : null,
    favoredSideSample: favoredSample,
  };
}

// ---------------------------------------------------------------------------
// ADP semantics. ADP has no line, so the miss metric is a signed rank
// difference: spotDelta = adpPosRank - finishPosRank. Positive = the player
// finished at a BETTER (lower) rank than drafted, i.e. beat ADP by that many
// spots; negative = busted by that many spots.
//
// A ratio-based rule ("bust if finish > 2x ADP rank") looks elegant but
// breaks down at the top of the board: a WR drafted 1st at the position who
// finishes 4th only moved 3 spots, yet 4 > 2*1 flags it as a "bust" under a
// multiplicative rule. Spot-based thresholds don't have that distortion, so
// that's what's used here.
//
// Universe: positional ADP rank within the cutoffs below (~two 12-team
// drafts of startable depth; deeper ADP is noise). Outcomes:
//   beat = finished at or better than the ADP slot (spotDelta >= 0)
//   bust = fell by at least a quarter of the position's startable pool
//          (BUST_SPOT_FRACTION below), or never played (dnp)
//   met  = fell short of the slot but not by enough to call it a bust
// dnp counts as a bust in bust-rate denominators but is EXCLUDED from
// mean-spot-delta averages (there is no defensible numeric for a season that
// never happened) and is pinned to the injury list in leaderboards.
// ---------------------------------------------------------------------------

export const ADP_UNIVERSE: Record<string, number> = { QB: 24, RB: 50, WR: 60, TE: 20 };

// A quarter of the position's startable pool: QB 6, RB 13, WR 15, TE 5.
const BUST_SPOT_FRACTION = 0.25;
function bustThreshold(position: string): number {
  const universe = ADP_UNIVERSE[position];
  return universe ? Math.round(universe * BUST_SPOT_FRACTION) : Infinity;
}

export type AdpOutcome = "beat" | "met" | "bust" | "dnp";

export interface AdpRow {
  position: string;
  adpPosRank: number;
  finishPosRank: number | null;
  games: number | null;
}

export function inAdpUniverse(row: Pick<AdpRow, "position" | "adpPosRank">): boolean {
  const cutoff = ADP_UNIVERSE[row.position];
  return cutoff !== undefined && row.adpPosRank <= cutoff;
}

/** adpPosRank - finishPosRank: positive = beat ADP by N spots, negative = busted by N spots. */
export function adpSpotDelta(row: AdpRow): number | null {
  if (row.finishPosRank === null || row.finishPosRank < 1 || row.adpPosRank < 1) return null;
  return row.adpPosRank - row.finishPosRank;
}

export function classifyAdpOutcome(row: AdpRow): AdpOutcome {
  if (row.finishPosRank === null) return "dnp";
  const delta = row.adpPosRank - row.finishPosRank;
  if (delta >= 0) return "beat";
  if (-delta >= bustThreshold(row.position)) return "bust";
  return "met";
}

export interface AdpSummary {
  sample: number; // rows in universe
  beat: number;
  met: number;
  bust: number; // includes dnp
  dnp: number;
  /** bust (incl. dnp) / sample */
  bustRate: number | null;
  beatRate: number | null;
  /** mean spot delta over rows with a finish (dnp excluded); positive = the
   * group beat ADP on average */
  meanSpotDelta: number | null;
}

export function summarizeAdp(rows: AdpRow[]): AdpSummary {
  const universe = rows.filter(inAdpUniverse);
  let beat = 0, met = 0, bust = 0, dnp = 0;
  let deltaSum = 0, deltaCount = 0;
  for (const r of universe) {
    const outcome = classifyAdpOutcome(r);
    if (outcome === "beat") beat++;
    else if (outcome === "met") met++;
    else if (outcome === "bust") bust++;
    else { dnp++; bust++; } // dnp counts as bust in the rate...
    const delta = adpSpotDelta(r);
    if (delta !== null) { deltaSum += delta; deltaCount++; } // ...but not the mean
  }
  const sample = universe.length;
  return {
    sample,
    beat,
    met,
    bust,
    dnp,
    bustRate: sample > 0 ? bust / sample : null,
    beatRate: sample > 0 ? beat / sample : null,
    meanSpotDelta: deltaCount > 0 ? deltaSum / deltaCount : null,
  };
}

// ---------------------------------------------------------------------------
// Injury split for the Biggest Misses leaderboard. Distinct from the
// games >= 6 floor in nfl_fantasy_season_ranks: that floor asks "did they
// play enough for a real PPG?"; this asks "was the season injury-shaped?".
// A 10-game season passes the first and fails the second by design.
// Threshold = ~82% of the schedule in both eras (14/17 post-2021, 13/16
// before).
// ---------------------------------------------------------------------------

export function isHealthySeason(games: number | null | undefined, season: number): boolean {
  if (games == null) return false;
  return games >= (season >= 2021 ? 14 : 13);
}

/** Leaderboard miss magnitudes, per source. */
export function propMissMagnitude(row: { actual: number | null; line: number }): number | null {
  if (row.actual === null || row.line <= 0) return null;
  return Math.abs(row.actual - row.line) / row.line;
}

export function winTotalMissMagnitude(row: { actual: number | null; line: number }): number | null {
  if (row.actual === null) return null;
  return Math.abs(row.actual - row.line);
}

export function adpMissMagnitude(row: AdpRow): number | null {
  const delta = adpSpotDelta(row);
  return delta === null ? null : Math.abs(delta);
}
