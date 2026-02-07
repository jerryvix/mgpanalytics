import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, TrendingUp, Calendar, RefreshCw, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useChat } from "@/contexts/ChatContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Game {
  id: number | string;
  home_team_name: string;
  visitor_team_name: string;
  date: string;
  status: string;
  league: string;
}

interface OddsMovement {
  id: string;
  gameId: string;
  team: string;
  opponent: string;
  market: string;
  openValue: number | null;
  currentValue: number | null;
  movement: number | null;
  lastUpdated: string;
  sport: string;
  hasMovement: boolean;
}

interface GameWithOdds extends Game {
  spread?: number | null;
  total?: number | null;
  hasOdds: boolean;
}

const EXAMPLE_PROMPTS = [
  "What should I know about tonight's slate?",
  "What props have moved the most since open?",
  "Who are the biggest favorites this week?",
];

const getSportEmoji = (league?: string) => {
  if (!league) return "🏈";
  const l = league.toUpperCase();
  if (l.includes("NFL") || l.includes("NCAAF")) return "🏈";
  if (l.includes("NBA") || l.includes("NCAAB")) return "🏀";
  if (l.includes("MLB")) return "⚾";
  return "🏈";
};

const formatGameTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  if (diffHours < 0) return "Now";
  if (diffHours < 1) return `${Math.floor(diffMs / (1000 * 60))}m`;
  if (diffHours < 24) return `${diffHours}h`;
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
};

export function DashboardHome() {
  const [query, setQuery] = useState("");
  const { openWithQuery } = useChat();
  const [moneyFlows, setMoneyFlows] = useState<OddsMovement[]>([]);
  const [upcomingGames, setUpcomingGames] = useState<GameWithOdds[]>([]);
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      // Fetch NFL games in next 48 hours first, then extend to 7 days if empty
      let { data: nflGames } = await supabase
        .from("games")
        .select("*")
        .not("status", "ilike", "%final%")
        .gte("date", now.toISOString())
        .lte("date", in48Hours.toISOString())
        .order("date", { ascending: true })
        .limit(10);

      // If no NFL games in 48 hours, look ahead 7 days
      if (!nflGames?.length) {
        const { data: extendedNflGames } = await supabase
          .from("games")
          .select("*")
          .not("status", "ilike", "%final%")
          .gte("date", now.toISOString())
          .lte("date", in7Days.toISOString())
          .order("date", { ascending: true })
          .limit(10);
        nflGames = extendedNflGames;
      }

      // Fetch NBA games in next 48 hours first, then extend
      let { data: nbaGames } = await supabase
        .from("nba_games")
        .select("*")
        .not("status", "ilike", "%final%")
        .gte("date", now.toISOString())
        .lte("date", in48Hours.toISOString())
        .order("date", { ascending: true })
        .limit(10);

      if (!nbaGames?.length) {
        const { data: extendedNbaGames } = await supabase
          .from("nba_games")
          .select("*")
          .not("status", "ilike", "%final%")
          .gte("date", now.toISOString())
          .lte("date", in7Days.toISOString())
          .order("date", { ascending: true })
          .limit(10);
        nbaGames = extendedNbaGames;
      }

      // Fetch NCAAB games in next 48 hours
      let { data: ncaabGames } = await supabase
        .from("ncaab_games")
        .select("*")
        .not("status", "ilike", "%final%")
        .gte("date", now.toISOString())
        .lte("date", in48Hours.toISOString())
        .order("date", { ascending: true })
        .limit(10);

      if (!ncaabGames?.length) {
        const { data: extendedNcaabGames } = await supabase
          .from("ncaab_games")
          .select("*")
          .not("status", "ilike", "%final%")
          .gte("date", now.toISOString())
          .lte("date", in7Days.toISOString())
          .order("date", { ascending: true })
          .limit(10);
        ncaabGames = extendedNcaabGames;
      }

      // Fetch NFL odds for games
      const nflGameIds = nflGames?.map(g => g.id) || [];
      const { data: nflOdds } = nflGameIds.length > 0 
        ? await supabase
            .from("odds")
            .select("*")
            .in("game_id", nflGameIds)
            .eq("sportsbook", "draftkings")
        : { data: [] };

      // Fetch NBA odds
      const nbaGameIds = nbaGames?.map(g => g.id) || [];
      const { data: nbaOdds } = nbaGameIds.length > 0
        ? await supabase
            .from("nba_odds")
            .select("*")
            .in("game_id", nbaGameIds)
            .eq("sportsbook", "draftkings")
        : { data: [] };

      // Fetch NCAAB odds
      const ncaabGameIds = ncaabGames?.map(g => g.id) || [];
      const { data: ncaabOdds } = ncaabGameIds.length > 0
        ? await supabase
            .from("ncaab_odds")
            .select("*")
            .in("game_id", ncaabGameIds)
            .eq("sportsbook", "draftkings")
        : { data: [] };

      // Combine games with odds - mark which have odds
      const gamesWithOdds: GameWithOdds[] = [];
      
      nflGames?.forEach(game => {
        const odds = nflOdds?.find(o => o.game_id === game.id);
        gamesWithOdds.push({
          id: game.id,
          home_team_name: game.home_team_name,
          visitor_team_name: game.visitor_team_name,
          date: game.date,
          status: game.status,
          league: "NFL",
          spread: odds?.spread_value ?? null,
          total: odds?.total_value ?? null,
          hasOdds: !!odds,
        });
      });

      nbaGames?.forEach(game => {
        const odds = nbaOdds?.find(o => o.game_id === game.id);
        gamesWithOdds.push({
          id: game.id,
          home_team_name: game.home_team_name,
          visitor_team_name: game.visitor_team_name,
          date: game.date,
          status: game.status,
          league: "NBA",
          spread: odds?.spread_value ?? null,
          total: odds?.total_value ?? null,
          hasOdds: !!odds,
        });
      });

      ncaabGames?.forEach(game => {
        const odds = ncaabOdds?.find(o => o.game_id === game.id);
        gamesWithOdds.push({
          id: game.id,
          home_team_name: game.home_team_name,
          visitor_team_name: game.visitor_team_name,
          date: game.date,
          status: game.status,
          league: "NCAAB",
          spread: odds?.spread_value ?? null,
          total: odds?.total_value ?? null,
          hasOdds: !!odds,
        });
      });

      // Sort: games with odds first, then by date
      gamesWithOdds.sort((a, b) => {
        if (a.hasOdds && !b.hasOdds) return -1;
        if (!a.hasOdds && b.hasOdds) return 1;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });

      setUpcomingGames(gamesWithOdds.slice(0, 6));

      // Fetch Money Flows from odds_snapshots
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const allGameIds = [
        ...nflGameIds.map(id => String(id)), 
        ...nbaGameIds.map(id => String(id)),
        ...ncaabGameIds.map(id => String(id))
      ];
      
      const movements: OddsMovement[] = [];

      if (allGameIds.length > 0) {
        const { data: snapshots } = await supabase
          .from("odds_snapshots")
          .select("*")
          .in("game_id", allGameIds)
          .eq("market_type", "spread")
          .gte("pulled_at", sevenDaysAgo.toISOString())
          .order("pulled_at", { ascending: true });

        if (snapshots && snapshots.length > 0) {
          // Group snapshots by game_id
          const snapshotsByGame: Record<string, typeof snapshots> = {};
          snapshots.forEach(s => {
            if (!snapshotsByGame[s.game_id]) {
              snapshotsByGame[s.game_id] = [];
            }
            snapshotsByGame[s.game_id].push(s);
          });

          // Calculate movement for each game
          Object.entries(snapshotsByGame).forEach(([gameId, gameSnapshots]) => {
            if (gameSnapshots.length < 2) return;

            const openSnapshot = gameSnapshots[0];
            const currentSnapshot = gameSnapshots[gameSnapshots.length - 1];
            const movement = (currentSnapshot.line_value ?? 0) - (openSnapshot.line_value ?? 0);

            // Find the game details
            const nflGame = nflGames?.find(g => String(g.id) === gameId);
            const nbaGame = nbaGames?.find(g => String(g.id) === gameId);
            const game = nflGame || nbaGame;

            if (game && Math.abs(movement) >= 0.5) {
              movements.push({
                id: gameId,
                gameId: gameId,
                team: game.home_team_name,
                opponent: game.visitor_team_name,
                market: "spread",
                openValue: openSnapshot.line_value,
                currentValue: currentSnapshot.line_value,
                movement: movement,
                lastUpdated: new Date(currentSnapshot.pulled_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
                sport: nflGame ? "NFL" : "NBA",
                hasMovement: true,
              });
            }
          });
        }
      }

      // If no movements from snapshots, show current odds as "no movement yet"
      if (movements.length === 0) {
        gamesWithOdds.slice(0, 4).forEach(game => {
          if (game.spread !== null) {
            movements.push({
              id: String(game.id),
              gameId: String(game.id),
              team: game.home_team_name,
              opponent: game.visitor_team_name,
              market: "spread",
              openValue: game.spread,
              currentValue: game.spread,
              movement: null,
              lastUpdated: "now",
              sport: game.league,
              hasMovement: false,
            });
          }
        });
      }

      // Sort by absolute movement (biggest moves first)
      movements.sort((a, b) => Math.abs(b.movement || 0) - Math.abs(a.movement || 0));
      setMoneyFlows(movements.slice(0, 4));

      setLastRefresh(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchData();
      toast.success("Data refreshed");
    } catch (error) {
      toast.error("Failed to refresh data");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      openWithQuery(query.trim());
      setQuery("");
    }
  };

  const handleExampleClick = (prompt: string) => {
    openWithQuery(prompt);
  };

  const formatLine = (value: number | null) => {
    if (value === null || value === undefined) return "—";
    return value > 0 ? `+${value}` : String(value);
  };

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center justify-center px-0 py-4 md:px-4 md:py-20"
      >
        <h1 className="text-xl md:text-4xl font-semibold text-foreground text-center tracking-tight mb-4 md:mb-8">
          What's on your mind today?
        </h1>

        <form onSubmit={handleSubmit} className="w-full max-w-2xl mb-4 md:mb-6">
          <div className="relative">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask about any game, market, or move"
              className="h-12 md:h-16 text-sm md:text-lg px-4 pr-12 md:px-6 md:pr-14 bg-card border-border focus:border-primary rounded-xl"
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 md:h-10 md:w-10 bg-primary hover:bg-primary/90 rounded-lg"
            >
              <ArrowRight className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
          </div>
        </form>

        <div className="flex flex-col md:flex-row md:flex-wrap md:justify-center gap-2 md:gap-3 w-full max-w-2xl">
          {EXAMPLE_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleExampleClick(prompt)}
              className="px-3 py-2 text-xs md:text-sm text-muted-foreground bg-card/50 hover:bg-card hover:text-foreground border border-border hover:border-primary/50 rounded-lg transition-all text-left md:text-center"
            >
              {prompt}
            </button>
          ))}
        </div>
      </motion.section>

      {/* Below the Fold Sections */}
      <div className="border-t border-border px-0 md:px-4 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* Refresh Button */}
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh Data
          </Button>
        </div>

        {/* Money Flows Section */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="text-sm text-foreground uppercase tracking-wider font-medium">
                Money Flows
              </h2>
            </div>
            {lastRefresh && (
              <span className="text-xs text-muted-foreground">
                Last refreshed: {lastRefresh}
              </span>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-card/50 rounded animate-pulse" />
              ))}
            </div>
          ) : moneyFlows.length > 0 ? (
            <div className="space-y-2">
              {moneyFlows.map((flow) => (
                <div
                  key={flow.id}
                  className="flex items-center justify-between px-3 py-2.5 bg-card/50 border border-border rounded-lg text-sm gap-2"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="shrink-0">{getSportEmoji(flow.sport)}</span>
                    <span className="text-foreground font-medium truncate">{flow.team}</span>
                    <span className="text-muted-foreground shrink-0">vs</span>
                    <span className="text-muted-foreground truncate">{flow.opponent}</span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {flow.hasMovement && flow.movement !== null ? (
                      <>
                        <span className="text-muted-foreground">{formatLine(flow.openValue)}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className={flow.movement > 0 ? "text-terminal-green" : "text-destructive"}>
                          {formatLine(flow.currentValue)}
                        </span>
                        {flow.movement > 0 ? (
                          <ArrowUpRight className="w-3.5 h-3.5 text-terminal-green" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5 text-destructive" />
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {flow.currentValue !== null
                          ? `${formatLine(flow.currentValue)} — no movement yet`
                          : "Odds not available"
                        }
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground px-4 py-3 bg-card/50 border border-border rounded-lg">
              No movement data yet — needs at least 2 snapshots.
            </p>
          )}
        </motion.section>

        {/* Upcoming Games Section */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              <h2 className="text-sm text-foreground uppercase tracking-wider font-medium">
                Upcoming Games
              </h2>
              <span className="text-xs text-muted-foreground">(next 48 hours)</span>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 bg-card/50 rounded animate-pulse" />
              ))}
            </div>
          ) : upcomingGames.length > 0 ? (
            <div className="space-y-2">
              {upcomingGames.map((game) => (
                <div
                  key={`${game.league}-${game.id}`}
                  className="flex items-center justify-between px-3 py-2.5 bg-card/50 border border-border rounded-lg text-sm gap-2"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0">{getSportEmoji(game.league)}</span>
                    <span className="text-foreground truncate">{game.visitor_team_name}</span>
                    <span className="text-muted-foreground shrink-0">@</span>
                    <span className="text-foreground truncate">{game.home_team_name}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground shrink-0">
                    <span className="text-xs">{formatGameTime(game.date)}</span>
                    {game.hasOdds && game.spread !== null ? (
                      <span className="text-primary">{formatLine(game.spread)}</span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground px-4 py-3 bg-card/50 border border-border rounded-lg">
              No upcoming games in the next 48 hours.
            </p>
          )}
        </motion.section>
      </div>
    </div>
  );
}