import { Card, CardContent } from "@/components/ui/card";
import { Flame } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { LiveBadge } from "@/components/ui/LiveBadge";
import { useLiveScores } from "@/hooks/useLiveScores";
import { useMlbProbables } from "@/hooks/useMlbProbables";
import { isCalledOff, type LiveGame } from "@/lib/liveScores";
import { careerVsPitcher } from "@/services/mlb/batterVsPitcher";
import { resolveMatchup } from "@/services/mlb/streakMatchup";
import { OppStarterCell, ProjectedTag } from "@/components/mlb/ProbablePitcher";
import { Button } from "@/components/ui/button";

export interface HitStreakRow {
  playerId: string;
  name: string;
  team: string;
  /** Full team name - used to match the ESPN live scoreboard. */
  teamName: string | null;
  headshotUrl?: string;
  streak: number;
  seasonAvg: number;
  obp?: number | null;
  slg?: number | null;
  ops?: number | null;
  homeRuns?: number | null;
  streakAvg: number;
  /** Synced next game (mlb_games); MLB's live schedule overrides it when loaded. */
  nextOpponent: string | null;
  nextOpponentAbbr: string | null;
  nextPitcher: string | null;
  nextGameDate: string | null;
}

// Baseball average format: 3 decimals, no leading zero (.312)
const fmtAvg = (val: number | null | undefined) => {
  if (val === undefined || val === null) return "-";
  return val.toFixed(3).replace(/^0/, "");
};

import { heatText, streakHeat } from "@/lib/heat";

const streakColor = (streak: number) => heatText(streakHeat(streak));

// Career line vs tonight's probable starter, from MLB's public Stats API.
// Sample size shown always - .333 in 3 AB and .320 in 25 AB are different
// facts, and "never faced him" is itself an angle.
function VsStarterCell({ batter, pitcher }: { batter: string; pitcher: string | null }) {
  const { data, isPending } = useQuery({
    queryKey: ["bvp", batter, pitcher],
    queryFn: () => careerVsPitcher(batter, pitcher!),
    enabled: !!pitcher,
    staleTime: 12 * 3600_000,
    gcTime: 12 * 3600_000,
    retry: 1,
  });

  if (!pitcher) return <span className="text-muted-foreground">-</span>;
  // isPending, not isLoading: a paused lookup is still pending, not "no data"
  if (isPending) return <span className="text-muted-foreground animate-pulse">…</span>;
  if (!data || data.status === "unavailable") return <span className="text-muted-foreground">-</span>;
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
  /** The first read is paused (offline, or a retry held while the tab is hidden). */
  isPaused?: boolean;
  /** The streak query failed: show an error with a retry, never the empty-state copy. */
  isError?: boolean;
  onRetry?: () => void;
  /** Full team name to abbreviation, for opponents that come from MLB's schedule. */
  teamAbbr?: (teamName: string) => string | null;
}

// ".304/.347/.438 · 11 HR"
function slashLine(r: HitStreakRow): string | null {
  if (r.obp == null || r.slg == null) return null;
  const hr = r.homeRuns != null ? ` · ${r.homeRuns} HR` : "";
  return `${fmtAvg(r.seasonAvg)}/${fmtAvg(r.obp)}/${fmtAvg(r.slg)}${hr}`;
}

// Game-state chip for the matchup cell. Live state comes from the same
// 60s ESPN scoreboard polling as the slate badges - not the batch-synced
// status column, which can lag hours. Upcoming games show first pitch so
// the pick window is visible at a glance.
function GameStateChip({
  liveGame,
  gameDate,
  offToday = false,
}: {
  liveGame: LiveGame | undefined;
  gameDate: string | null;
  offToday?: boolean;
}) {
  if (liveGame?.state === "in") return <LiveBadge detail={liveGame.detail} />;
  // No game today: say so plainly rather than showing tomorrow's first pitch
  // where tonight's would be.
  if (offToday && liveGame?.state !== "post") {
    return (
      <span
        className="font-mono text-[10px] uppercase tracking-wider border border-border rounded px-1.5 py-0.5 text-muted-foreground whitespace-nowrap"
        title="No game today"
      >
        Off today
      </span>
    );
  }
  if (liveGame?.state === "post") {
    // Postponed/canceled report "post" too - for picks that's the opposite
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
        title="Scheduled first pitch (Pacific) - picks close at game time"
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

export function HitStreakTable({ rows, isLoading, isPaused, isError, onRetry, teamAbbr }: HitStreakTableProps) {
  const live = useLiveScores("MLB");
  const { data: probables } = useMlbProbables(rows.length > 0);

  const prepared = rows.map((r) => {
    const m = resolveMatchup(r, probables, teamAbbr);
    // We don't know home/away here, so try the matchup both ways. The start
    // time keeps LAST night's game against the same opponent off this row.
    const when = { start: m.gameDate };
    const liveGame =
      r.teamName && m.opponent
        ? live.getGame(r.teamName, m.opponent, when) ?? live.getGame(m.opponent, r.teamName, when)
        : undefined;
    const dimmed = liveGame?.state === "post" && !isCalledOff(liveGame);
    return { r, m, liveGame, dimmed, slash: slashLine(r) };
  });

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Flame className="w-4 h-4 text-terminal-amber shrink-0" />
          <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground whitespace-nowrap">
            Active Hit Streaks
          </h2>
          <span className="hidden sm:inline text-xs text-muted-foreground font-mono">
            Hot bats - consecutive games with a hit
          </span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading streaks…</div>
        ) : isPaused ? (
          <div className="p-8 text-center text-sm space-y-1" role="status">
            <p className="text-foreground">Waiting for a connection…</p>
            <p className="text-muted-foreground text-xs">Hit streaks load as soon as you're back online.</p>
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-sm space-y-3" role="alert">
            <p className="text-foreground">Couldn't load hit streaks.</p>
            <p className="text-muted-foreground text-xs">Check your connection and try again.</p>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                Retry
              </Button>
            )}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No active hit streaks right now. Check back after the next slate of games.
          </div>
        ) : (
          <>
          {/* Phones: one stacked row per hitter, so the streak and the starter
              he faces next read without scrolling sideways. */}
          <ul className="sm:hidden divide-y divide-border/50">
            {prepared.map(({ r, m, liveGame, dimmed, slash }) => {
              const hand = m.pitcherLine?.hand ? ` ${m.pitcherLine.hand}HP` : "";
              const s = m.pitcherLine?.season;
              const l3 = m.pitcherLine?.last3;
              return (
                <li key={r.playerId} className={`px-4 py-3 ${dimmed ? "opacity-60" : ""}`}>
                  <Link to={`/dashboard/mlb/players/${r.playerId}`} className="flex items-center gap-3 group">
                    <div className="w-8 h-8 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                      {r.headshotUrl ? (
                        <img
                          src={r.headshotUrl}
                          alt={r.name}
                          className="w-full h-full object-cover"
                          onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="font-medium text-foreground truncate group-hover:text-terminal-green transition-colors">
                          {r.name}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground shrink-0">{r.team}</span>
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-muted-foreground truncate">
                        <span className="text-terminal-green">{fmtAvg(r.streakAvg)}</span> in streak
                        {r.obp != null && r.slg != null
                          ? ` · ${fmtAvg(r.seasonAvg)}/${fmtAvg(r.obp)}/${fmtAvg(r.slg)}`
                          : ""}
                      </div>
                    </div>
                    <div className={`shrink-0 text-right font-mono font-bold tabular-nums leading-none ${streakColor(r.streak)}`}>
                      <span className="inline-flex items-center gap-1 text-lg">
                        {r.streak >= 10 && <Flame className="w-3.5 h-3.5" />}
                        {r.streak}
                      </span>
                      <div className="text-[9px] font-normal uppercase tracking-wider text-muted-foreground mt-0.5">games</div>
                    </div>
                  </Link>
                  {m.opponent && (
                    <div className="mt-2 pl-11 text-[11px] font-mono tabular-nums text-muted-foreground space-y-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 whitespace-nowrap">
                          <GameStateChip liveGame={liveGame} gameDate={m.gameDate} offToday={m.offToday} />
                        </span>
                        <span className="text-foreground shrink-0">
                          {m.offToday && m.nextDay ? `Next: ${m.nextDay} vs ` : "vs "}
                          {m.opponentAbbr || m.opponent}
                        </span>
                        <span className="truncate" title={m.pitcherName ?? undefined}>
                          {m.pitcherName ? `· ${m.pitcherName.replace(/^(\S)\S*\s+/, "$1. ")}${hand}` : "· starter TBD"}
                        </span>
                      </div>
                      {(s || m.pitcherName) && (
                        <div className="flex items-center gap-1.5 min-w-0">
                          {m.pitcherLine?.projected && <ProjectedTag />}
                          {s && (
                            <span className="truncate">
                              {s.era?.toFixed(2) ?? "-"} ERA · {s.whip?.toFixed(2) ?? "-"} WHIP
                              {l3 ? ` · L${l3.starts.length} ${l3.era?.toFixed(2) ?? "-"}` : ""}
                            </span>
                          )}
                          {m.pitcherName && (
                            <span className="shrink-0 ml-auto">
                              <VsStarterCell batter={r.name} pitcher={m.pitcherName} />
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="text-left font-medium px-4 py-2">Player</th>
                  <th className="text-left font-medium px-2 py-2">Team</th>
                  <th className="text-right font-medium px-2 py-2">Streak</th>
                  <th className="text-right font-medium px-2 py-2" title="Batting average during the active streak">
                    Streak AVG
                  </th>
                  <th className="text-right font-medium px-2 py-2" title="Season on-base plus slugging">
                    OPS
                  </th>
                  <th
                    className="text-left font-medium px-2 py-2"
                    title="Opposing probable starter: season ERA and WHIP, then ERA over his last three starts (via MLB)"
                  >
                    Opp. Starter
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
                {prepared.map(({ r, m, liveGame, dimmed, slash }, i) => {
                  return (
                  <tr
                    key={r.playerId}
                    className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${
                      i % 2 === 1 ? "bg-muted/10" : ""
                    } ${dimmed ? "opacity-60" : ""}`}
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
                        <span className="min-w-0">
                          <span className="block font-medium text-foreground group-hover:text-terminal-green transition-colors whitespace-nowrap">
                            {r.name}
                          </span>
                          {slash && (
                            <span
                              className="block text-[10px] font-mono tabular-nums text-muted-foreground whitespace-nowrap"
                              title="Season AVG/OBP/SLG and home runs"
                            >
                              {slash}
                            </span>
                          )}
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
                      {r.ops != null ? fmtAvg(r.ops) : "-"}
                    </td>
                    <td className="px-2 py-2.5 text-xs">
                      {m.opponent ? (
                        <OppStarterCell
                          line={m.pitcherLine}
                          fallbackName={m.pitcherLine ? null : m.pitcherName}
                          dayLabel={m.offToday ? m.nextDay : null}
                        />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono tabular-nums text-xs whitespace-nowrap">
                      <VsStarterCell batter={r.name} pitcher={m.pitcherName} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {m.opponent ? (
                        <span className="inline-flex items-center gap-2">
                          <GameStateChip liveGame={liveGame} gameDate={m.gameDate} offToday={m.offToday} />
                          <span className="text-foreground font-mono" title={m.opponent}>
                            {m.offToday && m.nextDay ? `Next: ${m.nextDay} vs ` : ""}
                            {m.opponentAbbr || m.opponent}
                          </span>
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
