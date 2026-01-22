import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Loader2, 
  RefreshCw, 
  Trophy, 
  Dribbble, 
  GraduationCap, 
  Clock,
  CheckCircle,
  Play
} from "lucide-react";
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

interface SyncStatus {
  nfl: "idle" | "syncing" | "done" | "error";
  nba: "idle" | "syncing" | "done" | "error";
  ncaab: "idle" | "syncing" | "done" | "error";
  ncaaf: "idle" | "syncing" | "done" | "error";
  mlb: "idle" | "syncing" | "done" | "error";
}

interface SportCounts {
  nfl: { games: number | null; odds: number | null; lastSync: string | null };
  nba: { games: number | null; odds: number | null; lastSync: string | null };
  ncaab: { games: number | null; ranked: number | null; odds: number | null; lastSync: string | null };
  ncaaf: { games: number | null; ranked: number | null; odds: number | null; lastSync: string | null };
  mlb: { games: number | null; odds: number | null; lastSync: string | null };
}

export function SportsDataManagement() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    nfl: "idle",
    nba: "idle",
    ncaab: "idle",
    ncaaf: "idle",
    mlb: "idle",
  });
  
  const [isAllSyncing, setIsAllSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<{sport: string; count: number}[]>([]);
  
  const [counts, setCounts] = useState<SportCounts>({
    nfl: { games: null, odds: null, lastSync: null },
    nba: { games: null, odds: null, lastSync: null },
    ncaab: { games: null, ranked: null, odds: null, lastSync: null },
    ncaaf: { games: null, ranked: null, odds: null, lastSync: null },
    mlb: { games: null, odds: null, lastSync: null },
  });

  const fetchAllCounts = async () => {
    const [
      nflGames, nflOdds, nflSync,
      nbaGames, nbaOdds, nbaSync,
      ncaabGames, ncaabRanked, ncaabOdds, ncaabSync,
      ncaafGames, ncaafRanked, ncaafOdds, ncaafSync,
      mlbGames, mlbOdds, mlbSync
    ] = await Promise.all([
      // NFL
      supabase.from("games").select("*", { count: "exact", head: true }).eq("league", "NFL"),
      supabase.from("odds").select("*", { count: "exact", head: true }),
      supabase.from("sync_schedule").select("last_sync_at").eq("sport", "NFL").eq("data_type", "games").single(),
      // NBA
      supabase.from("nba_games").select("*", { count: "exact", head: true }),
      supabase.from("nba_odds").select("*", { count: "exact", head: true }),
      supabase.from("sync_schedule").select("last_sync_at").eq("sport", "NBA").eq("data_type", "games").single(),
      // NCAAB
      supabase.from("ncaab_games").select("*", { count: "exact", head: true }),
      supabase.from("ncaab_games").select("*", { count: "exact", head: true }).or("home_team_rank.not.is.null,visitor_team_rank.not.is.null"),
      supabase.from("ncaab_odds").select("*", { count: "exact", head: true }),
      supabase.from("sync_schedule").select("last_sync_at").eq("sport", "NCAAB").eq("data_type", "games").single(),
      // NCAAF
      supabase.from("ncaaf_games").select("*", { count: "exact", head: true }),
      supabase.from("ncaaf_games").select("*", { count: "exact", head: true }).or("home_team_rank.lte.25,visitor_team_rank.lte.25"),
      supabase.from("ncaaf_odds").select("*", { count: "exact", head: true }),
      supabase.from("sync_schedule").select("last_sync_at").eq("sport", "NCAAF").eq("data_type", "games").single(),
      // MLB
      supabase.from("mlb_games").select("*", { count: "exact", head: true }),
      supabase.from("mlb_odds").select("*", { count: "exact", head: true }),
      supabase.from("sync_schedule").select("last_sync_at").eq("sport", "MLB").eq("data_type", "games").single(),
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
      nfl: { 
        games: nflGames.count, 
        odds: nflOdds.count,
        lastSync: formatTime(nflSync.data?.last_sync_at)
      },
      nba: { 
        games: nbaGames.count, 
        odds: nbaOdds.count,
        lastSync: formatTime(nbaSync.data?.last_sync_at)
      },
      ncaab: { 
        games: ncaabGames.count, 
        ranked: ncaabRanked.count,
        odds: ncaabOdds.count,
        lastSync: formatTime(ncaabSync.data?.last_sync_at)
      },
      ncaaf: { 
        games: ncaafGames.count, 
        ranked: ncaafRanked.count,
        odds: ncaafOdds.count,
        lastSync: formatTime(ncaafSync.data?.last_sync_at)
      },
      mlb: { 
        games: mlbGames.count, 
        odds: mlbOdds.count,
        lastSync: formatTime(mlbSync.data?.last_sync_at)
      },
    });
  };

  useEffect(() => {
    fetchAllCounts();
  }, []);

  const updateSyncSchedule = async (sport: string) => {
    await supabase.from("sync_schedule").upsert({
      sport,
      data_type: "games",
      last_sync_at: new Date().toISOString(),
      last_sync_status: "success",
    }, { onConflict: "sport,data_type" });
  };

  // Individual sync handlers
  const syncNFL = async () => {
    setSyncStatus(prev => ({ ...prev, nfl: "syncing" }));
    try {
      const { data } = await supabase.functions.invoke("sync-nfl-games");
      await updateSyncSchedule("NFL");
      setSyncStatus(prev => ({ ...prev, nfl: "done" }));
      return data?.gamesCount || 0;
    } catch {
      setSyncStatus(prev => ({ ...prev, nfl: "error" }));
      return 0;
    }
  };

  const syncNBA = async () => {
    setSyncStatus(prev => ({ ...prev, nba: "syncing" }));
    try {
      const { data } = await supabase.functions.invoke("sync-nba-games");
      await updateSyncSchedule("NBA");
      setSyncStatus(prev => ({ ...prev, nba: "done" }));
      return data?.gamesCount || 0;
    } catch {
      setSyncStatus(prev => ({ ...prev, nba: "error" }));
      return 0;
    }
  };

  const syncNCAAB = async () => {
    setSyncStatus(prev => ({ ...prev, ncaab: "syncing" }));
    try {
      const { data } = await supabase.functions.invoke("sync-ncaab-games");
      await updateSyncSchedule("NCAAB");
      setSyncStatus(prev => ({ ...prev, ncaab: "done" }));
      return data?.gamesCount || 0;
    } catch {
      setSyncStatus(prev => ({ ...prev, ncaab: "error" }));
      return 0;
    }
  };

  const syncNCAAF = async () => {
    setSyncStatus(prev => ({ ...prev, ncaaf: "syncing" }));
    try {
      const { data } = await supabase.functions.invoke("sync-ncaaf-games");
      await updateSyncSchedule("NCAAF");
      setSyncStatus(prev => ({ ...prev, ncaaf: "done" }));
      return data?.gamesCount || 0;
    } catch {
      setSyncStatus(prev => ({ ...prev, ncaaf: "error" }));
      return 0;
    }
  };

  const syncMLB = async () => {
    setSyncStatus(prev => ({ ...prev, mlb: "syncing" }));
    try {
      const { data } = await supabase.functions.invoke("sync-mlb-games");
      await updateSyncSchedule("MLB");
      setSyncStatus(prev => ({ ...prev, mlb: "done" }));
      return data?.gamesCount || 0;
    } catch {
      setSyncStatus(prev => ({ ...prev, mlb: "error" }));
      return 0;
    }
  };

  // Sync All Sports - parallel execution
  const handleSyncAll = async () => {
    setIsAllSyncing(true);
    setSyncResults([]);
    setSyncStatus({
      nfl: "syncing",
      nba: "syncing",
      ncaab: "syncing",
      ncaaf: "syncing",
      mlb: "syncing",
    });

    try {
      const results = await Promise.all([
        syncNFL().then(count => ({ sport: "NFL", count })),
        syncNBA().then(count => ({ sport: "NBA", count })),
        syncNCAAB().then(count => ({ sport: "NCAAB", count })),
        syncNCAAF().then(count => ({ sport: "NCAAF", count })),
        syncMLB().then(count => ({ sport: "MLB", count })),
      ]);

      setSyncResults(results);
      await fetchAllCounts();

      const totalGames = results.reduce((sum, r) => sum + r.count, 0);
      toast({
        title: "All Sports Synced",
        description: `Successfully synced ${totalGames} total games across all sports`,
      });
    } catch (error) {
      console.error("Sync all error:", error);
      toast({
        title: "Sync Error",
        description: "Some sports failed to sync",
        variant: "destructive",
      });
    } finally {
      setIsAllSyncing(false);
      // Reset status after 3 seconds
      setTimeout(() => {
        setSyncStatus({
          nfl: "idle",
          nba: "idle",
          ncaab: "idle",
          ncaaf: "idle",
          mlb: "idle",
        });
        setSyncResults([]);
      }, 3000);
    }
  };

  // Individual sport sync with toast
  const handleIndividualSync = async (sport: "nfl" | "nba" | "ncaab" | "ncaaf" | "mlb") => {
    const syncFn = {
      nfl: syncNFL,
      nba: syncNBA,
      ncaab: syncNCAAB,
      ncaaf: syncNCAAF,
      mlb: syncMLB,
    }[sport];

    const count = await syncFn();
    await fetchAllCounts();
    
    toast({
      title: `${sport.toUpperCase()} Synced`,
      description: `Synced ${count} games`,
    });

    // Reset status after 2 seconds
    setTimeout(() => {
      setSyncStatus(prev => ({ ...prev, [sport]: "idle" }));
    }, 2000);
  };

  const getStatusIcon = (status: "idle" | "syncing" | "done" | "error") => {
    switch (status) {
      case "syncing":
        return <Loader2 className="w-3 h-3 animate-spin" />;
      case "done":
        return <CheckCircle className="w-3 h-3 text-terminal-green" />;
      case "error":
        return <span className="text-terminal-red">✗</span>;
      default:
        return null;
    }
  };

  const isSyncing = Object.values(syncStatus).some(s => s === "syncing");

  return (
    <Card className="bg-card border-primary/30">
      <CardHeader>
        <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-primary" />
          Sports Data Management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sync All Sports Button */}
        <Button
          size="lg"
          className="w-full bg-terminal-green hover:bg-terminal-green/80 text-background font-mono font-bold"
          onClick={handleSyncAll}
          disabled={isSyncing}
        >
          {isAllSyncing ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Syncing...</span>
              <div className="flex items-center gap-1 ml-2">
                <span className="flex items-center gap-0.5">NFL {getStatusIcon(syncStatus.nfl)}</span>
                <span className="flex items-center gap-0.5">NBA {getStatusIcon(syncStatus.nba)}</span>
                <span className="flex items-center gap-0.5">NCAAB {getStatusIcon(syncStatus.ncaab)}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4" />
              Sync All Sports
            </div>
          )}
        </Button>

        {/* Success message */}
        {syncResults.length > 0 && !isAllSyncing && (
          <div className="bg-terminal-green/10 border border-terminal-green/30 rounded-lg p-3 font-mono text-xs text-terminal-green">
            ✓ Successfully synced: {syncResults.map(r => `${r.count} ${r.sport}`).join(", ")} games
          </div>
        )}

        {/* Individual Sport Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* NFL Card */}
          <div className="bg-muted/30 rounded-lg p-3 border border-terminal-green/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-terminal-green" />
                <span className="font-mono text-sm font-medium">NFL</span>
              </div>
              <Badge variant="outline" className="border-terminal-green/50 text-terminal-green text-[9px]">
                {counts.nfl.games ?? "—"} games
              </Badge>
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono mb-2">
              <span className="flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {counts.nfl.lastSync || "Never"}
              </span>
              <span>{counts.nfl.odds ?? "—"} odds</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full font-mono text-xs border-terminal-green/50 hover:bg-terminal-green/10"
              onClick={() => handleIndividualSync("nfl")}
              disabled={syncStatus.nfl === "syncing"}
            >
              {syncStatus.nfl === "syncing" ? (
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-2" />
              )}
              Sync NFL (7 Days)
            </Button>
          </div>

          {/* NBA Card */}
          <div className="bg-muted/30 rounded-lg p-3 border border-terminal-cyan/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Dribbble className="w-4 h-4 text-terminal-cyan" />
                <span className="font-mono text-sm font-medium">NBA</span>
              </div>
              <Badge variant="outline" className="border-terminal-cyan/50 text-terminal-cyan text-[9px]">
                {counts.nba.games ?? "—"} games
              </Badge>
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono mb-2">
              <span className="flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {counts.nba.lastSync || "Never"}
              </span>
              <span>{counts.nba.odds ?? "—"} odds</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full font-mono text-xs border-terminal-cyan/50 hover:bg-terminal-cyan/10"
              onClick={() => handleIndividualSync("nba")}
              disabled={syncStatus.nba === "syncing"}
            >
              {syncStatus.nba === "syncing" ? (
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-2" />
              )}
              Sync NBA (48h)
            </Button>
          </div>

          {/* NCAAB Card */}
          <div className="bg-muted/30 rounded-lg p-3 border border-terminal-amber/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-terminal-amber" />
                <span className="font-mono text-sm font-medium">NCAAB</span>
              </div>
              <Badge variant="outline" className="border-terminal-amber/50 text-terminal-amber text-[9px]">
                {counts.ncaab.ranked ?? "—"} ranked
              </Badge>
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono mb-2">
              <span className="flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {counts.ncaab.lastSync || "Never"}
              </span>
              <span>{counts.ncaab.games ?? "—"} games</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full font-mono text-xs border-terminal-amber/50 hover:bg-terminal-amber/10"
              onClick={() => handleIndividualSync("ncaab")}
              disabled={syncStatus.ncaab === "syncing"}
            >
              {syncStatus.ncaab === "syncing" ? (
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-2" />
              )}
              Sync NCAAB (24h)
            </Button>
          </div>

          {/* NCAAF Card */}
          <div className="bg-muted/30 rounded-lg p-3 border border-orange-500/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-orange-500" />
                <span className="font-mono text-sm font-medium">NCAAF</span>
              </div>
              <Badge variant="outline" className="border-orange-500/50 text-orange-500 text-[9px]">
                {counts.ncaaf.ranked ?? "—"} Top 25
              </Badge>
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono mb-2">
              <span className="flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {counts.ncaaf.lastSync || "Never"}
              </span>
              <span>{counts.ncaaf.games ?? "—"} games</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full font-mono text-xs border-orange-500/50 hover:bg-orange-500/10"
              onClick={() => handleIndividualSync("ncaaf")}
              disabled={syncStatus.ncaaf === "syncing"}
            >
              {syncStatus.ncaaf === "syncing" ? (
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-2" />
              )}
              Sync NCAAF (7 Days)
            </Button>
          </div>

          {/* MLB Card */}
          <div className="bg-muted/30 rounded-lg p-3 border border-red-500/20 md:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BaseballIcon className="w-4 h-4 text-red-500" />
                <span className="font-mono text-sm font-medium">MLB</span>
                <span className="text-[9px] text-muted-foreground italic">(Season starts March 2026)</span>
              </div>
              <Badge variant="outline" className="border-red-500/50 text-red-500 text-[9px]">
                {counts.mlb.games ?? "—"} games
              </Badge>
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono mb-2">
              <span className="flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {counts.mlb.lastSync || "Never"}
              </span>
              <span>{counts.mlb.odds ?? "—"} odds</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full font-mono text-xs border-red-500/50 hover:bg-red-500/10"
              onClick={() => handleIndividualSync("mlb")}
              disabled={syncStatus.mlb === "syncing"}
            >
              {syncStatus.mlb === "syncing" ? (
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-2" />
              )}
              Sync MLB (24h)
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
