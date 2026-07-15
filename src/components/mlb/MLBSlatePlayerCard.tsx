import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { format, isToday, isTomorrow } from "date-fns";
import { FollowButton } from "@/components/ui/FollowButton";

interface GameContext {
  opponent: string;
  date: Date;
  isHome: boolean;
}

interface MLBSlatePlayerCardProps {
  id: string;
  name: string;
  team: string;
  position: string;
  headshotUrl?: string;
  rank: number;
  battingAvg?: number;
  homeRuns?: number;
  rbi?: number;
  ops?: number;
  hitStreak?: number;
  gameContext?: GameContext;
  showRank?: boolean;
  hasProps?: boolean;
}

// MLB position color coding
const getPositionColor = (position: string) => {
  switch (position) {
    case "P":
    case "SP":
    case "RP":
      return "text-red-400";
    case "C":
      return "text-amber-400";
    case "1B":
    case "2B":
    case "3B":
    case "SS":
    case "IF":
      return "text-cyan-400";
    case "LF":
    case "CF":
    case "RF":
    case "OF":
      return "text-green-400";
    case "DH":
      return "text-purple-400";
    default:
      return "text-muted-foreground";
  }
};

export function MLBSlatePlayerCard({
  id,
  name,
  team,
  position,
  headshotUrl,
  rank,
  battingAvg,
  homeRuns,
  rbi,
  ops,
  hitStreak,
  gameContext,
  showRank = true,
  hasProps,
}: MLBSlatePlayerCardProps) {
  const getInitials = () => {
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getRankBadge = () => {
    if (!showRank) return null;
    const baseClasses =
      "absolute -top-2 -left-2 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-lg";
    if (rank === 1) {
      return (
        <div className={`${baseClasses} bg-gradient-to-br from-yellow-400 to-amber-500 text-yellow-900`}>
          <Flame className="w-4 h-4" />
        </div>
      );
    }
    if (rank === 2) {
      return <div className={`${baseClasses} bg-gradient-to-br from-slate-300 to-slate-400 text-slate-800`}>#{rank}</div>;
    }
    if (rank === 3) {
      return <div className={`${baseClasses} bg-gradient-to-br from-amber-600 to-amber-700 text-amber-100`}>#{rank}</div>;
    }
    return <div className={`${baseClasses} bg-muted text-muted-foreground border border-border`}>#{rank}</div>;
  };

  const formatGameContext = () => {
    if (!gameContext) return null;
    const { opponent, date, isHome } = gameContext;
    const gameDate = new Date(date);
    const shortOpponent = opponent.split(" ").pop() || opponent;
    let dateString = "";
    if (isToday(gameDate)) dateString = `Today ${format(gameDate, "h:mm a")}`;
    else if (isTomorrow(gameDate)) dateString = `Tomorrow ${format(gameDate, "h:mm a")}`;
    else dateString = format(gameDate, "EEE h:mm a");
    const prefix = isHome ? "vs" : "@";
    return (
      <div className="text-xs text-muted-foreground font-mono">
        {prefix} {shortOpponent} • {dateString}
      </div>
    );
  };

  // Baseball averages: 3-decimal, no leading zero (.312 not 0.312)
  const fmtAvg = (val?: number) => {
    if (val === undefined || val === null) return "—";
    return val.toFixed(3).replace(/^0/, "");
  };
  const fmtInt = (val?: number) => (val === undefined || val === null ? "—" : String(Math.round(val)));

  return (
    <Link to={`/dashboard/mlb/players/${id}`}>
      <Card className="bg-card border-border hover:border-terminal-green/50 transition-all cursor-pointer group relative">
        {getRankBadge()}
        <CardContent className="p-4 space-y-3">
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
              <span className={`text-xs font-bold text-muted-foreground ${headshotUrl ? "hidden" : ""}`}>
                {getInitials()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground group-hover:text-terminal-green transition-colors truncate">
                {name}
              </h3>
              <div className="flex items-center gap-2 text-sm">
                <span className={`font-mono font-bold ${getPositionColor(position)}`}>{position}</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground truncate">{team}</span>
              </div>
              {formatGameContext()}
            </div>
            <FollowButton
              entity={{ entityType: "player", entityKey: id, entityLabel: name, sport: "MLB" }}
              className="shrink-0 -mt-1 -mr-1"
            />
          </div>

          {hasProps && (
            <Badge className="bg-terminal-cyan/15 text-terminal-cyan border-terminal-cyan/30 text-xs">
              <Target className="w-3 h-3 mr-1" />
              Props Available
            </Badge>
          )}

          {hitStreak && hitStreak >= 5 && (
            <Badge className="bg-terminal-amber/15 text-terminal-amber border-terminal-amber/30 text-xs">
              <Flame className="w-3 h-3 mr-1" />
              {hitStreak}-Game Hit Streak
            </Badge>
          )}

          {/* Stats: AVG / HR / RBI / OPS */}
          <div className="grid grid-cols-4 gap-1.5 text-center">
            <div className="bg-muted/30 rounded p-1.5">
              <div className="text-[10px] text-muted-foreground">AVG</div>
              <div className="text-sm font-bold text-terminal-green">{fmtAvg(battingAvg)}</div>
            </div>
            <div className="bg-muted/30 rounded p-1.5">
              <div className="text-[10px] text-muted-foreground">HR</div>
              <div className="text-sm font-bold text-foreground">{fmtInt(homeRuns)}</div>
            </div>
            <div className="bg-muted/30 rounded p-1.5">
              <div className="text-[10px] text-muted-foreground">RBI</div>
              <div className="text-sm font-bold text-foreground">{fmtInt(rbi)}</div>
            </div>
            <div className="bg-muted/30 rounded p-1.5">
              <div className="text-[10px] text-muted-foreground">OPS</div>
              <div className="text-sm font-bold text-muted-foreground">{fmtAvg(ops)}</div>
            </div>
          </div>

          {rank === 1 && showRank && (
            <div className="flex items-center justify-center gap-1 text-[10px] font-mono uppercase tracking-wide text-terminal-amber">
              <Flame className="w-3 h-3" />
              Top Bat on Slate
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
