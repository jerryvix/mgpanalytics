// Streak milestone tiers + helpers, shared by the badge, the home card, and the
// daily digest so the reward logic lives in one place.

export interface StreakTier {
  min: number;
  label: string;
  emoji: string;
}

export const STREAK_TIERS: StreakTier[] = [
  { min: 100, label: "Legend", emoji: "👑" },
  { min: 30, label: "Elite", emoji: "💎" },
  { min: 14, label: "Locked In", emoji: "⚡" },
  { min: 7, label: "On Fire", emoji: "🔥" },
  { min: 3, label: "Rolling", emoji: "📈" },
  { min: 1, label: "Getting Started", emoji: "🌱" },
];

// Days that trigger a celebration / reward moment.
export const MILESTONES = [3, 7, 14, 30, 60, 100, 180, 365];

export function tierFor(streak: number): StreakTier {
  return STREAK_TIERS.find((t) => streak >= t.min) ?? STREAK_TIERS[STREAK_TIERS.length - 1];
}

export function nextMilestone(streak: number): number | null {
  return MILESTONES.find((m) => m > streak) ?? null;
}

// True on the exact day a milestone is hit (for a one-time celebration).
export function isMilestoneDay(streak: number): boolean {
  return MILESTONES.includes(streak);
}
