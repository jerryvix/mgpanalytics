import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Target, Zap } from "lucide-react";
import { NFLPlayerStats } from "@/services/balldontlie/nflPlayers";
import {
  formatNumber,
  formatDecimal,
  calcCompletionPct,
  calcYPC,
  calcYPR,
  calcYPA,
  calcPerGame,
  getPositionGroup,
  calcFantasyPoints
} from "@/utils/nflStatsFormatters";

interface NFLPlayerStatsCardProps {
  stats: NFLPlayerStats | null;
  position: string;
  isLoading?: boolean;
}

interface StatRowProps {
  label: string;
  value: string | number;
  perGame?: string;
  highlight?: boolean;
}

function StatRow({ label, value, perGame, highlight }: StatRowProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`font-mono font-medium ${highlight ? "text-terminal-green" : "text-foreground"}`}>
          {value}
        </span>
        {perGame && (
          <span className="text-xs text-muted-foreground">({perGame}/g)</span>
        )}
      </div>
    </div>
  );
}

function StatBlock({ title, children, icon: Icon }: { title: string; children: React.ReactNode; icon?: any }) {
  return (
    <div className="bg-muted/20 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
        {Icon && <Icon className="w-4 h-4 text-terminal-green" />}
        <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide">{title}</h4>
      </div>
      <div className="space-y-0">{children}</div>
    </div>
  );
}

function QBStats({ stats }: { stats: NFLPlayerStats }) {
  const games = stats.games_played || 1;
  
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <StatBlock title="Passing" icon={Target}>
        <StatRow 
          label="Comp / Att" 
          value={`${formatNumber(stats.pass_completions)} / ${formatNumber(stats.pass_attempts)}`}
        />
        <StatRow 
          label="Comp %" 
          value={calcCompletionPct(stats.pass_completions || 0, stats.pass_attempts || 0)}
          highlight={(stats.pass_completions && stats.pass_attempts && (stats.pass_completions / stats.pass_attempts) > 0.65) || false}
        />
        <StatRow 
          label="Yards" 
          value={formatNumber(stats.pass_yards)}
          perGame={calcPerGame(stats.pass_yards, games)}
          highlight
        />
        <StatRow 
          label="Y/A" 
          value={calcYPA(stats.pass_yards || 0, stats.pass_attempts || 0)}
        />
        <StatRow 
          label="Touchdowns" 
          value={formatNumber(stats.pass_td)}
          perGame={calcPerGame(stats.pass_td, games)}
        />
        <StatRow
          label="Interceptions"
          value={formatNumber((stats as any).pass_int ?? stats.interceptions)}
        />
        <StatRow
          label="Passer Rating" 
          value={formatDecimal(stats.passer_rating)}
          highlight={(stats.passer_rating || 0) > 100}
        />
      </StatBlock>
      
      <StatBlock title="Rushing" icon={Zap}>
        <StatRow 
          label="Attempts" 
          value={formatNumber(stats.rush_attempts)}
        />
        <StatRow 
          label="Yards" 
          value={formatNumber(stats.rush_yards)}
          perGame={calcPerGame(stats.rush_yards, games)}
        />
        <StatRow 
          label="Y/C" 
          value={calcYPC(stats.rush_yards || 0, stats.rush_attempts || 0)}
        />
        <StatRow 
          label="Touchdowns" 
          value={formatNumber(stats.rush_td)}
        />
      </StatBlock>
    </div>
  );
}

function RBStats({ stats }: { stats: NFLPlayerStats }) {
  const games = stats.games_played || 1;
  
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <StatBlock title="Rushing" icon={Zap}>
        <StatRow 
          label="Attempts" 
          value={formatNumber(stats.rush_attempts)}
          perGame={calcPerGame(stats.rush_attempts, games)}
        />
        <StatRow 
          label="Yards" 
          value={formatNumber(stats.rush_yards)}
          perGame={calcPerGame(stats.rush_yards, games)}
          highlight
        />
        <StatRow 
          label="Y/C" 
          value={calcYPC(stats.rush_yards || 0, stats.rush_attempts || 0)}
          highlight={(stats.rush_yards && stats.rush_attempts && (stats.rush_yards / stats.rush_attempts) >= 4.5) || false}
        />
        <StatRow 
          label="Touchdowns" 
          value={formatNumber(stats.rush_td)}
        />
        <StatRow 
          label="Fumbles" 
          value={formatNumber(stats.fumbles_lost) || "0"}
        />
      </StatBlock>
      
      <StatBlock title="Receiving" icon={Target}>
        <StatRow 
          label="Targets" 
          value={formatNumber(stats.targets)}
        />
        <StatRow 
          label="Receptions" 
          value={formatNumber(stats.receptions)}
          perGame={calcPerGame(stats.receptions, games)}
        />
        <StatRow 
          label="Yards" 
          value={formatNumber(stats.rec_yards)}
          perGame={calcPerGame(stats.rec_yards, games)}
        />
        <StatRow 
          label="Touchdowns" 
          value={formatNumber(stats.rec_td)}
        />
      </StatBlock>
    </div>
  );
}

function WRTEStats({ stats }: { stats: NFLPlayerStats }) {
  const games = stats.games_played || 1;
  
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <StatBlock title="Receiving" icon={Target}>
        <StatRow 
          label="Targets" 
          value={formatNumber(stats.targets)}
          perGame={calcPerGame(stats.targets, games)}
        />
        <StatRow 
          label="Receptions" 
          value={formatNumber(stats.receptions)}
          perGame={calcPerGame(stats.receptions, games)}
        />
        <StatRow 
          label="Yards" 
          value={formatNumber(stats.rec_yards)}
          perGame={calcPerGame(stats.rec_yards, games)}
          highlight
        />
        <StatRow 
          label="Y/R" 
          value={calcYPR(stats.rec_yards || 0, stats.receptions || 0)}
        />
        <StatRow 
          label="Touchdowns" 
          value={formatNumber(stats.rec_td)}
        />
        <StatRow 
          label="Catch %" 
          value={stats.targets && stats.receptions 
            ? `${((stats.receptions / stats.targets) * 100).toFixed(1)}%` 
            : "—"}
        />
      </StatBlock>
      
      {(stats.rush_attempts || 0) > 0 && (
        <StatBlock title="Rushing" icon={Zap}>
          <StatRow 
            label="Attempts" 
            value={formatNumber(stats.rush_attempts)}
          />
          <StatRow 
            label="Yards" 
            value={formatNumber(stats.rush_yards)}
          />
          <StatRow 
            label="Touchdowns" 
            value={formatNumber(stats.rush_td)}
          />
        </StatBlock>
      )}
    </div>
  );
}

function DEFStats({ stats }: { stats: NFLPlayerStats }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <StatBlock title="Defense" icon={Zap}>
        <StatRow 
          label="Total Tackles" 
          value={formatNumber(stats.tackles)}
          highlight
        />
        <StatRow 
          label="Solo Tackles" 
          value={formatNumber(stats.solo_tackles)}
        />
        <StatRow 
          label="Sacks" 
          value={formatDecimal(stats.sacks)}
          highlight={(stats.sacks || 0) >= 1}
        />
        <StatRow 
          label="Tackles for Loss" 
          value={formatNumber(stats.tackles_for_loss)}
        />
      </StatBlock>
      
      <StatBlock title="Turnovers" icon={Target}>
        <StatRow 
          label="Interceptions" 
          value={formatNumber(stats.interceptions)}
          highlight={(stats.interceptions || 0) >= 1}
        />
        <StatRow 
          label="Forced Fumbles" 
          value={formatNumber(stats.forced_fumbles)}
        />
        <StatRow 
          label="Pass Deflections" 
          value={formatNumber(stats.pass_deflections)}
        />
        <StatRow 
          label="QB Hits" 
          value={formatNumber(stats.qb_hits)}
        />
      </StatBlock>
    </div>
  );
}

export function NFLPlayerStatsCard({ stats, position, isLoading }: NFLPlayerStatsCardProps) {
  // NFL uses start-year convention (e.g. 2025 = 2025-26 season)
  const isPostseason = (stats as any)?.season_type === "postseason";
  const seasonYear = stats?.season
    ?? (new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1);
  const seasonLabel = isPostseason
    ? `${seasonYear} Postseason Stats`
    : `${seasonYear} Season Stats`;

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            {seasonLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="h-48 bg-muted/30 animate-pulse rounded-lg" />
            <div className="h-48 bg-muted/30 animate-pulse rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            {seasonLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No stats available. Stats appear after season data is synced.
          </p>
        </CardContent>
      </Card>
    );
  }

  const positionGroup = getPositionGroup(position);
  const fantasyPoints = calcFantasyPoints(stats);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            {seasonLabel}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-muted-foreground/30">
              {stats.games_played || 0} Games
            </Badge>
            <Badge variant="outline" className="border-terminal-green/50 text-terminal-green">
              {fantasyPoints} FPts (PPR)
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {positionGroup === "QB" && <QBStats stats={stats} />}
        {positionGroup === "RB" && <RBStats stats={stats} />}
        {positionGroup === "WR_TE" && <WRTEStats stats={stats} />}
        {positionGroup === "DEF" && <DEFStats stats={stats} />}
        {positionGroup === "OTHER" && (
          <div className="grid md:grid-cols-3 gap-4">
            {stats.pass_yards && (
              <StatBlock title="Passing">
                <StatRow label="Yards" value={formatNumber(stats.pass_yards)} />
                <StatRow label="TDs" value={formatNumber(stats.pass_td)} />
              </StatBlock>
            )}
            {stats.rush_yards && (
              <StatBlock title="Rushing">
                <StatRow label="Yards" value={formatNumber(stats.rush_yards)} />
                <StatRow label="TDs" value={formatNumber(stats.rush_td)} />
              </StatBlock>
            )}
            {stats.rec_yards && (
              <StatBlock title="Receiving">
                <StatRow label="Yards" value={formatNumber(stats.rec_yards)} />
                <StatRow label="TDs" value={formatNumber(stats.rec_td)} />
              </StatBlock>
            )}
          </div>
        )}
        
        <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border">
          Source: Ball Don't Lie API
        </p>
      </CardContent>
    </Card>
  );
}
