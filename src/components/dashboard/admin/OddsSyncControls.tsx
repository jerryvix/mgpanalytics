import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Settings, RefreshCw, Loader2, Trash2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface OddsSyncControlsProps {
  onSyncComplete?: () => void;
}

const ODDS_SPORTS_KEY = "mgp_odds_enabled_sports";
const ALL_ODDS_SPORTS = ["NFL", "NBA", "NCAAB"] as const;

function loadEnabledSports(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(ODDS_SPORTS_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { NFL: true, NBA: true, NCAAB: true };
}

function saveEnabledSports(sports: Record<string, boolean>) {
  localStorage.setItem(ODDS_SPORTS_KEY, JSON.stringify(sports));
}

export function OddsSyncControls({ onSyncComplete }: OddsSyncControlsProps) {
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [nextSyncIn, setNextSyncIn] = useState<string>("15:00");
  const [failedSyncsToday, setFailedSyncsToday] = useState(0);
  const [snapshotCount, setSnapshotCount] = useState<number | null>(null);
  const [enabledSports, setEnabledSports] = useState<Record<string, boolean>>(loadEnabledSports);

  const fetchStats = async () => {
    // Get last sync time
    const { data: syncData } = await supabase
      .from("sync_schedule")
      .select("last_sync_at, last_sync_status")
      .eq("data_type", "odds_snapshot")
      .single();

    if (syncData?.last_sync_at) {
      try {
        setLastSyncTime(formatDistanceToNow(new Date(syncData.last_sync_at), { addSuffix: true }));
      } catch {
        setLastSyncTime(null);
      }
    }

    // Get snapshot count
    const { count } = await supabase
      .from("odds_snapshots")
      .select("*", { count: "exact", head: true });
    if (count !== null) setSnapshotCount(count);

    // Count failed syncs today (from sync_log if exists)
    const today = new Date().toISOString().split("T")[0];
    const { count: failedCount } = await supabase
      .from("sync_log")
      .select("*", { count: "exact", head: true })
      .eq("sync_type", "odds")
      .eq("status", "failed")
      .gte("started_at", today);
    
    setFailedSyncsToday(failedCount || 0);
  };

  useEffect(() => {
    fetchStats();

    // Update countdown every second
    const countdownInterval = setInterval(() => {
      const now = new Date();
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      const nextSync = 15 - (minutes % 15);
      const remainingSeconds = 60 - seconds;
      
      if (nextSync === 15 && remainingSeconds === 60) {
        setNextSyncIn("Now");
      } else {
        setNextSyncIn(`${nextSync - 1}:${remainingSeconds.toString().padStart(2, "0")}`);
      }
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, []);

  const toggleSport = (sport: string, enabled: boolean) => {
    const updated = { ...enabledSports, [sport]: enabled };
    setEnabledSports(updated);
    saveEnabledSports(updated);
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    const excludeSports = ALL_ODDS_SPORTS.filter(s => !enabledSports[s]);
    try {
      const { data, error } = await supabase.functions.invoke("sync-odds-snapshot", {
        body: excludeSports.length > 0 ? { excludeSports } : undefined,
      });

      if (error) {
        toast({ title: "Sync Error", description: error.message, variant: "destructive" });
      } else if (data?.success) {
        toast({ 
          title: "Odds Synced", 
          description: `${data.snapshotsCreated || 0} snapshots captured` 
        });
        onSyncComplete?.();
      }

      // Update sync schedule
      await supabase.from("sync_schedule").upsert({
        sport: "ALL",
        data_type: "odds_snapshot",
        last_sync_at: new Date().toISOString(),
        last_sync_status: data?.success ? "success" : "failed"
      }, { onConflict: "sport,data_type" });

      await fetchStats();
    } catch (error) {
      toast({ 
        title: "Sync Error", 
        description: error instanceof Error ? error.message : "Failed to sync", 
        variant: "destructive" 
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearHistory = async () => {
    setIsClearing(true);
    try {
      const { error } = await supabase
        .from("odds_history")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Cleared", description: "Odds history cleared successfully" });
        onSyncComplete?.();
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : "Failed to clear", 
        variant: "destructive" 
      });
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
    }
  };

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" />
            Odds Sync Management
          </CardTitle>
          <Badge 
            variant="outline" 
            className={autoSyncEnabled 
              ? "border-terminal-green text-terminal-green text-[10px]" 
              : "border-muted-foreground text-muted-foreground text-[10px]"}
          >
            {autoSyncEnabled ? "AUTO-SYNC ON" : "AUTO-SYNC OFF"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">Auto-sync enabled</span>
            <Switch
              checked={autoSyncEnabled}
              onCheckedChange={setAutoSyncEnabled}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground">Sports</span>
            <div className="flex items-center gap-3">
              {ALL_ODDS_SPORTS.map(sport => (
                <label key={sport} className="flex items-center gap-1 cursor-pointer">
                  <Switch
                    checked={enabledSports[sport] ?? true}
                    onCheckedChange={(checked) => toggleSport(sport, checked)}
                    className="scale-75"
                  />
                  <span className={`font-mono text-[10px] ${enabledSports[sport] ? "text-foreground" : "text-muted-foreground line-through"}`}>
                    {sport}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Interval</span>
              <span className="text-foreground">Every 15 min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Next sync</span>
              <span className="text-terminal-green flex items-center gap-1">
                <Clock className="w-2 h-2" />
                {nextSyncIn}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last sync</span>
              <span className="text-foreground">{lastSyncTime || "Never"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Failed today</span>
              <span className={failedSyncsToday > 0 ? "text-terminal-red" : "text-terminal-green"}>
                {failedSyncsToday}
              </span>
            </div>
            <div className="flex justify-between col-span-2">
              <span className="text-muted-foreground">Snapshots in vault</span>
              <span className="text-foreground">{snapshotCount?.toLocaleString() ?? "—"}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="justify-start font-mono text-xs border-terminal-green/50 hover:bg-terminal-green/10"
              onClick={handleSyncAll}
              disabled={isSyncing}
            >
              {isSyncing ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-2" />}
              Sync All Odds
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="justify-start font-mono text-xs border-terminal-red/50 hover:bg-terminal-red/10 text-terminal-red"
              onClick={() => setShowClearConfirm(true)}
              disabled={isClearing}
            >
              {isClearing ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Trash2 className="w-3 h-3 mr-2" />}
              Clear History
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Odds History?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all line movement history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleClearHistory}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear History
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
