// Projection Accuracy Backtester - the Accuracy tab. How did preseason
// numbers (season props, team win totals, fantasy ADP) hold up against what
// actually happened? All lines are preseason snapshots refreshed annually -
// this is deliberately NOT live futures tracking (docs/positioning.md).
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBacktest } from "@/hooks/useBacktest";
import { BiggestMisses } from "./BiggestMisses";

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
          {/* Positional Miss Rate table and Archetype Trends hidden per owner
              feedback (Aug 2026) while the metrics get rethought. The math
              lives on in backtestMetrics/backtestArchetypes and the
              ArchetypeBreakdown component - re-mount when ready. */}
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
