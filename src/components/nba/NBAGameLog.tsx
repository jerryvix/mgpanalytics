import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, TrendingUp, TrendingDown, Minus, Filter } from "lucide-react";
import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";

interface NBAGameLogEntry {
  id?: string;
  game_date: string;
  opponent_abbr: string;
  opponent_name?: string;
  home_away: string;
  result: string;
  team_score?: number;
  opponent_score?: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fg_made: number;
  fg_attempted: number;
  three_made: number;
  three_attempted: number;
}

interface NBAGameLogProps {
  gameLogs: NBAGameLogEntry[];
  playerName: string;
  seasonAverages?: {
    points: number;
    rebounds: number;
    assists: number;
    minutes: number;
  };
  isLoading?: boolean;
}

type FilterOption = "all" | "home" | "away" | "last5" | "last10";

function getPerformanceIndicator(value: number, average: number) {
  if (average === 0) return { icon: Minus, color: "text-muted-foreground" };
  const ratio = value / average;
  if (ratio >= 1.15) return { icon: TrendingUp, color: "text-terminal-green" };
  if (ratio <= 0.85) return { icon: TrendingDown, color: "text-destructive" };
  return { icon: Minus, color: "text-muted-foreground" };
}

function formatOpponent(abbr: string, isHome: boolean) {
  return isHome ? `vs ${abbr}` : `@ ${abbr}`;
}

function formatDate(dateStr: string) {
  try {
    return format(parseISO(dateStr), "MMM d");
  } catch {
    return dateStr;
  }
}

function calcFGPct(made: number, attempted: number) {
  if (attempted === 0) return "—";
  return `${Math.round((made / attempted) * 100)}%`;
}

function calc3Pct(made: number, attempted: number) {
  if (attempted === 0) return "—";
  return `${Math.round((made / attempted) * 100)}%`;
}

export function NBAGameLog({ gameLogs, playerName, seasonAverages, isLoading }: NBAGameLogProps) {
  const [filter, setFilter] = useState<FilterOption>("last10");

  const filteredLogs = useMemo(() => {
    let logs = [...gameLogs].sort(
      (a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime()
    );

    switch (filter) {
      case "home":
        logs = logs.filter((l) => l.home_away === "home");
        break;
      case "away":
        logs = logs.filter((l) => l.home_away === "away");
        break;
      case "last5":
        logs = logs.slice(0, 5);
        break;
      case "last10":
        logs = logs.slice(0, 10);
        break;
    }

    return logs;
  }, [gameLogs, filter]);

  const averages = useMemo(() => {
    if (filteredLogs.length === 0) return null;
    const totals = filteredLogs.reduce(
      (acc, log) => ({
        points: acc.points + log.points,
        rebounds: acc.rebounds + log.rebounds,
        assists: acc.assists + log.assists,
        fgMade: acc.fgMade + log.fg_made,
        fgAttempted: acc.fgAttempted + log.fg_attempted,
        threeMade: acc.threeMade + log.three_made,
        threeAttempted: acc.threeAttempted + log.three_attempted,
      }),
      { points: 0, rebounds: 0, assists: 0, fgMade: 0, fgAttempted: 0, threeMade: 0, threeAttempted: 0 }
    );
    const count = filteredLogs.length;
    return {
      points: (totals.points / count).toFixed(1),
      rebounds: (totals.rebounds / count).toFixed(1),
      assists: (totals.assists / count).toFixed(1),
      fgPct: calcFGPct(totals.fgMade, totals.fgAttempted),
      threePct: calc3Pct(totals.threeMade, totals.threeAttempted),
    };
  }, [filteredLogs]);

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Game Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 bg-muted/30 animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!gameLogs || gameLogs.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Game Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No game log data available for the {new Date().getMonth() >= 9 ? new Date().getFullYear() : new Date().getFullYear() - 1}-{new Date().getMonth() >= 9 ? String(new Date().getFullYear() + 1).slice(2) : String(new Date().getFullYear()).slice(2)} season. Game log data will appear here once it becomes available.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Game Log - {playerName}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={filter} onValueChange={(v) => setFilter(v as FilterOption)}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last5">Last 5 Games</SelectItem>
                <SelectItem value="last10">Last 10 Games</SelectItem>
                <SelectItem value="home">Home Only</SelectItem>
                <SelectItem value="away">Away Only</SelectItem>
                <SelectItem value="all">All Games</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead className="text-muted-foreground">Date</TableHead>
              <TableHead className="text-muted-foreground">Opp</TableHead>
              <TableHead className="text-muted-foreground text-right">MIN</TableHead>
              <TableHead className="text-muted-foreground text-right">PTS</TableHead>
              <TableHead className="text-muted-foreground text-right">REB</TableHead>
              <TableHead className="text-muted-foreground text-right">AST</TableHead>
              <TableHead className="text-muted-foreground text-right">STL</TableHead>
              <TableHead className="text-muted-foreground text-right">BLK</TableHead>
              <TableHead className="text-muted-foreground text-right">FG%</TableHead>
              <TableHead className="text-muted-foreground text-right">3P%</TableHead>
              <TableHead className="text-muted-foreground text-right">+/-</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.map((log, idx) => {
              const ptsIndicator = seasonAverages
                ? getPerformanceIndicator(log.points, seasonAverages.points)
                : null;
              const plusMinus =
                log.team_score !== undefined && log.opponent_score !== undefined
                  ? log.team_score - log.opponent_score
                  : null;

              return (
                <TableRow key={idx} className="border-border/30 hover:bg-muted/20">
                  <TableCell className="font-mono text-sm">{formatDate(log.game_date)}</TableCell>
                  <TableCell className="text-sm">
                    <span
                      className={
                        log.result === "W" ? "text-terminal-green" : log.result === "L" ? "text-destructive" : ""
                      }
                    >
                      {formatOpponent(log.opponent_abbr, log.home_away === "home")}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{log.minutes}</TableCell>
                  <TableCell className={`text-right font-mono text-sm font-medium ${ptsIndicator?.color || ""}`}>
                    {log.points}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{log.rebounds}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{log.assists}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{log.steals}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{log.blocks}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {calcFGPct(log.fg_made, log.fg_attempted)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {calc3Pct(log.three_made, log.three_attempted)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono text-sm ${
                      plusMinus !== null
                        ? plusMinus > 0
                          ? "text-terminal-green"
                          : plusMinus < 0
                          ? "text-destructive"
                          : ""
                        : ""
                    }`}
                  >
                    {plusMinus !== null ? (plusMinus > 0 ? `+${plusMinus}` : plusMinus) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Averages Footer */}
        {averages && (
          <div className="mt-4 pt-3 border-t border-border">
            <p className="text-sm font-mono text-muted-foreground">
              <span className="text-foreground font-medium">AVERAGES ({filter === "all" ? "Season" : filter}):</span>{" "}
              {averages.points} PTS | {averages.rebounds} REB | {averages.assists} AST | {averages.fgPct} FG% |{" "}
              {averages.threePct} 3P%
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-3 pt-2 border-t border-border/50">
          Green highlighting indicates above-average performance vs season average.
        </p>
      </CardContent>
    </Card>
  );
}
