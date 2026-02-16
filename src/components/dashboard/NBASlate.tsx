import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, Signal, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, isAfter, isBefore, addHours, getHours } from "date-fns";
import { NBAGameCard, GamePreviewModal, NBASlateFilters, SortOption, FilterOption } from "@/components/nba";

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

const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function NBASlate() {
  const [games, setGames] = useState<Game[]>([]);
  const [allGames, setAllGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [previewGame, setPreviewGame] = useState<Game | null>(null);
  const [allOdds, setAllOdds] = useState<Odd[]>([]);
  const [oddsLoading, setOddsLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [gameOddsMap, setGameOddsMap] = useState<GameOddsMap>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Filter/Sort state
  const [sortBy, setSortBy] = useState<SortOption>("time");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");
  const [showCompleted, setShowCompleted] = useState(false);

  const fetchGames = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    const now = new Date();
    const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // Fetch NBA games within 48-hour window
    const { data: gamesData, error: gamesError } = await supabase
      .from("nba_games")
      .select("*")
      .gte("date", now.toISOString())
      .lte("date", in48Hours.toISOString())
      .order("date", { ascending: true });

    if (gamesError) {
      console.error("Error fetching NBA games:", gamesError);
      setLoading(false);
      setIsRefreshing(false);
      return;
    }

    const allFetchedGames = (gamesData || []) as unknown as Game[];
    setAllGames(allFetchedGames);
    console.log("NBA games in 48h window:", allFetchedGames.length);

    // Fetch DraftKings odds for all games
    if (allFetchedGames.length > 0) {
      const gameIds = allFetchedGames.map((g) => g.id);
      const { data: oddsData, error: oddsError } = await supabase
        .from("nba_odds")
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

    setLastUpdated(new Date());
    setLoading(false);
    setIsRefreshing(false);
  }, []);

  // Apply filters and sorting
  useEffect(() => {
    let filteredGames = [...allGames];

    // Filter by completion status
    if (!showCompleted) {
      filteredGames = filteredGames.filter(
        (game) => !game.status.toLowerCase().startsWith("final")
      );
    }

    // Apply filter type
    switch (filterBy) {
      case "primetime":
        // Primetime = games after 7 PM local time
        filteredGames = filteredGames.filter((game) => {
          const gameDate = parseISO(game.date);
          const hour = getHours(gameDate);
          return hour >= 19 || hour < 2; // 7 PM - 2 AM
        });
        break;
      case "close":
        // Close spreads = games with spread < 5
        filteredGames = filteredGames.filter((game) => {
          const odds = gameOddsMap[game.id];
          return odds && odds.spread_value !== null && Math.abs(odds.spread_value) < 5;
        });
        break;
    }

    // Apply sorting
    switch (sortBy) {
      case "time":
        filteredGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        break;
      case "spread":
        filteredGames.sort((a, b) => {
          const spreadA = Math.abs(gameOddsMap[a.id]?.spread_value ?? 999);
          const spreadB = Math.abs(gameOddsMap[b.id]?.spread_value ?? 999);
          return spreadA - spreadB;
        });
        break;
      case "total":
        filteredGames.sort((a, b) => {
          const totalA = gameOddsMap[a.id]?.total_value ?? 0;
          const totalB = gameOddsMap[b.id]?.total_value ?? 0;
          return totalB - totalA; // Higher totals first
        });
        break;
    }

    setGames(filteredGames);
  }, [allGames, gameOddsMap, sortBy, filterBy, showCompleted]);

  // Initial fetch
  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      fetchGames(true);
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchGames]);

  const handleViewAllOdds = async (game: Game, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedGame(game);
    setSheetOpen(true);
    setOddsLoading(true);
    setAllOdds([]);

    const { data, error } = await supabase
      .from("nba_odds")
      .select("*")
      .eq("game_id", game.id)
      .in("sportsbook", SPORTSBOOKS);

    if (error) {
      console.error("Error fetching all odds:", error);
    } else {
      setAllOdds(data || []);
    }
    setOddsLoading(false);
  };

  const handleViewPreview = (game: Game) => {
    setPreviewGame(game);
    setPreviewOpen(true);
  };

  const formatGameTime = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      return format(date, "MMM d, h:mm a");
    } catch {
      return dateString;
    }
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

  return (
    <div className="space-y-6">
      {/* Header with Filters */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <NBASlateFilters
          gamesCount={games.length}
          sortBy={sortBy}
          onSortChange={setSortBy}
          filterBy={filterBy}
          onFilterChange={setFilterBy}
          showCompleted={showCompleted}
          onShowCompletedChange={setShowCompleted}
          lastUpdated={lastUpdated}
          onRefresh={() => fetchGames(true)}
          isRefreshing={isRefreshing}
        />
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
            <p className="text-foreground">No games match your filters</p>
            <p className="text-xs text-muted-foreground mt-2">
              {allGames.length > 0 
                ? "Try adjusting your filter settings" 
                : "Check back later for new matchups"}
            </p>
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
          {games.map((game, index) => (
            <NBAGameCard
              key={game.id}
              game={game}
              odds={gameOddsMap[game.id] || null}
              index={index}
              onViewOdds={handleViewAllOdds}
              onViewPreview={handleViewPreview}
            />
          ))}
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
                    {selectedGame.visitor_team_name} @ {selectedGame.home_team_name}
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
              SPORTSBOOKS.map((sportsbook) => {
                const odds = getOddsBySportsbook(sportsbook);

                return (
                  <div key={sportsbook} className="border border-terminal-cyan/20 rounded-lg overflow-hidden">
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

      {/* Game Preview Modal */}
      <GamePreviewModal
        game={previewGame}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </div>
  );
}
