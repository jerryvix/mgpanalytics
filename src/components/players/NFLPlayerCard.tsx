import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface NFLPlayerCardProps {
  id: number;
  firstName: string;
  lastName: string;
  position: string;
  positionAbbreviation: string;
  team: {
    name: string;
    full_name?: string;
    abbreviation: string;
  } | null;
  jerseyNumber?: string | null;
  height?: string | null;
  weight?: string | number | null;
  college?: string | null;
  experience?: string | number | null;
}

export function NFLPlayerCard({
  id,
  firstName,
  lastName,
  position,
  positionAbbreviation,
  team,
  jerseyNumber,
  height,
  weight,
  college,
  experience,
}: NFLPlayerCardProps) {
  const fullName = `${firstName} ${lastName}`;
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`;
  
  const getPositionColor = () => {
    switch (positionAbbreviation) {
      case "QB":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      case "RB":
      case "FB":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "WR":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "TE":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "OL":
      case "OT":
      case "OG":
      case "C":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "DL":
      case "DE":
      case "DT":
        return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "LB":
        return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
      case "DB":
      case "CB":
      case "S":
        return "bg-pink-500/20 text-pink-400 border-pink-500/30";
      case "K":
      case "P":
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      default:
        return "bg-terminal-green/20 text-terminal-green border-terminal-green/30";
    }
  };

  return (
    <Link to={`/dashboard/nfl/players/bdl-${id}`}>
      <Card className="group bg-card border-border hover:border-terminal-green/50 transition-all duration-200 cursor-pointer hover:shadow-lg hover:shadow-terminal-green/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            {/* Player Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                <span className="text-lg font-bold text-muted-foreground">{initials}</span>
              </div>
              {jerseyNumber && (
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-terminal-green flex items-center justify-center">
                  <span className="text-[10px] font-bold text-background">#{jerseyNumber}</span>
                </div>
              )}
            </div>

            {/* Player Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground group-hover:text-terminal-green transition-colors truncate">
                {fullName}
              </h3>
              
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={getPositionColor()}>
                  {positionAbbreviation || position}
                </Badge>
                {team && (
                  <span className="text-sm text-muted-foreground truncate">
                    {team.abbreviation || team.name}
                  </span>
                )}
              </div>

              {/* Additional Info */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                {height && <span>{height}</span>}
                {weight && <span>{typeof weight === 'string' ? weight : `${weight} lbs`}</span>}
                {experience !== null && experience !== undefined && (
                  <span>
                    {typeof experience === 'string' 
                      ? experience 
                      : experience === 0 
                        ? "Rookie" 
                        : `${experience} yr${experience > 1 ? "s" : ""}`}
                  </span>
                )}
                {college && <span className="truncate max-w-[120px]">{college}</span>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
