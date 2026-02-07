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
import { Calendar, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { NFLGameLogEntry } from "@/services/balldontlie/nflPlayers";
import {
  formatNumber,
  formatGameDate,
  formatOpponent,
  getPositionGroup,
  calcFantasyPoints
} from "@/utils/nflStatsFormatters";

interface NFLGameLogProps {
  gameLogs: NFLGameLogEntry[];
  position: string;
  seasonAverages?: {
    pass_yards?: number;
    rush_yards?: number;
    rec_yards?: number;
    receptions?: number;
  };
  isLoading?: boolean;
}

function getPerformanceIndicator(value: number, average: number) {
  const ratio = value / average;
  if (ratio >= 1.15) return { icon: TrendingUp, color: "text-terminal-green", label: "Above Avg" };
  if (ratio <= 0.85) return { icon: TrendingDown, color: "text-destructive", label: "Below Avg" };
  return { icon: Minus, color: "text-muted-foreground", label: "Average" };
}

function QBGameLogTable({ logs, averages }: { logs: NFLGameLogEntry[]; averages?: any }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border/50">
          <TableHead className="text-muted-foreground">Date</TableHead>
          <TableHead className="text-muted-foreground">Opp</TableHead>
          <TableHead className="text-muted-foreground text-right">C/A</TableHead>
          <TableHead className="text-muted-foreground text-right">Pass Yds</TableHead>
          <TableHead className="text-muted-foreground text-right">TD</TableHead>
          <TableHead className="text-muted-foreground text-right">INT</TableHead>
          <TableHead className="text-muted-foreground text-right">Rush Yds</TableHead>
          <TableHead className="text-muted-foreground text-right">FPts</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log, idx) => {
          const fpts = calcFantasyPoints(log);
          const passYdsAvg = averages?.pass_yards || 250;
          const passIndicator = log.pass_yards ? getPerformanceIndicator(log.pass_yards, passYdsAvg) : null;
          
          return (
            <TableRow key={idx} className="border-border/30 hover:bg-muted/20">
              <TableCell className="font-mono text-sm">{formatGameDate(log.game_date || "")}</TableCell>
              <TableCell className="text-sm">{formatOpponent(log.opponent || "—", log.is_home || false)}</TableCell>
              <TableCell className="text-right font-mono text-sm">
                {log.pass_completions || 0}/{log.pass_attempts || 0}
              </TableCell>
              <TableCell className={`text-right font-mono text-sm ${passIndicator?.color || ""}`}>
                {formatNumber(log.pass_yards)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm text-terminal-green">
                {log.pass_td || 0}
              </TableCell>
              <TableCell className={`text-right font-mono text-sm ${(log.interceptions || 0) > 0 ? "text-destructive" : ""}`}>
                {log.interceptions || 0}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {formatNumber(log.rush_yards)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm font-medium">
                {fpts.toFixed(1)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function RBGameLogTable({ logs, averages }: { logs: NFLGameLogEntry[]; averages?: any }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border/50">
          <TableHead className="text-muted-foreground">Date</TableHead>
          <TableHead className="text-muted-foreground">Opp</TableHead>
          <TableHead className="text-muted-foreground text-right">Att</TableHead>
          <TableHead className="text-muted-foreground text-right">Rush Yds</TableHead>
          <TableHead className="text-muted-foreground text-right">Rush TD</TableHead>
          <TableHead className="text-muted-foreground text-right">Rec</TableHead>
          <TableHead className="text-muted-foreground text-right">Rec Yds</TableHead>
          <TableHead className="text-muted-foreground text-right">FPts</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log, idx) => {
          const fpts = calcFantasyPoints(log);
          const rushYdsAvg = averages?.rush_yards || 60;
          const rushIndicator = log.rush_yards ? getPerformanceIndicator(log.rush_yards, rushYdsAvg) : null;
          
          return (
            <TableRow key={idx} className="border-border/30 hover:bg-muted/20">
              <TableCell className="font-mono text-sm">{formatGameDate(log.game_date || "")}</TableCell>
              <TableCell className="text-sm">{formatOpponent(log.opponent || "—", log.is_home || false)}</TableCell>
              <TableCell className="text-right font-mono text-sm">
                {log.rush_attempts || 0}
              </TableCell>
              <TableCell className={`text-right font-mono text-sm ${rushIndicator?.color || ""}`}>
                {formatNumber(log.rush_yards)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm text-terminal-green">
                {log.rush_td || 0}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {log.receptions || 0}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {formatNumber(log.rec_yards)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm font-medium">
                {fpts.toFixed(1)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function WRTEGameLogTable({ logs, averages }: { logs: NFLGameLogEntry[]; averages?: any }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border/50">
          <TableHead className="text-muted-foreground">Date</TableHead>
          <TableHead className="text-muted-foreground">Opp</TableHead>
          <TableHead className="text-muted-foreground text-right">Tgt</TableHead>
          <TableHead className="text-muted-foreground text-right">Rec</TableHead>
          <TableHead className="text-muted-foreground text-right">Rec Yds</TableHead>
          <TableHead className="text-muted-foreground text-right">TD</TableHead>
          <TableHead className="text-muted-foreground text-right">FPts</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log, idx) => {
          const fpts = calcFantasyPoints(log);
          const recYdsAvg = averages?.rec_yards || 50;
          const recIndicator = log.rec_yards ? getPerformanceIndicator(log.rec_yards, recYdsAvg) : null;
          
          return (
            <TableRow key={idx} className="border-border/30 hover:bg-muted/20">
              <TableCell className="font-mono text-sm">{formatGameDate(log.game_date || "")}</TableCell>
              <TableCell className="text-sm">{formatOpponent(log.opponent || "—", log.is_home || false)}</TableCell>
              <TableCell className="text-right font-mono text-sm">
                {log.targets || 0}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {log.receptions || 0}
              </TableCell>
              <TableCell className={`text-right font-mono text-sm ${recIndicator?.color || ""}`}>
                {formatNumber(log.rec_yards)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm text-terminal-green">
                {log.rec_td || 0}
              </TableCell>
              <TableCell className="text-right font-mono text-sm font-medium">
                {fpts.toFixed(1)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function DEFGameLogTable({ logs }: { logs: NFLGameLogEntry[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border/50">
          <TableHead className="text-muted-foreground">Date</TableHead>
          <TableHead className="text-muted-foreground">Opp</TableHead>
          <TableHead className="text-muted-foreground text-right">Tkl</TableHead>
          <TableHead className="text-muted-foreground text-right">Solo</TableHead>
          <TableHead className="text-muted-foreground text-right">Sacks</TableHead>
          <TableHead className="text-muted-foreground text-right">INT</TableHead>
          <TableHead className="text-muted-foreground text-right">PD</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log, idx) => (
          <TableRow key={idx} className="border-border/30 hover:bg-muted/20">
            <TableCell className="font-mono text-sm">{formatGameDate(log.game_date || "")}</TableCell>
            <TableCell className="text-sm">{formatOpponent(log.opponent || "—", log.is_home || false)}</TableCell>
            <TableCell className="text-right font-mono text-sm">
              {log.tackles || 0}
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              {log.solo_tackles || 0}
            </TableCell>
            <TableCell className={`text-right font-mono text-sm ${(log.sacks || 0) >= 1 ? "text-terminal-green" : ""}`}>
              {log.sacks || 0}
            </TableCell>
            <TableCell className={`text-right font-mono text-sm ${(log.interceptions || 0) >= 1 ? "text-terminal-green" : ""}`}>
              {log.interceptions || 0}
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              {log.pass_deflections || 0}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function NFLGameLog({ gameLogs, position, seasonAverages, isLoading }: NFLGameLogProps) {
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
            No game log data available. Game log data will appear here once it becomes available.
          </p>
        </CardContent>
      </Card>
    );
  }

  const positionGroup = getPositionGroup(position);
  const recentGames = gameLogs.slice(0, 10); // Show last 10 games

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Game Log
          </CardTitle>
          <Badge variant="outline" className="border-muted-foreground/30">
            Last {recentGames.length} Games
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {positionGroup === "QB" && <QBGameLogTable logs={recentGames} averages={seasonAverages} />}
        {positionGroup === "RB" && <RBGameLogTable logs={recentGames} averages={seasonAverages} />}
        {positionGroup === "WR_TE" && <WRTEGameLogTable logs={recentGames} averages={seasonAverages} />}
        {positionGroup === "DEF" && <DEFGameLogTable logs={recentGames} />}
        {positionGroup === "OTHER" && <WRTEGameLogTable logs={recentGames} averages={seasonAverages} />}
        
        <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border">
          Green highlighting indicates above-average performance. FPts = Fantasy Points (PPR).
        </p>
      </CardContent>
    </Card>
  );
}
