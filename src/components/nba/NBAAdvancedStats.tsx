import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Info, TrendingUp, TrendingDown } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NBAAdvancedStatsProps {
  stats: {
    points_per_game?: number;
    rebounds_per_game?: number;
    assists_per_game?: number;
    steals_per_game?: number;
    blocks_per_game?: number;
    turnovers_per_game?: number;
    field_goal_pct?: number;
    three_point_pct?: number;
    free_throw_pct?: number;
    minutes_per_game?: number;
    games_played?: number;
  } | null;
  gameLogs: Array<{
    points: number;
    rebounds: number;
    assists: number;
    fg_made: number;
    fg_attempted: number;
    three_made: number;
    three_attempted: number;
    minutes: number;
  }>;
  position?: string;
  isLoading?: boolean;
}

// Calculate advanced metrics from available data
function calculateAdvancedMetrics(
  stats: NBAAdvancedStatsProps["stats"],
  gameLogs: NBAAdvancedStatsProps["gameLogs"]
) {
  if (!stats) return null;

  const gp = stats.games_played || 1;
  const mpg = stats.minutes_per_game || 30;
  const ppg = stats.points_per_game || 0;
  const rpg = stats.rebounds_per_game || 0;
  const apg = stats.assists_per_game || 0;
  const spg = stats.steals_per_game || 0;
  const bpg = stats.blocks_per_game || 0;
  const topg = stats.turnovers_per_game || 0;
  const fgPct = stats.field_goal_pct || 0;
  const fg3Pct = stats.three_point_pct || 0;
  const ftPct = stats.free_throw_pct || 0;

  // Estimate FGA/FTA from available data or use reasonable estimates
  const fgaPerGame = ppg > 0 && fgPct > 0 ? ppg / (2 * fgPct) : 15;
  const ftaPerGame = ppg * 0.2; // Rough estimate

  // True Shooting % = PTS / (2 * (FGA + 0.44 * FTA))
  const tsa = 2 * (fgaPerGame + 0.44 * ftaPerGame);
  const trueShooting = tsa > 0 ? (ppg / tsa) * 100 : 0;

  // Estimated Usage Rate (simplified)
  // Usage = (FGA + 0.44*FTA + TOV) / Minutes * some factor
  const possessions = fgaPerGame + 0.44 * ftaPerGame + topg;
  const usageRate = mpg > 0 ? (possessions / mpg) * 100 * 2.5 : 0;

  // Assist Rate (simplified) = AST / (FGA * teamFGM rate)
  const assistRate = fgaPerGame > 0 ? (apg / (fgaPerGame * 0.45)) * 100 : 0;

  // Turnover Rate = TOV / (FGA + 0.44*FTA + TOV)
  const turnoverRate = possessions > 0 ? (topg / possessions) * 100 : 0;

  // PER approximation (simplified)
  // Real PER is complex, this is a rough estimate
  const per =
    (ppg + rpg * 1.2 + apg * 1.5 + spg * 2 + bpg * 2 - topg * 1.5) / (mpg / 48) * (gp > 20 ? 1 : 0.9);

  // Offensive Rating estimate (points per 100 possessions)
  const offRating = mpg > 0 ? (ppg / mpg) * 100 * 2.4 : 0;

  // Defensive estimates (very rough without play-by-play data)
  const defRating = 110 - spg * 3 - bpg * 2; // Lower is better
  const stealPct = (spg / mpg) * 100 * 5;
  const blockPct = (bpg / mpg) * 100 * 5;

  // Win Shares estimate (simplified)
  const winShares = gp > 0 ? (per / 15) * (gp / 82) * 10 : 0;

  // Box Plus/Minus estimate
  const bpm = (per - 15) / 3 + (trueShooting - 55) * 0.1;

  // VORP estimate
  const vorp = bpm * (mpg / 48) * (gp / 82) * 2.7;

  return {
    offensive: {
      usageRate: Math.min(usageRate, 45),
      trueShooting,
      assistRate: Math.min(assistRate, 50),
      turnoverRate,
      offRating: Math.min(offRating, 130),
    },
    defensive: {
      defRating: Math.max(defRating, 95),
      stealPct,
      blockPct,
      defWinShares: Math.max(winShares * 0.4, 0),
    },
    overall: {
      per: Math.max(per, 0),
      winShares: Math.max(winShares, 0),
      bpm,
      vorp: Math.max(vorp, 0),
    },
  };
}

interface StatRowProps {
  label: string;
  value: number;
  unit?: string;
  leagueAvg?: number;
  higherIsBetter?: boolean;
  description?: string;
  rank?: string;
}

function StatRow({ label, value, unit = "", leagueAvg, higherIsBetter = true, description, rank }: StatRowProps) {
  const formatted = unit === "%" ? `${value.toFixed(1)}%` : value.toFixed(1);
  const isAboveAvg = leagueAvg !== undefined ? (higherIsBetter ? value > leagueAvg : value < leagueAvg) : null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/30 cursor-help">
            <div className="flex items-center gap-2">
              {isAboveAvg !== null && (
                <span className={isAboveAvg ? "text-terminal-green" : "text-muted-foreground"}>
                  {isAboveAvg ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                </span>
              )}
              <span className="text-sm text-muted-foreground">{label}:</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`font-mono text-sm font-medium ${isAboveAvg ? "text-terminal-green" : "text-foreground"}`}>
                {formatted}
              </span>
              {rank && (
                <Badge variant="outline" className="text-[9px] px-1 h-4">
                  {rank}
                </Badge>
              )}
            </div>
          </div>
        </TooltipTrigger>
        {description && (
          <TooltipContent side="left" className="max-w-[200px]">
            <p className="text-xs">{description}</p>
            {leagueAvg !== undefined && (
              <p className="text-xs text-muted-foreground mt-1">
                League avg: {unit === "%" ? `${leagueAvg}%` : leagueAvg}
              </p>
            )}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

export function NBAAdvancedStats({ stats, gameLogs, position, isLoading }: NBAAdvancedStatsProps) {
  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Advanced Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-muted/30 animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const advancedMetrics = calculateAdvancedMetrics(stats, gameLogs);

  if (!advancedMetrics) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Advanced Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Advanced stats require season data. Try syncing player stats from the Admin Panel.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5 text-terminal-green" />
            Advanced Stats - 2024-25 Season
          </CardTitle>
          <Badge variant="outline" className="border-muted-foreground/30 text-xs">
            <Info className="w-3 h-3 mr-1" />
            Hover for definitions
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Offensive */}
          <div className="border border-terminal-green/20 rounded-lg p-3 bg-terminal-green/5">
            <h4 className="font-mono text-xs text-terminal-green uppercase mb-2 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Offensive
            </h4>
            <div className="space-y-1">
              <StatRow
                label="Usage Rate"
                value={advancedMetrics.offensive.usageRate}
                unit="%"
                leagueAvg={20}
                description="Percentage of team plays used by player while on court"
              />
              <StatRow
                label="True Shooting %"
                value={advancedMetrics.offensive.trueShooting}
                unit="%"
                leagueAvg={57}
                description="Shooting efficiency accounting for 2P, 3P, and FT"
              />
              <StatRow
                label="Assist Rate"
                value={advancedMetrics.offensive.assistRate}
                unit="%"
                leagueAvg={16}
                description="Percentage of teammate FGs assisted while on court"
              />
              <StatRow
                label="Turnover Rate"
                value={advancedMetrics.offensive.turnoverRate}
                unit="%"
                leagueAvg={13}
                higherIsBetter={false}
                description="Turnovers per 100 plays"
              />
              <StatRow
                label="Off Rating"
                value={advancedMetrics.offensive.offRating}
                leagueAvg={112}
                description="Points produced per 100 possessions"
              />
            </div>
          </div>

          {/* Defensive */}
          <div className="border border-terminal-cyan/20 rounded-lg p-3 bg-terminal-cyan/5">
            <h4 className="font-mono text-xs text-terminal-cyan uppercase mb-2 flex items-center gap-1">
              <TrendingDown className="w-3 h-3" />
              Defensive
            </h4>
            <div className="space-y-1">
              <StatRow
                label="Def Rating"
                value={advancedMetrics.defensive.defRating}
                leagueAvg={112}
                higherIsBetter={false}
                description="Points allowed per 100 possessions"
              />
              <StatRow
                label="Steal %"
                value={advancedMetrics.defensive.stealPct}
                unit="%"
                leagueAvg={1.5}
                description="Percentage of opponent possessions ending in steal"
              />
              <StatRow
                label="Block %"
                value={advancedMetrics.defensive.blockPct}
                unit="%"
                leagueAvg={2.0}
                description="Percentage of opponent 2PA blocked"
              />
              <StatRow
                label="Def Win Shares"
                value={advancedMetrics.defensive.defWinShares}
                leagueAvg={1.5}
                description="Wins attributed to defensive contribution"
              />
            </div>
          </div>

          {/* Overall */}
          <div className="border border-terminal-amber/20 rounded-lg p-3 bg-terminal-amber/5">
            <h4 className="font-mono text-xs text-terminal-amber uppercase mb-2 flex items-center gap-1">
              <Zap className="w-3 h-3" />
              Overall
            </h4>
            <div className="space-y-1">
              <StatRow
                label="PER"
                value={advancedMetrics.overall.per}
                leagueAvg={15}
                description="Player Efficiency Rating - overall production per minute"
              />
              <StatRow
                label="Win Shares"
                value={advancedMetrics.overall.winShares}
                leagueAvg={4}
                description="Estimated wins contributed to team"
              />
              <StatRow
                label="Box +/-"
                value={advancedMetrics.overall.bpm}
                leagueAvg={0}
                description="Box Plus/Minus - points per 100 poss vs league avg"
              />
              <StatRow
                label="VORP"
                value={advancedMetrics.overall.vorp}
                leagueAvg={1}
                description="Value Over Replacement Player"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <p>
              Advanced stats are calculated estimates based on available box score data. Actual values from official
              sources may differ due to play-by-play data differences.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
