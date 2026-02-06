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
  Dribbble,
  Trophy
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

type SyncState = "idle" | "syncing" | "done" | "error";

interface PropCounts {
  nba: { count: number | null; lastSync: string | null };
  nfl: { count: number | null; lastSync: string | null };
}

export function PropsSyncCard() {
  const [syncStatus, setSyncStatus] = useState<{ nba: SyncState; nfl: SyncState }>({
    nba: "idle",
    nfl: "idle",
  });

  const [counts, setCounts] = useState<PropCounts>({
    nba: { count: null, lastSync: null },
    nfl: { count: null, lastSync: null },
  });

  const fetchCounts = async () => {
    const today = new Date().toISOString().split('T')[0];

    const [nbaProps, nflProps, nbaSync, nflSync] = await Promise.all([
      supabase
        .from("player_props")
        .select("*", { count: "exact", head: true })
        .eq("sport", "NBA")
        .eq("is_active", true)
        .gte("game_date", today),
      supabase
        .from("player_props")
        .select("*", { count: "exact", head: true })
        .eq("sport", "NFL")
        .eq("is_active", true)
        .gte("game_date", today),
      supabase
        .from("sync_schedule")
        .select("last_sync_at")
        .eq("sport", "NBA")
        .eq("data_type", "props")
        .single(),
      supabase
        .from("sync_schedule")
        .select("last_sync_at")
        .eq("sport", "NFL")
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
      nfl: { count: nflProps.count, lastSync: formatTime(nflSync.data?.last_sync_at) },
    });
  };

  useEffect(() => {
    fetchCounts();
  }, []);

  const syncProps = async (sport: "NBA" | "NFL") => {
    const key = sport.toLowerCase() as "nba" | "nfl";
    setSyncStatus(prev => ({ ...prev, [key]: "syncing" }));
    try {
      const { data, error } = await supabase.functions.invoke("sync-player-props", {
        body: { sport },
      });
      if (error) throw error;
      setSyncStatus(prev => ({ ...prev, [key]: "done" }));
      await fetchCounts();
      toast({
        title: `${sport} Props Synced`,
        description: `${data?.propsAdded || 0} props from ${data?.eventsProcessed || 0} games`
      });
    } catch (error) {
      console.error(`${sport} props sync error:`, error);
      setSyncStatus(prev => ({ ...prev, [key]: "error" }));
      toast({ title: "Sync Failed", description: `Failed to sync ${sport} props`, variant: "destructive" });
    } finally {
      setTimeout(() => setSyncStatus(prev => ({ ...prev, [key]: "idle" })), 3000);
    }
  };

  const getStatusIcon = (status: SyncState) => {
    if (status === "syncing") return <Loader2 className="w-3 h-3 animate-spin text-blue-500" />;
    if (status === "done") return <CheckCircle className="w-3 h-3 text-terminal-green" />;
    if (status === "error") return <XCircle className="w-3 h-3 text-destructive" />;
    return null;
  };

  const SportSection = ({ sport, icon, color, statusKey }: {
    sport: "NBA" | "NFL";
    icon: React.ReactNode;
    color: string;
    statusKey: "nba" | "nfl";
  }) => (
    <div className={`rounded p-2 border border-${color}/30 bg-${color}/5`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="font-mono text-[10px] font-medium">{sport} Props</span>
        </div>
        {getStatusIcon(syncStatus[statusKey])}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="bg-muted/30 rounded p-1.5">
          <div className="text-[8px] text-muted-foreground mb-0.5">Active Props</div>
          <Badge variant="outline" className={`border-${color}/50 text-${color} text-[9px] px-1`}>
            {counts[statusKey].count ?? "—"}
          </Badge>
        </div>
        <div className="bg-muted/30 rounded p-1.5">
          <div className="text-[8px] text-muted-foreground mb-0.5 flex items-center gap-1">
            <Clock className="w-2 h-2" />
            Last Sync
          </div>
          <div className="text-[8px] text-muted-foreground font-mono">
            {counts[statusKey].lastSync || "Never"}
          </div>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full font-mono text-[9px] h-6 border-orange-500/50 hover:bg-orange-500/10 text-orange-400"
        onClick={() => syncProps(sport)}
        disabled={syncStatus[statusKey] === "syncing"}
      >
        {syncStatus[statusKey] === "syncing" ? (
          <Loader2 className="w-2 h-2 animate-spin" />
        ) : (
          <><RefreshCw className="w-2 h-2 mr-1" />Sync {sport} Props</>
        )}
      </Button>
    </div>
  );

  return (
    <Card className="bg-card border-orange-500/30">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs font-mono text-foreground flex items-center gap-2">
          <BarChart3 className="w-3 h-3 text-orange-500" />
          Player Props Sync
          <Badge variant="outline" className="text-[8px] border-terminal-green/50 text-terminal-green ml-auto">
            The Odds API
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="py-2 px-3 space-y-2">
        <SportSection
          sport="NBA"
          icon={<Dribbble className="w-3 h-3 text-terminal-cyan" />}
          color="terminal-cyan"
          statusKey="nba"
        />
        <SportSection
          sport="NFL"
          icon={<Trophy className="w-3 h-3 text-terminal-green" />}
          color="terminal-green"
          statusKey="nfl"
        />
      </CardContent>
    </Card>
  );
}
