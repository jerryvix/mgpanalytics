import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Signal, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { WinProbBar } from "@/components/ui/WinProbBar";
import { Skeleton } from "@/components/ui/skeleton";
import { LiveBadge } from "@/components/ui/LiveBadge";
import { FollowButton } from "@/components/ui/FollowButton";
import { GameInsightsSheet } from "@/components/games/GameInsightsSheet";
import { useLiveScores } from "@/hooks/useLiveScores";
import { isLiveStatus, isFinalStatus } from "@/lib/gameStatus";

interface Game {
  id: string;
  home_team_name: string;
  visitor_team_name: string;
  status: string;
  date: string;
  venue: string | null;
  starting_pitcher_home: string | null;
  starting_pitcher_away: string | null;
}

interface Odd {
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

type GameOddsMap = Record<string, Odd | null>;

export function MLBSlate() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [gameOddsMap, setGameOddsMap] = useState<GameOddsMap>({});
  const live = useLiveScores("MLB");

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    setLoading(true);
    // Reach back 5h so games currently in progress stay on the slate
    const windowStart = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const in48Hours = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const { data: gamesData, error: gamesError } = await supabase
      .from("mlb_games")
      .select("*")
      .gte("date", windowStart.toISOString())
      .lte("date", in48Hours.toISOString())
      .order("date", { ascending: true });

    if (gamesError) {
      console.error("Error fetching MLB games:", gamesError);
      setLoading(false);
      return;
    }

    const upcomingGames = (gamesData || []).filter((game) => !isFinalStatus(game.status));
    setGames(upcomingGames as unknown as Game[]);

    // DraftKings odds for the slate cards
    const gameIds = upcomingGames.map((g) => g.id);
    if (gameIds.length > 0) {
      const { data: oddsData, error: oddsError } = await supabase
        .from("mlb_odds")
        .select("*")
        .in("game_id", gameIds)
        .ilike("sportsbook", "%draftkings%");

      if (oddsError) {
        console.error("Error fetching DraftKings odds:", oddsError);
      } else {
        const oddsMap: GameOddsMap = {};
        (oddsData || []).forEach((odd) => {
          oddsMap[odd.game_id] = odd;
        });
        setGameOddsMap(oddsMap);
      }
    }

    setLoading(false);
  };

  const handleOpenInsights = (game: Game) => {
    setSelectedGame(game);
    setSheetOpen(true);
  };

  const formatGameTime = (dateString: string) => {
    try {
      return format(parseISO(dateString), "MMM d, h:mm a");
    } catch {
      return dateString;
    }
  };

  const getStatusBadge = (status: string) => {
    if (isLiveStatus(status)) {
      return <LiveBadge />;
    }
    if (isFinalStatus(status)) {
      return (
        <Badge className="bg-muted text-muted-foreground border-border text-[10px] font-mono">
          FINAL
        </Badge>
      );
    }
    return (
      <Badge className="bg-terminal-green/10 text-terminal-green border-terminal-green/50 text-[10px] font-mono">
        UPCOMING
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-wide font-mono">MLB SLATE</h1>
          <p className="text-sm text-muted-foreground font-mono">
            Upcoming Games with Probable Starters and Live Odds
          </p>
        </div>
      </motion.div>

      {/* Loading State — skeleton cards shaped like the real slate */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="bg-card border-terminal-green/30">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : games.length === 0 ? (
        <Card className="bg-card border-terminal-green/30">
          <CardContent className="py-12 text-center font-mono">
            <Signal className="w-8 h-8 mx-auto mb-4 text-terminal-amber" />
            <p className="text-foreground">No upcoming games on the board right now.</p>
            <p className="text-xs text-muted-foreground mt-2">
              The next slate loads in as games are scheduled — during the season that's daily.
            </p>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {games.map((game, index) => {
            const dkOdds = gameOddsMap[game.id];
            const liveGame = live.getGame(game.visitor_team_name, game.home_team_name);
            const showScore = liveGame && liveGame.state !== "pre" && liveGame.awayScore !== null;

            return (
              <motion.div
                key={game.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
              >
                <Card
                  onClick={() => handleOpenInsights(game)}
                  role="button"
                  aria-label={`Game insights: ${game.visitor_team_name} at ${game.home_team_name}`}
                  className="cursor-pointer bg-gradient-to-b from-card to-card/70 border-terminal-green/30 hover:border-terminal-green/60 hover:shadow-[0_0_24px_-8px_hsl(var(--terminal-green)/0.4)] transition-all"
                >
                  <CardContent className="p-4">
                    {/* Header row */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                        {formatGameTime(game.date)}
                      </span>
                      {liveGame?.state === "in" ? (
                        <LiveBadge detail={liveGame.detail} />
                      ) : (
                        getStatusBadge(liveGame?.state === "post" ? "Final" : game.status)
                      )}
                    </div>

                    {/* Matchup — away team first */}
                    <div className="font-mono text-base text-foreground mb-3">
                      <div className="flex items-center gap-2">
                        <TeamLogo sport="MLB" name={game.visitor_team_name} size={22} />
                        <span className="font-bold">{game.visitor_team_name}</span>
                        <FollowButton
                          entity={{
                            entityType: "team",
                            entityKey: `MLB:${game.visitor_team_name}`,
                            entityLabel: game.visitor_team_name,
                            sport: "MLB",
                          }}
                        />
                        {showScore && (
                          <span className="ml-auto font-bold tabular-nums text-lg">{liveGame.awayScore}</span>
                        )}
                      </div>
                      <span className="text-terminal-green mx-2 text-sm">@</span>
                      <div className="flex items-center gap-2">
                        <TeamLogo sport="MLB" name={game.home_team_name} size={22} />
                        <span className="font-bold">{game.home_team_name}</span>
                        <FollowButton
                          entity={{
                            entityType: "team",
                            entityKey: `MLB:${game.home_team_name}`,
                            entityLabel: game.home_team_name,
                            sport: "MLB",
                          }}
                        />
                        {showScore && (
                          <span className="ml-auto font-bold tabular-nums text-lg">{liveGame.homeScore}</span>
                        )}
                      </div>
                    </div>

                    {/* Probable starters — the matchup within the matchup */}
                    {(game.starting_pitcher_away || game.starting_pitcher_home) && (
                      <div className="rounded-lg bg-muted/20 border border-border px-3 py-2 mb-3">
                        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">
                          Probable Starters
                        </div>
                        <div className="text-xs font-mono text-foreground">
                          ⚾ {game.starting_pitcher_away || "TBD"}
                          <span className="text-muted-foreground mx-1.5">vs</span>
                          {game.starting_pitcher_home || "TBD"}
                        </div>
                      </div>
                    )}

                    {game.venue && (
                      <p className="text-[10px] text-muted-foreground font-mono mb-3">📍 {game.venue}</p>
                    )}

                    {/* DraftKings Odds Section */}
                    <div className="bg-terminal-green/5 border border-terminal-green/20 rounded-lg p-3 mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-3 h-3 text-terminal-green" />
                        <span className="font-mono text-[10px] text-terminal-green uppercase tracking-wider">
                          DraftKings Odds
                        </span>
                      </div>

                      {dkOdds ? (
                        <div className="space-y-2 font-mono text-xs">
                          {/* Run line */}
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">RUN LINE:</span>
                            <span className="text-foreground">
                              {dkOdds.spread_value !== null ? (
                                <>
                                  {game.home_team_name.split(" ").pop()} {formatLine(dkOdds.spread_value)}{" "}
                                  <span className="text-terminal-green">({formatPrice(dkOdds.spread_odds)})</span>
                                </>
                              ) : (
                                <span className="text-muted-foreground">N/A</span>
                              )}
                            </span>
                          </div>

                          {/* Moneyline */}
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">ML:</span>
                            <span className="text-foreground">
                              {dkOdds.moneyline_home !== null || dkOdds.moneyline_away !== null ? (
                                <>
                                  {game.home_team_name.split(" ").pop()}{" "}
                                  <span className="text-terminal-green">{formatPrice(dkOdds.moneyline_home)}</span>
                                  <span className="text-muted-foreground mx-1">|</span>
                                  {game.visitor_team_name.split(" ").pop()}{" "}
                                  <span className="text-terminal-amber">{formatPrice(dkOdds.moneyline_away)}</span>
                                </>
                              ) : (
                                <span className="text-muted-foreground">N/A</span>
                              )}
                            </span>
                          </div>

                          {/* Implied win probability */}
                          <WinProbBar
                            homeName={game.home_team_name}
                            awayName={game.visitor_team_name}
                            moneylineHome={dkOdds.moneyline_home}
                            moneylineAway={dkOdds.moneyline_away}
                          />

                          {/* Total */}
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">TOTAL:</span>
                            <span className="text-foreground">
                              {dkOdds.total_value !== null ? (
                                <>
                                  <span className="text-terminal-amber">{dkOdds.total_value}</span>
                                  <span className="text-muted-foreground ml-1">
                                    O ({formatPrice(dkOdds.total_over_odds)}) / U ({formatPrice(dkOdds.total_under_odds)})
                                  </span>
                                </>
                              ) : (
                                <span className="text-muted-foreground">N/A</span>
                              )}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground font-mono">
                          Odds post closer to first pitch
                        </p>
                      )}
                    </div>

                    {/* Game Insights Button — same target as tapping the card */}
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenInsights(game);
                      }}
                      className="w-full bg-terminal-green/20 hover:bg-terminal-green/30 text-terminal-green border border-terminal-green/50 font-mono text-sm"
                      variant="outline"
                    >
                      <TrendingUp className="w-4 h-4 mr-2" />
                      Game Insights & Odds
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Game Insights panel — real synced data: consensus win prob, line
          movement, hot bats, verified angles, and the book-by-book board */}
      <GameInsightsSheet sport="MLB" game={selectedGame} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
