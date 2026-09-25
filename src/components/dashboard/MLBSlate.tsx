import { useState, useEffect, useRef } from "react";
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
import { useMlbProbables } from "@/hooks/useMlbProbables";
import { isLiveStatus, isFinalStatus, isCalledOffStatus } from "@/lib/gameStatus";
import { findMatchupForGame } from "@/services/mlb/probablePitchers";
import { ProbablePitcherRow } from "@/components/mlb/ProbablePitcher";
import { nickname } from "@/lib/teamNames";
import { postedMlbOdds } from "@/lib/mlbRunLine";

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
  // Official probables with season + last-3-start lines, from MLB directly
  const { data: probables } = useMlbProbables();
  // The synced names only stand in while MLB's data is missing (loading or
  // unreachable); once it loads, an unannounced, unresolvable starter is TBD.
  const pitcherFallback = !probables;

  // "No upcoming games" is only true after a read that worked: a failed first
  // read shows an error with Retry, and while offline the slate says it is
  // waiting. Once a slate has loaded, a failed refresh keeps it on screen with
  // a small note instead of replacing it.
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [oddsFailed, setOddsFailed] = useState(false);
  const [offline, setOffline] = useState(typeof navigator !== "undefined" && navigator.onLine === false);
  const hasSlate = useRef(false);

  useEffect(() => {
    fetchGames();
    // Load again the moment the connection comes back
    const onOnline = () => {
      setOffline(false);
      fetchGames();
    };
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const fetchGames = async () => {
    // Skeleton only before the first good read; a refresh keeps the slate up
    if (!hasSlate.current) {
      setLoading(true);
      setLoadFailed(false);
    }
    // Reach back 5h so games currently in progress stay on the slate
    const windowStart = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const in48Hours = new Date(Date.now() + 48 * 60 * 60 * 1000);

    try {
      const { data: gamesData, error: gamesError } = await supabase
        .from("mlb_games")
        .select("*")
        .gte("date", windowStart.toISOString())
        .lte("date", in48Hours.toISOString())
        .order("date", { ascending: true });

      if (gamesError) throw new Error(gamesError.message);

      // Postponed and canceled games (and ones that left their date) are not upcoming
      const upcomingGames = (gamesData || []).filter((game) => !isFinalStatus(game.status) && !isCalledOffStatus(game.status));
      setGames(upcomingGames as unknown as Game[]);
      hasSlate.current = true;
      setLoadFailed(false);
      setRefreshFailed(false);

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
          setOddsFailed(true);
        } else {
          const oddsMap: GameOddsMap = {};
          (oddsData || []).forEach((odd) => {
            // A run line DraftKings hasn't posted (stored as 0, no price) reads N/A
            oddsMap[odd.game_id] = postedMlbOdds(odd);
          });
          setGameOddsMap(oddsMap);
          setOddsFailed(false);
        }
      }
    } catch (err) {
      console.error("Error fetching MLB games:", err);
      if (hasSlate.current) setRefreshFailed(true);
      else setLoadFailed(true);
    } finally {
      setLoading(false);
    }
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

      {/* A failed refresh keeps the last good slate; just say so */}
      {refreshFailed && !loadFailed && (
        <div
          className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground"
          role="status"
        >
          <Signal className="w-3.5 h-3.5 text-terminal-amber shrink-0" />
          <span>
            {offline ? "Offline. Showing the last loaded slate." : "Couldn't refresh. Showing the last loaded slate."}
          </span>
          {!offline && (
            <button onClick={() => fetchGames()} className="text-terminal-green hover:underline">
              Retry
            </button>
          )}
        </div>
      )}

      {/* Loading State - skeleton cards shaped like the real slate */}
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
      ) : loadFailed ? (
        <Card className="bg-card border-terminal-green/30">
          <CardContent className="py-12 text-center font-mono space-y-3" role={offline ? "status" : "alert"}>
            <Signal className="w-8 h-8 mx-auto text-terminal-amber" />
            {offline ? (
              <>
                <p className="text-foreground">Waiting for a connection…</p>
                <p className="text-xs text-muted-foreground">The slate loads as soon as you're back online.</p>
              </>
            ) : (
              <>
                <p className="text-foreground">Couldn't load today's games.</p>
                <p className="text-xs text-muted-foreground">Check your connection and try again.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchGames()}
                  className="font-mono"
                >
                  Retry
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : games.length === 0 ? (
        <Card className="bg-card border-terminal-green/30">
          <CardContent className="py-12 text-center font-mono">
            <Signal className="w-8 h-8 mx-auto mb-4 text-terminal-amber" />
            <p className="text-foreground">No upcoming games on the board right now.</p>
            <p className="text-xs text-muted-foreground mt-2">
              The next slate loads in as games are scheduled - during the season that's daily.
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
            const matchup = findMatchupForGame(probables, game);
            // Mid-series the live board can still hold last night's game between
            // the same two teams; the start time ties it to this card's game.
            const liveGame = live.getGame(game.visitor_team_name, game.home_team_name, { start: game.date });
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

                    {/* Matchup - away team first */}
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

                    {/* Probable starters - the matchup within the matchup. MLB's
                        announced starter wins; the synced name covers the gap
                        when MLB has not named one yet. Names only: the slate
                        stays light and the pitching lines live in Game
                        Insights, the Hit Streaks table and chat. */}
                    <div className="rounded-lg bg-muted/20 border border-border px-3 py-2 mb-3 space-y-1.5">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        Probable Starters
                      </div>
                      <ProbablePitcherRow
                        teamName={game.visitor_team_name}
                        line={matchup?.away}
                        fallbackName={pitcherFallback ? game.starting_pitcher_away : null}
                        showStats={false}
                      />
                      <ProbablePitcherRow
                        teamName={game.home_team_name}
                        line={matchup?.home}
                        fallbackName={pitcherFallback ? game.starting_pitcher_home : null}
                        showStats={false}
                      />
                    </div>

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
                                  {nickname(game.home_team_name)} {formatLine(dkOdds.spread_value)}{" "}
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
                                  {nickname(game.home_team_name)}{" "}
                                  <span className="text-terminal-green">{formatPrice(dkOdds.moneyline_home)}</span>
                                  <span className="text-muted-foreground mx-1">|</span>
                                  {nickname(game.visitor_team_name)}{" "}
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
                          {oddsFailed ? "Odds unavailable right now" : "Odds post closer to first pitch"}
                        </p>
                      )}
                    </div>

                    {/* Game Insights Button - same target as tapping the card */}
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenInsights(game);
                      }}
                      className="w-full h-11 md:h-10 bg-terminal-green/20 hover:bg-terminal-green/30 text-terminal-green border border-terminal-green/50 font-mono text-sm active:scale-[0.99]"
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

      {/* Game Insights panel - real synced data: consensus win prob, line
          movement, hot bats, verified angles, and the book-by-book board */}
      <GameInsightsSheet sport="MLB" game={selectedGame} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
