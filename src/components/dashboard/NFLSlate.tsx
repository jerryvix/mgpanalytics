import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, Signal, TrendingUp, X } from "lucide-react";
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
  market_type: string;
  line: number;
  price: number;
}

interface GroupedOdds {
  spread: { home: Odd | null; away: Odd | null };
  moneyline: { home: Odd | null; away: Odd | null };
  total: { over: Odd | null; under: Odd | null };
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

  const groupOdds = (odds: Odd[], game: Game): GroupedOdds => {
    const grouped: GroupedOdds = {
      spread: { home: null, away: null },
      moneyline: { home: null, away: null },
      total: { over: null, under: null },
    };

    odds.forEach((odd) => {
      const marketType = odd.market_type.toLowerCase();
      
      if (marketType.includes("spread")) {
        if (odd.line < 0) {
          grouped.spread.home = odd;
        } else {
          grouped.spread.away = odd;
        }
      } else if (marketType.includes("moneyline") || marketType === "ml") {
        if (odd.price < 0 || (grouped.moneyline.home === null && !grouped.moneyline.away)) {
          grouped.moneyline.home = odd;
        } else {
          grouped.moneyline.away = odd;
        }
      } else if (marketType.includes("total") || marketType.includes("over") || marketType.includes("under")) {
        if (marketType.includes("over") || (grouped.total.over === null && !marketType.includes("under"))) {
          grouped.total.over = odd;
        } else {
          grouped.total.under = odd;
        }
      }
    });

    return grouped;
  };

  const formatPrice = (price: number) => {
    return price >= 0 ? `+${price}` : `${price}`;
  };

  const formatLine = (line: number) => {
    return line >= 0 ? `+${line}` : `${line}`;
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
            ) : odds.length === 0 ? (
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

                {(() => {
                  const grouped = groupOdds(odds, selectedGame!);
                  return (
                    <div className="space-y-6">
                      {/* Spread */}
                      <div className="space-y-2">
                        <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                          Spread
                        </h3>
                        <div className="bg-card border border-terminal-green/20 rounded-lg p-4">
                          {grouped.spread.home || grouped.spread.away ? (
                            <div className="font-mono text-sm flex justify-between items-center">
                              <span className="text-foreground">
                                {selectedGame?.home_team_name}{" "}
                                <span className="text-terminal-amber">
                                  {grouped.spread.home ? formatLine(grouped.spread.home.line) : "—"}
                                </span>
                                <span className="text-muted-foreground ml-1">
                                  ({grouped.spread.home ? formatPrice(grouped.spread.home.price) : "—"})
                                </span>
                              </span>
                              <span className="text-terminal-green mx-2">|</span>
                              <span className="text-foreground">
                                {selectedGame?.visitor_team_name}{" "}
                                <span className="text-terminal-amber">
                                  {grouped.spread.away ? formatLine(grouped.spread.away.line) : "—"}
                                </span>
                                <span className="text-muted-foreground ml-1">
                                  ({grouped.spread.away ? formatPrice(grouped.spread.away.price) : "—"})
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
                          {grouped.moneyline.home || grouped.moneyline.away ? (
                            <div className="font-mono text-sm flex justify-between items-center">
                              <span className="text-foreground">
                                {selectedGame?.home_team_name}{" "}
                                <span className={grouped.moneyline.home && grouped.moneyline.home.price < 0 ? "text-terminal-green" : "text-terminal-amber"}>
                                  {grouped.moneyline.home ? formatPrice(grouped.moneyline.home.price) : "—"}
                                </span>
                              </span>
                              <span className="text-terminal-green mx-2">|</span>
                              <span className="text-foreground">
                                {selectedGame?.visitor_team_name}{" "}
                                <span className={grouped.moneyline.away && grouped.moneyline.away.price > 0 ? "text-terminal-amber" : "text-terminal-green"}>
                                  {grouped.moneyline.away ? formatPrice(grouped.moneyline.away.price) : "—"}
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
                          {grouped.total.over || grouped.total.under ? (
                            <div className="font-mono text-sm flex justify-between items-center">
                              <span className="text-foreground">
                                <span className="text-terminal-amber">
                                  {grouped.total.over ? grouped.total.over.line : "—"}
                                </span>{" "}
                                Over{" "}
                                <span className="text-muted-foreground">
                                  ({grouped.total.over ? formatPrice(grouped.total.over.price) : "—"})
                                </span>
                              </span>
                              <span className="text-terminal-green mx-2">/</span>
                              <span className="text-foreground">
                                Under{" "}
                                <span className="text-muted-foreground">
                                  ({grouped.total.under ? formatPrice(grouped.total.under.price) : "—"})
                                </span>
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">Not available</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
