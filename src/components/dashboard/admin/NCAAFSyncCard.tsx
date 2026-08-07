import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Trophy, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

export function NCAAFSyncCard() {
  const [isSyncing, setIsSyncing] = useState(false);
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

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-ncaaf-games");
      
      if (error) {
        console.error("Sync error:", error);
      }

      // Update sync schedule
      await supabase.from("sync_schedule").upsert({
        sport: "NCAAF",
        data_type: "games",
        last_sync_at: new Date().toISOString(),
        last_sync_status: "success",
      }, { onConflict: "sport,data_type" });

      await fetchCounts();

      toast({
        title: "NCAAF Games Synced",
        description: data?.message || `Synced ${data?.gamesCount || 0} games`,
      });
    } catch (error) {
      console.error("Sync error:", error);
      toast({
        title: "Sync Failed",
        description: "Failed to sync NCAAF games",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

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
          Sync NCAAF Games (Top 25, 7 Days)
        </Button>
        
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-orange-500">{gamesCount ?? "—"}</div>
            <div className="text-[9px] text-muted-foreground font-mono">Games</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-orange-500">{rankedCount ?? "—"}</div>
            <div className="text-[9px] text-muted-foreground font-mono">Top 25</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-orange-500">{oddsCount ?? "—"}</div>
            <div className="text-[9px] text-muted-foreground font-mono">Odds</div>
          </div>
        </div>
        
        {lastSync && (
          <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground font-mono">
            <Clock className="w-2.5 h-2.5" />
            Last synced {lastSync}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
