import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Flame, Trophy, Star, TrendingUp } from "lucide-react";

interface DetailedStats {
  qbr?: number;
  passing_yards?: number;
  passing_yards_per_game?: number;
  passing_touchdowns?: number;
  interceptions?: number;
  rushing_yards?: number;
  rushing_yards_per_game?: number;
  rushing_touchdowns?: number;
  receiving_yards?: number;
  receiving_yards_per_game?: number;
  receptions?: number;
  receiving_touchdowns?: number;
  games_played?: number;
}

interface NFLSlateLeaderCardProps {
  id: number;
  firstName: string;
  lastName: string;
  position: string;
  positionAbbreviation: string;
  team: {
    id: number;
    abbreviation: string;
    full_name: string;
    name: string;
  } | null;
  jerseyNumber?: string | null;
  statValue: number;
  statType: string;
  rank: number;
  category: "passing" | "rushing" | "receiving";
  positionRank?: number;
  detailedStats?: DetailedStats;
}

export function NFLSlateLeaderCard({
  id,
  firstName,
  lastName,
  position,
  positionAbbreviation,
  team,
  jerseyNumber,
  statValue,
  statType,
  rank,
  category,
  positionRank,
  detailedStats,
}: NFLSlateLeaderCardProps) {
  const fullName = `${firstName} ${lastName}`;

  const getCategoryStyles = () => {
    switch (category) {
      case "passing":
        return {
          border: "border-red-500/30 hover:border-red-500/60",
          badge: "bg-red-500/20 text-red-400 border-red-500/30",
          glow: "hover:shadow-red-500/10",
          accent: "text-red-400",
        };
      case "rushing":
        return {
          border: "border-blue-500/30 hover:border-blue-500/60",
          badge: "bg-blue-500/20 text-blue-400 border-blue-500/30",
          glow: "hover:shadow-blue-500/10",
          accent: "text-blue-400",
        };
      case "receiving":
        return {
          border: "border-green-500/30 hover:border-green-500/60",
          badge: "bg-green-500/20 text-green-400 border-green-500/30",
          glow: "hover:shadow-green-500/10",
          accent: "text-green-400",
        };
      default:
        return {
          border: "border-primary/30 hover:border-primary/60",
          badge: "bg-primary/20 text-primary border-primary/30",
          glow: "hover:shadow-primary/10",
          accent: "text-primary",
        };
    }
  };

  const styles = getCategoryStyles();

  const getRankBadge = () => {
    if (rank === 1) {
      return (
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-yellow-500/30 to-amber-500/20 text-yellow-400 text-xs font-bold border border-yellow-500/30">
          <Flame className="w-3.5 h-3.5" />
          <span>#1</span>
        </div>
      );
    }
    if (rank === 2) {
      return (
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-500/20 text-slate-300 text-xs font-bold border border-slate-500/30">
          <Trophy className="w-3.5 h-3.5" />
          <span>#2</span>
        </div>
      );
    }
    return null;
  };

  const formatStatValue = (value: number) => {
    return value.toLocaleString();
  };

  const getPositionLabel = () => {
    switch (category) {
      case "passing": return "QBs";
      case "rushing": return "RBs";
      case "receiving": return "WR/TEs";
      default: return "Players";
    }
  };

  // Render position-specific stats
  const renderDetailedStats = () => {
    if (!detailedStats) return null;

    if (category === "passing") {
      return (
        <div className="grid grid-cols-4 gap-2 text-center">
          {detailedStats.qbr !== undefined && (
            <div>
              <div className={`text-lg font-bold ${styles.accent}`}>
                {detailedStats.qbr.toFixed(1)}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase">QBR</div>
            </div>
          )}
          <div>
            <div className="text-sm font-semibold text-foreground">
              {detailedStats.passing_yards_per_game?.toFixed(1)}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase">Yds/G</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              {detailedStats.passing_touchdowns}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase">TDs</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              {detailedStats.interceptions}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase">INTs</div>
          </div>
        </div>
      );
    }

    if (category === "rushing") {
      return (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-sm font-semibold text-foreground">
              {formatStatValue(detailedStats.rushing_yards || 0)}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase">Total Yds</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              {detailedStats.rushing_yards_per_game?.toFixed(1)}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase">Yds/G</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              {detailedStats.rushing_touchdowns}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase">TDs</div>
          </div>
        </div>
      );
    }

    if (category === "receiving") {
      return (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-sm font-semibold text-foreground">
              {formatStatValue(detailedStats.receiving_yards || 0)}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase">Total Yds</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              {detailedStats.receptions}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase">Rec</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              {detailedStats.receiving_touchdowns}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase">TDs</div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <Link to={`/dashboard/nfl/players/bdl-${id}`}>
      <Card className={`group bg-card ${styles.border} transition-all duration-200 cursor-pointer hover:shadow-lg ${styles.glow} h-full`}>
        <CardContent className="p-4">
          {/* Header: Team Leader Badge + Rank */}
          <div className="flex items-center justify-between mb-3">
            <Badge className="bg-primary/10 text-primary border-primary/30 gap-1">
              <Star className="w-3 h-3 fill-current" />
              Team Leader
            </Badge>
            {getRankBadge()}
          </div>

          {/* Player Info Row */}
          <div className="flex items-start gap-3">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center border-2 border-muted-foreground/20">
                <User className="w-7 h-7 text-muted-foreground" />
              </div>
              {jerseyNumber && (
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-md">
                  <span className="text-[10px] font-bold text-primary-foreground">#{jerseyNumber}</span>
                </div>
              )}
            </div>

            {/* Name & Team */}
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-foreground group-hover:text-primary transition-colors text-base leading-tight">
                {fullName}
              </h3>
              
              <div className="flex items-center gap-2 mt-1.5">
                <Badge variant="outline" className={styles.badge}>
                  {positionAbbreviation || position}
                </Badge>
                {team && (
                  <span className="text-sm text-muted-foreground font-medium">
                    {team.full_name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Main Stat Display with Position Rank */}
          <div className="mt-4 pt-3 border-t border-border">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <span className="text-2xl font-bold text-foreground">
                  {formatStatValue(statValue)}
                </span>
                <span className="text-sm font-medium text-muted-foreground ml-1">
                  {statType}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                  2025 Season
                </Badge>
                {positionRank && (
                  <span className="text-[11px] text-muted-foreground italic mt-1">
                    #{positionRank} among {getPositionLabel()}
                  </span>
                )}
              </div>
            </div>

            {/* Detailed Stats Grid */}
            {detailedStats && (
              <div className="pt-3 border-t border-border/50">
                {renderDetailedStats()}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
