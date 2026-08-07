// Pure classifiers for CFB Matchup Intelligence. Three signals - roster
// continuity (weighted heaviest per spec), NFL draft talent density, and
// head-to-head history - each with an explicit "insufficient" arm, folded
// into one composite lean. Continuity percentages are 0-100.

export type ContinuityVerdict = "intact" | "retooled" | "rebuilt" | "insufficient";
export type SignalLean = "home" | "away" | "even" | "insufficient";
export type H2HVerdict = "team1_owns" | "team2_owns" | "split" | "insufficient";

export interface ContinuityInput {
  percentPpa: number | null;
  /** Incoming transfers only - departures are already priced into percentPpa. */
  portalIn: number | null;
}

/**
 * Classify one team's year-over-year roster continuity. Returning production
 * (percent of prior-season PPA back on the roster) is the backbone; the
 * bands follow FBS distribution - ~65%+ returning is a largely intact core,
 * under ~40% is a genuine rebuild.
 */
export function classifyContinuity(input: ContinuityInput): ContinuityVerdict {
  const { percentPpa } = input;
  if (percentPpa == null || !Number.isFinite(percentPpa)) return "insufficient";
  if (percentPpa >= 65) return "intact";
  if (percentPpa < 40) return "rebuilt";
  return "retooled";
}

/**
 * Continuity score for edge comparison. Returning PPA already reflects every
 * departure (drafted or portaled-out players' production is in the
 * denominator but not the numerator), so departures must NOT be subtracted
 * again - only portal ADDITIONS carry information percentPpa misses. Half a
 * point per incoming transfer, capped at +10 so bulk-churn programs don't
 * buy an edge on volume.
 */
export function continuityScore(input: ContinuityInput): number | null {
  if (input.percentPpa == null || !Number.isFinite(input.percentPpa)) return null;
  return input.percentPpa + Math.min(Math.max(input.portalIn ?? 0, 0) * 0.5, 10);
}

/**
 * Which side keeps more of what mattered last season. A 12-point score gap
 * (roughly one continuity band) is required to call an edge.
 */
export function continuityEdge(home: ContinuityInput, away: ContinuityInput): SignalLean {
  const h = continuityScore(home);
  const a = continuityScore(away);
  if (h == null || a == null) return "insufficient";
  if (h - a >= 12) return "home";
  if (a - h >= 12) return "away";
  return "even";
}

export interface H2HGameRow {
  season: number;
  date: string | null;
  home_school: string;
  away_school: string;
  home_points: number;
  away_points: number;
}

export interface H2HSummary {
  verdict: H2HVerdict;
  team1Wins: number;
  team2Wins: number;
  totalGames: number;
  /** Consecutive most-recent wins by one school; null unless count >= 2. */
  streak: { school: string; count: number } | null;
}

function winnerOf(g: H2HGameRow): string | null {
  if (g.home_points > g.away_points) return g.home_school;
  if (g.away_points > g.home_points) return g.away_school;
  return null;
}

/**
 * Summarize a series between two schools. Games must already be filtered to
 * the two teams; order doesn't matter (sorted newest-first internally).
 * Fewer than 2 meetings can't establish a lean - "insufficient".
 * "Owns" = won at least 75% of the meetings.
 */
export function classifyH2H(
  games: H2HGameRow[],
  school1: string,
  school2: string
): H2HSummary {
  const sorted = [...games].sort((a, b) => {
    if (a.season !== b.season) return b.season - a.season;
    return (b.date ?? "").localeCompare(a.date ?? "");
  });

  let team1Wins = 0;
  let team2Wins = 0;
  for (const g of sorted) {
    const w = winnerOf(g);
    if (w === school1) team1Wins++;
    else if (w === school2) team2Wins++;
  }
  const totalGames = sorted.length;

  let streak: H2HSummary["streak"] = null;
  const firstWinner = sorted.map(winnerOf).find((w) => w !== null) ?? null;
  if (firstWinner) {
    let count = 0;
    for (const g of sorted) {
      const w = winnerOf(g);
      if (w === null) continue; // ties don't extend or break a streak read
      if (w === firstWinner) count++;
      else break;
    }
    if (count >= 2) streak = { school: firstWinner, count };
  }

  let verdict: H2HVerdict;
  if (totalGames < 2) {
    verdict = "insufficient";
  } else if (team1Wins / totalGames >= 0.75) {
    verdict = "team1_owns";
  } else if (team2Wins / totalGames >= 0.75) {
    verdict = "team2_owns";
  } else {
    verdict = "split";
  }

  return { verdict, team1Wins, team2Wins, totalGames, streak };
}

/** Rank-weighted talent points: top-15 pick territory = 3, first-two-rounds territory = 2, any board spot = 1. */
export function talentPoints(ranks: number[]): number {
  return ranks.reduce((sum, r) => sum + (r <= 15 ? 3 : r <= 50 ? 2 : 1), 0);
}

const BOARD_STALE_DAYS = 21;

export interface TalentEdgeResult {
  lean: SignalLean;
  homePoints: number;
  awayPoints: number;
}

/**
 * Compare likely-drafted talent between the rosters. A stale or missing
 * board (no capture in 21 days) is "insufficient" - a July board says
 * nothing about November. Fresh board with no prospects on either side is a
 * real "even": most matchups won't feature key draft names, and that's
 * worth knowing too.
 */
export function classifyTalentEdge(
  homeRanks: number[],
  awayRanks: number[],
  capturedAt: string | Date | null,
  now: Date = new Date()
): TalentEdgeResult {
  const homePoints = talentPoints(homeRanks);
  const awayPoints = talentPoints(awayRanks);

  if (!capturedAt) return { lean: "insufficient", homePoints, awayPoints };
  const captured = typeof capturedAt === "string" ? new Date(capturedAt) : capturedAt;
  if (!Number.isFinite(captured.getTime())) return { lean: "insufficient", homePoints, awayPoints };
  const ageDays = (now.getTime() - captured.getTime()) / 86_400_000;
  if (ageDays > BOARD_STALE_DAYS) return { lean: "insufficient", homePoints, awayPoints };

  if (homePoints - awayPoints >= 3) return { lean: "home", homePoints, awayPoints };
  if (awayPoints - homePoints >= 3) return { lean: "away", homePoints, awayPoints };
  return { lean: "even", homePoints, awayPoints };
}

export interface CompositeInput {
  continuity: SignalLean;
  talent: SignalLean;
  h2h: SignalLean;
}

export interface CompositeVerdict {
  lean: SignalLean;
  /** Weighted score in [-1, 1] (+ = home), null when no signal has data. */
  score: number | null;
  signalsUsed: number;
}

const SIGNAL_WEIGHTS: Record<keyof CompositeInput, number> = {
  continuity: 0.5, // heaviest per spec - last season matters less if the roster left
  talent: 0.3,
  h2h: 0.2,
};

/**
 * Fold the three signal leans into one composite. Insufficient signals drop
 * out and the remaining weights renormalize, so a matchup with only
 * continuity data still gets a full-strength read from it.
 */
export function compositeVerdict(input: CompositeInput): CompositeVerdict {
  let weightSum = 0;
  let score = 0;
  let signalsUsed = 0;

  for (const key of Object.keys(SIGNAL_WEIGHTS) as Array<keyof CompositeInput>) {
    const lean = input[key];
    if (lean === "insufficient") continue;
    const w = SIGNAL_WEIGHTS[key];
    weightSum += w;
    signalsUsed++;
    score += w * (lean === "home" ? 1 : lean === "away" ? -1 : 0);
  }

  if (signalsUsed === 0) return { lean: "insufficient", score: null, signalsUsed: 0 };

  const normalized = score / weightSum;
  const lean: SignalLean = normalized >= 0.25 ? "home" : normalized <= -0.25 ? "away" : "even";
  return { lean, score: Math.round(normalized * 100) / 100, signalsUsed };
}
