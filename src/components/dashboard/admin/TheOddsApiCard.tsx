import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Zap, CheckCircle, XCircle, RefreshCw, Clock, Trash2 } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface TheOddsApiCardProps {
  onSyncComplete?: () => void;
}

export function TheOddsApiCard({ onSyncComplete }: TheOddsApiCardProps) {
  const [isTestingAPI, setIsTestingAPI] = useState(false);
  const [isSyncingOdds, setIsSyncingOdds] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [apiStatus, setApiStatus] = useState<{ 
    success: boolean; 
    message: string; 
    usage?: { requests_used: number; requests_remaining: number } 
  } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [nextSyncIn, setNextSyncIn] = useState<string>("--:--");
  const [snapshotCount, setSnapshotCount] = useState<number | null>(null);

  const fetchStats = async () => {
    const [syncData, snapshotResult] = await Promise.all([
      supabase.from("sync_schedule").select("last_sync_at").eq("data_type", "odds_snapshot").single(),
      supabase.from("odds_snapshots").select("*", { count: "exact", head: true }),
    ]);

    if (syncData.data?.last_sync_at) {
      try {
        setLastSyncTime(formatDistanceToNow(new Date(syncData.data.last_sync_at), { addSuffix: true }));
      } catch {
        setLastSyncTime(null);
      }
    }
    if (snapshotResult.count !== null) setSnapshotCount(snapshotResult.count);
  };

  useEffect(() => {
    fetchStats();

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

  const handleTestAPIConnection = async () => {
    setIsTestingAPI(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-odds-snapshot", {
        body: { testOnly: true }
      });

      if (error) {
        setApiStatus({ success: false, message: error.message });
        toast({ title: "API Error", description: error.message, variant: "destructive" });
      } else if (data?.success) {
        setApiStatus({ success: true, message: "Connected", usage: data.usage });
        toast({ title: "The Odds API Connected" });
      } else {
        setApiStatus({ success: false, message: data?.error || "Connection failed" });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Connection failed";
      setApiStatus({ success: false, message: msg });
    } finally {
      setIsTestingAPI(false);
    }
  };

  const handleSyncOddsNow = async () => {
    setIsSyncingOdds(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-odds-snapshot");

      if (error) {
        toast({ title: "Sync Error", description: error.message, variant: "destructive" });
      } else if (data?.success) {
        await supabase.from("sync_schedule").upsert({
          sport: "ALL",
          data_type: "odds_snapshot",
          last_sync_at: new Date().toISOString(),
          last_sync_status: "success"
        }, { onConflict: "sport,data_type" });
        
        await fetchStats();
        toast({ title: "Odds Synced", description: `${data.snapshotsCreated || 0} snapshots captured` });
        onSyncComplete?.();
      }
    } catch (error) {
      toast({ title: "Sync Error", description: error instanceof Error ? error.message : "Sync failed", variant: "destructive" });
    } finally {
      setIsSyncingOdds(false);
    }
  };

  const handleClearHistory = async () => {
    setIsClearing(true);
    try {
      const { error } = await supabase.from("odds_history").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Cleared", description: "Odds history cleared" });
        onSyncComplete?.();
      }
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to clear", variant: "destructive" });
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
    }
  };

  return (
    <>
      <Card className="bg-card border-terminal-amber/30">
        <CardHeader className="py-2 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-mono text-foreground flex items-center gap-2">
            <Zap className="w-3 h-3 text-terminal-amber" />
            The Odds API
          </CardTitle>
          <div className="flex items-center gap-2">
            {apiStatus && (
              <Badge 
                variant="outline" 
                className={`text-[9px] ${apiStatus.success ? "border-terminal-green text-terminal-green" : "border-destructive text-destructive"}`}
              >
                {apiStatus.success ? "✓" : "✗"}
              </Badge>
            )}
            <Badge 
              variant="outline" 
              className={`text-[9px] ${autoSyncEnabled ? "border-terminal-green text-terminal-green" : "border-muted-foreground text-muted-foreground"}`}
            >
              {autoSyncEnabled ? "AUTO" : "MANUAL"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="py-2 px-4 space-y-2">
          {/* Compact Stats Row */}
          <div className="flex items-center justify-between font-mono text-[9px] bg-muted/30 rounded px-2 py-1">
            <div className="flex items-center gap-3">
              <span>NFL, NBA, NCAAB</span>
              <span className="text-terminal-green">DraftKings</span>
              {apiStatus?.usage && (
                <span className={apiStatus.usage.requests_remaining < 1000 ? "text-destructive" : "text-muted-foreground"}>
                  {apiStatus.usage.requests_remaining.toLocaleString()} remaining
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <Clock className="w-2 h-2" />
                {lastSyncTime || "Never"}
              </span>
              <span className="text-terminal-green">Next: {nextSyncIn}</span>
            </div>
          </div>

          {/* Controls Row */}
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 font-mono text-[9px] h-6 border-terminal-amber/50 hover:bg-terminal-amber/10"
              onClick={handleTestAPIConnection}
              disabled={isTestingAPI || isSyncingOdds}
            >
              {isTestingAPI ? (
                <Loader2 className="w-2 h-2 animate-spin" />
              ) : apiStatus?.success ? (
                <CheckCircle className="w-2 h-2 mr-1 text-terminal-green" />
              ) : apiStatus ? (
                <XCircle className="w-2 h-2 mr-1 text-destructive" />
              ) : (
                <Zap className="w-2 h-2 mr-1" />
              )}
              Test
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 font-mono text-[9px] h-6 border-terminal-green/50 hover:bg-terminal-green/10"
              onClick={handleSyncOddsNow}
              disabled={isTestingAPI || isSyncingOdds}
            >
              {isSyncingOdds ? <Loader2 className="w-2 h-2 animate-spin" /> : <RefreshCw className="w-2 h-2 mr-1" />}
              Sync Now
            </Button>
            <div className="flex items-center gap-1">
              <span className="text-[8px] text-muted-foreground">Auto</span>
              <Switch checked={autoSyncEnabled} onCheckedChange={setAutoSyncEnabled} className="scale-75" />
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="font-mono text-[9px] h-6 border-destructive/50 hover:bg-destructive/10 text-destructive"
              onClick={() => setShowClearConfirm(true)}
              disabled={isClearing}
            >
              {isClearing ? <Loader2 className="w-2 h-2 animate-spin" /> : <Trash2 className="w-2 h-2" />}
            </Button>
          </div>

          {/* Snapshots count */}
          <div className="text-[8px] text-muted-foreground font-mono text-center">
            {snapshotCount?.toLocaleString() ?? "—"} snapshots in vault
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
            <AlertDialogAction onClick={handleClearHistory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Clear History
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
