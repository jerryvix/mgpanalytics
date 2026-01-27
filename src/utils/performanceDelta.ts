/**
 * Performance Delta Engine
 * 
 * Calculates the variance between a player's Recent Period performance 
 * and their Season Baseline Average.
 * 
 * Delta % = ((Recent_Period_Avg - Season_Baseline_Avg) / Season_Baseline_Avg) * 100
 * 
 * Recent Period definitions:
 * - NFL/NCAAF: Postseason stats (if available) vs Regular Season baseline
 * - NBA/NCAAB/MLB: Last 5 Games vs Season-to-date average
 */

export interface DeltaResult {
  delta: number;           // The raw percentage change
  isSurge: boolean;        // True if delta > 15%
  isSlump: boolean;        // True if delta < -15%
  recentValue: number;     // The recent period average
  baselineValue: number;   // The season baseline average
  label: string;           // Human-readable label
}

export interface SeasonBaseline {
  // Shared
  gamesPlayed: number;
  
  // NBA/NCAAB metrics
  pointsPerGame?: number;
  reboundsPerGame?: number;
  assistsPerGame?: number;
  minutesPerGame?: number;
  
  // NFL/NCAAF metrics
  passingYards?: number;
  passingYardsPerGame?: number;
  passingTouchdowns?: number;
  rushingYards?: number;
  rushingYardsPerGame?: number;
  rushingTouchdowns?: number;
  receivingYards?: number;
  receivingYardsPerGame?: number;
  receptions?: number;
  receivingTouchdowns?: number;
  
  // MLB metrics
  battingAverage?: number;
  homeRuns?: number;
  rbi?: number;
  ops?: number;
  era?: number;
  strikeouts?: number;
}

export interface RecentPeriod {
  gamesCount: number;
  
  // NBA/NCAAB metrics
  pointsPerGame?: number;
  reboundsPerGame?: number;
  assistsPerGame?: number;
  
  // NFL/NCAAF metrics
  passingYardsPerGame?: number;
  rushingYardsPerGame?: number;
  receivingYardsPerGame?: number;
  
  // MLB metrics
  battingAverage?: number;
  ops?: number;
  era?: number;
}

export const SURGE_THRESHOLD = 15;  // +15% = Performance Surge
export const SLUMP_THRESHOLD = -15; // -15% = Performance Slump

/**
 * Calculate the Performance Delta for a given metric
 */
export function calculateDelta(
  recentValue: number,
  baselineValue: number
): DeltaResult {
  // Avoid division by zero
  if (baselineValue === 0 || !baselineValue) {
    return {
      delta: 0,
      isSurge: false,
      isSlump: false,
      recentValue,
      baselineValue,
      label: "N/A",
    };
  }

  const delta = ((recentValue - baselineValue) / baselineValue) * 100;
  const roundedDelta = Math.round(delta * 10) / 10;

  return {
    delta: roundedDelta,
    isSurge: roundedDelta >= SURGE_THRESHOLD,
    isSlump: roundedDelta <= SLUMP_THRESHOLD,
    recentValue,
    baselineValue,
    label: formatDeltaLabel(roundedDelta),
  };
}

/**
 * Format delta as a human-readable label
 */
export function formatDeltaLabel(delta: number): string {
  const prefix = delta >= 0 ? "+" : "";
  return `${prefix}${delta.toFixed(1)}%`;
}

/**
 * Get the primary delta for an NBA/NCAAB player (based on PPG)
 */
export function getNBADelta(
  seasonAvg: { pointsPerGame?: number; reboundsPerGame?: number; assistsPerGame?: number } | null,
  recentAvg: { pointsPerGame?: number; reboundsPerGame?: number; assistsPerGame?: number } | null
): DeltaResult | null {
  if (!seasonAvg?.pointsPerGame || !recentAvg?.pointsPerGame) {
    return null;
  }

  return calculateDelta(recentAvg.pointsPerGame, seasonAvg.pointsPerGame);
}

/**
 * Get the primary delta for an NFL QB (based on passing yards per game)
 */
export function getNFLQBDelta(
  seasonStats: { passingYardsPerGame?: number } | null,
  postseasonStats: { passingYardsPerGame?: number } | null
): DeltaResult | null {
  if (!seasonStats?.passingYardsPerGame || !postseasonStats?.passingYardsPerGame) {
    return null;
  }

  return calculateDelta(postseasonStats.passingYardsPerGame, seasonStats.passingYardsPerGame);
}

/**
 * Get the primary delta for an NFL RB (based on rushing yards per game)
 */
export function getNFLRBDelta(
  seasonStats: { rushingYardsPerGame?: number } | null,
  postseasonStats: { rushingYardsPerGame?: number } | null
): DeltaResult | null {
  if (!seasonStats?.rushingYardsPerGame || !postseasonStats?.rushingYardsPerGame) {
    return null;
  }

  return calculateDelta(postseasonStats.rushingYardsPerGame, seasonStats.rushingYardsPerGame);
}

/**
 * Get the primary delta for an NFL WR/TE (based on receiving yards per game)
 */
export function getNFLReceiverDelta(
  seasonStats: { receivingYardsPerGame?: number } | null,
  postseasonStats: { receivingYardsPerGame?: number } | null
): DeltaResult | null {
  if (!seasonStats?.receivingYardsPerGame || !postseasonStats?.receivingYardsPerGame) {
    return null;
  }

  return calculateDelta(postseasonStats.receivingYardsPerGame, seasonStats.receivingYardsPerGame);
}

/**
 * Get the performance surge badge color based on delta
 */
export function getDeltaBadgeStyles(delta: number): {
  bgClass: string;
  textClass: string;
  borderClass: string;
} {
  if (delta >= SURGE_THRESHOLD) {
    return {
      bgClass: "bg-emerald-500/20",
      textClass: "text-emerald-400",
      borderClass: "border-emerald-500/30",
    };
  }
  
  if (delta <= SLUMP_THRESHOLD) {
    return {
      bgClass: "bg-red-500/20",
      textClass: "text-red-400",
      borderClass: "border-red-500/30",
    };
  }

  return {
    bgClass: "bg-muted/20",
    textClass: "text-muted-foreground",
    borderClass: "border-border",
  };
}

/**
 * Sport-specific period labels
 */
export function getRecentPeriodLabel(sport: "NFL" | "NCAAF" | "NBA" | "NCAAB" | "MLB"): string {
  switch (sport) {
    case "NFL":
    case "NCAAF":
      return "Postseason";
    case "NBA":
    case "NCAAB":
    case "MLB":
      return "Last 5 Games";
    default:
      return "Recent";
  }
}

/**
 * Get baseline period label
 */
export function getBaselinePeriodLabel(season: number = 2025): string {
  return `${season} Season Baseline`;
}

/**
 * Performance Delta disclaimer text
 */
export const DELTA_DISCLAIMER = 
  "Performance Delta: Calculated as the percentage variance between a player's Current Period (Postseason or Last 5 Games) and their 2025 Season Baseline Average.";
