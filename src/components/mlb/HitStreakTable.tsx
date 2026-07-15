import { Card, CardContent } from "@/components/ui/card";
import { Flame, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

export interface HitStreakRow {
  playerId: string;
  name: string;
  team: string;
  headshotUrl?: string;
  streak: number;
  seasonAvg: number;
  streakAvg: number;
  last7Avg: number | null;
  nextOpponent: string | null;
  nextPitcher: string | null;
}

// Baseball average format: 3 decimals, no leading zero (.312)
const fmtAvg = (val: number | null | undefined) => {
  if (val === undefined || val === null) return "—";
  return val.toFixed(3).replace(/^0/, "");
};

import { heatText, streakHeat } from "@/lib/heat";

const streakColor = (streak: number) => heatText(streakHeat(streak));

interface HitStreakTableProps {
  rows: HitStreakRow[];
  isLoading?: boolean;
}

export function HitStreakTable({ rows, isLoading }: HitStreakTableProps) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Flame className="w-4 h-4 text-terminal-amber" />
          <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
            Active Hit Streaks
          </h2>
          <span className="text-xs text-muted-foreground font-mono">
            Hot bats — consecutive games with a hit
          </span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading streaks…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No active hit streaks right now. Check back after the next slate of games.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="text-left font-medium px-4 py-2">Player</th>
                  <th className="text-left font-medium px-2 py-2">Team</th>
                  <th className="text-right font-medium px-2 py-2">Streak</th>
                  <th className="text-right font-medium px-2 py-2" title="Batting average during the active streak">
                    Streak AVG
                  </th>
                  <th className="text-right font-medium px-2 py-2" title="Season batting average">
                    Season AVG
                  </th>
                  <th className="text-right font-medium px-2 py-2" title="Batting average, last 7 games">
                    L7
                  </th>
                  <th className="text-left font-medium px-4 py-2">Next Matchup</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.playerId}
                    className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${
                      i % 2 === 1 ? "bg-muted/10" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/dashboard/mlb/players/${r.playerId}`}
                        className="flex items-center gap-2 group"
                      >
                        <div className="w-7 h-7 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                          {r.headshotUrl ? (
                            <img
                              src={r.headshotUrl}
                              alt={r.name}
                              className="w-full h-full object-cover"
                              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                            />
                          ) : null}
                        </div>
                        <span className="font-medium text-foreground group-hover:text-terminal-green transition-colors whitespace-nowrap">
                          {r.name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground font-mono">{r.team}</td>
                    <td className={`px-2 py-2.5 text-right font-mono font-bold tabular-nums ${streakColor(r.streak)}`}>
                      <span className="inline-flex items-center gap-1 justify-end">
                        {r.streak >= 10 && <Flame className="w-3 h-3" />}
                        {r.streak}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono tabular-nums text-terminal-green">
                      {fmtAvg(r.streakAvg)}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono tabular-nums text-foreground">
                      {fmtAvg(r.seasonAvg)}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {r.last7Avg !== null ? (
                        <span className="inline-flex items-center gap-1 justify-end">
                          {r.last7Avg >= r.seasonAvg && <TrendingUp className="w-3 h-3 text-terminal-green" />}
                          {fmtAvg(r.last7Avg)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {r.nextOpponent ? (
                        <>
                          <span className="text-foreground">{r.nextOpponent}</span>
                          {r.nextPitcher && <span className="text-muted-foreground"> · {r.nextPitcher}</span>}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
