// One heat scale for the whole app so "hot" always looks the same: the more
// intense a value (a longer streak, a bigger line move, a hotter form delta),
// the warmer and brighter it reads. Keeps the visual language consistent.

// intensity: 0 (cool) → 1 (scorching)
export function heatText(intensity: number): string {
  const x = Math.max(0, Math.min(1, intensity));
  if (x >= 0.85) return "text-red-400";
  if (x >= 0.6) return "text-terminal-amber";
  if (x >= 0.35) return "text-yellow-400";
  if (x >= 0.15) return "text-terminal-green";
  return "text-foreground";
}

// Convenience scalers for common metrics → 0..1 intensity.
export const streakHeat = (streak: number) => streak / 20; // 20+ games = max
export const avgDeltaHeat = (delta: number) => delta / 0.35; // +.350 form swing = max
export const lineMoveHeat = (absMove: number, market: string) =>
  absMove / (market === "Moneyline" ? 80 : market === "Total" ? 4 : 3);

// A subtle lift + border-glow on hover — reusable card interaction.
export const hoverLift =
  "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-terminal-green/5";
