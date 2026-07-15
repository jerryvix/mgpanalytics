import { Flame } from "lucide-react";
import { useStreak } from "@/hooks/useStreak";

// Compact login-streak pill. Records today's visit on mount and shows the
// running streak — a lightweight loss-aversion hook ("don't break the chain").
export function StreakBadge() {
  const { data } = useStreak();
  const n = data?.current_streak ?? 0;
  if (n < 1) return null;

  const isHot = n >= 3;
  return (
    <div
      title={
        data
          ? `${n}-day streak · longest ${data.longest_streak} · ${data.total_visits} total visits`
          : undefined
      }
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono ${
        isHot
          ? "border-terminal-amber/40 bg-terminal-amber/10 text-terminal-amber"
          : "border-border bg-card text-muted-foreground"
      }`}
    >
      <Flame className={`w-3.5 h-3.5 ${isHot ? "text-terminal-amber" : ""}`} />
      <span className="font-bold tabular-nums">{n}</span>
      <span>day{n === 1 ? "" : "s"}</span>
    </div>
  );
}
