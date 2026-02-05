import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Loader2,
  RefreshCw,
  Trophy,
  Dribbble,
  GraduationCap,
  Clock,
  CheckCircle,
  XCircle,
  Play,
  ChevronDown,
  Info
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

type SyncState = "idle" | "syncing" | "done" | "error" | "offseason" | "never";

interface SyncStatus {
  nfl: SyncState;
  nba: SyncState;
  ncaab: SyncState;
  ncaaf: SyncState;
  mlb: SyncState;
}

interface SportCounts {
  nfl: { games: number | null; odds: number | null; lastSync: string | null };
  nba: { games: number | null; odds: number | null; lastSync: string | null };
  ncaab: { games: number | null; ranked: number | null; odds: number | null; lastSync: string | null };
  ncaaf: { games: number | null; ranked: number | null; odds: number | null; lastSync: string | null };
  mlb: { games: number | null; odds: number | null; lastSync: string | null };
}

// Determine if sport is off-season (simplified logic)
const isOffSeason = (sport: string): boolean => {
  const month = new Date().getMonth(); // 0-11
  switch (sport) {
    case "nfl": return month >= 2 && month <= 7; // Mar-Aug off
    case "nba": return month >= 6 && month <= 9; // Jul-Oct off
    case "ncaab": return month >= 3 && month <= 9; // Apr-Oct off
    case "ncaaf": return month >= 0 && month <= 7; // Jan-Aug off
    case "mlb": return month >= 10 || month <= 2; // Nov-Mar off
    default: return false;
  }
};

export function SportsDataManagement() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    nfl: "idle",
    nba: "idle",
    ncaab: "idle",
    ncaaf: "idle",
    mlb: "idle",
  });
  
  const [isAllSyncing, setIsAllSyncing] = useState(false);
  const [syncStartTime, setSyncStartTime] = useState<number | null>(null);
  const [syncResults, setSyncResults] = useState<{sport: string; count: number; status: "done" | "error"}[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  
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
      supabase.from("games").select("*", { count: "exact", head: true }).eq("league", "NFL"),
      supabase.from("odds").select("*", { count: "exact", head: true }),
      supabase.from("sync_schedule").select("last_sync_at").eq("sport", "NFL").eq("data_type", "games").single(),
      supabase.from("nba_games").select("*", { count: "exact", head: true }),
      supabase.from("nba_odds").select("*", { count: "exact", head: true }),
      supabase.from("sync_schedule").select("last_sync_at").eq("sport", "NBA").eq("data_type", "games").single(),
      supabase.from("ncaab_games").select("*", { count: "exact", head: true }),
      supabase.from("ncaab_games").select("*", { count: "exact", head: true }).or("home_team_rank.not.is.null,visitor_team_rank.not.is.null"),
      supabase.from("ncaab_odds").select("*", { count: "exact", head: true }),
      supabase.from("sync_schedule").select("last_sync_at").eq("sport", "NCAAB").eq("data_type", "games").single(),
      supabase.from("ncaaf_games").select("*", { count: "exact", head: true }),
      supabase.from("ncaaf_games").select("*", { count: "exact", head: true }).or("home_team_rank.lte.25,visitor_team_rank.lte.25"),
      supabase.from("ncaaf_odds").select("*", { count: "exact", head: true }),
      supabase.from("sync_schedule").select("last_sync_at").eq("sport", "NCAAF").eq("data_type", "games").single(),
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
      nfl: { games: nflGames.count, odds: nflOdds.count, lastSync: formatTime(nflSync.data?.last_sync_at) },
      nba: { games: nbaGames.count, odds: nbaOdds.count, lastSync: formatTime(nbaSync.data?.last_sync_at) },
      ncaab: { games: ncaabGames.count, ranked: ncaabRanked.count, odds: ncaabOdds.count, lastSync: formatTime(ncaabSync.data?.last_sync_at) },
      ncaaf: { games: ncaafGames.count, ranked: ncaafRanked.count, odds: ncaafOdds.count, lastSync: formatTime(ncaafSync.data?.last_sync_at) },
      mlb: { games: mlbGames.count, odds: mlbOdds.count, lastSync: formatTime(mlbSync.data?.last_sync_at) },
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

  const syncNFL = async () => {
    setSyncStatus(prev => ({ ...prev, nfl: "syncing" }));
    try {
      const { data } = await supabase.functions.invoke("sync-nfl-games");
      await updateSyncSchedule("NFL");
      setSyncStatus(prev => ({ ...prev, nfl: "done" }));
      return { count: data?.gamesCount || 0, status: "done" as const };
    } catch {
      setSyncStatus(prev => ({ ...prev, nfl: "error" }));
      return { count: 0, status: "error" as const };
    }
  };

  const syncNBA = async () => {
    setSyncStatus(prev => ({ ...prev, nba: "syncing" }));
    try {
      const { data } = await supabase.functions.invoke("sync-nba-games");
      await updateSyncSchedule("NBA");
      setSyncStatus(prev => ({ ...prev, nba: "done" }));
      return { count: data?.gamesCount || 0, status: "done" as const };
    } catch {
      setSyncStatus(prev => ({ ...prev, nba: "error" }));
      return { count: 0, status: "error" as const };
    }
  };

  const syncNCAAB = async () => {
    setSyncStatus(prev => ({ ...prev, ncaab: "syncing" }));
    try {
      const { data } = await supabase.functions.invoke("sync-ncaab-games");
      await updateSyncSchedule("NCAAB");
      setSyncStatus(prev => ({ ...prev, ncaab: "done" }));
      return { count: data?.gamesCount || 0, status: "done" as const };
    } catch {
      setSyncStatus(prev => ({ ...prev, ncaab: "error" }));
      return { count: 0, status: "error" as const };
    }
  };

  const syncNCAAF = async () => {
    setSyncStatus(prev => ({ ...prev, ncaaf: "syncing" }));
    try {
      const { data } = await supabase.functions.invoke("sync-ncaaf-games");
      await updateSyncSchedule("NCAAF");
      setSyncStatus(prev => ({ ...prev, ncaaf: "done" }));
      return { count: data?.gamesCount || 0, status: "done" as const };
    } catch {
      setSyncStatus(prev => ({ ...prev, ncaaf: "error" }));
      return { count: 0, status: "error" as const };
    }
  };

  const syncMLB = async () => {
    setSyncStatus(prev => ({ ...prev, mlb: "syncing" }));
    try {
      const { data } = await supabase.functions.invoke("sync-mlb-games");
      await updateSyncSchedule("MLB");
      setSyncStatus(prev => ({ ...prev, mlb: "done" }));
      return { count: data?.gamesCount || 0, status: "done" as const };
    } catch {
      setSyncStatus(prev => ({ ...prev, mlb: "error" }));
      return { count: 0, status: "error" as const };
    }
  };

  const handleSyncAll = async () => {
    setIsAllSyncing(true);
    setSyncResults([]);
    setSyncStartTime(Date.now());
    setSyncStatus({ nfl: "syncing", nba: "syncing", ncaab: "syncing", ncaaf: "syncing", mlb: "syncing" });

    try {
      const results = await Promise.all([
        syncNFL().then(r => ({ sport: "NFL", ...r })),
        syncNBA().then(r => ({ sport: "NBA", ...r })),
        syncNCAAB().then(r => ({ sport: "NCAAB", ...r })),
        syncNCAAF().then(r => ({ sport: "NCAAF", ...r })),
        syncMLB().then(r => ({ sport: "MLB", ...r })),
      ]);

      const duration = Math.round((Date.now() - (syncStartTime || Date.now())) / 1000);
      setSyncResults(results);
      await fetchAllCounts();

      const totalGames = results.filter(r => r.status === "done").reduce((sum, r) => sum + r.count, 0);
      const errorCount = results.filter(r => r.status === "error").length;
      
      toast({ 
        title: errorCount > 0 ? "Sync Complete (with errors)" : "All Sports Synced", 
        description: `${totalGames} games synced in ${duration}s${errorCount > 0 ? ` (${errorCount} failed)` : ""}`,
        variant: errorCount > 0 ? "destructive" : "default"
      });
    } catch (error) {
      console.error("Sync all error:", error);
      toast({ title: "Sync Error", description: "Some sports failed to sync", variant: "destructive" });
    } finally {
      setIsAllSyncing(false);
      setSyncStartTime(null);
      setTimeout(() => {
        setSyncStatus({ nfl: "idle", nba: "idle", ncaab: "idle", ncaaf: "idle", mlb: "idle" });
        setSyncResults([]);
      }, 5000);
    }
  };

  const handleIndividualSync = async (sport: "nfl" | "nba" | "ncaab" | "ncaaf" | "mlb") => {
    const syncFn = { nfl: syncNFL, nba: syncNBA, ncaab: syncNCAAB, ncaaf: syncNCAAF, mlb: syncMLB }[sport];
    const result = await syncFn();
    await fetchAllCounts();
    toast({ 
      title: result.status === "done" ? `${sport.toUpperCase()} Synced` : `${sport.toUpperCase()} Failed`, 
      description: result.status === "done" ? `Synced ${result.count} games` : "Sync failed",
      variant: result.status === "error" ? "destructive" : "default"
    });
    setTimeout(() => setSyncStatus(prev => ({ ...prev, [sport]: "idle" })), 3000);
  };

  // Color-coded status indicator
  const getStatusDisplay = (sport: keyof SyncStatus, lastSync: string | null) => {
    const status = syncStatus[sport];
    const offSeason = isOffSeason(sport);
    
    if (status === "syncing") {
      return <Loader2 className="w-3 h-3 animate-spin text-blue-500" />;
    }
    if (status === "done") {
      return <CheckCircle className="w-3 h-3 text-terminal-green" />;
    }
    if (status === "error") {
      return <XCircle className="w-3 h-3 text-destructive" />;
    }
    if (!lastSync) {
      return <span className="w-2 h-2 rounded-full bg-muted-foreground" />;
    }
    if (offSeason) {
      return <span className="w-2 h-2 rounded-full bg-terminal-amber" />;
    }
    return <span className="w-2 h-2 rounded-full bg-terminal-green" />;
  };

  // Get card border color based on status
  const getCardBorderClass = (sport: keyof SyncStatus, lastSync: string | null) => {
    const status = syncStatus[sport];
    if (status === "syncing") return "border-blue-500/50 bg-blue-500/5";
    if (status === "done") return "border-terminal-green/50 bg-terminal-green/5";
    if (status === "error") return "border-destructive/50 bg-destructive/5";
    if (!lastSync) return "border-muted-foreground/30";
    if (isOffSeason(sport)) return "border-terminal-amber/30";
    return "border-terminal-green/20";
  };

  const isSyncing = Object.values(syncStatus).some(s => s === "syncing");

  // Sync progress display during sync all
  const getSyncProgressText = () => {
    const sports = ["nfl", "nba", "ncaab", "ncaaf", "mlb"] as const;
    const parts = sports.map(s => {
      const status = syncStatus[s];
      if (status === "done") return `${s.toUpperCase()} ✓`;
      if (status === "error") return `${s.toUpperCase()} ✗`;
      if (status === "syncing") return `${s.toUpperCase()} ⏳`;
      return null;
    }).filter(Boolean);
    return parts.join(" | ");
  };

  const sportConfig = [
    { key: "nfl" as const, label: "NFL", Icon: Trophy, color: "terminal-green", window: "7 Days" },
    { key: "nba" as const, label: "NBA", Icon: Dribbble, color: "terminal-cyan", window: "48h" },
    { key: "ncaab" as const, label: "NCAAB", Icon: GraduationCap, color: "terminal-amber", window: "24h" },
    { key: "ncaaf" as const, label: "NCAAF", Icon: Trophy, color: "orange-500", window: "7 Days" },
    { key: "mlb" as const, label: "MLB", Icon: BaseballIcon, color: "red-500", window: "24h" },
  ];

  return (
    <Card className="bg-card border-primary/30">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xs font-mono text-foreground flex items-center gap-2">
            <RefreshCw className="w-3 h-3 text-primary" />
            Sports Data
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3 h-3 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                <p>Data is cached in the database. Sync pulls fresh data from external APIs (Ball Don't Lie, The Odds API) into the cache. You don't need to sync before every query.</p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
          
          {/* Big Green Sync All Button */}
          <Button
            size="sm"
            className="bg-terminal-green hover:bg-terminal-green/80 text-background font-mono text-xs h-8 px-4 shadow-lg shadow-terminal-green/20"
            onClick={handleSyncAll}
            disabled={isSyncing}
          >
            {isAllSyncing ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Syncing...</span>
              </div>
            ) : (
              <><Play className="w-3 h-3 mr-1" />Sync All</>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="py-2 px-3 space-y-2">
        {/* Sync Progress Bar - shown during sync all */}
        {isAllSyncing && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded px-2 py-1.5 font-mono text-[10px] text-blue-400 animate-pulse">
            {getSyncProgressText()}
          </div>
        )}

        {/* Success Summary - shown after sync all */}
        {syncResults.length > 0 && !isAllSyncing && (
          <div className={`rounded px-2 py-1.5 font-mono text-[10px] ${
            syncResults.some(r => r.status === "error") 
              ? "bg-terminal-amber/10 border border-terminal-amber/30 text-terminal-amber"
              : "bg-terminal-green/10 border border-terminal-green/30 text-terminal-green"
          }`}>
            ✓ {syncResults.map(r => `${r.count} ${r.sport}${r.status === "error" ? " ✗" : ""}`).join(", ")}
          </div>
        )}

        {/* Sport Cards Grid - Always show tablet layout */}
        <div className="grid grid-cols-5 gap-2">
          {sportConfig.map(({ key, label, Icon, color, window }) => (
            <div key={key} className={`rounded p-2 border transition-colors ${getCardBorderClass(key, counts[key].lastSync)}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1">
                  <Icon className={`w-3 h-3 text-${color}`} />
                  <span className="font-mono text-[10px] font-medium">{label}</span>
                </div>
                {getStatusDisplay(key, counts[key].lastSync)}
              </div>
              <div className="flex items-center justify-between mb-1">
                <Badge variant="outline" className={`border-${color}/50 text-${color} text-[8px] px-1 py-0`}>
                  {key === "ncaab" || key === "ncaaf" ? counts[key].ranked ?? "—" : counts[key].games ?? "—"}
                </Badge>
                {isOffSeason(key) && (
                  <Badge variant="outline" className="border-terminal-amber/50 text-terminal-amber text-[7px] px-0.5 py-0">
                    OFF
                  </Badge>
                )}
              </div>
              <div className="text-[8px] text-muted-foreground font-mono flex items-center gap-1 mb-1">
                <Clock className="w-2 h-2" />
                <span className="truncate">{counts[key].lastSync || "Never"}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className={`w-full font-mono text-[9px] h-5 border-${color}/50 hover:bg-${color}/10`}
                onClick={() => handleIndividualSync(key)}
                disabled={syncStatus[key] === "syncing" || isAllSyncing}
              >
                {syncStatus[key] === "syncing" ? <Loader2 className="w-2 h-2 animate-spin" /> : window}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
