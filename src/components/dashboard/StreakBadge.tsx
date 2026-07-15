import { useStreak } from "@/hooks/useStreak";
import { tierFor, nextMilestone } from "@/lib/streaks";

// Compact login-streak pill. Records today's visit on mount and shows the
// running streak + tier — a lightweight loss-aversion hook ("don't break the
// chain") with a milestone target in the tooltip.
export function StreakBadge() {
  const { data } = useStreak();
  const n = data?.current_streak ?? 0;
  if (n < 1) return null;

  const tier = tierFor(n);
  const next = nextMilestone(n);
  const isHot = n >= 3;

  return (
    <div
      title={
        data
          ? `${tier.label} · ${n}-day streak · longest ${data.longest_streak} · ${data.total_visits} visits` +
            (next ? ` · ${next - n} to ${next}` : "")
          : undefined
      }
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono ${
        isHot
          ? "border-terminal-amber/40 bg-terminal-amber/10 text-terminal-amber"
          : "border-border bg-card text-muted-foreground"
      }`}
    >
      <span className="text-sm leading-none">{tier.emoji}</span>
      <span className="font-bold tabular-nums">{n}</span>
      <span>day{n === 1 ? "" : "s"}</span>
    </div>
  );
}
