// Admin controls for the projection backtester's data pipeline: player
// crosswalk (nflverse), win totals + actual records (SportsOddsHistory),
// ADP (FantasyFootballCalculator), and the prop-line captures. Backfills
// loop one season per invocation (edge-fn timeout pattern, same as
// NCAAFSyncCard.backfillResults). Unresolved subject names surface here -
// fix = nfl_name_overrides row + re-run that season.
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Crosshair, Users, Trophy, ListOrdered, History, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { mostRecentCompletedNflSeason } from "@/utils/nflSeason";

const BACKFILL_START = 2018;

interface UnmatchedRow {
  kind: string;
  source: string;
  season: number;
  subject_name: string;
}

export function BacktestSyncCard() {
  const [running, setRunning] = useState<string | null>(null);
  const [counts, setCounts] = useState<{
    crosswalk: number | null;
    lines: number | null;
    adp: number | null;
    results: number | null;
  }>({ crosswalk: null, lines: null, adp: null, results: null });
  const [unmatched, setUnmatched] = useState<UnmatchedRow[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const lastCompleted = mostRecentCompletedNflSeason();

  const fetchCounts = async () => {
    const [xw, lines, adp, results, un, sched] = await Promise.all([
      supabase.from("nfl_player_ids").select("*", { count: "exact", head: true }),
      supabase.from("nfl_preseason_lines").select("*", { count: "exact", head: true }),
      supabase.from("nfl_adp_snapshots").select("*", { count: "exact", head: true }),
      supabase.from("nfl_team_season_results").select("*", { count: "exact", head: true }),
      supabase.from("nfl_backtest_unmatched").select("kind, source, season, subject_name").limit(50),
      supabase.from("sync_schedule").select("last_sync_at").eq("sport", "NFL").eq("data_type", "adp").maybeSingle(),
    ]);
    setCounts({
      crosswalk: xw.count,
      lines: lines.count,
      adp: adp.count,
      results: results.count,
    });
    setUnmatched((un.data as UnmatchedRow[]) ?? []);
    if (sched.data?.last_sync_at) {
      setLastSync(formatDistanceToNow(new Date(sched.data.last_sync_at), { addSuffix: true }));
    }
  };

  useEffect(() => {
    fetchCounts();
  }, []);

  const invoke = async (label: string, fn: string, body?: Record<string, unknown>) => {
    setRunning(label);
    try {
      const { data, error } = await supabase.functions.invoke(fn, body ? { body } : undefined);
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error || "sync reported failure");
      toast({ title: label, description: data?.message || "Done" });
      await fetchCounts();
    } catch (error) {
      console.error(`${fn} error:`, error);
      toast({
        title: `${label} Failed`,
        description: error instanceof Error ? error.message : "Sync failed - check sync log",
        variant: "destructive",
      });
    } finally {
      setRunning(null);
    }
  };

  // One season per invocation; win totals + ADP for every backfill season.
  const backfillHistory = async () => {
    const label = "Backfill Lines + ADP";
    setRunning(label);
    try {
      for (let y = BACKFILL_START; y <= lastCompleted; y++) {
        for (const fn of ["sync-win-totals", "sync-adp"] as const) {
          const { data, error } = await supabase.functions.invoke(fn, { body: { season: y } });
          if (error) throw new Error(`${fn} ${y}: ${error.message}`);
          if (data?.success === false) throw new Error(`${fn} ${y}: ${data?.error}`);
        }
        toast({ title: `Backfill ${y}`, description: "win totals + ADP done" });
      }
      await fetchCounts();
    } catch (error) {
      console.error("Backfill error:", error);
      toast({
        title: "Backfill Failed",
        description: error instanceof Error ? error.message : "Check sync log",
        variant: "destructive",
      });
    } finally {
      setRunning(null);
    }
  };

  // Prerequisite for ADP grading: nfl_fantasy_weekly must cover the window
  // (positional finishes come from its ranks view).
  const backfillFantasy = async () => {
    const label = "Backfill Fantasy Weekly";
    setRunning(label);
    try {
      for (let y = BACKFILL_START; y <= lastCompleted; y++) {
        const { data, error } = await supabase.functions.invoke("backfill-nfl-fantasy", {
          body: { season: y },
        });
        if (error) throw new Error(`${y}: ${error.message}`);
        if (data?.success === false) throw new Error(`${y}: ${data?.error}`);
        toast({ title: `Fantasy ${y}`, description: data?.message || "Done" });
      }
      await fetchCounts();
    } catch (error) {
      console.error("Fantasy backfill error:", error);
      toast({
        title: "Fantasy Backfill Failed",
        description: error instanceof Error ? error.message : "Check sync log",
        variant: "destructive",
      });
    } finally {
      setRunning(null);
    }
  };

  const ingestProps = async () => {
    const label = "Ingest Prop Captures";
    setRunning(label);
    try {
      for (const season of [2025, 2026]) {
        const { data, error } = await supabase.functions.invoke("sync-preseason-props", {
          body: { season },
        });
        if (error) throw new Error(`${season}: ${error.message}`);
        if (data?.success === false) throw new Error(`${season}: ${data?.error}`);
        toast({ title: `Props ${season}`, description: data?.message || "Done" });
      }
      await fetchCounts();
    } catch (error) {
      console.error("Props ingest error:", error);
      toast({
        title: "Props Ingest Failed",
        description: error instanceof Error ? error.message : "Check sync log",
        variant: "destructive",
      });
    } finally {
      setRunning(null);
    }
  };

  const actionButton = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <Button
      key={label}
      variant="outline"
      size="sm"
      className="w-full justify-start font-mono text-xs border-terminal-green/50 hover:bg-terminal-green/10"
      onClick={onClick}
      disabled={running !== null}
    >
      {running === label ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : icon}
      {label}
    </Button>
  );

  return (
    <Card className="bg-card border-terminal-green/30">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-terminal-green" />
          Projection Backtester Data
        </CardTitle>
        <Badge variant="outline" className="border-terminal-green text-terminal-green text-[10px]">
          NFL
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              [counts.crosswalk, "Crosswalk"],
              [counts.lines, "Lines"],
              [counts.adp, "ADP Rows"],
              [counts.results, "Team W-L"],
            ] as const
          ).map(([value, label]) => (
            <div key={label} className="bg-muted/50 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-terminal-green">{value ?? "-"}</div>
              <div className="text-[9px] text-muted-foreground font-mono">{label}</div>
            </div>
          ))}
        </div>

        {actionButton("Refresh Player Crosswalk (nflverse)", <Users className="w-3 h-3 mr-2" />, () =>
          invoke("Refresh Player Crosswalk (nflverse)", "sync-nfl-player-ids")
        )}
        {actionButton(`Backfill Fantasy Weekly (${BACKFILL_START}–${lastCompleted})`, <History className="w-3 h-3 mr-2" />, backfillFantasy)}
        {actionButton(`Backfill Lines + ADP (${BACKFILL_START}–${lastCompleted})`, <Trophy className="w-3 h-3 mr-2" />, backfillHistory)}
        {actionButton("Ingest Prop Captures (2025 + 2026)", <Target className="w-3 h-3 mr-2" />, ingestProps)}
        {actionButton("Sync Current Season (win totals + ADP)", <ListOrdered className="w-3 h-3 mr-2" />, async () => {
          await invoke("Sync Current Season (win totals + ADP)", "sync-win-totals");
          await invoke("Sync Current Season (win totals + ADP)", "sync-adp");
        })}

        {lastSync && (
          <div className="text-[10px] text-muted-foreground font-mono text-center">
            ADP last synced {lastSync}
          </div>
        )}

        {unmatched.length > 0 && (
          <div className="pt-2 border-t border-terminal-green/20 space-y-1">
            <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
              Unresolved names ({unmatched.length}{unmatched.length === 50 ? "+" : ""}) - add nfl_name_overrides
              rows, then re-run that season
            </div>
            <div className="max-h-32 overflow-y-auto space-y-0.5">
              {unmatched.map((u, i) => (
                <div key={`${u.kind}-${u.subject_name}-${i}`} className="text-[10px] font-mono text-muted-foreground">
                  <span className="text-foreground">{u.subject_name}</span> · {u.kind} · {u.season} · {u.source}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
