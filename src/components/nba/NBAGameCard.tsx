import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, AlertTriangle, Info } from "lucide-react";
import { format, parseISO, isToday, isTomorrow, differenceInMinutes } from "date-fns";
import { PublicBettingPreview } from "@/components/PublicBettingPreview";
import { GamePropsPreview } from "@/components/props/GamePropsPreview";
import { getTeamAbbrev } from "@/utils/teamAbbreviations";
import { TeamLogo } from "@/components/ui/TeamLogo";

interface NBAOdds {
  id: string;
  game_id: string;
  sportsbook: string;
  spread_value: number | null;
  spread_odds: number | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
  total_value: number | null;
  total_over_odds: number | null;
  total_under_odds: number | null;
}

interface NBAGame {
  id: string;
  home_team_name: string;
  visitor_team_name: string;
  status: string;
  date: string;
  season: number;
}

interface InjuryInfo {
  team: string;
  players: Array<{ name: string; status: string }>;
}

interface NBAGameCardProps {
  game: NBAGame;
  odds: NBAOdds | null;
  injuries?: InjuryInfo[];
  lineMovement?: {
    spreadChange: number;
    totalChange: number;
  };
  index: number;
  onViewOdds: (game: NBAGame, e: React.MouseEvent) => void;
  onViewPreview: (game: NBAGame) => void;
}


export function NBAGameCard({
  game,
  odds,
  injuries = [],
  lineMovement,
  index,
  onViewOdds,
  onViewPreview,
}: NBAGameCardProps) {
  const formatGameTime = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      const timeStr = format(date, "h:mm a");
      
      if (isToday(date)) {
        return `TODAY ${timeStr}`;
      } else if (isTomorrow(date)) {
        return `TOMORROW ${timeStr}`;
      } else {
        return format(date, "EEE h:mm a").toUpperCase();
      }
    } catch {
      return dateString;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === "in progress" || statusLower === "live") {
      return (
        <Badge className="bg-terminal-green/20 text-terminal-green border-terminal-green text-[10px] font-mono animate-pulse">
          LIVE
        </Badge>
      );
    }
    return (
      <Badge className="bg-terminal-green/10 text-terminal-green border-terminal-green/50 text-[10px] font-mono">
        SCHEDULED
      </Badge>
    );
  };

  const formatPrice = (price: number | null) => {
    if (price === null) return "N/A";
    return price >= 0 ? `+${price}` : `${price}`;
  };

  const formatLine = (line: number | null) => {
    if (line === null) return "N/A";
    return line >= 0 ? `+${line}` : `${line}`;
  };

  const homeAbbrev = getTeamAbbrev(game.home_team_name, "NBA");
  const visitorAbbrev = getTeamAbbrev(game.visitor_team_name, "NBA");

  // Check for key injuries
  const keyInjuries = injuries.filter((i) =>
    i.players.some((p) => p.status.toLowerCase() === "out")
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card className="bg-card border-terminal-cyan/30 hover:border-terminal-cyan/60 transition-all h-full">
        <CardContent className="p-4">
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              {formatGameTime(game.date)}
            </span>
            {getStatusBadge(game.status)}
          </div>

          {/* Matchup - Visitor @ Home format (standard convention) */}
          <div className="font-mono text-base text-foreground mb-4">
            <div className="flex items-center gap-2">
              <TeamLogo sport="NBA" name={game.visitor_team_name} size={22} />
              <span className="font-bold">{game.visitor_team_name}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-terminal-cyan text-xs ml-7">@</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <TeamLogo sport="NBA" name={game.home_team_name} size={22} />
              <span className="font-bold">{game.home_team_name}</span>
            </div>
          </div>

          {/* Odds Section */}
          {odds ? (
            <div className="bg-terminal-green/5 border border-terminal-green/20 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-3 h-3 text-terminal-green" />
                <span className="font-mono text-[10px] text-terminal-green uppercase tracking-wider">
                  DraftKings Odds
                </span>
              </div>

              <div className="space-y-2 font-mono text-xs">
                {/* Spread */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">SPREAD:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-foreground">
                      {odds.spread_value !== null ? (
                        <>
                          {homeAbbrev} {formatLine(odds.spread_value)}{" "}
                          <span className="text-terminal-green">({formatPrice(odds.spread_odds)})</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </span>
                    {lineMovement && Math.abs(lineMovement.spreadChange) >= 0.5 && (
                      <span className={`flex items-center ${lineMovement.spreadChange > 0 ? "text-terminal-green" : "text-terminal-amber"}`}>
                        {lineMovement.spreadChange > 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Moneyline */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">ML:</span>
                  <span className="text-foreground">
                    {odds.moneyline_home !== null || odds.moneyline_away !== null ? (
                      <>
                        {homeAbbrev}{" "}
                        <span className="text-terminal-green">{formatPrice(odds.moneyline_home)}</span>
                        <span className="text-muted-foreground mx-1">|</span>
                        {visitorAbbrev}{" "}
                        <span className="text-terminal-amber">{formatPrice(odds.moneyline_away)}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </span>
                </div>

                {/* Total */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">TOTAL:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-foreground">
                      {odds.total_value !== null ? (
                        <>
                          O/U <span className="text-terminal-amber">{odds.total_value}</span>
                          <span className="text-muted-foreground ml-1">
                            ({formatPrice(odds.total_over_odds)}/{formatPrice(odds.total_under_odds)})
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </span>
                    {lineMovement && Math.abs(lineMovement.totalChange) >= 0.5 && (
                      <span className={`flex items-center ${lineMovement.totalChange > 0 ? "text-terminal-green" : "text-terminal-amber"}`}>
                        {lineMovement.totalChange > 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground italic mb-3">*odds pending</p>
          )}

          {/* Key Injuries Alert */}
          {keyInjuries.length > 0 && (
            <div className="bg-terminal-amber/10 border border-terminal-amber/30 rounded-lg p-2 mb-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 text-terminal-amber mt-0.5 flex-shrink-0" />
                <div className="text-[10px] font-mono">
                  <span className="text-terminal-amber font-bold">Key Injuries:</span>
                  <div className="text-muted-foreground mt-0.5">
                    {keyInjuries.map((injury, idx) => (
                      <div key={idx}>
                        • {getTeamAbbrev(injury.team, "NBA")}:{" "}
                        {injury.players
                          .filter((p) => p.status.toLowerCase() === "out")
                          .map((p) => p.name)
                          .join(", ")}{" "}
                        <span className="text-terminal-amber">(Out)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Public Betting Preview */}
          <PublicBettingPreview
            homeTeam={game.home_team_name}
            awayTeam={game.visitor_team_name}
            gameId={game.id}
            sport="NBA"
          />

          {/* Top Props Preview */}
          <GamePropsPreview
            gameId={game.id}
            homeTeam={game.home_team_name}
            awayTeam={game.visitor_team_name}
          />

          {/* Action Buttons */}
          <div className="flex gap-2 mt-2">
            <Button
              onClick={(e) => onViewOdds(game, e)}
              className="flex-1 bg-terminal-cyan/20 hover:bg-terminal-cyan/30 text-terminal-cyan border border-terminal-cyan/50 font-mono text-xs"
              variant="outline"
              size="sm"
            >
              <TrendingUp className="w-3 h-3 mr-1" />
              View All Odds
            </Button>
            <Button
              onClick={() => onViewPreview(game)}
              className="flex-1 bg-muted/50 hover:bg-muted text-foreground border border-border font-mono text-xs"
              variant="outline"
              size="sm"
            >
              <Info className="w-3 h-3 mr-1" />
              Game Preview
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
