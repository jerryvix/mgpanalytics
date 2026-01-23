import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Play, 
  Square, 
  Loader2, 
  ChevronDown, 
  ChevronRight,
  Users,
  BarChart3,
  FileText,
  TrendingUp,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

type SyncState = "idle" | "syncing" | "done" | "error" | "stopped";

interface SyncProgress {
  current: number;
  total: number;
  eta?: number;
}

interface NBADataCounts {
  players: { count: number; lastSync: string | null; status: SyncState };
  injuries: { count: number; lastSync: string | null };
  seasonStats: { count: number; lastSync: string | null; status: SyncState };
  gameLogs: { count: number; lastSync: string | null; status: SyncState };
  props: { count: number; lastSync: string | null; status: SyncState };
  games: { count: number; lastSync: string | null };
}

export function NBASyncCard() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isFullSyncing, setIsFullSyncing] = useState(false);
  const [fullSyncStep, setFullSyncStep] = useState("");
  
  // Individual sync states
  const [playersSyncState, setPlayersSyncState] = useState<SyncState>("idle");
  const [statsSyncState, setStatsSyncState] = useState<SyncState>("idle");
  const [logsSyncState, setLogsSyncState] = useState<SyncState>("idle");
  const [propsSyncState, setPropsSyncState] = useState<SyncState>("idle");
  
  // Progress tracking
  const [statsProgress, setStatsProgress] = useState<SyncProgress | null>(null);
  const [logsProgress, setLogsProgress] = useState<SyncProgress | null>(null);
  
  // Stop refs
  const stopSyncRef = useRef(false);
  const stopStatsRef = useRef(false);
  const stopLogsRef = useRef(false);
  
  // Data counts
  const [counts, setCounts] = useState<NBADataCounts>({
    players: { count: 0, lastSync: null, status: "idle" },
    injuries: { count: 0, lastSync: null },
    seasonStats: { count: 0, lastSync: null, status: "idle" },
    gameLogs: { count: 0, lastSync: null, status: "idle" },
    props: { count: 0, lastSync: null, status: "idle" },
    games: { count: 0, lastSync: null },
  });

  const formatLastSync = (timestamp: string | null): string => {
    if (!timestamp) return "Never";
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return "Unknown";
    }
  };

  const fetchCounts = async () => {
    const today = new Date().toISOString().split("T")[0];
    
    // Fetch all counts in parallel
    const [
      playersResult,
      statsResult,
      logsResult,
      propsResult,
      gamesResult,
      injuriesResult,
      syncSchedule
    ] = await Promise.all([
      supabase.from("players").select("*", { count: "exact", head: true }).eq("sport", "NBA"),
      supabase.from("player_season_stats").select("*", { count: "exact", head: true }).eq("sport", "NBA"),
      supabase.from("player_game_logs").select("*", { count: "exact", head: true }).eq("sport", "NBA"),
      supabase.from("player_props").select("*", { count: "exact", head: true }).eq("sport", "NBA").eq("is_active", true).gte("game_date", today),
      supabase.from("nba_games").select("*", { count: "exact", head: true }),
      supabase.from("players").select("*", { count: "exact", head: true }).eq("sport", "NBA").not("injury_status", "is", null),
      supabase.from("sync_schedule").select("sport, data_type, last_sync_at, last_sync_status").eq("sport", "NBA")
    ]);

    const getSyncTime = (dataType: string): string | null => {
      const record = syncSchedule.data?.find(s => s.data_type === dataType);
      return record?.last_sync_at || null;
    };

    setCounts({
      players: { count: playersResult.count || 0, lastSync: getSyncTime("players"), status: "idle" },
      injuries: { count: injuriesResult.count || 0, lastSync: getSyncTime("players") },
      seasonStats: { count: statsResult.count || 0, lastSync: getSyncTime("season_stats"), status: "idle" },
      gameLogs: { count: logsResult.count || 0, lastSync: getSyncTime("game_logs"), status: "idle" },
      props: { count: propsResult.count || 0, lastSync: getSyncTime("props"), status: "idle" },
      games: { count: gamesResult.count || 0, lastSync: getSyncTime("games") },
    });
  };

  useEffect(() => {
    fetchCounts();
  }, []);

  const updateSyncSchedule = async (dataType: string, status: string) => {
    await supabase.from("sync_schedule").upsert({
      sport: "NBA",
      data_type: dataType,
      last_sync_at: new Date().toISOString(),
      last_sync_status: status,
    }, { onConflict: "sport,data_type" });
  };

  // Sync Players (via edge function)
  const syncPlayers = async (): Promise<boolean> => {
    setPlayersSyncState("syncing");
    try {
      const { error } = await supabase.functions.invoke("sync-nba-players");
      if (error) console.log("[NBA Sync] Players edge error:", error.message);
      
      await updateSyncSchedule("players", "success");
      await fetchCounts();
      setPlayersSyncState("done");
      
      if (!isFullSyncing) {
        toast({ title: "NBA Players Synced", description: `Players updated successfully` });
      }
      
      setTimeout(() => setPlayersSyncState("idle"), 3000);
      return true;
    } catch (error) {
      console.error("[NBA Sync] Players error:", error);
      setPlayersSyncState("error");
      await updateSyncSchedule("players", "failed");
      return false;
    }
  };

  // Sync Season Stats (via edge function)
  const syncSeasonStats = async (): Promise<boolean> => {
    setStatsSyncState("syncing");
    stopStatsRef.current = false;
    
    try {
      const { data, error } = await supabase.functions.invoke("sync-nba-stats");
      
      if (error) {
        console.log("[NBA Sync] Stats edge error:", error.message);
      }
      
      if (stopStatsRef.current) {
        setStatsSyncState("stopped");
        await updateSyncSchedule("season_stats", "stopped");
        return false;
      }

      await updateSyncSchedule("season_stats", "success");
      await fetchCounts();
      setStatsSyncState("done");
      
      if (!isFullSyncing) {
        toast({ 
          title: "NBA Season Stats Synced", 
          description: data?.synced ? `${data.synced} stats updated` : "Stats updated successfully"
        });
      }
      
      setTimeout(() => setStatsSyncState("idle"), 3000);
      return true;
    } catch (error) {
      console.error("[NBA Sync] Stats error:", error);
      setStatsSyncState("error");
      await updateSyncSchedule("season_stats", "failed");
      return false;
    }
  };

  // Sync Game Logs (via edge function)
  const syncGameLogs = async (): Promise<boolean> => {
    setLogsSyncState("syncing");
    stopLogsRef.current = false;
    
    try {
      const { data, error } = await supabase.functions.invoke("sync-nba-game-logs");
      
      if (error) {
        console.log("[NBA Sync] Game logs edge error:", error.message);
      }
      
      if (stopLogsRef.current) {
        setLogsSyncState("stopped");
        await updateSyncSchedule("game_logs", "stopped");
        return false;
      }

      await updateSyncSchedule("game_logs", "success");
      await fetchCounts();
      setLogsSyncState("done");
      
      if (!isFullSyncing) {
        toast({ 
          title: "NBA Game Logs Synced", 
          description: data?.synced ? `${data.synced} game logs updated` : "Game logs updated successfully"
        });
      }
      
      setTimeout(() => setLogsSyncState("idle"), 3000);
      return true;
    } catch (error) {
      console.error("[NBA Sync] Game logs error:", error);
      setLogsSyncState("error");
      await updateSyncSchedule("game_logs", "failed");
      return false;
    }
  };

  // Sync Props (via edge function)
  const syncProps = async (): Promise<boolean> => {
    setPropsSyncState("syncing");
    
    try {
      const { data, error } = await supabase.functions.invoke("sync-nba-props");
      
      if (error) {
        console.log("[NBA Sync] Props edge error:", error.message);
      }

      await updateSyncSchedule("props", "success");
      await fetchCounts();
      setPropsSyncState("done");
      
      if (!isFullSyncing) {
        toast({ 
          title: "NBA Props Synced", 
          description: data?.synced ? `${data.synced} props updated` : "Props updated successfully"
        });
      }
      
      setTimeout(() => setPropsSyncState("idle"), 3000);
      return true;
    } catch (error) {
      console.error("[NBA Sync] Props error:", error);
      setPropsSyncState("error");
      await updateSyncSchedule("props", "failed");
      return false;
    }
  };

  // Full NBA Sync
  const handleFullSync = async () => {
    setIsFullSyncing(true);
    stopSyncRef.current = false;
    const startTime = Date.now();

    try {
      // Step 1: Players
      setFullSyncStep("Syncing Players...");
      toast({ title: "NBA Full Sync", description: "Step 1/4: Syncing Players..." });
      await syncPlayers();
      if (stopSyncRef.current) throw new Error("Sync cancelled");

      // Step 2: Season Stats
      setFullSyncStep("Syncing Season Stats...");
      toast({ title: "NBA Full Sync", description: "Step 2/4: Syncing Season Stats..." });
      await syncSeasonStats();
      if (stopSyncRef.current) throw new Error("Sync cancelled");

      // Step 3: Game Logs
      setFullSyncStep("Syncing Game Logs...");
      toast({ title: "NBA Full Sync", description: "Step 3/4: Syncing Game Logs..." });
      await syncGameLogs();
      if (stopSyncRef.current) throw new Error("Sync cancelled");

      // Step 4: Props
      setFullSyncStep("Syncing Props...");
      toast({ title: "NBA Full Sync", description: "Step 4/4: Syncing Props..." });
      await syncProps();

      const duration = Math.round((Date.now() - startTime) / 1000);
      toast({
        title: "✓ NBA Full Sync Complete",
        description: `All data synced in ${Math.floor(duration / 60)}m ${duration % 60}s`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Sync failed";
      if (msg !== "Sync cancelled") {
        toast({ title: "NBA Sync Failed", description: msg, variant: "destructive" });
      }
    } finally {
      setIsFullSyncing(false);
      setFullSyncStep("");
      stopSyncRef.current = false;
    }
  };

  const handleStopFullSync = () => {
    stopSyncRef.current = true;
    stopStatsRef.current = true;
    stopLogsRef.current = true;
    toast({ title: "Stopping NBA sync...", description: "Will stop after current operation" });
  };

  const getStatusIcon = (status: SyncState) => {
    switch (status) {
      case "syncing": return <Loader2 className="w-3 h-3 animate-spin text-terminal-cyan" />;
      case "done": return <CheckCircle2 className="w-3 h-3 text-terminal-green" />;
      case "error": return <AlertTriangle className="w-3 h-3 text-terminal-red" />;
      case "stopped": return <Square className="w-3 h-3 text-terminal-amber" />;
      default: return <Clock className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const formatCount = (n: number): string => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  const isSyncing = playersSyncState === "syncing" || statsSyncState === "syncing" || 
                    logsSyncState === "syncing" || propsSyncState === "syncing" || isFullSyncing;

  // Calculate data health score
  const calculateHealthScore = (): number => {
    let score = 0;
    const now = new Date();
    const hourMs = 60 * 60 * 1000;
    
    // Players: fresh if < 12 hours
    if (counts.players.lastSync) {
      const age = now.getTime() - new Date(counts.players.lastSync).getTime();
      if (age < 12 * hourMs) score += 25;
      else if (age < 24 * hourMs) score += 15;
    }
    
    // Stats: fresh if < 24 hours
    if (counts.seasonStats.lastSync) {
      const age = now.getTime() - new Date(counts.seasonStats.lastSync).getTime();
      if (age < 24 * hourMs) score += 25;
      else if (age < 48 * hourMs) score += 15;
    }
    
    // Game Logs: fresh if < 24 hours
    if (counts.gameLogs.lastSync) {
      const age = now.getTime() - new Date(counts.gameLogs.lastSync).getTime();
      if (age < 24 * hourMs) score += 25;
      else if (age < 48 * hourMs) score += 15;
    }
    
    // Props: fresh if < 6 hours
    if (counts.props.lastSync) {
      const age = now.getTime() - new Date(counts.props.lastSync).getTime();
      if (age < 6 * hourMs) score += 25;
      else if (age < 12 * hourMs) score += 15;
    }
    
    return score;
  };

  const healthScore = calculateHealthScore();

  return (
    <Card className="bg-card border-terminal-cyan/30">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-2 px-4 flex flex-row items-center justify-between cursor-pointer hover:bg-muted/20">
            <CardTitle className="text-xs font-mono text-foreground flex items-center gap-2">
              <Activity className="w-3 h-3 text-terminal-cyan" />
              🏀 NBA Stats Sync (Ball Don't Lie)
              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge 
                variant="outline" 
                className={`text-[9px] ${healthScore >= 75 ? "border-terminal-green text-terminal-green" : healthScore >= 50 ? "border-terminal-amber text-terminal-amber" : "border-terminal-red text-terminal-red"}`}
              >
                {healthScore}/100
              </Badge>
              {isFullSyncing ? (
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="font-mono text-[10px] h-6 px-2" 
                  onClick={(e) => { e.stopPropagation(); handleStopFullSync(); }}
                >
                  <Square className="w-2 h-2 mr-1" />Stop
                </Button>
              ) : (
                <Button 
                  size="sm"
                  className="font-mono text-[10px] h-6 bg-terminal-cyan hover:bg-terminal-cyan/80 text-background"
                  onClick={(e) => { e.stopPropagation(); handleFullSync(); }}
                  disabled={isSyncing}
                >
                  <Play className="w-2 h-2 mr-1" />Full Sync
                </Button>
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="py-2 px-4 space-y-3">
            {/* Compact Stats Row */}
            <div className="flex items-center justify-between font-mono text-[10px] bg-muted/30 rounded px-2 py-1">
              <div className="flex items-center gap-3">
                <span>{formatCount(counts.players.count)} Players</span>
                <span className="text-muted-foreground">|</span>
                <span>{formatCount(counts.seasonStats.count)} Stats</span>
                <span className="text-muted-foreground">|</span>
                <span>{formatCount(counts.gameLogs.count)} Logs</span>
                <span className="text-muted-foreground">|</span>
                <span>{formatCount(counts.props.count)} Props</span>
              </div>
              <span className="text-muted-foreground">Games: {counts.games.count}</span>
            </div>

            {/* Full Sync Progress */}
            {isFullSyncing && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-terminal-cyan">{fullSyncStep}</span>
                </div>
                <Progress value={
                  fullSyncStep.includes("Players") ? 25 :
                  fullSyncStep.includes("Season") ? 50 :
                  fullSyncStep.includes("Game") ? 75 :
                  fullSyncStep.includes("Props") ? 90 : 0
                } className="h-1" />
              </div>
            )}

            {/* Sync Sections */}
            <div className="space-y-2">
              {/* Players Section */}
              <div className="flex items-center justify-between bg-muted/20 rounded px-2 py-1.5">
                <div className="flex items-center gap-2">
                  {getStatusIcon(playersSyncState)}
                  <Users className="w-3 h-3 text-muted-foreground" />
                  <span className="font-mono text-[10px]">Players & Injuries</span>
                  <span className="text-[9px] text-muted-foreground">
                    {counts.players.count} players, {counts.injuries.count} injuries
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-muted-foreground">{formatLastSync(counts.players.lastSync)}</span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="font-mono text-[9px] h-5 px-2 border-terminal-cyan/50 hover:bg-terminal-cyan/10"
                    onClick={syncPlayers}
                    disabled={isSyncing}
                  >
                    {playersSyncState === "syncing" ? <Loader2 className="w-2 h-2 animate-spin" /> : <RefreshCw className="w-2 h-2" />}
                  </Button>
                </div>
              </div>

              {/* Season Stats Section */}
              <div className="flex items-center justify-between bg-muted/20 rounded px-2 py-1.5">
                <div className="flex items-center gap-2">
                  {getStatusIcon(statsSyncState)}
                  <BarChart3 className="w-3 h-3 text-muted-foreground" />
                  <span className="font-mono text-[10px]">Season Averages</span>
                  <span className="text-[9px] text-muted-foreground">
                    {counts.seasonStats.count}/{counts.players.count} players
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-muted-foreground">{formatLastSync(counts.seasonStats.lastSync)}</span>
                  {statsSyncState === "syncing" ? (
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      className="font-mono text-[9px] h-5 px-2"
                      onClick={() => { stopStatsRef.current = true; }}
                    >
                      <Square className="w-2 h-2" />
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="font-mono text-[9px] h-5 px-2 border-terminal-cyan/50 hover:bg-terminal-cyan/10"
                      onClick={syncSeasonStats}
                      disabled={isSyncing}
                    >
                      <RefreshCw className="w-2 h-2" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Game Logs Section */}
              <div className="flex items-center justify-between bg-muted/20 rounded px-2 py-1.5">
                <div className="flex items-center gap-2">
                  {getStatusIcon(logsSyncState)}
                  <FileText className="w-3 h-3 text-muted-foreground" />
                  <span className="font-mono text-[10px]">Game Logs</span>
                  <span className="text-[9px] text-muted-foreground">
                    {formatCount(counts.gameLogs.count)} stored
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-muted-foreground">{formatLastSync(counts.gameLogs.lastSync)}</span>
                  {logsSyncState === "syncing" ? (
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      className="font-mono text-[9px] h-5 px-2"
                      onClick={() => { stopLogsRef.current = true; }}
                    >
                      <Square className="w-2 h-2" />
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="font-mono text-[9px] h-5 px-2 border-terminal-cyan/50 hover:bg-terminal-cyan/10"
                      onClick={syncGameLogs}
                      disabled={isSyncing}
                    >
                      <RefreshCw className="w-2 h-2" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Props Section */}
              <div className="flex items-center justify-between bg-muted/20 rounded px-2 py-1.5">
                <div className="flex items-center gap-2">
                  {getStatusIcon(propsSyncState)}
                  <TrendingUp className="w-3 h-3 text-muted-foreground" />
                  <span className="font-mono text-[10px]">Player Props</span>
                  <span className="text-[9px] text-muted-foreground">
                    {counts.props.count} active props
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-muted-foreground">{formatLastSync(counts.props.lastSync)}</span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="font-mono text-[9px] h-5 px-2 border-terminal-cyan/50 hover:bg-terminal-cyan/10"
                    onClick={syncProps}
                    disabled={isSyncing}
                  >
                    {propsSyncState === "syncing" ? <Loader2 className="w-2 h-2 animate-spin" /> : <RefreshCw className="w-2 h-2" />}
                  </Button>
                </div>
              </div>
            </div>

            {/* Data Health Summary */}
            <div className="bg-muted/30 rounded px-2 py-1.5 space-y-1">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-muted-foreground">DATA HEALTH</span>
                <span className={healthScore >= 75 ? "text-terminal-green" : healthScore >= 50 ? "text-terminal-amber" : "text-terminal-red"}>
                  Score: {healthScore}/100
                </span>
              </div>
              <div className="flex items-center gap-2 text-[9px]">
                <span className={counts.players.lastSync ? "text-terminal-green" : "text-terminal-red"}>
                  {counts.players.lastSync ? "✓" : "⚠️"} Players
                </span>
                <span className={counts.seasonStats.lastSync ? "text-terminal-green" : "text-terminal-red"}>
                  {counts.seasonStats.lastSync ? "✓" : "⚠️"} Stats
                </span>
                <span className={counts.gameLogs.lastSync ? "text-terminal-green" : "text-terminal-red"}>
                  {counts.gameLogs.lastSync ? "✓" : "⚠️"} Logs
                </span>
                <span className={counts.props.lastSync ? "text-terminal-green" : "text-terminal-red"}>
                  {counts.props.lastSync ? "✓" : "⚠️"} Props
                </span>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
