// Projection Accuracy Backtester - the Accuracy tab. How did preseason
// numbers (season props, team win totals, fantasy ADP) hold up against what
// actually happened? All lines are preseason snapshots refreshed annually -
// this is deliberately NOT live futures tracking (docs/positioning.md).
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, Trophy, ListOrdered } from "lucide-react";
import { useBacktest } from "@/hooks/useBacktest";
import {
  summarizeLines,
  summarizeAdp,
  inAdpUniverse,
  type AdpRow,
  type GradedLine,
} from "@/utils/backtestMetrics";
import type { PlayerSeasonRow, PropResultRow, WinTotalResultRow } from "@/hooks/useBacktest";
import { ArchetypeBreakdown } from "./ArchetypeBreakdown";
import { BiggestMisses } from "./BiggestMisses";

const toGraded = (r: PropResultRow | WinTotalResultRow): GradedLine => ({
  result: r.result,
  line: r.line,
  actual: r.actual,
  overOdds: r.over_odds,
  underOdds: r.under_odds,
});

const toAdpRow = (r: PlayerSeasonRow): AdpRow => ({
  position: r.position,
  adpPosRank: r.adp_pos_rank,
  finishPosRank: r.finish_pos_rank,
  games: r.games,
});

const pct = (v: number | null) => (v === null ? "-" : `${(v * 100).toFixed(0)}%`);

function sourceCard(
  icon: React.ReactNode,
  title: string,
  subtitle: string,
  stats: [string, string][]
) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">{title}</h3>
            <p className="text-[10px] text-muted-foreground font-mono">{subtitle}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {stats.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] text-muted-foreground font-mono uppercase">{label}</span>
              <span className="font-mono font-bold tabular-nums text-foreground text-sm">{value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function BacktestOverview() {
  const { lastCompleted, props, winTotals, playerSeasons, isLoading, isError } = useBacktest();

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !props.data || !winTotals.data || !playerSeasons.data) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground font-mono">
            Backtest data unavailable - run the backtester syncs from the admin panel.
          </p>
        </CardContent>
      </Card>
    );
  }

  const propRows = props.data.filter((r) => r.season === lastCompleted);
  const winRows = winTotals.data.filter((r) => r.season === lastCompleted);
  const adpRows = playerSeasons.data.filter((r) => r.season === lastCompleted);

  const propSummary = summarizeLines(propRows.map(toGraded));
  const winSummary = summarizeLines(winRows.map(toGraded));
  const adpSummary = summarizeAdp(adpRows.map(toAdpRow));

  // Positional split: where is the market least reliable?
  const positions = ["QB", "RB", "WR", "TE"] as const;
  const positional = positions.map((pos) => {
    const posAdp = summarizeAdp(adpRows.filter((r) => r.position === pos).map(toAdpRow));
    const posProps = summarizeLines(propRows.filter((r) => r.position === pos).map(toGraded));
    return { pos, adp: posAdp, props: posProps };
  });

  const empty = propRows.length === 0 && winRows.length === 0 && adpRows.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <p className="text-xs text-muted-foreground font-mono">
          {lastCompleted} season (last completed, resolved at runtime) - preseason numbers vs what actually
          happened.
        </p>
      </div>

      {empty ? (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground font-mono">
              No graded {lastCompleted} data yet - run the backtester backfills from the admin panel.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {sourceCard(
              <Target className="w-4 h-4 text-terminal-green" />,
              "Season Props",
              "preseason season-total lines, hand-archived",
              [
                ["Graded", `${propSummary.graded}`],
                ["Pushes", `${propSummary.pushes}`],
                ["Over rate", pct(propSummary.overRate)],
                ["Book side hit", pct(propSummary.favoredSideHitRate)],
                ["Avg miss", pct(propSummary.meanAbsErrorPct)],
                ["Ungraded", `${propSummary.ungraded}`],
              ]
            )}
            {sourceCard(
              <Trophy className="w-4 h-4 text-terminal-green" />,
              "Team Win Totals",
              "lines & results via SportsOddsHistory.com",
              [
                ["Graded", `${winSummary.graded}`],
                ["Pushes", `${winSummary.pushes}`],
                ["Over rate", pct(winSummary.overRate)],
                ["Book side hit", pct(winSummary.favoredSideHitRate)],
                ["Avg miss", winSummary.meanAbsError !== null ? `${winSummary.meanAbsError.toFixed(1)} W` : "-"],
                ["Ungraded", `${winSummary.ungraded}`],
              ]
            )}
            {sourceCard(
              <ListOrdered className="w-4 h-4 text-terminal-green" />,
              "Fantasy ADP",
              "PPR 12-team (FantasyFootballCalculator)",
              [
                ["In universe", `${adpSummary.sample}`],
                ["Beat ADP", pct(adpSummary.beatRate)],
                ["Bust rate", pct(adpSummary.bustRate)],
                ["Did not play", `${adpSummary.dnp}`],
              ]
            )}
          </div>

          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-2">
              <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
                Positional Miss Rate
              </h3>
              <p className="text-[10px] text-muted-foreground font-mono">
                Where the market is historically least reliable, {lastCompleted} season.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left font-medium py-1.5 pr-2">Pos</th>
                      <th className="text-right font-medium py-1.5 px-2">ADP sample</th>
                      <th className="text-right font-medium py-1.5 px-2">ADP bust rate</th>
                      <th className="text-right font-medium py-1.5 px-2">Prop lines</th>
                      <th className="text-right font-medium py-1.5 px-2">Prop over rate</th>
                      <th className="text-right font-medium py-1.5 pl-2">Prop pushes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positional.map(({ pos, adp, props: pr }) => (
                      <tr key={pos} className="border-b border-border/40">
                        <td className="py-1.5 pr-2 font-mono font-bold">{pos}</td>
                        <td className="py-1.5 px-2 text-right font-mono tabular-nums">{adp.sample}</td>
                        <td className="py-1.5 px-2 text-right font-mono tabular-nums">{pct(adp.bustRate)}</td>
                        <td className="py-1.5 px-2 text-right font-mono tabular-nums">{pr.graded}</td>
                        <td className="py-1.5 px-2 text-right font-mono tabular-nums">{pct(pr.overRate)}</td>
                        <td className="py-1.5 pl-2 text-right font-mono tabular-nums">{pr.pushes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <ArchetypeBreakdown rows={playerSeasons.data} />

          <BiggestMisses
            playerSeasons={playerSeasons.data}
            props={props.data}
            winTotals={winTotals.data}
            lastCompleted={lastCompleted}
          />
        </>
      )}

      <p className="text-[10px] text-muted-foreground font-mono">
        Win-total lines and results courtesy of SportsOddsHistory.com. All lines are preseason snapshots, not
        live futures.
      </p>
    </div>
  );
}
