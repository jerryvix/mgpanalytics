import { Card, CardContent } from "@/components/ui/card";
import { Flame } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { LiveBadge } from "@/components/ui/LiveBadge";
import { useLiveScores } from "@/hooks/useLiveScores";
import { isCalledOff, type LiveGame } from "@/lib/liveScores";
import { careerVsPitcher } from "@/services/mlb/batterVsPitcher";

export interface HitStreakRow {
  playerId: string;
  name: string;
  team: string;
  /** Full team name — used to match the ESPN live scoreboard. */
  teamName: string | null;
  headshotUrl?: string;
  streak: number;
  seasonAvg: number;
  streakAvg: number;
  nextOpponent: string | null;
  nextOpponentAbbr: string | null;
  nextPitcher: string | null;
  nextGameDate: string | null;
}

// Baseball average format: 3 decimals, no leading zero (.312)
const fmtAvg = (val: number | null | undefined) => {
  if (val === undefined || val === null) return "—";
  return val.toFixed(3).replace(/^0/, "");
};

import { heatText, streakHeat } from "@/lib/heat";

const streakColor = (streak: number) => heatText(streakHeat(streak));

// Career line vs tonight's probable starter, from MLB's public Stats API.
// Sample size shown always — .333 in 3 AB and .320 in 25 AB are different
// facts, and "never faced him" is itself an angle.
function VsStarterCell({ batter, pitcher }: { batter: string; pitcher: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["bvp", batter, pitcher],
    queryFn: () => careerVsPitcher(batter, pitcher!),
    enabled: !!pitcher,
    staleTime: 12 * 3600_000,
    gcTime: 12 * 3600_000,
    retry: 1,
  });

  if (!pitcher) return <span className="text-muted-foreground">—</span>;
  if (isLoading) return <span className="text-muted-foreground animate-pulse">…</span>;
  if (!data || data.status === "unavailable") return <span className="text-muted-foreground">—</span>;
  if (data.status === "never-faced") {
    return (
      <span className="text-muted-foreground" title={`No career at-bats against ${pitcher}`}>
        1st look
      </span>
    );
  }

  const { avg, hits, atBats, homeRuns, ops } = data.line;
  const solidSample = atBats >= 10;
  const tone =
    avg !== null && solidSample && avg >= 0.3
      ? "text-terminal-green"
      : avg !== null && solidSample && avg <= 0.15
        ? "text-terminal-amber"
        : "text-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1 justify-end ${tone}`}
      title={`Career vs ${pitcher}: ${hits}-for-${atBats}${homeRuns ? `, ${homeRuns} HR` : ""}${ops !== null ? `, ${ops.toFixed(3)} OPS` : ""}`}
    >
      {fmtAvg(avg)}
      <span className="text-muted-foreground text-[10px]">
        ({hits}-{atBats}{homeRuns > 0 ? `, ${homeRuns} HR` : ""})
      </span>
    </span>
  );
}

interface HitStreakTableProps {
  rows: HitStreakRow[];
  isLoading?: boolean;
}

// Game-state chip for the matchup cell. Live state comes from the same
// 60s ESPN scoreboard polling as the slate badges — not the batch-synced
// status column, which can lag hours. Upcoming games show first pitch so
// the pick window is visible at a glance.
function GameStateChip({ liveGame, gameDate }: { liveGame: LiveGame | undefined; gameDate: string | null }) {
  if (liveGame?.state === "in") return <LiveBadge detail={liveGame.detail} />;
  if (liveGame?.state === "post") {
    // Postponed/canceled report "post" too — for picks that's the opposite
    // of Final (no game tonight), so say so.
    const calledOff = isCalledOff(liveGame);
    return (
      <span
        className={`font-mono text-[10px] uppercase tracking-wider border rounded px-1.5 py-0.5 ${
          calledOff ? "text-terminal-amber border-terminal-amber/40" : "text-muted-foreground border-border"
        }`}
        title={liveGame.detail || undefined}
      >
        {calledOff ? "PPD" : "Final"}
      </span>
    );
  }
  // Upcoming: prefer ESPN's own start time (correct even for doubleheader
  // game 2, where our synced row may be the earlier game), else our synced
  // date. Never show a first pitch that's already in the past.
  const when = (liveGame?.state === "pre" && liveGame.startTime) || gameDate;
  if (!when) return null;
  try {
    const d = parseISO(when);
    if (d.getTime() < Date.now() - 15 * 60_000) return null;
    return (
      <span
        className="font-mono text-[10px] text-terminal-green/80"
        title="Scheduled first pitch (Pacific) — picks close at game time"
      >
        {fmtPacific(d)}
      </span>
    );
  } catch {
    return null;
  }
}

// Owner's call: table times are Pacific. "PT" covers PST/PDT year-round.
const PT_TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
const PT_DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Los_Angeles" });
const PT_YMD = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" });
function fmtPacific(d: Date): string {
  const sameDay = PT_YMD.format(d) === PT_YMD.format(new Date());
  return `${sameDay ? "" : `${PT_DAY.format(d)} `}${PT_TIME.format(d)} PT`;
}

export function HitStreakTable({ rows, isLoading }: HitStreakTableProps) {
  const live = useLiveScores("MLB");
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
                  <th
                    className="text-right font-medium px-2 py-2"
                    title="Career batting line against tonight's probable starter (all seasons, via MLB)"
                  >
                    VS Starter
                  </th>
                  <th className="text-left font-medium px-4 py-2">Next Matchup</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  // We don't know home/away here, so try the matchup both ways.
                  const liveGame =
                    r.teamName && r.nextOpponent
                      ? live.getGame(r.teamName, r.nextOpponent) ?? live.getGame(r.nextOpponent, r.teamName)
                      : undefined;
                  return (
                  <tr
                    key={r.playerId}
                    className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${
                      i % 2 === 1 ? "bg-muted/10" : ""
                    } ${liveGame?.state === "post" && !isCalledOff(liveGame) ? "opacity-60" : ""}`}
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
                    <td className="px-2 py-2.5 text-muted-foreground font-mono">
                      <span className="inline-flex items-center gap-1.5">
                        <TeamLogo sport="MLB" name={r.team} abbr={r.team} size={16} />
                        {r.team}
                      </span>
                    </td>
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
                    <td className="px-2 py-2.5 text-right font-mono tabular-nums text-xs whitespace-nowrap">
                      <VsStarterCell batter={r.name} pitcher={r.nextPitcher} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {r.nextOpponent ? (
                        <span className="inline-flex items-center gap-2">
                          <GameStateChip liveGame={liveGame} gameDate={r.nextGameDate} />
                          <span title={r.nextOpponent}>
                            <span className="text-foreground font-mono">{r.nextOpponentAbbr || r.nextOpponent}</span>
                            {r.nextPitcher && <span className="text-muted-foreground"> · {r.nextPitcher}</span>}
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
