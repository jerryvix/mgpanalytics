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
  id: number;
  home_team_name: string;
  visitor_team_name: string;
  status: string;
  date: string;
  league: string;
}

interface Odd {
  id: string;
  game_id: number;
  sportsbook: string;
  spread_value: number | null;
  spread_odds: number | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
  total_value: number | null;
  total_over_odds: number | null;
  total_under_odds: number | null;
}

export function NFLSlate() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [odds, setOdds] = useState<Odd[]>([]);
  const [oddsLoading, setOddsLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    setLoading(true);
    // Fetch all NFL games, then filter out completed ones client-side
    // Status values vary: "Final", "Final/OT", or scheduled times like "1/17 - 4:30 PM EST"
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .eq("league", "NFL")
      .order("date", { ascending: true });

    if (error) {
      console.error("Error fetching games:", error);
    } else {
      // Filter out games that are completed (status starts with "Final")
      const upcomingGames = (data || []).filter(
        (game) => !game.status.toLowerCase().startsWith("final")
      );
      console.log("All NFL games:", data);
      console.log("Upcoming games (non-Final):", upcomingGames);
      setGames(upcomingGames);
    }
    setLoading(false);
  };

  const handleViewOdds = async (game: Game, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedGame(game);
    setSheetOpen(true);
    setOddsLoading(true);
    setOdds([]);

    const { data, error } = await supabase
      .from("odds")
      .select("*")
      .eq("game_id", game.id)
      .ilike("sportsbook", "%draftkings%");

    if (error) {
      console.error("Error fetching odds:", error);
    } else {
      setOdds(data || []);
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
    if (price === null) return "—";
    return price >= 0 ? `+${price}` : `${price}`;
  };

  const formatLine = (line: number | null) => {
    if (line === null) return "—";
    return line >= 0 ? `+${line}` : `${line}`;
  };

  const scheduledGamesCount = games.length;
  const dkOdds = odds.length > 0 ? odds[0] : null;

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
            NFL SLATE
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            Upcoming Games
          </p>
        </div>
        <Badge variant="outline" className="border-terminal-green text-terminal-green font-mono">
          {scheduledGamesCount} UPCOMING
        </Badge>
      </motion.div>

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-terminal-green" />
          <span className="ml-2 font-mono text-muted-foreground">LOADING FEED...</span>
        </div>
      ) : games.length === 0 ? (
        <Card className="bg-card border-terminal-green/30">
          <CardContent className="py-12 text-center font-mono">
            <Signal className="w-8 h-8 mx-auto mb-4 text-terminal-amber" />
            <p className="text-muted-foreground">No upcoming games scheduled</p>
            <p className="text-xs text-muted-foreground mt-1">Check back later for new matchups</p>
          </CardContent>
        </Card>
      ) : (
        /* Games Grid */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {games.map((game, index) => (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="bg-card border-terminal-green/30 hover:border-terminal-green/60 transition-all">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                      {formatGameTime(game.date)}
                    </span>
                    {getStatusBadge(game.status)}
                  </div>

                  <div className="font-mono text-lg text-foreground">
                    <span className="font-bold">{game.home_team_name}</span>
                    <span className="text-terminal-green mx-2">vs</span>
                    <span className="font-bold">{game.visitor_team_name}</span>
                  </div>

                  <div className="mt-4">
                    <Button
                      onClick={(e) => handleViewOdds(game, e)}
                      className="w-full bg-terminal-green/20 hover:bg-terminal-green/30 text-terminal-green border border-terminal-green/50 font-mono text-sm"
                      variant="outline"
                    >
                      <TrendingUp className="w-4 h-4 mr-2" />
                      View Odds
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* DraftKings Odds Side Panel */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="bg-background border-l border-terminal-green/30 w-full sm:max-w-lg">
          <SheetHeader className="flex flex-row items-center justify-between">
            <SheetTitle className="font-mono text-foreground">
              {selectedGame && (
                <span className="text-lg">
                  {selectedGame.home_team_name} vs {selectedGame.visitor_team_name}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-6">
            {oddsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-terminal-green" />
                <span className="ml-2 font-mono text-sm text-muted-foreground">
                  FETCHING DRAFTKINGS ODDS...
                </span>
              </div>
            ) : !dkOdds ? (
              <div className="border border-terminal-amber/30 rounded-lg p-6 bg-card">
                <div className="text-center font-mono">
                  <Signal className="w-8 h-8 mx-auto mb-4 text-terminal-amber" />
                  <p className="text-terminal-amber">DraftKings odds not available</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Odds data may not have been synced yet
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-2 pb-4 border-b border-terminal-green/20">
                  <Signal className="w-4 h-4 text-terminal-green" />
                  <span className="font-mono text-xs text-terminal-green tracking-wider uppercase">
                    DraftKings Odds
                  </span>
                </div>

                <div className="space-y-6">
                  {/* Spread */}
                  <div className="space-y-2">
                    <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                      Spread
                    </h3>
                    <div className="bg-card border border-terminal-green/20 rounded-lg p-4">
                      {dkOdds.spread_value !== null ? (
                        <div className="font-mono text-sm flex justify-between items-center">
                          <span className="text-foreground">
                            {selectedGame?.home_team_name}{" "}
                            <span className="text-terminal-amber">
                              {formatLine(dkOdds.spread_value)}
                            </span>
                            <span className="text-muted-foreground ml-1">
                              ({formatPrice(dkOdds.spread_odds)})
                            </span>
                          </span>
                          <span className="text-terminal-green mx-2">|</span>
                          <span className="text-foreground">
                            {selectedGame?.visitor_team_name}{" "}
                            <span className="text-terminal-amber">
                              {formatLine(dkOdds.spread_value ? -dkOdds.spread_value : null)}
                            </span>
                            <span className="text-muted-foreground ml-1">
                              ({formatPrice(dkOdds.spread_odds)})
                            </span>
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not available</span>
                      )}
                    </div>
                  </div>

                  {/* Moneyline */}
                  <div className="space-y-2">
                    <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                      Moneyline
                    </h3>
                    <div className="bg-card border border-terminal-green/20 rounded-lg p-4">
                      {dkOdds.moneyline_home !== null || dkOdds.moneyline_away !== null ? (
                        <div className="font-mono text-sm flex justify-between items-center">
                          <span className="text-foreground">
                            {selectedGame?.home_team_name}{" "}
                            <span className={dkOdds.moneyline_home && dkOdds.moneyline_home < 0 ? "text-terminal-green" : "text-terminal-amber"}>
                              {formatPrice(dkOdds.moneyline_home)}
                            </span>
                          </span>
                          <span className="text-terminal-green mx-2">|</span>
                          <span className="text-foreground">
                            {selectedGame?.visitor_team_name}{" "}
                            <span className={dkOdds.moneyline_away && dkOdds.moneyline_away > 0 ? "text-terminal-amber" : "text-terminal-green"}>
                              {formatPrice(dkOdds.moneyline_away)}
                            </span>
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not available</span>
                      )}
                    </div>
                  </div>

                  {/* Total */}
                  <div className="space-y-2">
                    <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                      Total
                    </h3>
                    <div className="bg-card border border-terminal-green/20 rounded-lg p-4">
                      {dkOdds.total_value !== null ? (
                        <div className="font-mono text-sm flex justify-between items-center">
                          <span className="text-foreground">
                            <span className="text-terminal-amber">
                              {dkOdds.total_value}
                            </span>{" "}
                            Over{" "}
                            <span className="text-muted-foreground">
                              ({formatPrice(dkOdds.total_over_odds)})
                            </span>
                          </span>
                          <span className="text-terminal-green mx-2">/</span>
                          <span className="text-foreground">
                            Under{" "}
                            <span className="text-muted-foreground">
                              ({formatPrice(dkOdds.total_under_odds)})
                            </span>
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not available</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
