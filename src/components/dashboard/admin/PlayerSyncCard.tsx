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
  RefreshCw,
  BarChart3
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

type SyncState = "idle" | "syncing" | "done" | "error";

interface PlayerCounts {
  nfl: { count: number | null; lastSync: string | null };
  nba: { count: number | null; lastSync: string | null; withStats: number | null; statsLastSync: string | null };
  ncaab: { count: number | null; lastSync: string | null };
}

export function PlayerSyncCard() {
  const [syncStatus, setSyncStatus] = useState<{ nfl: SyncState; nba: SyncState; ncaab: SyncState; nbaStats: SyncState }>({
    nfl: "idle",
    nba: "idle",
    ncaab: "idle",
    nbaStats: "idle",
  });

  const [counts, setCounts] = useState<PlayerCounts>({
    nfl: { count: null, lastSync: null },
    nba: { count: null, lastSync: null, withStats: null, statsLastSync: null },
    ncaab: { count: null, lastSync: null },
  });

  const fetchCounts = async () => {
    const [nflPlayers, nbaPlayers, ncaabPlayers, nflSync, nbaSync, ncaabSync, nbaStatsSync, nbaWithStats] = await Promise.all([
      supabase.from("players").select("*", { count: "exact", head: true }).eq("sport", "NFL").eq("is_featured", true),
      supabase.from("players").select("*", { count: "exact", head: true }).eq("sport", "NBA").eq("is_featured", true),
      supabase.from("players").select("*", { count: "exact", head: true }).eq("sport", "NCAAB").eq("is_featured", true),
      supabase.from("sync_schedule").select("last_sync_at").eq("sport", "NFL").eq("data_type", "players").single(),
      supabase.from("sync_schedule").select("last_sync_at").eq("sport", "NBA").eq("data_type", "players").single(),
      supabase.from("sync_schedule").select("last_sync_at").eq("sport", "NCAAB").eq("data_type", "players").single(),
      supabase.from("sync_schedule").select("last_sync_at").eq("sport", "NBA").eq("data_type", "stats").single(),
      // Count NBA players with stats
      supabase
        .from("player_season_stats")
        .select("player_id", { count: "exact", head: true })
        .eq("sport", "NBA")
        .eq("season", new Date().getMonth() >= 9 ? new Date().getFullYear() + 1 : new Date().getFullYear())
        .gt("points_per_game", 0),
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
      nba: { 
        count: nbaPlayers.count, 
        lastSync: formatTime(nbaSync.data?.last_sync_at),
        withStats: nbaWithStats.count,
        statsLastSync: formatTime(nbaStatsSync.data?.last_sync_at),
      },
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

  const syncNBAStats = async () => {
    setSyncStatus(prev => ({ ...prev, nbaStats: "syncing" }));
    try {
      const { data, error } = await supabase.functions.invoke("sync-nba-stats");
      if (error) throw error;
      setSyncStatus(prev => ({ ...prev, nbaStats: "done" }));
      await fetchCounts();
      toast({ 
        title: "NBA Stats Synced", 
        description: `${data?.synced || 0} players updated via Ball Don't Lie` 
      });
    } catch (error) {
      console.error("NBA stats sync error:", error);
      setSyncStatus(prev => ({ ...prev, nbaStats: "error" }));
      toast({ title: "Sync Failed", description: "Failed to sync NBA stats", variant: "destructive" });
    } finally {
      setTimeout(() => setSyncStatus(prev => ({ ...prev, nbaStats: "idle" })), 3000);
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
    setSyncStatus({ nfl: "syncing", nba: "syncing", ncaab: "syncing", nbaStats: "idle" });
    await Promise.all([syncNFLPlayers(), syncNBAPlayers(), syncNCAABPlayers()]);
  };

  const getStatusIcon = (status: SyncState) => {
    if (status === "syncing") return <Loader2 className="w-3 h-3 animate-spin text-blue-500" />;
    if (status === "done") return <CheckCircle className="w-3 h-3 text-terminal-green" />;
    if (status === "error") return <XCircle className="w-3 h-3 text-destructive" />;
    return null;
  };

  const isSyncing = Object.values(syncStatus).some(s => s === "syncing");

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
      <CardContent className="py-2 px-3 space-y-3">
        {/* NFL & NCAAB Row */}
        <div className="grid grid-cols-2 gap-2">
          {/* NFL */}
          <div className="rounded p-2 border border-border bg-muted/20">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <Trophy className="w-3 h-3 text-terminal-green" />
                <span className="font-mono text-[10px] font-medium">NFL</span>
              </div>
              {getStatusIcon(syncStatus.nfl)}
            </div>
            <div className="flex items-center gap-1 mb-1">
              <Badge variant="outline" className="border-terminal-green/50 text-terminal-green text-[9px] px-1">
                {counts.nfl.count ?? "—"} players
              </Badge>
            </div>
            <div className="text-[8px] text-muted-foreground font-mono flex items-center gap-1 mb-1.5">
              <Clock className="w-2 h-2" />
              <span className="truncate">{counts.nfl.lastSync || "Never"}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full font-mono text-[9px] h-5 border-terminal-green/50 hover:bg-terminal-green/10"
              onClick={syncNFLPlayers}
              disabled={syncStatus.nfl === "syncing"}
            >
              {syncStatus.nfl === "syncing" ? <Loader2 className="w-2 h-2 animate-spin" /> : "Sync (7 Days)"}
            </Button>
          </div>

          {/* NCAAB */}
          <div className="rounded p-2 border border-border bg-muted/20">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <GraduationCap className="w-3 h-3 text-terminal-amber" />
                <span className="font-mono text-[10px] font-medium">NCAAB</span>
              </div>
              {getStatusIcon(syncStatus.ncaab)}
            </div>
            <div className="flex items-center gap-1 mb-1">
              <Badge variant="outline" className="border-terminal-amber/50 text-terminal-amber text-[9px] px-1">
                {counts.ncaab.count ?? "—"} players
              </Badge>
            </div>
            <div className="text-[8px] text-muted-foreground font-mono flex items-center gap-1 mb-1.5">
              <Clock className="w-2 h-2" />
              <span className="truncate">{counts.ncaab.lastSync || "Never"}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full font-mono text-[9px] h-5 border-terminal-amber/50 hover:bg-terminal-amber/10"
              onClick={syncNCAABPlayers}
              disabled={syncStatus.ncaab === "syncing"}
            >
              {syncStatus.ncaab === "syncing" ? <Loader2 className="w-2 h-2 animate-spin" /> : "Sync (24h)"}
            </Button>
          </div>
        </div>

        {/* NBA Section with Stats */}
        <div className="rounded p-2 border border-terminal-cyan/30 bg-terminal-cyan/5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <Dribbble className="w-3 h-3 text-terminal-cyan" />
              <span className="font-mono text-[10px] font-medium">NBA</span>
            </div>
            {getStatusIcon(syncStatus.nba)}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            {/* Players */}
            <div className="bg-muted/30 rounded p-1.5">
              <div className="text-[8px] text-muted-foreground mb-0.5">Players</div>
              <Badge variant="outline" className="border-terminal-cyan/50 text-terminal-cyan text-[9px] px-1">
                {counts.nba.count ?? "—"}
              </Badge>
              <div className="text-[7px] text-muted-foreground font-mono mt-0.5">
                {counts.nba.lastSync || "Never synced"}
              </div>
            </div>

            {/* Stats */}
            <div className="bg-muted/30 rounded p-1.5">
              <div className="text-[8px] text-muted-foreground mb-0.5 flex items-center gap-1">
                <BarChart3 className="w-2 h-2" />
                With Stats
              </div>
              <Badge 
                variant="outline" 
                className={`text-[9px] px-1 ${
                  counts.nba.withStats && counts.nba.count && counts.nba.withStats >= counts.nba.count * 0.8
                    ? "border-terminal-green/50 text-terminal-green"
                    : "border-yellow-500/50 text-yellow-500"
                }`}
              >
                {counts.nba.withStats ?? "—"} / {counts.nba.count ?? "—"}
              </Badge>
              <div className="text-[7px] text-muted-foreground font-mono mt-0.5">
                {counts.nba.statsLastSync || "Never synced"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full font-mono text-[9px] h-6 border-terminal-cyan/50 hover:bg-terminal-cyan/10"
              onClick={syncNBAPlayers}
              disabled={syncStatus.nba === "syncing"}
            >
              {syncStatus.nba === "syncing" ? <Loader2 className="w-2 h-2 animate-spin" /> : "Sync Players"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full font-mono text-[9px] h-6 border-blue-500/50 hover:bg-blue-500/10 text-blue-400"
              onClick={syncNBAStats}
              disabled={syncStatus.nbaStats === "syncing"}
            >
              {syncStatus.nbaStats === "syncing" ? (
                <Loader2 className="w-2 h-2 animate-spin" />
              ) : (
                <><BarChart3 className="w-2 h-2 mr-1" />Sync Stats</>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}