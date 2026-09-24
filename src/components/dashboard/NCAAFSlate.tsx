import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Signal, TrendingUp, Trophy, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { PublicBettingPreview } from "@/components/PublicBettingPreview";
import { FollowButton } from "@/components/ui/FollowButton";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { WinProbBar } from "@/components/ui/WinProbBar";
import { Skeleton } from "@/components/ui/skeleton";
import { PropFuturesBoard } from "@/components/players/PropFuturesBoard";
import { GameInsightsSheet } from "@/components/games/GameInsightsSheet";
import { LiveBadge } from "@/components/ui/LiveBadge";
import { useLiveScores } from "@/hooks/useLiveScores";
import { useApPoll } from "@/hooks/useApPoll";
import { isLiveStatus, isFinalStatus } from "@/lib/gameStatus";
import { isTop25, slateRank } from "@/lib/apPoll";
import { tbdKickoffLabel } from "@/lib/kickoff";
import { fetchStoredLines, overlayStoredLines } from "@/lib/storedLines";

interface Game {
  id: string;
  home_team_name: string;
  visitor_team_name: string;
  home_team_id: string | null;
  visitor_team_id: string | null;
  status: string;
  date: string;
  venue: string | null;
  home_team_rank: number | null;
  visitor_team_rank: number | null;
  is_featured: boolean;
  season: number | null;
  updated_at: string | null;
  /** Kickoff not set by the networks yet: `date` is a midnight-ET placeholder. */
  time_tbd?: boolean | null;
}

const HOUR_MS = 60 * 60 * 1000;

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
  updated_at?: string | null;
}

type GameOddsMap = Record<string, Odd | null>;

export function NCAAFSlate() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [gameOddsMap, setGameOddsMap] = useState<GameOddsMap>({});
  const [pageView, setPageView] = useState<"games" | "futures">("games");
  const live = useLiveScores("NCAAF");
  const { poll } = useApPoll();

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    setLoading(true);
    // Reach back 5h so games currently in progress stay on the slate
    const windowStart = new Date(Date.now() - 5 * HOUR_MS);

    // The whole coming week, not the first 30 kickoffs: an FBS Saturday runs
    // 70 games deep, and a 30-game cap cut the slate off mid-afternoon, so the
    // night games (and the ranked teams in them) never appeared.
    const weekEnd = new Date(Date.now() + 7 * 24 * HOUR_MS);
    let { data: gamesData, error: gamesError } = await supabase
      .from("ncaaf_games")
      .select("*")
      .gte("date", windowStart.toISOString())
      .lt("date", weekEnd.toISOString())
      .order("date", { ascending: true })
      .limit(200);

    // Off weeks and the offseason: show the next 30 matchups however far out,
    // so the slate is never falsely empty on a non-gameday.
    if (!gamesError && !(gamesData || []).some((game) => !isFinalStatus(game.status))) {
      ({ data: gamesData, error: gamesError } = await supabase
        .from("ncaaf_games")
        .select("*")
        .gte("date", windowStart.toISOString())
        .order("date", { ascending: true })
        .limit(30));
    }

    if (gamesError) {
      console.error("Error fetching NCAAF games:", gamesError);
      setLoading(false);
      return;
    }

    const upcomingGames = (gamesData || []).filter((game) => !isFinalStatus(game.status));
    setGames(upcomingGames as unknown as Game[]);

    if (upcomingGames.length > 0) {
      const gameIds = upcomingGames.map((g) => g.id);
      const { data: oddsData } = await supabase
        .from("ncaaf_odds")
        .select("*")
        .in("game_id", gameIds)
        .ilike("sportsbook", "%draftkings%");
      // One DraftKings number per market across the app: each card takes the
      // line sync-betting-splits stores (betting_lines) unless the daily
      // ncaaf_odds row captured a different number after it, the same rule
      // as Game Insights > Market Pulse (lib/marketPulse chooseLine).
      const byGame = new Map<string, Odd>((oddsData || []).map((odd) => [odd.game_id, odd as Odd]));
      const merged = overlayStoredLines(byGame, await fetchStoredLines("NCAAF", gameIds), (id) => ({
        id: `betting_lines:${id}`,
        game_id: id,
        sportsbook: "draftkings",
      }) as Odd);
      setGameOddsMap(Object.fromEntries(merged));
    }

    setLoading(false);
  };

  const handleOpenInsights = (game: Game) => {
    setSelectedGame(game);
    setSheetOpen(true);
  };

  const formatGameDate = (dateString: string, timeTbd?: boolean | null) => {
    // No kickoff time yet: show ESPN's calendar day (set in Eastern time)
    // instead of printing the midnight placeholder as a real time.
    if (timeTbd) return tbdKickoffLabel(dateString);
    try {
      const date = parseISO(dateString);
      const days = differenceInCalendarDays(date, new Date());
      const time = format(date, "EEE MMM d, h:mm a");
      if (days <= 0) return `Today · ${format(date, "h:mm a")}`;
      if (days === 1) return `Tomorrow · ${format(date, "h:mm a")}`;
      return time;
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
  const formatRank = (rank: number | null) => (isTop25(rank) ? `#${rank}` : null);
  // Every game on the slate is upcoming or live, so each team carries its
  // CURRENT AP rank: the live poll, else the synced rank while it is fresh.
  const ranksFor = (game: Game) => ({
    away: slateRank({
      teamId: game.visitor_team_id,
      storedRank: game.visitor_team_rank,
      storedAt: game.updated_at,
      gameSeason: game.season,
      poll,
    }),
    home: slateRank({
      teamId: game.home_team_id,
      storedRank: game.home_team_rank,
      storedAt: game.updated_at,
      gameSeason: game.season,
      poll,
    }),
  });
  const rankedGamesCount = games.filter((g) => {
    const r = ranksFor(g);
    return r.home !== null || r.away !== null;
  }).length;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-wide font-mono">NCAAF SLATE</h1>
          <p className="text-sm text-muted-foreground font-mono">Upcoming College Football Matchups</p>
        </div>
        <Badge variant="outline" className="border-terminal-amber text-terminal-amber font-mono">
          {rankedGamesCount > 0 ? `${rankedGamesCount} RANKED` : `${games.length} GAMES`}
        </Badge>
      </motion.div>

      {/* Games | Futures view switch (Matchbetwin-style) */}
      <div className="flex gap-2">
        {(["games", "futures"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setPageView(v)}
            className={`font-mono text-xs uppercase tracking-wider px-4 py-2 rounded-md border transition-colors ${
              pageView === v
                ? "text-terminal-amber border-terminal-amber/50 bg-terminal-amber/10"
                : "text-muted-foreground border-border bg-card/50 hover:text-foreground"
            }`}
          >
            {v === "games" ? "Games" : "Futures"}
          </button>
        ))}
      </div>

      {pageView === "futures" ? (
        <PropFuturesBoard sport="NCAAF" view="team" />
      ) : (
      <>
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
            <p className="text-foreground">No upcoming matchups scheduled yet</p>
            <p className="text-xs text-muted-foreground mt-2">
              The schedule fills in as the season approaches - check back soon.
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
            const ranks = ranksFor(game);
            const isRanked = ranks.home !== null || ranks.away !== null;
            const liveGame = live.getGame(game.visitor_team_name, game.home_team_name, { start: game.date, timeTbd: game.time_tbd });
            const showScore = liveGame && liveGame.state !== "pre" && liveGame.awayScore !== null;
            return (
              <motion.div
                key={game.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index, 12) * 0.03 }}
              >
                <Card
                  onClick={() => handleOpenInsights(game)}
                  role="button"
                  aria-label={`Game insights: ${game.visitor_team_name} at ${game.home_team_name}`}
                  className="cursor-pointer bg-gradient-to-b from-card to-card/70 border-terminal-amber/30 hover:border-terminal-amber/60 hover:shadow-[0_0_24px_-8px_hsl(var(--terminal-amber)/0.4)] transition-all"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                        {formatGameDate(game.date, game.time_tbd)}
                      </span>
                      {liveGame?.state === "in" ? (
                        <LiveBadge detail={liveGame.detail} />
                      ) : (
                        // No FEATURED fallback: for NCAAF is_featured only ever
                        // meant "had a ranked team when synced", so on a stale
                        // row it flagged teams that have since dropped out.
                        getStatusBadge(liveGame?.state === "post" ? "Final" : game.status, isRanked, false)
                      )}
                    </div>

                    {/* Matchup - away team first */}
                    <div className="font-mono text-base text-foreground mb-4">
                      <div className="flex items-center gap-2">
                        <TeamLogo sport="NCAAF" name={game.visitor_team_name} espnId={game.visitor_team_id} size={22} />
                        {formatRank(ranks.away) && (
                          <Badge
                            className="bg-terminal-amber text-background text-[10px] px-1.5 py-0"
                            title="AP Top 25 rank"
                          >
                            {formatRank(ranks.away)}
                          </Badge>
                        )}
                        <span className="font-bold">{game.visitor_team_name}</span>
                        <FollowButton
                          entity={{
                            entityType: "team",
                            entityKey: `NCAAF:${game.visitor_team_name}`,
                            entityLabel: game.visitor_team_name,
                            sport: "NCAAF",
                          }}
                        />
                        {showScore && (
                          <span className="ml-auto font-bold tabular-nums text-lg">{liveGame.awayScore}</span>
                        )}
                      </div>
                      <span className="text-terminal-amber mx-2 text-sm">@</span>
                      <div className="flex items-center gap-2">
                        <TeamLogo sport="NCAAF" name={game.home_team_name} espnId={game.home_team_id} size={22} />
                        {formatRank(ranks.home) && (
                          <Badge
                            className="bg-terminal-amber text-background text-[10px] px-1.5 py-0"
                            title="AP Top 25 rank"
                          >
                            {formatRank(ranks.home)}
                          </Badge>
                        )}
                        <span className="font-bold">{game.home_team_name}</span>
                        <FollowButton
                          entity={{
                            entityType: "team",
                            entityKey: `NCAAF:${game.home_team_name}`,
                            entityLabel: game.home_team_name,
                            sport: "NCAAF",
                          }}
                        />
                        {showScore && (
                          <span className="ml-auto font-bold tabular-nums text-lg">{liveGame.homeScore}</span>
                        )}
                      </div>
                    </div>

                    {game.venue && (
                      <p className="text-[10px] text-muted-foreground font-mono mb-3">📍 {game.venue}</p>
                    )}

                    {dkOdds ? (
                      <div className="bg-terminal-green/5 border border-terminal-green/20 rounded-lg p-3 mb-3">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUp className="w-3 h-3 text-terminal-green" />
                          <span className="font-mono text-[10px] text-terminal-green uppercase tracking-wider">
                            DraftKings Odds
                          </span>
                        </div>
                        <div className="space-y-2 font-mono text-xs">
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

                          {/* Implied win probability */}
                          <WinProbBar
                            homeName={game.home_team_name}
                            awayName={game.visitor_team_name}
                            moneylineHome={dkOdds.moneyline_home}
                            moneylineAway={dkOdds.moneyline_away}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground italic mb-3">*odds post closer to kickoff</p>
                    )}

                    <PublicBettingPreview
                      homeTeam={game.home_team_name}
                      awayTeam={game.visitor_team_name}
                      gameId={game.id}
                      sport="NCAAF"
                      odds={dkOdds}
                    />

                    {/* Game Insights Button - same target as tapping the card */}
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenInsights(game);
                      }}
                      className="w-full h-11 md:h-10 bg-terminal-amber/20 hover:bg-terminal-amber/30 text-terminal-amber border border-terminal-amber/50 font-mono text-sm mt-2 active:scale-[0.99]"
                      variant="outline"
                    >
                      <TrendingUp className="w-4 h-4 mr-2" />
                      Game Insights
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
      </>
      )}

      {/* Game Insights panel - matchup intel, consensus win prob, line
          movement, verified angles, and the book-by-book board */}
      <GameInsightsSheet sport="NCAAF" game={selectedGame} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
