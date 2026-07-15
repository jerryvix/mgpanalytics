import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { useStreak } from "@/hooks/useStreak";
import { tierFor, nextMilestone, isMilestoneDay } from "@/lib/streaks";
import { CountUp } from "@/components/ui/CountUp";

// Compact streak progress card: current tier, streak count, and progress toward
// the next milestone reward. Celebrates on a milestone day.
export function StreakCard() {
  const { data } = useStreak();
  const n = data?.current_streak ?? 0;
  if (!data || n < 1) return null;

  const tier = tierFor(n);
  const next = nextMilestone(n);
  const celebrating = isMilestoneDay(n);
  // progress from the previous milestone (or 0) to the next
  const prev = next ? Math.max(0, next - (next <= 7 ? next : next === 14 ? 7 : next === 30 ? 14 : 30)) : 0;
  const pct = next ? Math.min(100, Math.round(((n - prev) / (next - prev)) * 100)) : 100;

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Card
        className={`border ${
          celebrating ? "border-terminal-amber/50 bg-terminal-amber/10" : "border-border bg-card"
        }`}
      >
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <div className="text-2xl leading-none">{tier.emoji}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-mono font-bold text-foreground tabular-nums">
                  <CountUp value={n} />-day streak
                </span>
                <span className="text-xs font-mono text-terminal-amber uppercase tracking-wide">{tier.label}</span>
              </div>
              {celebrating ? (
                <p className="text-xs text-terminal-amber font-medium mt-0.5">
                  🎉 Milestone hit — {n} days straight. Keep the chain alive!
                </p>
              ) : next ? (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {next - n} more day{next - n === 1 ? "" : "s"} to <span className="text-foreground">{next}</span>
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-0.5">Longest ever: {data.longest_streak} days</p>
              )}
              {next && (
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-terminal-green to-terminal-amber transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>
            <div className="text-right shrink-0 hidden sm:block">
              <div className="text-[10px] text-muted-foreground font-mono uppercase">Best</div>
              <div className="font-mono font-bold text-foreground tabular-nums">
                <CountUp value={data.longest_streak} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
