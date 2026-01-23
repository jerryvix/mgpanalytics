import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Activity, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

interface PlayerCardProps {
  id: string;
  name: string;
  team: string;
  position: string;
  sport: "NFL" | "NBA" | "NCAAB";
  injuryStatus?: string;
  isFeatured?: boolean;
  featuredReason?: string;
  usageRank?: number;
  headshotUrl?: string;
  // NFL stats
  passYards?: number;
  rushYards?: number;
  recYards?: number;
  // NBA/NCAAB stats
  pointsPerGame?: number;
  reboundsPerGame?: number;
  assistsPerGame?: number;
  minutesPerGame?: number;
}

export function PlayerCard({
  id,
  name,
  team,
  position,
  sport,
  injuryStatus = "Healthy",
  isFeatured,
  featuredReason,
  usageRank,
  passYards,
  rushYards,
  recYards,
  pointsPerGame,
  reboundsPerGame,
  assistsPerGame,
  minutesPerGame,
  headshotUrl,
}: PlayerCardProps) {
  const isInjured = injuryStatus !== "Healthy";
  
  // Get initials for fallback avatar
  const getInitials = () => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getInjuryBadgeColor = () => {
    switch (injuryStatus) {
      case "Out":
      case "IR":
        return "bg-red-500/20 text-red-400 border-red-500/30";
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
      case "QB":
        return "text-blue-400";
      case "RB":
      case "FB":
        return "text-green-400";
      case "WR":
        return "text-purple-400";
      case "TE":
        return "text-orange-400";
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

  const renderStats = () => {
    if (sport === "NFL") {
      return (
        <div className="grid grid-cols-3 gap-2 text-center">
          {position === "QB" && passYards !== undefined && (
            <div className="bg-muted/30 rounded p-1.5">
              <div className="text-xs text-muted-foreground">Pass</div>
              <div className="text-sm font-bold text-terminal-green">{passYards.toLocaleString()}</div>
            </div>
          )}
          {(position === "RB" || position === "FB") && rushYards !== undefined && (
            <div className="bg-muted/30 rounded p-1.5">
              <div className="text-xs text-muted-foreground">Rush</div>
              <div className="text-sm font-bold text-terminal-green">{rushYards.toLocaleString()}</div>
            </div>
          )}
          {(position === "WR" || position === "TE") && recYards !== undefined && (
            <div className="bg-muted/30 rounded p-1.5">
              <div className="text-xs text-muted-foreground">Rec</div>
              <div className="text-sm font-bold text-terminal-green">{recYards.toLocaleString()}</div>
            </div>
          )}
        </div>
      );
    }

    // NBA/NCAAB stats
    return (
      <div className="grid grid-cols-4 gap-1.5 text-center">
        <div className="bg-muted/30 rounded p-1.5">
          <div className="text-[10px] text-muted-foreground">PPG</div>
          <div className="text-sm font-bold text-terminal-green">{pointsPerGame?.toFixed(1) || "—"}</div>
        </div>
        <div className="bg-muted/30 rounded p-1.5">
          <div className="text-[10px] text-muted-foreground">RPG</div>
          <div className="text-sm font-bold text-foreground">{reboundsPerGame?.toFixed(1) || "—"}</div>
        </div>
        <div className="bg-muted/30 rounded p-1.5">
          <div className="text-[10px] text-muted-foreground">APG</div>
          <div className="text-sm font-bold text-foreground">{assistsPerGame?.toFixed(1) || "—"}</div>
        </div>
        <div className="bg-muted/30 rounded p-1.5">
          <div className="text-[10px] text-muted-foreground">MPG</div>
          <div className="text-sm font-bold text-muted-foreground">{minutesPerGame?.toFixed(1) || "—"}</div>
        </div>
      </div>
    );
  };

  return (
    <Link to={`/dashboard/${sport.toLowerCase()}/players/${id}`}>
      <Card className="bg-card border-border hover:border-terminal-green/50 transition-all cursor-pointer group">
        <CardContent className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                {headshotUrl ? (
                  <img 
                    src={headshotUrl} 
                    alt={name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Fallback to initials on image load error
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <span className={`text-xs font-bold text-muted-foreground ${headshotUrl ? 'hidden' : ''}`}>
                  {getInitials()}
                </span>
              </div>
              <div>
                <h3 className="font-semibold text-foreground group-hover:text-terminal-green transition-colors">
                  {name}
                </h3>
                <div className="flex items-center gap-2 text-sm">
                  <span className={`font-mono font-bold ${getPositionColor()}`}>{position}</span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">{team}</span>
                </div>
              </div>
            </div>
            
            {usageRank && usageRank <= 3 && (
              <Badge variant="outline" className="border-terminal-green/50 text-terminal-green text-[10px]">
                <TrendingUp className="w-3 h-3 mr-1" />
                #{usageRank}
              </Badge>
            )}
          </div>

          {/* Injury Status */}
          {isInjured && (
            <Badge className={`${getInjuryBadgeColor()} text-xs`}>
              <Activity className="w-3 h-3 mr-1" />
              {injuryStatus}
            </Badge>
          )}

          {/* Stats */}
          {renderStats()}

          {/* Featured Reason */}
          {isFeatured && featuredReason && (
            <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wide">
              {featuredReason === "high_usage" && "High Usage Player"}
              {featuredReason === "injured" && "Injury Watch"}
              {featuredReason === "volume_fallback" && "Volume Candidate"}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
