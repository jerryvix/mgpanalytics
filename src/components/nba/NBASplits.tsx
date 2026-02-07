import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart3 } from "lucide-react";
import { useMemo } from "react";

interface GameLog {
  game_date: string;
  opponent_abbr: string;
  home_away: string;
  points: number;
  rebounds: number;
  assists: number;
  fg_made: number;
  fg_attempted: number;
}

interface NBASplitsProps {
  gameLogs: GameLog[];
  playerName: string;
  isLoading?: boolean;
}

interface SplitRow {
  label: string;
  games: number;
  ppg: number;
  rpg: number;
  apg: number;
  fgPct: number;
}

function calculateSplits(logs: GameLog[], filterFn: (log: GameLog) => boolean): SplitRow | null {
  const filtered = logs.filter(filterFn);
  if (filtered.length === 0) return null;

  const totals = filtered.reduce(
    (acc, log) => ({
      points: acc.points + log.points,
      rebounds: acc.rebounds + log.rebounds,
      assists: acc.assists + log.assists,
      fgMade: acc.fgMade + log.fg_made,
      fgAttempted: acc.fgAttempted + log.fg_attempted,
    }),
    { points: 0, rebounds: 0, assists: 0, fgMade: 0, fgAttempted: 0 }
  );

  const gp = filtered.length;
  return {
    label: "",
    games: gp,
    ppg: totals.points / gp,
    rpg: totals.rebounds / gp,
    apg: totals.assists / gp,
    fgPct: totals.fgAttempted > 0 ? (totals.fgMade / totals.fgAttempted) * 100 : 0,
  };
}

// Simple check for Eastern Conference teams
const EASTERN_TEAMS = [
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DET", "IND", 
  "MIA", "MIL", "NYK", "ORL", "PHI", "TOR", "WAS"
];

export function NBASplits({ gameLogs, playerName, isLoading }: NBASplitsProps) {
  const splits = useMemo(() => {
    if (gameLogs.length === 0) return [];

    const sortedLogs = [...gameLogs].sort(
      (a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime()
    );

    const results: Array<SplitRow & { highlight?: boolean }> = [];

    // Home
    const home = calculateSplits(gameLogs, (l) => l.home_away === "home");
    if (home) results.push({ ...home, label: "Home" });

    // Away
    const away = calculateSplits(gameLogs, (l) => l.home_away === "away");
    if (away) results.push({ ...away, label: "Away" });

    // vs East
    const vsEast = calculateSplits(gameLogs, (l) => EASTERN_TEAMS.includes(l.opponent_abbr.toUpperCase()));
    if (vsEast) results.push({ ...vsEast, label: "vs East" });

    // vs West
    const vsWest = calculateSplits(gameLogs, (l) => !EASTERN_TEAMS.includes(l.opponent_abbr.toUpperCase()));
    if (vsWest) results.push({ ...vsWest, label: "vs West" });

    // Last 5 Games
    const last5 = calculateSplits(sortedLogs.slice(0, 5), () => true);
    if (last5) results.push({ ...last5, label: "Last 5 Games", highlight: true });

    // Last 10 Games
    const last10 = calculateSplits(sortedLogs.slice(0, 10), () => true);
    if (last10) results.push({ ...last10, label: "Last 10 Games" });

    // Wins
    // We don't have W/L in logs directly, but we could infer from score if available
    // For now, skip this split

    return results;
  }, [gameLogs]);

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Situational Splits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 bg-muted/30 animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (gameLogs.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Situational Splits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Splits require game log data. This data will appear once game logs are available.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-terminal-cyan" />
          Situational Splits - {playerName}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead className="text-muted-foreground">Split</TableHead>
              <TableHead className="text-muted-foreground text-center">GP</TableHead>
              <TableHead className="text-muted-foreground text-right">PPG</TableHead>
              <TableHead className="text-muted-foreground text-right">RPG</TableHead>
              <TableHead className="text-muted-foreground text-right">APG</TableHead>
              <TableHead className="text-muted-foreground text-right">FG%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {splits.map((split, idx) => (
              <TableRow
                key={idx}
                className={`border-border/30 hover:bg-muted/20 ${
                  split.highlight ? "bg-terminal-cyan/5" : ""
                }`}
              >
                <TableCell className="font-medium text-sm">{split.label}</TableCell>
                <TableCell className="text-center font-mono text-sm">{split.games}</TableCell>
                <TableCell className="text-right font-mono text-sm font-medium text-terminal-green">
                  {split.ppg.toFixed(1)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{split.rpg.toFixed(1)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{split.apg.toFixed(1)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{split.fgPct.toFixed(0)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border">
          Splits are calculated from available game log data for the 2024-25 season.
        </p>
      </CardContent>
    </Card>
  );
}
