import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Loader2, 
  Users, 
  Trophy, 
  Dribbble, 
  GraduationCap, 
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

type SyncState = "idle" | "syncing" | "done" | "error";

interface PlayerCounts {
  nfl: { count: number | null; lastSync: string | null };
  nba: { count: number | null; lastSync: string | null };
  ncaab: { count: number | null; lastSync: string | null };
}

export function PlayerSyncCard() {
  const [syncStatus, setSyncStatus] = useState<{ nfl: SyncState; nba: SyncState; ncaab: SyncState }>({
    nfl: "idle",
    nba: "idle",
    ncaab: "idle",
  });

  const [counts, setCounts] = useState<PlayerCounts>({
    nfl: { count: null, lastSync: null },
    nba: { count: null, lastSync: null },
    ncaab: { count: null, lastSync: null },
  });

  const fetchCounts = async () => {
    const [nflPlayers, nbaPlayers, ncaabPlayers, nflSync, nbaSync, ncaabSync] = await Promise.all([
      supabase.from("players").select("*", { count: "exact", head: true }).eq("sport", "NFL").eq("is_featured", true),
      supabase.from("players").select("*", { count: "exact", head: true }).eq("sport", "NBA").eq("is_featured", true),
      supabase.from("players").select("*", { count: "exact", head: true }).eq("sport", "NCAAB").eq("is_featured", true),
      supabase.from("sync_schedule").select("last_sync_at").eq("sport", "NFL").eq("data_type", "players").single(),
      supabase.from("sync_schedule").select("last_sync_at").eq("sport", "NBA").eq("data_type", "players").single(),
      supabase.from("sync_schedule").select("last_sync_at").eq("sport", "NCAAB").eq("data_type", "players").single(),
    ]);

    const formatTime = (timestamp: string | null | undefined) => {
      if (!timestamp) return null;
      try {
        return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
      } catch {
        return null;
      }
    };

    setCounts({
      nfl: { count: nflPlayers.count, lastSync: formatTime(nflSync.data?.last_sync_at) },
      nba: { count: nbaPlayers.count, lastSync: formatTime(nbaSync.data?.last_sync_at) },
      ncaab: { count: ncaabPlayers.count, lastSync: formatTime(ncaabSync.data?.last_sync_at) },
    });
  };

  useEffect(() => {
    fetchCounts();
  }, []);

  const syncNFLPlayers = async () => {
    setSyncStatus(prev => ({ ...prev, nfl: "syncing" }));
    try {
      const { data, error } = await supabase.functions.invoke("sync-nfl-players-slate");
      if (error) throw error;
      setSyncStatus(prev => ({ ...prev, nfl: "done" }));
      await fetchCounts();
      toast({ title: "NFL Players Synced", description: data?.message || "Players updated" });
    } catch (error) {
      console.error("NFL player sync error:", error);
      setSyncStatus(prev => ({ ...prev, nfl: "error" }));
      toast({ title: "Sync Failed", description: "Failed to sync NFL players", variant: "destructive" });
    } finally {
      setTimeout(() => setSyncStatus(prev => ({ ...prev, nfl: "idle" })), 3000);
    }
  };

  const syncNBAPlayers = async () => {
    setSyncStatus(prev => ({ ...prev, nba: "syncing" }));
    try {
      const { data, error } = await supabase.functions.invoke("sync-nba-players");
      if (error) throw error;
      setSyncStatus(prev => ({ ...prev, nba: "done" }));
      await fetchCounts();
      toast({ title: "NBA Players Synced", description: data?.message || "Players updated" });
    } catch (error) {
      console.error("NBA player sync error:", error);
      setSyncStatus(prev => ({ ...prev, nba: "error" }));
      toast({ title: "Sync Failed", description: "Failed to sync NBA players", variant: "destructive" });
    } finally {
      setTimeout(() => setSyncStatus(prev => ({ ...prev, nba: "idle" })), 3000);
    }
  };

  const syncNCAABPlayers = async () => {
    setSyncStatus(prev => ({ ...prev, ncaab: "syncing" }));
    try {
      const { data, error } = await supabase.functions.invoke("sync-ncaab-players");
      if (error) throw error;
      setSyncStatus(prev => ({ ...prev, ncaab: "done" }));
      await fetchCounts();
      toast({ title: "NCAAB Players Synced", description: data?.message || "Players updated" });
    } catch (error) {
      console.error("NCAAB player sync error:", error);
      setSyncStatus(prev => ({ ...prev, ncaab: "error" }));
      toast({ title: "Sync Failed", description: "Failed to sync NCAAB players", variant: "destructive" });
    } finally {
      setTimeout(() => setSyncStatus(prev => ({ ...prev, ncaab: "idle" })), 3000);
    }
  };

  const syncAllPlayers = async () => {
    setSyncStatus({ nfl: "syncing", nba: "syncing", ncaab: "syncing" });
    await Promise.all([syncNFLPlayers(), syncNBAPlayers(), syncNCAABPlayers()]);
  };

  const getStatusIcon = (status: SyncState) => {
    if (status === "syncing") return <Loader2 className="w-3 h-3 animate-spin text-blue-500" />;
    if (status === "done") return <CheckCircle className="w-3 h-3 text-terminal-green" />;
    if (status === "error") return <XCircle className="w-3 h-3 text-destructive" />;
    return null;
  };

  const isSyncing = Object.values(syncStatus).some(s => s === "syncing");

  const sportConfig = [
    { key: "nfl" as const, label: "NFL", Icon: Trophy, color: "terminal-green", sync: syncNFLPlayers, window: "7 Days" },
    { key: "nba" as const, label: "NBA", Icon: Dribbble, color: "terminal-cyan", sync: syncNBAPlayers, window: "48h" },
    { key: "ncaab" as const, label: "NCAAB", Icon: GraduationCap, color: "terminal-amber", sync: syncNCAABPlayers, window: "24h" },
  ];

  return (
    <Card className="bg-card border-purple-500/30">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xs font-mono text-foreground flex items-center gap-2">
            <Users className="w-3 h-3 text-purple-500" />
            Player Sync
          </CardTitle>
          
          <Button
            size="sm"
            variant="outline"
            className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10 font-mono text-xs h-7 px-3"
            onClick={syncAllPlayers}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <><RefreshCw className="w-3 h-3 mr-1" />Sync All Players</>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="py-2 px-3">
        <div className="grid grid-cols-3 gap-2">
          {sportConfig.map(({ key, label, Icon, color, sync, window }) => (
            <div key={key} className="rounded p-2 border border-border bg-muted/20">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1">
                  <Icon className={`w-3 h-3 text-${color}`} />
                  <span className="font-mono text-[10px] font-medium">{label}</span>
                </div>
                {getStatusIcon(syncStatus[key])}
              </div>
              
              <div className="flex items-center gap-1 mb-1">
                <Badge variant="outline" className={`border-${color}/50 text-${color} text-[9px] px-1`}>
                  {counts[key].count ?? "—"} players
                </Badge>
              </div>
              
              <div className="text-[8px] text-muted-foreground font-mono flex items-center gap-1 mb-1.5">
                <Clock className="w-2 h-2" />
                <span className="truncate">{counts[key].lastSync || "Never"}</span>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                className={`w-full font-mono text-[9px] h-5 border-${color}/50 hover:bg-${color}/10`}
                onClick={sync}
                disabled={syncStatus[key] === "syncing"}
              >
                {syncStatus[key] === "syncing" ? (
                  <Loader2 className="w-2 h-2 animate-spin" />
                ) : (
                  `Sync (${window})`
                )}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
