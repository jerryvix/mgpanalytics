import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Flame, Trophy } from "lucide-react";

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
}: NFLSlateLeaderCardProps) {
  const fullName = `${firstName} ${lastName}`;

  const getCategoryColor = () => {
    switch (category) {
      case "passing":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      case "rushing":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "receiving":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      default:
        return "bg-primary/20 text-primary border-primary/30";
    }
  };

  const getCategoryLabel = () => {
    switch (category) {
      case "passing":
        return "Passing Leader";
      case "rushing":
        return "Rushing Leader";
      case "receiving":
        return "Receiving Leader";
      default:
        return "Leader";
    }
  };

  const getRankBadge = () => {
    if (rank === 1) {
      return (
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-bold">
          <Flame className="w-3 h-3" />
          #1
        </div>
      );
    }
    if (rank === 2) {
      return (
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-400/20 text-slate-300 text-xs font-bold">
          <Trophy className="w-3 h-3" />
          #2
        </div>
      );
    }
    return null;
  };

  const formatStatValue = (value: number) => {
    return value.toLocaleString();
  };

  return (
    <Link to={`/dashboard/nfl/players/bdl-${id}`}>
      <Card className="group bg-card border-border hover:border-primary/50 transition-all duration-200 cursor-pointer hover:shadow-lg hover:shadow-primary/5 h-full">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Rank Badge */}
            <div className="flex-shrink-0">
              {getRankBadge()}
            </div>

            {/* Player Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <User className="w-6 h-6 text-muted-foreground" />
              </div>
              {jerseyNumber && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-[9px] font-bold text-primary-foreground">#{jerseyNumber}</span>
                </div>
              )}
            </div>

            {/* Player Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate text-sm">
                {fullName}
              </h3>
              
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={getCategoryColor()}>
                  {positionAbbreviation || position}
                </Badge>
                {team && (
                  <span className="text-xs text-muted-foreground truncate">
                    {team.abbreviation}
                  </span>
                )}
              </div>

              {/* Stat Display */}
              <div className="mt-2 flex flex-col gap-1">
                <span className="text-lg font-bold text-foreground">
                  {formatStatValue(statValue)} <span className="text-xs font-normal text-muted-foreground">yds</span>
                </span>
                <Badge variant="secondary" className="w-fit text-[10px]">
                  {getCategoryLabel()}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
