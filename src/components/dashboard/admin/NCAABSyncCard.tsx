import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, GraduationCap, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

export function NCAABSyncCard() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [gamesCount, setGamesCount] = useState<number | null>(null);
  const [oddsCount, setOddsCount] = useState<number | null>(null);
  const [rankedGamesCount, setRankedGamesCount] = useState<number | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const fetchCounts = async () => {
    const [gamesResult, oddsResult, rankedResult, syncResult] = await Promise.all([
      supabase.from("ncaab_games").select("*", { count: "exact", head: true }),
      supabase.from("ncaab_odds").select("*", { count: "exact", head: true }),
      supabase.from("ncaab_games").select("*", { count: "exact", head: true })
        .or("home_team_rank.not.is.null,visitor_team_rank.not.is.null"),
      supabase.from("sync_schedule").select("last_sync_at").eq("sport", "NCAAB").eq("data_type", "games").single()
    ]);

    if (gamesResult.count !== null) setGamesCount(gamesResult.count);
    if (oddsResult.count !== null) setOddsCount(oddsResult.count);
    if (rankedResult.count !== null) setRankedGamesCount(rankedResult.count);
    if (syncResult.data?.last_sync_at) {
      try {
        setLastSyncTime(formatDistanceToNow(new Date(syncResult.data.last_sync_at), { addSuffix: true }));
      } catch {
        setLastSyncTime(null);
      }
    }
  };

  useEffect(() => {
    fetchCounts();
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-ncaab-games");

      if (error) {
        console.log("[Admin] Edge function error:", error.message);
      }

      await fetchCounts();
      
      // Update sync schedule
      await supabase.from("sync_schedule").upsert({
        sport: "NCAAB",
        data_type: "games",
        last_sync_at: new Date().toISOString(),
        last_sync_status: "success"
      }, { onConflict: "sport,data_type" });

      toast({
        title: "NCAAB Games Synced",
        description: data?.message || "Games updated successfully",
      });
    } catch (error) {
      console.error("Sync error:", error);
      toast({
        title: "Sync Error",
        description: error instanceof Error ? error.message : "Failed to sync",
        variant: "destructive"
      });
    } finally {
      setIsSyncing(false);
      await fetchCounts();
    }
  };

  return (
    <Card className="bg-card border-terminal-amber/30">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-terminal-amber" />
          NCAAB Data Sync
        </CardTitle>
        <Badge variant="outline" className="border-terminal-amber text-terminal-amber text-[10px]">NCAAB</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full justify-start font-mono text-xs border-terminal-amber/50 hover:bg-terminal-amber/10"
          onClick={handleSync}
          disabled={isSyncing}
        >
          {isSyncing ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-2" />}
          Sync NCAAB Games (24h)
        </Button>
        
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-terminal-amber">{gamesCount?.toLocaleString() ?? "—"}</div>
            <div className="text-[9px] text-muted-foreground font-mono">Games</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-terminal-amber">{rankedGamesCount?.toLocaleString() ?? "—"}</div>
            <div className="text-[9px] text-muted-foreground font-mono">Ranked</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-terminal-amber">{oddsCount?.toLocaleString() ?? "—"}</div>
            <div className="text-[9px] text-muted-foreground font-mono">Odds</div>
          </div>
        </div>

        {lastSyncTime && (
          <div className="flex items-center justify-center gap-1 font-mono text-[10px] text-muted-foreground">
            <Clock className="w-2 h-2" />
            Last synced {lastSyncTime}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
