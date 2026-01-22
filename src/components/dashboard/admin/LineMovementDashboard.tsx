import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendingUp, TrendingDown, RefreshCw, Loader2, Flame, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface LineMovement {
  id: string;
  game_id: string;
  sport: string;
  bookmaker: string;
  odds_type: string;
  team: string | null;
  current_line: number | null;
  previous_line: number | null;
  opening_line: number | null;
  line_movement: string | null;
  timestamp: string | null;
}

export function LineMovementDashboard() {
  const [movements, setMovements] = useState<LineMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [lineTypeFilter, setLineTypeFilter] = useState<string>("all");

  const fetchMovements = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("odds_history")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(50);

      if (sportFilter !== "all") {
        query = query.eq("sport", sportFilter);
      }
      if (lineTypeFilter !== "all") {
        query = query.eq("odds_type", lineTypeFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching movements:", error);
        return;
      }

      // Filter to only show significant movements
      const significantMovements = (data || []).filter(m => {
        if (!m.current_line || !m.previous_line) return false;
        const diff = Math.abs(m.current_line - m.previous_line);
        if (m.odds_type === "moneyline") return diff >= 10;
        return diff >= 0.5;
      });

      setMovements(significantMovements);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchMovements();
    setIsRefreshing(false);
  };

  useEffect(() => {
    fetchMovements();
  }, [sportFilter, lineTypeFilter]);

  const getMovementIcon = (movement: LineMovement) => {
    if (!movement.current_line || !movement.previous_line) return null;
    const diff = Math.abs(movement.current_line - movement.previous_line);
    const isSteam = diff >= 1.5;
    
    if (isSteam) {
      return <Flame className="w-4 h-4 text-orange-500" />;
    }
    if (movement.current_line > movement.previous_line) {
      return <TrendingUp className="w-4 h-4 text-terminal-green" />;
    }
    return <TrendingDown className="w-4 h-4 text-terminal-red" />;
  };

  const getMovementValue = (movement: LineMovement) => {
    if (!movement.current_line || !movement.previous_line) return "—";
    const diff = movement.current_line - movement.previous_line;
    const sign = diff > 0 ? "+" : "";
    return `${sign}${diff.toFixed(1)}`;
  };

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return "—";
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return "—";
    }
  };

  return (
    <Card className="bg-card border-terminal-cyan/30 md:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-terminal-cyan" />
          Line Movement Dashboard
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={sportFilter} onValueChange={setSportFilter}>
            <SelectTrigger className="w-[100px] h-7 text-xs font-mono">
              <SelectValue placeholder="Sport" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sports</SelectItem>
              <SelectItem value="NFL">NFL</SelectItem>
              <SelectItem value="NBA">NBA</SelectItem>
              <SelectItem value="NCAAB">NCAAB</SelectItem>
            </SelectContent>
          </Select>
          <Select value={lineTypeFilter} onValueChange={setLineTypeFilter}>
            <SelectTrigger className="w-[100px] h-7 text-xs font-mono">
              <SelectValue placeholder="Line Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Lines</SelectItem>
              <SelectItem value="spread">Spreads</SelectItem>
              <SelectItem value="total">Totals</SelectItem>
              <SelectItem value="moneyline">Moneyline</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 font-mono text-xs"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-terminal-cyan" />
          </div>
        ) : movements.length === 0 ? (
          <div className="text-center py-8 font-mono text-sm text-muted-foreground">
            No significant line movements detected yet.
            <br />
            <span className="text-xs">Run "Sync Odds Now" to capture odds snapshots.</span>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-mono text-[10px] h-8 sticky top-0 bg-muted/50">Sport</TableHead>
                  <TableHead className="font-mono text-[10px] h-8 sticky top-0 bg-muted/50">Game</TableHead>
                  <TableHead className="font-mono text-[10px] h-8 sticky top-0 bg-muted/50">Type</TableHead>
                  <TableHead className="font-mono text-[10px] h-8 sticky top-0 bg-muted/50">Open</TableHead>
                  <TableHead className="font-mono text-[10px] h-8 sticky top-0 bg-muted/50">Prev</TableHead>
                  <TableHead className="font-mono text-[10px] h-8 sticky top-0 bg-muted/50">Current</TableHead>
                  <TableHead className="font-mono text-[10px] h-8 sticky top-0 bg-muted/50">Move</TableHead>
                  <TableHead className="font-mono text-[10px] h-8 sticky top-0 bg-muted/50">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((movement) => (
                  <TableRow key={movement.id} className="font-mono text-[10px]">
                    <TableCell className="py-1">
                      <Badge variant="outline" className="text-[8px] px-1">
                        {movement.sport}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1 max-w-[120px] truncate">
                      {movement.team || movement.game_id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="py-1 capitalize">{movement.odds_type}</TableCell>
                    <TableCell className="py-1">{movement.opening_line ?? "—"}</TableCell>
                    <TableCell className="py-1">{movement.previous_line ?? "—"}</TableCell>
                    <TableCell className="py-1 font-semibold">{movement.current_line ?? "—"}</TableCell>
                    <TableCell className="py-1">
                      <div className="flex items-center gap-1">
                        {getMovementIcon(movement)}
                        <span className={
                          movement.current_line && movement.previous_line
                            ? movement.current_line > movement.previous_line 
                              ? "text-terminal-green" 
                              : "text-terminal-red"
                            : ""
                        }>
                          {getMovementValue(movement)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-1 text-muted-foreground">
                      {formatTimestamp(movement.timestamp)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
