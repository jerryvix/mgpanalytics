import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Flame, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { format, isToday, isTomorrow } from "date-fns";
import { DeltaResult } from "@/utils/performanceDelta";
import { PerformanceSurgeBadge } from "@/components/ui/PerformanceSurgeBadge";

interface GameContext {
  opponent: string;
  date: Date;
  isHome: boolean;
}

interface NBASlatePlayerCardProps {
  id: string;
  name: string;
  team: string;
  position: string;
  injuryStatus?: string;
  headshotUrl?: string;
  rank: number;
  pointsPerGame?: number;
  reboundsPerGame?: number;
  assistsPerGame?: number;
  minutesPerGame?: number;
  gameContext?: GameContext;
  showRank?: boolean;
  performanceDelta?: DeltaResult | null;
}

export function NBASlatePlayerCard({
  id,
  name,
  team,
  position,
  injuryStatus = "Healthy",
  headshotUrl,
  rank,
  pointsPerGame,
  reboundsPerGame,
  assistsPerGame,
  minutesPerGame,
  gameContext,
  showRank = true,
  performanceDelta,
}: NBASlatePlayerCardProps) {
  const isInjured = injuryStatus !== "Healthy";

  // Get initials for fallback avatar
  const getInitials = () => {
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getInjuryBadgeColor = () => {
    switch (injuryStatus) {
      case "Out":
      case "IR":
        return "bg-destructive/20 text-destructive border-destructive/30";
      case "Doubtful":
        return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "Questionable":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      default:
        return "bg-green-500/20 text-green-400 border-green-500/30";
    }
  };

  const getPositionColor = () => {
    switch (position) {
      case "PG":
      case "SG":
      case "G":
        return "text-cyan-400";
      case "SF":
      case "PF":
      case "F":
        return "text-amber-400";
      case "C":
        return "text-red-400";
      default:
        return "text-muted-foreground";
    }
  };

  // Rank badge styling
  const getRankBadge = () => {
    if (!showRank) return null;

    const baseClasses = "absolute -top-2 -left-2 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-lg";
    
    if (rank === 1) {
      return (
        <div className={`${baseClasses} bg-gradient-to-br from-yellow-400 to-amber-500 text-yellow-900`}>
          <Flame className="w-4 h-4" />
        </div>
      );
    }
    if (rank === 2) {
      return (
        <div className={`${baseClasses} bg-gradient-to-br from-slate-300 to-slate-400 text-slate-800`}>
          #{rank}
        </div>
      );
    }
    if (rank === 3) {
      return (
        <div className={`${baseClasses} bg-gradient-to-br from-amber-600 to-amber-700 text-amber-100`}>
          #{rank}
        </div>
      );
    }
    return (
      <div className={`${baseClasses} bg-muted text-muted-foreground border border-border`}>
        #{rank}
      </div>
    );
  };

  // Format game context
  const formatGameContext = () => {
    if (!gameContext) return null;

    const { opponent, date, isHome } = gameContext;
    const gameDate = new Date(date);
    
    // Get short team name (last word or abbreviation)
    const shortOpponent = opponent.split(" ").pop() || opponent;
    
    let dateString = "";
    if (isToday(gameDate)) {
      dateString = `Today ${format(gameDate, "h:mm a")}`;
    } else if (isTomorrow(gameDate)) {
      dateString = `Tomorrow ${format(gameDate, "h:mm a")}`;
    } else {
      dateString = format(gameDate, "EEE h:mm a");
    }

    const prefix = isHome ? "vs" : "@";

    return (
      <div className="text-xs text-muted-foreground font-mono">
        {prefix} {shortOpponent} • {dateString}
      </div>
    );
  };

  const formatStat = (val: number | undefined, decimals: number = 1) => {
    if (val === undefined || val === null) return "N/A";
    return val.toFixed(decimals);
  };

  return (
    <Link to={`/dashboard/nba/players/${id}`}>
      <Card className="bg-card border-border hover:border-terminal-green/50 transition-all cursor-pointer group relative">
        {/* Rank Badge */}
        {getRankBadge()}

        <CardContent className="p-4 space-y-3">
          {/* Performance Surge Badge - Top of card */}
          {performanceDelta?.isSurge && (
            <PerformanceSurgeBadge delta={performanceDelta} size="sm" />
          )}
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
              {headshotUrl ? (
                <img
                  src={headshotUrl}
                  alt={name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                    target.nextElementSibling?.classList.remove("hidden");
                  }}
                />
              ) : null}
              <span
                className={`text-xs font-bold text-muted-foreground ${
                  headshotUrl ? "hidden" : ""
                }`}
              >
                {getInitials()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground group-hover:text-terminal-green transition-colors truncate">
                {name}
              </h3>
              <div className="flex items-center gap-2 text-sm">
                <span className={`font-mono font-bold ${getPositionColor()}`}>
                  {position}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground truncate">{team}</span>
              </div>
              {/* Game Context */}
              {formatGameContext()}
            </div>
          </div>

          {/* Injury Status */}
          {isInjured && (
            <Badge className={`${getInjuryBadgeColor()} text-xs`}>
              <Activity className="w-3 h-3 mr-1" />
              {injuryStatus}
            </Badge>
          )}

          {/* Stats */}
          <div className="grid grid-cols-4 gap-1.5 text-center">
            <div className="bg-muted/30 rounded p-1.5">
              <div className="text-[10px] text-muted-foreground">PPG</div>
              <div className="text-sm font-bold text-terminal-green">
                {formatStat(pointsPerGame)}
              </div>
            </div>
            <div className="bg-muted/30 rounded p-1.5">
              <div className="text-[10px] text-muted-foreground">RPG</div>
              <div className="text-sm font-bold text-foreground">
                {formatStat(reboundsPerGame)}
              </div>
            </div>
            <div className="bg-muted/30 rounded p-1.5">
              <div className="text-[10px] text-muted-foreground">APG</div>
              <div className="text-sm font-bold text-foreground">
                {formatStat(assistsPerGame)}
              </div>
            </div>
            <div className="bg-muted/30 rounded p-1.5">
              <div className="text-[10px] text-muted-foreground">MPG</div>
              <div className="text-sm font-bold text-muted-foreground">
                {formatStat(minutesPerGame)}
              </div>
            </div>
          </div>

          {/* Hot badge for #1 */}
          {rank === 1 && showRank && (
            <div className="flex items-center justify-center gap-1 text-[10px] font-mono uppercase tracking-wide text-terminal-amber">
              <Flame className="w-3 h-3" />
              Top Scorer on Slate
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
