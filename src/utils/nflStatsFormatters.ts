/**
 * Format a number with commas for thousands
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString();
}

/**
 * Format a decimal to 1 decimal place
 */
export function formatDecimal(value: number | null | undefined, places = 1): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(places);
}

/**
 * Format a percentage
 */
export function formatPercent(value: number | null | undefined, places = 1): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(places)}%`;
}

/**
 * Calculate completion percentage
 */
export function calcCompletionPct(completions: number | null, attempts: number | null): string {
  if (!completions || !attempts || attempts === 0) return "—";
  return `${((completions / attempts) * 100).toFixed(1)}%`;
}

/**
 * Calculate yards per carry
 */
export function calcYPC(yards: number | null, attempts: number | null): string {
  if (!yards || !attempts || attempts === 0) return "—";
  return (yards / attempts).toFixed(1);
}

/**
 * Calculate yards per reception
 */
export function calcYPR(yards: number | null, receptions: number | null): string {
  if (!yards || !receptions || receptions === 0) return "—";
  return (yards / receptions).toFixed(1);
}

/**
 * Calculate yards per attempt (passing)
 */
export function calcYPA(yards: number | null, attempts: number | null): string {
  if (!yards || !attempts || attempts === 0) return "—";
  return (yards / attempts).toFixed(1);
}

/**
 * Calculate per-game average
 */
export function calcPerGame(total: number | null | undefined, games: number | null | undefined): string {
  if (!total || !games || games === 0) return "—";
  return (total / games).toFixed(1);
}

/**
 * Format a stat with per-game average
 */
export function formatStatWithAvg(
  total: number | null | undefined, 
  games: number | null | undefined
): { total: string; avg: string } {
  return {
    total: formatNumber(total),
    avg: calcPerGame(total, games)
  };
}

/**
 * Determine if a value exceeds the average (for highlighting)
 */
export function exceedsAverage(value: number | null | undefined, average: number | null | undefined): boolean {
  if (value === null || value === undefined || average === null || average === undefined) return false;
  return value > average;
}

/**
 * Get position group from abbreviation
 */
export function getPositionGroup(position: string): "QB" | "RB" | "WR_TE" | "DEF" | "OTHER" {
  const pos = position?.toUpperCase();
  
  if (pos === "QB" || pos === "QUARTERBACK") return "QB";
  if (pos === "RB" || pos === "FB" || pos === "RUNNING BACK" || pos === "FULLBACK") return "RB";
  if (pos === "WR" || pos === "TE" || pos === "WIDE RECEIVER" || pos === "TIGHT END") return "WR_TE";
  if (["DE", "DT", "LB", "CB", "S", "DB", "MLB", "OLB", "ILB", "FS", "SS", "DEFENSIVE END", 
       "DEFENSIVE TACKLE", "LINEBACKER", "CORNERBACK", "SAFETY"].includes(pos)) return "DEF";
  
  return "OTHER";
}

/**
 * Format game date for display
 */
export function formatGameDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateString;
  }
}

/**
 * Format opponent with home/away indicator
 */
export function formatOpponent(opponent: string, isHome: boolean): string {
  return isHome ? `vs ${opponent}` : `@ ${opponent}`;
}

/**
 * Calculate fantasy points (PPR scoring)
 */
export function calcFantasyPoints(stats: {
  pass_yards?: number | null;
  pass_td?: number | null;
  interceptions?: number | null;
  rush_yards?: number | null;
  rush_td?: number | null;
  receptions?: number | null;
  rec_yards?: number | null;
  rec_td?: number | null;
  fumbles_lost?: number | null;
}): number {
  let points = 0;
  
  // Passing
  points += (stats.pass_yards || 0) * 0.04; // 1 point per 25 yards
  points += (stats.pass_td || 0) * 4;
  points -= (stats.interceptions || 0) * 2;
  
  // Rushing
  points += (stats.rush_yards || 0) * 0.1; // 1 point per 10 yards
  points += (stats.rush_td || 0) * 6;
  
  // Receiving (PPR)
  points += (stats.receptions || 0) * 1; // 1 point per reception
  points += (stats.rec_yards || 0) * 0.1;
  points += (stats.rec_td || 0) * 6;
  
  // Fumbles
  points -= (stats.fumbles_lost || 0) * 2;
  
  return Math.round(points * 10) / 10;
}

/**
 * Get stat color class based on value
 */
export function getStatColorClass(
  value: number | null | undefined,
  thresholds: { good: number; great: number },
  higherIsBetter = true
): string {
  if (value === null || value === undefined) return "text-muted-foreground";
  
  if (higherIsBetter) {
    if (value >= thresholds.great) return "text-terminal-green";
    if (value >= thresholds.good) return "text-foreground";
    return "text-muted-foreground";
  } else {
    if (value <= thresholds.great) return "text-terminal-green";
    if (value <= thresholds.good) return "text-foreground";
    return "text-destructive";
  }
}
