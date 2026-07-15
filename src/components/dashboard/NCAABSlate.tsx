import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, Signal, TrendingUp, Trophy, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { PublicBettingPreview } from "@/components/PublicBettingPreview";
import { OffseasonBanner } from "@/components/dashboard/OffseasonBanner";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { WinProbBar } from "@/components/ui/WinProbBar";
import { Skeleton } from "@/components/ui/skeleton";
import { LiveBadge } from "@/components/ui/LiveBadge";
import { useLiveScores } from "@/hooks/useLiveScores";
import { isLiveStatus, isFinalStatus } from "@/lib/gameStatus";

interface Game {
  id: string;
  home_team_name: string;
  visitor_team_name: string;
  status: string;
  date: string;
  home_team_rank: number | null;
  visitor_team_rank: number | null;
  is_featured: boolean;
  home_team_id: string | null;
  visitor_team_id: string | null;
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

export function NCAABSlate() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [allOdds, setAllOdds] = useState<Odd[]>([]);
  const [oddsLoading, setOddsLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [gameOddsMap, setGameOddsMap] = useState<GameOddsMap>({});
  const [hasRankedGames, setHasRankedGames] = useState(false);
  const live = useLiveScores("NCAAB");

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    setLoading(true);

    // Window: 4h back (keeps in-progress games visible) to 24h ahead
    const now = new Date();
    const windowStart = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Fetch NCAAB games
    const { data: gamesData, error: gamesError } = await supabase
      .from("ncaab_games")
      .select("*")
      .gte("date", windowStart.toISOString())
      .lte("date", in24Hours.toISOString())
      .order("date", { ascending: true });

    if (gamesError) {
      console.error("Error fetching NCAAB games:", gamesError);
      setLoading(false);
      return;
    }

    // Filter out completed games
    const upcomingGames = (gamesData || []).filter((game) => !isFinalStatus(game.status));

    // Check if we have ranked games
    const rankedGames = upcomingGames.filter(
      (g) => g.home_team_rank !== null || g.visitor_team_rank !== null
    );
    setHasRankedGames(rankedGames.length > 0);

    console.log("NCAAB games:", upcomingGames.length, "ranked:", rankedGames.length);
    setGames(upcomingGames as unknown as Game[]);

    // Fetch DraftKings odds for all games
    if (upcomingGames.length > 0) {
      const gameIds = upcomingGames.map((g) => g.id);
      const { data: oddsData, error: oddsError } = await supabase
        .from("ncaab_odds")
        .select("*")
        .in("game_id", gameIds)
        .ilike("sportsbook", "%draftkings%");

      if (oddsError) {
        console.error("Error fetching NCAAB odds:", oddsError);
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

  const handleViewAllOdds = async (game: Game, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedGame(game);
    setSheetOpen(true);
    setOddsLoading(true);
    setAllOdds([]);

    const { data, error } = await supabase
      .from("ncaab_odds")
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

  const formatGameTime = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      return format(date, "MMM d, h:mm a");
    } catch {
      return dateString;
    }
  };

  const getStatusBadge = (status: string, isRanked: boolean, isFeatured: boolean) => {
    if (isLiveStatus(status)) {
      return <LiveBadge />;
    }
    if (isRanked) {
      return (
        <Badge className="bg-terminal-amber/20 text-terminal-amber border-terminal-amber/50 text-[10px] font-mono">
          <Trophy className="w-3 h-3 mr-1" />
          RANKED
        </Badge>
      );
    }
    if (isFeatured) {
      return (
        <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/50 text-[10px] font-mono">
          <Star className="w-3 h-3 mr-1" />
          FEATURED
        </Badge>
      );
    }
    return (
      <Badge className="bg-terminal-amber/10 text-terminal-amber border-terminal-amber/50 text-[10px] font-mono">
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

  const formatRank = (rank: number | null) => {
    if (!rank || rank > 25) return null;
    return `#${rank}`;
  };

  const getOddsBySportsbook = (sportsbook: string): Odd | undefined => {
    return allOdds.find((o) => o.sportsbook.toLowerCase().includes(sportsbook));
  };

  const rankedGamesCount = games.filter(
    (g) => g.home_team_rank !== null || g.visitor_team_rank !== null
  ).length;

  return (
    <div className="space-y-6">
      <OffseasonBanner sport="NCAAB" />
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-wide font-mono">
            NCAAB SLATE
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            {hasRankedGames
              ? "AP Top 25 Matchups (Next 24 Hours)"
              : "Featured Matchups (Next 24 Hours)"}
          </p>
        </div>
        <Badge variant="outline" className="border-terminal-amber text-terminal-amber font-mono">
          {rankedGamesCount > 0 ? `${rankedGamesCount} RANKED` : `${games.length} GAMES`}
        </Badge>
      </motion.div>

      {/* Loading State — skeleton cards shaped like the real slate */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="bg-card border-terminal-amber/30">
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
        <Card className="bg-card border-terminal-amber/30">
          <CardContent className="py-12 text-center font-mono">
            <Signal className="w-8 h-8 mx-auto mb-4 text-terminal-amber" />
            <p className="text-foreground">No ranked matchups in the next 24 hours</p>
            <p className="text-xs text-muted-foreground mt-2">
              Check back later for AP Top 25 games
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Info banner for featured games */}
          {!hasRankedGames && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 font-mono text-sm"
            >
              <div className="flex items-center gap-2 text-purple-400">
                <Star className="w-4 h-4" />
                <span>No ranked matchups today — showing featured games</span>
              </div>
            </motion.div>
          )}

          {/* Games Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          >
            {games.map((game, index) => {
              const dkOdds = gameOddsMap[game.id];
              const isRanked =
                game.home_team_rank !== null || game.visitor_team_rank !== null;
              const liveGame = live.getGame(game.visitor_team_name, game.home_team_name);
              const showScore = liveGame && liveGame.state !== "pre" && liveGame.awayScore !== null;

              return (
                <motion.div
                  key={game.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="bg-gradient-to-b from-card to-card/70 border-terminal-amber/30 hover:border-terminal-amber/60 hover:shadow-[0_0_24px_-8px_hsl(var(--terminal-amber)/0.4)] transition-all">
                    <CardContent className="p-4">
                      {/* Header row */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                          {formatGameTime(game.date)}
                        </span>
                        {liveGame?.state === "in" ? (
                          <LiveBadge detail={liveGame.detail} />
                        ) : (
                          getStatusBadge(liveGame?.state === "post" ? "Final" : game.status, isRanked, game.is_featured)
                        )}
                      </div>

                      {/* Matchup with Rankings — away team first */}
                      <div className="font-mono text-base text-foreground mb-4">
                        <div className="flex items-center gap-2">
                          <TeamLogo sport="NCAAB" name={game.visitor_team_name} espnId={game.visitor_team_id} size={22} />
                          {formatRank(game.visitor_team_rank) && (
                            <Badge className="bg-terminal-amber text-background text-[10px] px-1.5 py-0">
                              {formatRank(game.visitor_team_rank)}
                            </Badge>
                          )}
                          <span className="font-bold">{game.visitor_team_name}</span>
                          {showScore && (
                            <span className="ml-auto font-bold tabular-nums text-lg">{liveGame.awayScore}</span>
                          )}
                        </div>
                        <span className="text-terminal-amber mx-2 text-sm">@</span>
                        <div className="flex items-center gap-2">
                          <TeamLogo sport="NCAAB" name={game.home_team_name} espnId={game.home_team_id} size={22} />
                          {formatRank(game.home_team_rank) && (
                            <Badge className="bg-terminal-amber text-background text-[10px] px-1.5 py-0">
                              {formatRank(game.home_team_rank)}
                            </Badge>
                          )}
                          <span className="font-bold">{game.home_team_name}</span>
                          {showScore && (
                            <span className="ml-auto font-bold tabular-nums text-lg">{liveGame.homeScore}</span>
                          )}
                        </div>
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
                                    {game.home_team_name.split(" ").pop()}{" "}
                                    {formatLine(dkOdds.spread_value)}{" "}
                                    <span className="text-terminal-green">
                                      ({formatPrice(dkOdds.spread_odds)})
                                    </span>
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
                                {dkOdds.moneyline_home !== null ||
                                dkOdds.moneyline_away !== null ? (
                                  <>
                                    {game.home_team_name.split(" ").pop()}{" "}
                                    <span className="text-terminal-green">
                                      {formatPrice(dkOdds.moneyline_home)}
                                    </span>
                                    <span className="text-muted-foreground mx-1">|</span>
                                    {game.visitor_team_name.split(" ").pop()}{" "}
                                    <span className="text-terminal-amber">
                                      {formatPrice(dkOdds.moneyline_away)}
                                    </span>
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
                                    <span className="text-terminal-amber">
                                      {dkOdds.total_value}
                                    </span>
                                    <span className="text-muted-foreground ml-1">
                                      O ({formatPrice(dkOdds.total_over_odds)}) / U (
                                      {formatPrice(dkOdds.total_under_odds)})
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
                        <p className="text-[10px] text-muted-foreground italic mb-3">
                          *odds pending
                        </p>
                      )}

                      {/* Public Betting Preview */}
                      <PublicBettingPreview
                        homeTeam={game.home_team_name}
                        awayTeam={game.visitor_team_name}
                        gameId={game.id}
                        sport="NCAAB"
                      />

                      {/* View All Odds Button */}
                      <Button
                        onClick={(e) => handleViewAllOdds(game, e)}
                        className="w-full bg-terminal-amber/20 hover:bg-terminal-amber/30 text-terminal-amber border border-terminal-amber/50 font-mono text-sm mt-2"
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
        </>
      )}

      {/* All Sportsbooks Odds Panel */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="bg-background/85 backdrop-blur-xl border-l border-terminal-amber/30 w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="flex flex-row items-center justify-between pb-4 border-b border-terminal-amber/20">
            <SheetTitle className="font-mono text-foreground">
              {selectedGame && (
                <div>
                  <div className="flex items-center gap-2 text-lg">
                    {formatRank(selectedGame.visitor_team_rank) && (
                      <Badge className="bg-terminal-amber text-background text-xs">
                        {formatRank(selectedGame.visitor_team_rank)}
                      </Badge>
                    )}
                    {selectedGame.visitor_team_name}
                    <span className="text-terminal-amber">@</span>
                    {formatRank(selectedGame.home_team_rank) && (
                      <Badge className="bg-terminal-amber text-background text-xs">
                        {formatRank(selectedGame.home_team_rank)}
                      </Badge>
                    )}
                    {selectedGame.home_team_name}
                  </div>
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
                <Loader2 className="w-5 h-5 animate-spin text-terminal-amber" />
                <span className="ml-2 font-mono text-sm text-muted-foreground">
                  FETCHING ALL ODDS...
                </span>
              </div>
            ) : allOdds.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-6 text-center">
                *odds not yet available
              </p>
            ) : (
              SPORTSBOOKS.map((sportsbook) => {
                const odds = getOddsBySportsbook(sportsbook);

                return (
                  <div
                    key={sportsbook}
                    className="border border-terminal-amber/20 rounded-lg overflow-hidden"
                  >
                    <div className="bg-terminal-amber/10 px-4 py-2 border-b border-terminal-amber/20">
                      <span className="font-mono text-sm font-bold text-terminal-amber">
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
                                    <span className="text-terminal-amber">
                                      {formatLine(odds.spread_value)}
                                    </span>
                                    <span className="text-muted-foreground ml-1">
                                      ({formatPrice(odds.spread_odds)})
                                    </span>
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
                              {odds.moneyline_home !== null ||
                              odds.moneyline_away !== null ? (
                                <div className="flex justify-between items-center gap-4">
                                  <span>
                                    {selectedGame?.home_team_name}{" "}
                                    <span className="text-terminal-green">
                                      {formatPrice(odds.moneyline_home)}
                                    </span>
                                  </span>
                                  <span className="text-terminal-amber/50">|</span>
                                  <span>
                                    {selectedGame?.visitor_team_name}{" "}
                                    <span className="text-terminal-amber">
                                      {formatPrice(odds.moneyline_away)}
                                    </span>
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
                                    O/U{" "}
                                    <span className="text-terminal-amber">
                                      {odds.total_value}
                                    </span>
                                  </span>
                                  <span>
                                    Over{" "}
                                    <span className="text-terminal-green">
                                      {formatPrice(odds.total_over_odds)}
                                    </span>
                                    <span className="text-muted-foreground mx-1">|</span>
                                    Under{" "}
                                    <span className="text-terminal-amber">
                                      {formatPrice(odds.total_under_odds)}
                                    </span>
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">N/A</span>
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          Odds not available
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
