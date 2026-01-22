import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Flame, Volume2, VolumeX, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface SteamMove {
  id: string;
  game_id: string;
  sport: string;
  team: string | null;
  current_line: number | null;
  previous_line: number | null;
  odds_type: string;
  timestamp: string | null;
}

export function SteamMoveAlerts() {
  const [steamMoves, setSteamMoves] = useState<SteamMove[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchSteamMoves = async () => {
    try {
      // Get movements from the last hour with significant movement (>=1.5 points)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from("odds_history")
        .select("*")
        .gte("timestamp", oneHourAgo)
        .eq("line_movement", "steam")
        .order("timestamp", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Error fetching steam moves:", error);
        return;
      }

      // Also check for any moves >= 1.5 points
      const { data: bigMoves } = await supabase
        .from("odds_history")
        .select("*")
        .gte("timestamp", oneHourAgo)
        .order("timestamp", { ascending: false })
        .limit(50);

      const filteredBigMoves = (bigMoves || []).filter(m => {
        if (!m.current_line || !m.previous_line) return false;
        return Math.abs(m.current_line - m.previous_line) >= 1.5;
      });

      // Combine and dedupe
      const combined = [...(data || []), ...filteredBigMoves];
      const uniqueIds = new Set<string>();
      const unique = combined.filter(m => {
        if (uniqueIds.has(m.id)) return false;
        uniqueIds.add(m.id);
        return true;
      });

      setSteamMoves(unique);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchSteamMoves();
    setIsRefreshing(false);
  };

  const handleClearAlerts = () => {
    setSteamMoves([]);
  };

  useEffect(() => {
    fetchSteamMoves();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchSteamMoves, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatMovement = (move: SteamMove) => {
    if (!move.current_line || !move.previous_line) return "";
    return `${move.previous_line} → ${move.current_line}`;
  };

  const formatDiff = (move: SteamMove) => {
    if (!move.current_line || !move.previous_line) return "";
    const diff = Math.abs(move.current_line - move.previous_line);
    return `${diff.toFixed(1)}pt move`;
  };

  return (
    <Card className="bg-card border-orange-500/30">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
          <Flame className="w-4 h-4 text-orange-500" />
          Steam Move Alerts
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {soundEnabled ? (
              <Volume2 className="w-3 h-3 text-muted-foreground" />
            ) : (
              <VolumeX className="w-3 h-3 text-muted-foreground" />
            )}
            <Switch
              checked={soundEnabled}
              onCheckedChange={setSoundEnabled}
              className="scale-75"
            />
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 px-2"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 px-2 text-muted-foreground hover:text-destructive"
            onClick={handleClearAlerts}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
          </div>
        ) : steamMoves.length === 0 ? (
          <div className="text-center py-4 font-mono text-xs text-muted-foreground">
            No steam moves detected in the last hour.
            <br />
            <span className="text-[10px]">Auto-refreshes every 30 seconds</span>
          </div>
        ) : (
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {steamMoves.map((move) => (
                <div 
                  key={move.id}
                  className="flex items-start gap-2 p-2 rounded bg-orange-500/10 border border-orange-500/20"
                >
                  <Flame className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[8px] px-1">
                        {move.sport}
                      </Badge>
                      <span className="font-mono text-xs font-semibold truncate">
                        {move.team || move.game_id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                      <span className="capitalize">{move.odds_type}</span>
                      <span className="mx-1">•</span>
                      <span className="text-orange-400">{formatMovement(move)}</span>
                      <span className="mx-1">•</span>
                      <span>{formatDiff(move)}</span>
                    </div>
                    <div className="font-mono text-[9px] text-muted-foreground/60 mt-0.5">
                      {move.timestamp ? formatDistanceToNow(new Date(move.timestamp), { addSuffix: true }) : "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
