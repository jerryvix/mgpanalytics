import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, Signal, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";

interface Game {
  id: string;
  home_team_name: string;
  visitor_team_name: string;
  status: string;
  date: string;
  season: number;
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

const SPORTSBOOKS = ["draftkings", "fanduel", "caesars", "betrivers"];
const SPORTSBOOK_LABELS: Record<string, string> = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  caesars: "Caesars",
  betrivers: "BetRivers",
};

export function NBASlate() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [allOdds, setAllOdds] = useState<Odd[]>([]);
  const [oddsLoading, setOddsLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [gameOddsMap, setGameOddsMap] = useState<GameOddsMap>({});

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    setLoading(true);

    // Fetch all NBA games
    const { data: gamesData, error: gamesError } = await supabase
      .from("nba_games")
      .select("*")
      .order("date", { ascending: true });

    if (gamesError) {
      console.error("Error fetching NBA games:", gamesError);
      setLoading(false);
      return;
    }

    // Filter out completed games
    const upcomingGames = (gamesData || []).filter(
      (game) => !game.status.toLowerCase().startsWith("final")
    );
    console.log("All NBA games:", gamesData);
    console.log("Upcoming NBA games (non-Final):", upcomingGames);
    setGames(upcomingGames);

    // Fetch DraftKings odds for all upcoming games to display on cards
    if (upcomingGames.length > 0) {
      const gameIds = upcomingGames.map((g) => g.id);
      const { data: oddsData, error: oddsError } = await supabase
        .from("nba_odds")
        .select("*")
        .in("game_id", gameIds)
        .ilike("sportsbook", "%draftkings%");

      if (oddsError) {
        console.error("Error fetching DraftKings odds:", oddsError);
      } else {
        // Create map of game_id -> DraftKings odds
        const oddsMap: GameOddsMap = {};
        (oddsData || []).forEach((odd) => {
          oddsMap[odd.game_id] = odd;
        });
        setGameOddsMap(oddsMap);
        console.log("NBA DraftKings odds map:", oddsMap);
      }
    }

    setLoading(false);
  };

  const handleViewAllOdds = async (game: Game, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedGame(game);
    setSheetOpen(true);
    setOddsLoading(true);
    setAllOdds([]);

    // Fetch ALL sportsbooks for this game
    const { data, error } = await supabase
      .from("nba_odds")
      .select("*")
      .eq("game_id", game.id)
      .in("sportsbook", SPORTSBOOKS);

    if (error) {
      console.error("Error fetching all odds:", error);
    } else {
      console.log("All NBA odds for game:", data);
      setAllOdds(data || []);
    }
    setOddsLoading(false);
  };

  const formatGameTime = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      return format(date, "MMM d, h:mm a");
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

  const getOddsBySportsbook = (sportsbook: string): Odd | undefined => {
    return allOdds.find((o) => o.sportsbook.toLowerCase().includes(sportsbook));
  };

  const scheduledGamesCount = games.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-wide font-mono">
            NBA SLATE
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            Upcoming Games with Live Odds
          </p>
        </div>
        <Badge variant="outline" className="border-terminal-cyan text-terminal-cyan font-mono">
          {scheduledGamesCount} UPCOMING
        </Badge>
      </motion.div>

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-terminal-cyan" />
          <span className="ml-2 font-mono text-muted-foreground">LOADING FEED...</span>
        </div>
      ) : games.length === 0 ? (
        <Card className="bg-card border-terminal-cyan/30">
          <CardContent className="py-12 text-center font-mono">
            <Signal className="w-8 h-8 mx-auto mb-4 text-terminal-amber" />
            <p className="text-muted-foreground">No upcoming NBA games scheduled</p>
            <p className="text-xs text-muted-foreground mt-1">Check back later for new matchups</p>
          </CardContent>
        </Card>
      ) : (
        /* Games Grid */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {games.map((game, index) => {
            const dkOdds = gameOddsMap[game.id];

            return (
              <motion.div
                key={game.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="bg-card border-terminal-cyan/30 hover:border-terminal-cyan/60 transition-all">
                  <CardContent className="p-4">
                    {/* Header row */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                        {formatGameTime(game.date)}
                      </span>
                      {getStatusBadge(game.status)}
                    </div>

                    {/* Matchup */}
                    <div className="font-mono text-base text-foreground mb-4">
                      <span className="font-bold">{game.home_team_name}</span>
                      <span className="text-terminal-cyan mx-2">vs</span>
                      <span className="font-bold">{game.visitor_team_name}</span>
                    </div>

                    {/* DraftKings Odds Section */}
                    {dkOdds ? (
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
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground italic mb-3">*odds pending</p>
                    )}

                    {/* View All Odds Button */}
                    <Button
                      onClick={(e) => handleViewAllOdds(game, e)}
                      className="w-full bg-terminal-cyan/20 hover:bg-terminal-cyan/30 text-terminal-cyan border border-terminal-cyan/50 font-mono text-sm"
                      variant="outline"
                    >
                      <TrendingUp className="w-4 h-4 mr-2" />
                      View All Odds
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* All Sportsbooks Odds Panel */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="bg-background border-l border-terminal-cyan/30 w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="flex flex-row items-center justify-between pb-4 border-b border-terminal-cyan/20">
            <SheetTitle className="font-mono text-foreground">
              {selectedGame && (
                <div>
                  <span className="text-lg">
                    {selectedGame.home_team_name} vs {selectedGame.visitor_team_name}
                  </span>
                  <p className="text-xs text-muted-foreground font-normal mt-1">
                    {formatGameTime(selectedGame.date)}
                  </p>
                </div>
              )}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {oddsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-terminal-cyan" />
                <span className="ml-2 font-mono text-sm text-muted-foreground">
                  FETCHING ALL ODDS...
                </span>
              </div>
            ) : allOdds.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-6 text-center">*odds not yet available</p>
            ) : (
              /* Sportsbook sections */
              SPORTSBOOKS.map((sportsbook) => {
                const odds = getOddsBySportsbook(sportsbook);

                return (
                  <div key={sportsbook} className="border border-terminal-cyan/20 rounded-lg overflow-hidden">
                    {/* Sportsbook Header */}
                    <div className="bg-terminal-cyan/10 px-4 py-2 border-b border-terminal-cyan/20">
                      <span className="font-mono text-sm font-bold text-terminal-cyan">
                        {SPORTSBOOK_LABELS[sportsbook]}
                      </span>
                    </div>

                    <div className="p-4 space-y-4 bg-card">
                      {odds ? (
                        <>
                          {/* Spread */}
                          <div>
                            <h4 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                              Spread
                            </h4>
                            <div className="font-mono text-sm">
                              {odds.spread_value !== null ? (
                                <div className="flex justify-between items-center">
                                  <span>
                                    {selectedGame?.home_team_name}{" "}
                                    <span className="text-terminal-amber">{formatLine(odds.spread_value)}</span>
                                    <span className="text-muted-foreground ml-1">({formatPrice(odds.spread_odds)})</span>
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">N/A</span>
                              )}
                            </div>
                          </div>

                          {/* Moneyline */}
                          <div>
                            <h4 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                              Moneyline
                            </h4>
                            <div className="font-mono text-sm">
                              {odds.moneyline_home !== null || odds.moneyline_away !== null ? (
                                <div className="flex justify-between items-center gap-4">
                                  <span>
                                    {selectedGame?.home_team_name}{" "}
                                    <span className="text-terminal-green">{formatPrice(odds.moneyline_home)}</span>
                                  </span>
                                  <span className="text-terminal-cyan/50">|</span>
                                  <span>
                                    {selectedGame?.visitor_team_name}{" "}
                                    <span className="text-terminal-amber">{formatPrice(odds.moneyline_away)}</span>
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">N/A</span>
                              )}
                            </div>
                          </div>

                          {/* Total */}
                          <div>
                            <h4 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                              Total
                            </h4>
                            <div className="font-mono text-sm">
                              {odds.total_value !== null ? (
                                <div className="flex justify-between items-center">
                                  <span>
                                    O/U <span className="text-terminal-amber">{odds.total_value}</span>
                                  </span>
                                  <span>
                                    Over <span className="text-terminal-green">{formatPrice(odds.total_over_odds)}</span>
                                    <span className="text-muted-foreground mx-1">|</span>
                                    Under <span className="text-terminal-amber">{formatPrice(odds.total_under_odds)}</span>
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">N/A</span>
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground font-mono">
                          No odds available from this sportsbook
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
