import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Trophy, Clock, Users, History, GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

// CFB season labeled by start year: Jul-Dec = that year, Jan-Jun = prior
const currentCfbSeason = () => {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
};

export function NCAAFSyncCard() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [intelRunning, setIntelRunning] = useState<string | null>(null);
  const [gamesCount, setGamesCount] = useState<number | null>(null);
  const [oddsCount, setOddsCount] = useState<number | null>(null);
  const [rankedCount, setRankedCount] = useState<number | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const fetchCounts = async () => {
    const [gamesRes, oddsRes, rankedRes, syncRes] = await Promise.all([
      supabase.from("ncaaf_games").select("*", { count: "exact", head: true }),
      supabase.from("ncaaf_odds").select("*", { count: "exact", head: true }),
      supabase.from("ncaaf_games").select("*", { count: "exact", head: true })
        .or("home_team_rank.lte.25,visitor_team_rank.lte.25"),
      supabase.from("sync_schedule")
        .select("last_sync_at")
        .eq("sport", "NCAAF")
        .eq("data_type", "games")
        .single(),
    ]);

    if (gamesRes.count !== null) setGamesCount(gamesRes.count);
    if (oddsRes.count !== null) setOddsCount(oddsRes.count);
    if (rankedRes.count !== null) setRankedCount(rankedRes.count);
    if (syncRes.data?.last_sync_at) {
      setLastSync(formatDistanceToNow(new Date(syncRes.data.last_sync_at), { addSuffix: true }));
    }
  };

  useEffect(() => {
    fetchCounts();
  }, []);

  // Records and reports what the function actually returned. This used to
  // write "success" and toast "Synced" even when the call failed, which is
  // how a dead NCAAF sync could look healthy from this card.
  const handleSync = async () => {
    setIsSyncing(true);
    let ok = false;
    let detail = "Failed to sync NCAAF games";
    try {
      const { data, error } = await supabase.functions.invoke("sync-ncaaf-games");
      if (error) {
        // supabase-js hides the JSON body on non-2xx; surface it when there is one
        detail = error.message || detail;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            if (body?.error) detail = body.error;
          } catch { /* not JSON */ }
        }
      } else if (!data || data.success === false) {
        detail = data?.error || detail;
      } else {
        ok = true;
        detail = data.message || `Synced ${data.gamesCount ?? 0} games`;
      }

      await supabase.from("sync_schedule").upsert({
        sport: "NCAAF",
        data_type: "games",
        last_sync_at: new Date().toISOString(),
        last_sync_status: ok ? "success" : "failed",
        records_synced: ok ? data?.gamesCount ?? 0 : 0,
        error_message: ok ? null : detail,
      }, { onConflict: "sport,data_type" });

      await fetchCounts();
    } catch (error) {
      console.error("Sync error:", error);
      detail = error instanceof Error ? error.message : detail;
    } finally {
      setIsSyncing(false);
    }

    if (ok) {
      toast({ title: "NCAAF Games Synced", description: detail });
    } else {
      console.error("NCAAF sync failed:", detail);
      toast({ title: "NCAAF Sync Failed", description: detail, variant: "destructive" });
    }
  };

  // Matchup-intel jobs (CFBD + DraftTek). label doubles as the running-state
  // key; body is passed through to the edge function (e.g. backfill seasons).
  const runIntelSync = async (
    label: string,
    fn: string,
    body?: Record<string, unknown>
  ) => {
    setIntelRunning(label);
    try {
      const { data, error } = await supabase.functions.invoke(fn, body ? { body } : undefined);
      if (error) throw error;
      toast({ title: label, description: data?.message || "Done" });
    } catch (error) {
      console.error(`${fn} error:`, error);
      toast({
        title: `${label} Failed`,
        description: error instanceof Error ? error.message : "Sync failed - check sync log",
        variant: "destructive",
      });
    } finally {
      setIntelRunning(null);
    }
  };

  const backfillResults = async () => {
    // One season per invocation (edge-fn timeout pattern); last 5 completed
    // seasons + current = the H2H window
    const season = currentCfbSeason();
    setIntelRunning("Backfill Results");
    try {
      for (let y = season - 5; y <= season; y++) {
        const { data, error } = await supabase.functions.invoke("sync-cfbd-games", {
          body: { season: y },
        });
        if (error) throw error;
        toast({ title: `Results ${y}`, description: data?.message || "Done" });
      }
    } catch (error) {
      console.error("Backfill error:", error);
      toast({
        title: "Backfill Failed",
        description: error instanceof Error ? error.message : "Check sync log",
        variant: "destructive",
      });
    } finally {
      setIntelRunning(null);
    }
  };

  const intelButton = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void
  ) => (
    <Button
      key={label}
      variant="outline"
      size="sm"
      className="w-full justify-start font-mono text-xs border-orange-500/50 hover:bg-orange-500/10"
      onClick={onClick}
      disabled={intelRunning !== null}
    >
      {intelRunning === label ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : icon}
      {label}
    </Button>
  );

  return (
    <Card className="bg-card border-orange-500/30">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
          <Trophy className="w-4 h-4 text-orange-500" />
          NCAAF Data Sync
        </CardTitle>
        <Badge variant="outline" className="border-orange-500 text-orange-500 text-[10px]">NCAAF</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full justify-start font-mono text-xs border-orange-500/50 hover:bg-orange-500/10"
          onClick={handleSync}
          disabled={isSyncing}
        >
          {isSyncing ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-2" />}
          Sync NCAAF Games (All FBS, -7/+60 Days)
        </Button>
        <p className="text-[10px] text-muted-foreground font-mono leading-snug">
          Every FBS game in the window with AP ranks, finals and DraftKings lines;
          also re-pulls any game from the last 45 days still missing its final.
        </p>
        
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-orange-500">{gamesCount ?? "-"}</div>
            <div className="text-[9px] text-muted-foreground font-mono">Games</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-orange-500">{rankedCount ?? "-"}</div>
            <div className="text-[9px] text-muted-foreground font-mono">Top 25</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-orange-500">{oddsCount ?? "-"}</div>
            <div className="text-[9px] text-muted-foreground font-mono">Odds</div>
          </div>
        </div>
        
        {lastSync && (
          <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground font-mono">
            <Clock className="w-2.5 h-2.5" />
            Last synced {lastSync}
          </div>
        )}

        {/* Matchup Intel jobs - also the offseason escape hatch: dispatch
            skips NCAAF Feb-Jun but the portal moves hardest Dec-Apr */}
        <div className="pt-2 border-t border-orange-500/20 space-y-2">
          <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
            Matchup Intel
          </div>
          {intelButton("Sync Roster Intel (CFBD)", <Users className="w-3 h-3 mr-2" />, () =>
            runIntelSync("Sync Roster Intel (CFBD)", "sync-cfbd-roster-intel")
          )}
          {intelButton("Sync Results (CFBD)", <History className="w-3 h-3 mr-2" />, () =>
            runIntelSync("Sync Results (CFBD)", "sync-cfbd-games")
          )}
          {intelButton("Backfill Results (Last 5 Seasons)", <History className="w-3 h-3 mr-2" />, backfillResults)}
          {intelButton("Refresh Draft Board (DraftTek Top 200)", <GraduationCap className="w-3 h-3 mr-2" />, () =>
            runIntelSync("Refresh Draft Board (DraftTek Top 200)", "sync-draft-board")
          )}
        </div>
      </CardContent>
    </Card>
  );
}
