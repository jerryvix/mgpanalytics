import { impliedPair } from "@/lib/odds";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/ui/CountUp";

interface WinProbBarProps {
  homeName: string;
  awayName: string;
  moneylineHome: number | null;
  moneylineAway: number | null;
  className?: string;
}

// Implied win probability from the moneyline, vig removed — a Bloomberg-style
// read on who the market favors. Home keeps the terminal-green side, away the
// amber side, matching the ML row colors. Renders nothing without both prices.
export function WinProbBar({ homeName, awayName, moneylineHome, moneylineAway, className }: WinProbBarProps) {
  const pair = impliedPair(moneylineHome, moneylineAway);
  if (!pair) return null;

  const homePct = Math.round(pair.home * 100);
  const awayPct = 100 - homePct;
  const shortName = (name: string) => name.split(" ").pop();

  return (
    <div className={cn("space-y-1", className)} title="Implied win probability (moneyline, vig removed)">
      <div className="flex items-center justify-between font-mono tabular-nums text-[10px]">
        <span className="text-terminal-green">
          {shortName(homeName)} <CountUp value={homePct} suffix="%" />
        </span>
        <span className="text-terminal-amber">
          <CountUp value={awayPct} suffix="%" /> {shortName(awayName)}
        </span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="bg-terminal-green transition-all duration-700" style={{ width: `${homePct}%` }} />
        <div className="bg-terminal-amber flex-1" />
      </div>
    </div>
  );
}
