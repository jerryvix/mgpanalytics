import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Clock, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

// sync-mlb-games takes { startDate, endDate } and re-pulls at most this many
// days per run (MAX_EXPLICIT_DAYS). Its self-heal only looks back 45 days, so
// March-July 2026 stayed "scheduled" with 0-0 scores until backfilled.
const MAX_BACKFILL_DAYS = 60;

/** Why a backfill range cannot run, or null. Dates are YYYY-MM-DD (date inputs). */
function backfillRangeProblem(start: string, end: string): string | null {
  if (!start || !end) return "Pick a start and an end date.";
  if (end < start) return "The end date is before the start date.";
  const days = Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1;
  return days > MAX_BACKFILL_DAYS ? `That is ${days} days; backfill at most ${MAX_BACKFILL_DAYS} per run.` : null;
}

// Baseball icon component
function BaseballIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M4.93 4.93c4.08 4.08 4.08 10.06 0 14.14" />
      <path d="M19.07 4.93c-4.08 4.08-4.08 10.06 0 14.14" />
    </svg>
  );
}

export function MLBSyncCard() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [gamesCount, setGamesCount] = useState<number | null>(null);
  const [oddsCount, setOddsCount] = useState<number | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const fetchCounts = async () => {
    const [gamesRes, oddsRes, syncRes] = await Promise.all([
      supabase.from("mlb_games").select("*", { count: "exact", head: true }),
      supabase.from("mlb_odds").select("*", { count: "exact", head: true }),
      supabase.from("sync_schedule")
        .select("last_sync_at")
        .eq("sport", "MLB")
        .eq("data_type", "games")
        .single(),
    ]);

    if (gamesRes.count !== null) setGamesCount(gamesRes.count);
    if (oddsRes.count !== null) setOddsCount(oddsRes.count);
    if (syncRes.data?.last_sync_at) {
      setLastSync(formatDistanceToNow(new Date(syncRes.data.last_sync_at), { addSuffix: true }));
    }
  };

  useEffect(() => {
    fetchCounts();
  }, []);

  const [backfillStart, setBackfillStart] = useState("");
  const [backfillEnd, setBackfillEnd] = useState("");
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ ok: boolean; text: string } | null>(null);
  const rangeProblem = backfillRangeProblem(backfillStart, backfillEnd);

  // Reports what the function actually returned, including its error body
  // (supabase-js hides it on a non-2xx response).
  const handleBackfill = async () => {
    if (rangeProblem) return;
    setIsBackfilling(true);
    setBackfillResult(null);
    let result = { ok: false, text: "Backfill failed. Check the sync log and try again." };
    try {
      const { data, error } = await supabase.functions.invoke("sync-mlb-games", {
        body: { startDate: backfillStart, endDate: backfillEnd },
      });
      if (error) {
        let detail = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            if (body?.error) detail = body.error;
          } catch { /* not JSON */ }
        }
        result = { ok: false, text: `Backfill failed: ${detail || "no response"}` };
      } else if (!data || data.success === false) {
        result = { ok: false, text: `Backfill failed: ${data?.error || "no result"}` };
      } else {
        result = { ok: true, text: data.message || `Synced ${data.gamesCount ?? 0} games` };
        await fetchCounts();
      }
    } catch (err) {
      console.error("MLB backfill error:", err);
      if (err instanceof Error && err.message) result = { ok: false, text: `Backfill failed: ${err.message}` };
    } finally {
      setIsBackfilling(false);
    }
    setBackfillResult(result);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-mlb-games");
      
      if (error) {
        console.error("Sync error:", error);
      }

      // Update sync schedule
      await supabase.from("sync_schedule").upsert({
        sport: "MLB",
        data_type: "games",
        last_sync_at: new Date().toISOString(),
        last_sync_status: "success",
      }, { onConflict: "sport,data_type" });

      await fetchCounts();

      toast({
        title: "MLB Games Synced",
        description: data?.message || `Synced ${data?.gamesCount || 0} games`,
      });
    } catch (error) {
      console.error("Sync error:", error);
      toast({
        title: "Sync Failed",
        description: "Failed to sync MLB games",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Card className="bg-card border-red-500/30">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
          <BaseballIcon className="w-4 h-4 text-red-500" />
          MLB Data Sync
        </CardTitle>
        <Badge variant="outline" className="border-red-500 text-red-500 text-[10px]">MLB</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full justify-start font-mono text-xs border-red-500/50 hover:bg-red-500/10"
          onClick={handleSync}
          disabled={isSyncing}
        >
          {isSyncing ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-2" />}
          Sync MLB Games (24h)
        </Button>
        
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-red-500">{gamesCount ?? "-"}</div>
            <div className="text-[9px] text-muted-foreground font-mono">Games</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-red-500">{oddsCount ?? "-"}</div>
            <div className="text-[9px] text-muted-foreground font-mono">Odds</div>
          </div>
        </div>
        
        {lastSync && (
          <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground font-mono">
            <Clock className="w-2.5 h-2.5" />
            Last synced {lastSync}
          </div>
        )}
        
        <div className="text-[9px] text-muted-foreground font-mono text-center italic">
          Note: MLB season starts March 2026
        </div>

        {/* Re-pull finals and scores for past dates the 45-day self-heal no longer reaches */}
        <div className="pt-2 border-t border-red-500/20 space-y-2">
          <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
            Backfill dates
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="block text-[10px] text-muted-foreground font-mono">Start</span>
              <Input
                type="date"
                aria-label="Backfill start date"
                className="h-11 font-mono text-xs"
                value={backfillStart}
                onChange={(e) => setBackfillStart(e.target.value)}
                disabled={isBackfilling}
              />
            </label>
            <label className="space-y-1">
              <span className="block text-[10px] text-muted-foreground font-mono">End</span>
              <Input
                type="date"
                aria-label="Backfill end date"
                className="h-11 font-mono text-xs"
                value={backfillEnd}
                onChange={(e) => setBackfillEnd(e.target.value)}
                disabled={isBackfilling}
              />
            </label>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-11 justify-start font-mono text-xs border-red-500/50 hover:bg-red-500/10"
            onClick={handleBackfill}
            disabled={isBackfilling || rangeProblem !== null}
          >
            {isBackfilling ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <History className="w-3 h-3 mr-2" />}
            {isBackfilling ? "Backfilling..." : "Backfill Dates"}
          </Button>
          {backfillStart && backfillEnd && rangeProblem ? (
            <p className="text-[10px] font-mono text-red-500" role="alert">{rangeProblem}</p>
          ) : (
            <p className="text-[10px] text-muted-foreground font-mono leading-snug">
              Re-pulls finals and scores for up to {MAX_BACKFILL_DAYS} days a run.
            </p>
          )}
          {backfillResult && (
            <p
              className={`text-[10px] font-mono leading-snug ${backfillResult.ok ? "text-foreground" : "text-red-500"}`}
              role={backfillResult.ok ? "status" : "alert"}
            >
              {backfillResult.text}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
