import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Loader2, 
  BarChart3, 
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Dribbble
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

type SyncState = "idle" | "syncing" | "done" | "error";

interface PropCounts {
  nba: { count: number | null; lastSync: string | null };
}

export function PropsSyncCard() {
  const [syncStatus, setSyncStatus] = useState<{ nba: SyncState }>({
    nba: "idle",
  });

  const [counts, setCounts] = useState<PropCounts>({
    nba: { count: null, lastSync: null },
  });

  const fetchCounts = async () => {
    const today = new Date().toISOString().split('T')[0];
    
    const [nbaProps, nbaSync] = await Promise.all([
      supabase
        .from("player_props")
        .select("*", { count: "exact", head: true })
        .eq("sport", "NBA")
        .eq("is_active", true)
        .gte("game_date", today),
      supabase
        .from("sync_schedule")
        .select("last_sync_at")
        .eq("sport", "NBA")
        .eq("data_type", "props")
        .single(),
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
      nba: { count: nbaProps.count, lastSync: formatTime(nbaSync.data?.last_sync_at) },
    });
  };

  useEffect(() => {
    fetchCounts();
  }, []);

  const syncNBAProps = async () => {
    setSyncStatus(prev => ({ ...prev, nba: "syncing" }));
    try {
      const { data, error } = await supabase.functions.invoke("sync-nba-props");
      if (error) throw error;
      setSyncStatus(prev => ({ ...prev, nba: "done" }));
      await fetchCounts();
      toast({ 
        title: "NBA Props Synced", 
        description: `${data?.propsAdded || 0} props added for ${data?.playersProcessed || 0} players` 
      });
    } catch (error) {
      console.error("NBA props sync error:", error);
      setSyncStatus(prev => ({ ...prev, nba: "error" }));
      toast({ title: "Sync Failed", description: "Failed to sync NBA props", variant: "destructive" });
    } finally {
      setTimeout(() => setSyncStatus(prev => ({ ...prev, nba: "idle" })), 3000);
    }
  };

  const getStatusIcon = (status: SyncState) => {
    if (status === "syncing") return <Loader2 className="w-3 h-3 animate-spin text-blue-500" />;
    if (status === "done") return <CheckCircle className="w-3 h-3 text-terminal-green" />;
    if (status === "error") return <XCircle className="w-3 h-3 text-destructive" />;
    return null;
  };

  return (
    <Card className="bg-card border-orange-500/30">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs font-mono text-foreground flex items-center gap-2">
          <BarChart3 className="w-3 h-3 text-orange-500" />
          Player Props Sync
        </CardTitle>
      </CardHeader>
      <CardContent className="py-2 px-3">
        {/* NBA Props */}
        <div className="rounded p-2 border border-terminal-cyan/30 bg-terminal-cyan/5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Dribbble className="w-3 h-3 text-terminal-cyan" />
              <span className="font-mono text-[10px] font-medium">NBA Props</span>
            </div>
            {getStatusIcon(syncStatus.nba)}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="bg-muted/30 rounded p-1.5">
              <div className="text-[8px] text-muted-foreground mb-0.5">Active Props</div>
              <Badge variant="outline" className="border-terminal-cyan/50 text-terminal-cyan text-[9px] px-1">
                {counts.nba.count ?? "—"}
              </Badge>
            </div>
            <div className="bg-muted/30 rounded p-1.5">
              <div className="text-[8px] text-muted-foreground mb-0.5 flex items-center gap-1">
                <Clock className="w-2 h-2" />
                Last Sync
              </div>
              <div className="text-[8px] text-muted-foreground font-mono">
                {counts.nba.lastSync || "Never"}
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full font-mono text-[9px] h-6 border-orange-500/50 hover:bg-orange-500/10 text-orange-400"
            onClick={syncNBAProps}
            disabled={syncStatus.nba === "syncing"}
          >
            {syncStatus.nba === "syncing" ? (
              <Loader2 className="w-2 h-2 animate-spin" />
            ) : (
              <><RefreshCw className="w-2 h-2 mr-1" />Sync NBA Props</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
