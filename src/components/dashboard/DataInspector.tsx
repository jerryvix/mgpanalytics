import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Loader2, Database, Activity, Clock, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SyncStatus {
  sport: string;
  data_type: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
  records_synced: number | null;
  cron_interval: string | null;
  is_enabled: boolean;
}

interface DataCoverage {
  sport: string;
  players: number;
  games: number;
  odds: number;
  props: number;
  provider: string;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 48) return `${Math.floor(hours / 24)}d ago`;
  if (hours > 0) return `${hours}h ${minutes}m ago`;
  return `${minutes}m ago`;
}

function freshnessColor(dateStr: string | null, intervalHours: number): string {
  if (!dateStr) return "text-destructive";
  const hours = (Date.now() - new Date(dateStr).getTime()) / 3600000;
  if (hours <= intervalHours * 1.5) return "text-terminal-green";
  if (hours <= intervalHours * 3) return "text-terminal-amber";
  return "text-destructive";
}

function intervalToHours(interval: string | null): number {
  if (!interval) return 24;
  const match = interval.match(/(\d+)h/);
  return match ? parseInt(match[1]) : 24;
}

export function DataInspector() {
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[] | null>(null);
  const [coverage, setCoverage] = useState<DataCoverage[] | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const runDiagnostics = async () => {
    setIsLoading(true);
    setHasRun(true);

    try {
      // 1. Sync schedule health
      const { data: schedules } = await supabase
        .from("sync_schedule")
        .select("sport, data_type, last_sync_at, last_sync_status, records_synced, cron_interval, is_enabled")
        .order("sport")
        .order("data_type");

      setSyncStatuses(schedules || []);

      // 2. Data coverage counts per sport
      const sports = ["NFL", "NBA", "NCAAB"];
      const coverageData: DataCoverage[] = [];

      for (const sport of sports) {
        const [playersRes, propsRes] = await Promise.all([
          supabase.from("players").select("id", { count: "exact", head: true }).eq("sport", sport),
          supabase.from("player_props").select("id", { count: "exact", head: true }).eq("sport", sport).eq("is_active", true),
        ]);

        // Sport-specific game/odds tables
        let gamesCount = 0;
        let oddsCount = 0;
        let provider = "BDL";

        if (sport === "NFL") {
          const { count: gc } = await supabase.from("games").select("id", { count: "exact", head: true }).eq("league", "NFL");
          const { count: oc } = await supabase.from("odds").select("id", { count: "exact", head: true });
          gamesCount = gc || 0;
          oddsCount = oc || 0;
          provider = "BDL + Odds API";
        } else if (sport === "NBA") {
          const { count: gc } = await supabase.from("nba_games").select("id", { count: "exact", head: true });
          const { count: oc } = await supabase.from("nba_odds").select("id", { count: "exact", head: true });
          gamesCount = gc || 0;
          oddsCount = oc || 0;
          provider = "ESPN + Odds API";
        } else if (sport === "NCAAB") {
          const { count: gc } = await supabase.from("ncaab_games").select("id", { count: "exact", head: true });
          gamesCount = gc || 0;
          provider = "ESPN + Odds API";
        }

        coverageData.push({
          sport,
          players: playersRes.count || 0,
          games: gamesCount,
          odds: oddsCount,
          props: propsRes.count || 0,
          provider,
        });
      }

      setCoverage(coverageData);
    } catch (error) {
      console.error("Diagnostics error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const failingSyncs = syncStatuses?.filter(s => s.last_sync_status === "error" || s.last_sync_status === "fail") || [];
  const staleSyncs = syncStatuses?.filter(s => {
    if (!s.last_sync_at || !s.is_enabled) return false;
    const hours = (Date.now() - new Date(s.last_sync_at).getTime()) / 3600000;
    return hours > intervalToHours(s.cron_interval) * 3;
  }) || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="md:col-span-2"
    >
      <Card className="bg-card border-terminal-amber/30">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
            <Activity className="w-4 h-4 text-terminal-amber" />
            Data Health Monitor
          </CardTitle>
          <Badge variant="outline" className="border-terminal-amber text-terminal-amber text-[10px]">
            DIAGNOSTICS
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center font-mono text-xs border-terminal-amber/50 hover:bg-terminal-amber/10"
            onClick={runDiagnostics}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                Checking Health...
              </>
            ) : (
              <>
                <Database className="w-3 h-3 mr-2" />
                Run Health Check
              </>
            )}
          </Button>

          {hasRun && !isLoading && (
            <div className="space-y-5">
              {/* Alerts */}
              {(failingSyncs.length > 0 || staleSyncs.length > 0) && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-2 font-mono text-xs font-semibold text-destructive">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Issues Detected
                  </div>
                  {failingSyncs.map(s => (
                    <div key={`${s.sport}-${s.data_type}`} className="font-mono text-[10px] text-destructive">
                      {s.sport}:{s.data_type} — last sync failed
                    </div>
                  ))}
                  {staleSyncs.map(s => (
                    <div key={`${s.sport}-${s.data_type}`} className="font-mono text-[10px] text-terminal-amber">
                      {s.sport}:{s.data_type} — stale ({timeAgo(s.last_sync_at)})
                    </div>
                  ))}
                </div>
              )}

              {/* Data Coverage */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Database className="w-3 h-3 text-terminal-cyan" />
                  <span className="font-mono text-xs text-muted-foreground">Data Coverage</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {coverage?.map(c => (
                    <div key={c.sport} className="bg-muted/30 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-foreground">{c.sport}</span>
                        <Badge variant="outline" className="text-[8px] px-1">{c.provider}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px]">
                        <span className="text-muted-foreground">Players</span>
                        <span className={c.players > 0 ? "text-terminal-green" : "text-destructive"}>{c.players}</span>
                        <span className="text-muted-foreground">Games</span>
                        <span className={c.games > 0 ? "text-terminal-green" : "text-muted-foreground"}>{c.games}</span>
                        <span className="text-muted-foreground">Odds</span>
                        <span className={c.odds > 0 ? "text-terminal-green" : "text-muted-foreground"}>{c.odds}</span>
                        <span className="text-muted-foreground">Props</span>
                        <span className={c.props > 0 ? "text-terminal-green" : "text-muted-foreground"}>{c.props}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sync Schedule */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3 text-terminal-green" />
                  <span className="font-mono text-xs text-muted-foreground">Sync Schedule</span>
                </div>
                <div className="space-y-1 max-h-64 overflow-auto">
                  {syncStatuses?.map(s => {
                    const intervalH = intervalToHours(s.cron_interval);
                    return (
                      <div
                        key={`${s.sport}-${s.data_type}`}
                        className="flex items-center justify-between bg-muted/20 rounded px-2 py-1.5 font-mono text-[10px]"
                      >
                        <div className="flex items-center gap-2">
                          {!s.is_enabled && <Badge variant="outline" className="text-[8px] px-1 text-muted-foreground">OFF</Badge>}
                          <span className="text-foreground">{s.sport}:{s.data_type}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground">{s.cron_interval || "—"}</span>
                          {s.records_synced !== null && (
                            <span className="text-muted-foreground">{s.records_synced} rec</span>
                          )}
                          <span className={
                            s.last_sync_status === "error" || s.last_sync_status === "fail"
                              ? "text-destructive"
                              : freshnessColor(s.last_sync_at, intervalH)
                          }>
                            {timeAgo(s.last_sync_at)}
                          </span>
                          {s.last_sync_status === "success" && <span className="text-terminal-green">OK</span>}
                          {(s.last_sync_status === "error" || s.last_sync_status === "fail") && <span className="text-destructive">FAIL</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
