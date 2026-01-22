import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

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
            <div className="text-lg font-bold text-red-500">{gamesCount ?? "—"}</div>
            <div className="text-[9px] text-muted-foreground font-mono">Games</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-red-500">{oddsCount ?? "—"}</div>
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
      </CardContent>
    </Card>
  );
}
