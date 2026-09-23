import { ArrowUpRight, ArrowDownRight, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { getTeamAbbrev } from "@/utils/teamAbbreviations";
import { useIsMobile } from "@/hooks/use-mobile";
import { Skeleton } from "@/components/ui/skeleton";

export interface TopGame {
  id: number | string;
  home_team_name: string;
  visitor_team_name: string;
  date: string;
  league: string;
  spread: number | null;
  spreadOdds: number | null;
  total: number | null;
  hasOdds: boolean;
  lineMove: number | null; // signed movement vs. open, when we have history
}

const SPORT_SLATE_PATH: Record<string, string> = {
  NFL: "/dashboard/nfl",
  NBA: "/dashboard/nba",
  NCAAB: "/dashboard/ncaab",
  NCAAF: "/dashboard/ncaaf",
  MLB: "/dashboard/mlb",
};

const formatLine = (value: number | null) => {
  if (value === null || value === undefined) return null;
  return value > 0 ? `+${value}` : String(value);
};

const formatGameTime = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

interface TodaysTopGamesProps {
  games: TopGame[];
  loading: boolean;
}

export function TodaysTopGames({ games, loading }: TodaysTopGamesProps) {
  const isMobile = useIsMobile();
  const dominantSport = games[0]?.league ?? "NFL";
  const seeAllPath = SPORT_SLATE_PATH[dominantSport] ?? "/dashboard/nfl";

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-mono text-[11px] text-foreground uppercase tracking-widest font-bold">
          Today's Top Games
        </h2>
        <Link
          to={seeAllPath}
          className="text-xs text-terminal-blue hover:text-terminal-blue/80 transition-colors inline-flex items-center gap-0.5"
        >
          See all
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : games.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {games.map((game) => {
            const homeAbbr = isMobile ? getTeamAbbrev(game.home_team_name, game.league) : game.home_team_name;
            const awayAbbr = isMobile ? getTeamAbbrev(game.visitor_team_name, game.league) : game.visitor_team_name;
            const showMove = game.lineMove !== null && Math.abs(game.lineMove) >= 0.5;

            return (
              <div
                key={`${game.league}-${game.id}`}
                className="bg-card border border-border rounded-lg p-3 hover:border-terminal-blue/40 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
                    {formatGameTime(game.date)} · {game.league}
                  </span>
                </div>

                <div className="space-y-1 mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <TeamLogo sport={game.league} name={game.visitor_team_name} size={16} />
                    <span className="text-sm text-foreground truncate">{awayAbbr}</span>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <TeamLogo sport={game.league} name={game.home_team_name} size={16} />
                    <span className="text-sm text-foreground truncate">{homeAbbr}</span>
                  </div>
                </div>

                {game.hasOdds ? (
                  <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-terminal-blue font-medium">
                        {getTeamAbbrev(game.home_team_name, game.league)} {formatLine(game.spread)}
                      </span>
                      {game.total !== null && (
                        <span className="text-muted-foreground">O/U {game.total}</span>
                      )}
                    </div>
                    {game.spreadOdds !== null && (
                      <span className="font-mono text-muted-foreground">{formatLine(game.spreadOdds)}</span>
                    )}
                  </div>
                ) : (
                  <div className="pt-2 border-t border-border/60 text-xs text-muted-foreground/60">
                    Odds not available
                  </div>
                )}

                {showMove && (
                  <div className="mt-1.5 flex items-center gap-1">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      Line move
                    </span>
                    <span
                      className={`inline-flex items-center gap-0.5 font-mono text-xs font-bold ${
                        (game.lineMove ?? 0) > 0 ? "text-terminal-green" : "text-destructive"
                      }`}
                    >
                      {(game.lineMove ?? 0) > 0 ? (
                        <ArrowUpRight className="w-3 h-3" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3" />
                      )}
                      {formatLine(Number((game.lineMove ?? 0).toFixed(1)))}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground px-4 py-3 bg-card/50 border border-border rounded-lg">
          No games in the next 48 hours.
        </p>
      )}
    </section>
  );
}
