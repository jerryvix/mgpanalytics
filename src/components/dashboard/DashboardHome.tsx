import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, TrendingUp, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useChat } from "@/contexts/ChatContext";
import { supabase } from "@/integrations/supabase/client";

interface Game {
  id: number | string;
  home_team_name: string;
  visitor_team_name: string;
  date: string;
  status: string;
  league?: string;
}

interface OddsMovement {
  id: string;
  team: string;
  market: string;
  oldValue: number;
  newValue: number;
  timeAgo: string;
  sport: string;
}

interface GameWithOdds extends Game {
  spread?: number;
  total?: number;
}

const EXAMPLE_PROMPTS = [
  "What caused the biggest movement today?",
  "What should I know about tonight's slate?",
  "Which games are the hardest to interpret right now?",
];

const getSportEmoji = (league?: string) => {
  if (!league) return "🏈";
  const l = league.toUpperCase();
  if (l.includes("NFL") || l.includes("NCAAF")) return "🏈";
  if (l.includes("NBA") || l.includes("NCAAB")) return "🏀";
  if (l.includes("MLB")) return "⚾";
  return "🏈";
};

const formatTimeAgo = (date: Date) => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
};

export function DashboardHome() {
  const [query, setQuery] = useState("");
  const { openWithQuery } = useChat();
  const [moneyFlows, setMoneyFlows] = useState<OddsMovement[]>([]);
  const [upcomingGames, setUpcomingGames] = useState<GameWithOdds[]>([]);
  const [lastSync, setLastSync] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch NFL games
      const { data: nflGames } = await supabase
        .from("games")
        .select("*")
        .in("status", ["scheduled", "SCHEDULED", "live", "LIVE"])
        .order("date", { ascending: true })
        .limit(10);

      // Fetch NBA games
      const { data: nbaGames } = await supabase
        .from("nba_games")
        .select("*")
        .in("status", ["scheduled", "SCHEDULED", "live", "LIVE"])
        .order("date", { ascending: true })
        .limit(10);

      // Fetch NFL odds for games
      const nflGameIds = nflGames?.map(g => g.id) || [];
      const { data: nflOdds } = await supabase
        .from("odds")
        .select("*")
        .in("game_id", nflGameIds)
        .eq("sportsbook", "draftkings");

      // Fetch NBA odds
      const nbaGameIds = nbaGames?.map(g => g.id) || [];
      const { data: nbaOdds } = await supabase
        .from("nba_odds")
        .select("*")
        .in("game_id", nbaGameIds)
        .eq("sportsbook", "draftkings");

      // Combine games with odds
      const gamesWithOdds: GameWithOdds[] = [];
      
      nflGames?.forEach(game => {
        const odds = nflOdds?.find(o => o.game_id === game.id);
        gamesWithOdds.push({
          ...game,
          league: "NFL",
          spread: odds?.spread_value,
          total: odds?.total_value,
        });
      });

      nbaGames?.forEach(game => {
        const odds = nbaOdds?.find(o => o.game_id === game.id);
        gamesWithOdds.push({
          ...game,
          league: "NBA",
          spread: odds?.spread_value,
          total: odds?.total_value,
        });
      });

      // Sort by date
      gamesWithOdds.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setUpcomingGames(gamesWithOdds.slice(0, 8));

      // Mock money flows - in production this would compare historical odds
      // For now, show the most recent odds updates as "movements"
      const movements: OddsMovement[] = [];
      
      nflOdds?.slice(0, 3).forEach((odd, idx) => {
        const game = nflGames?.find(g => g.id === odd.game_id);
        if (game && odd.spread_value) {
          movements.push({
            id: `nfl-${idx}`,
            team: game.home_team_name,
            market: "spread",
            oldValue: odd.spread_value + (Math.random() > 0.5 ? 0.5 : -0.5),
            newValue: odd.spread_value,
            timeAgo: formatTimeAgo(new Date(odd.updated_at)),
            sport: "NFL",
          });
        }
      });

      nbaOdds?.slice(0, 2).forEach((odd, idx) => {
        const game = nbaGames?.find(g => g.id === odd.game_id);
        if (game && odd.spread_value) {
          movements.push({
            id: `nba-${idx}`,
            team: game.home_team_name,
            market: "spread",
            oldValue: odd.spread_value + (Math.random() > 0.5 ? 0.5 : -0.5),
            newValue: odd.spread_value,
            timeAgo: formatTimeAgo(new Date(odd.updated_at)),
            sport: "NBA",
          });
        }
      });

      setMoneyFlows(movements);

      // Get last sync time
      const { data: syncLog } = await supabase
        .from("sync_log")
        .select("completed_at")
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1);

      if (syncLog?.[0]?.completed_at) {
        setLastSync(new Date(syncLog[0].completed_at).toLocaleString());
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
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

  return (
    <div className="min-h-[calc(100vh-6rem)] flex flex-col">
      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex-1 flex flex-col items-center justify-center px-4 py-12 md:py-20"
      >
        <h1 className="text-2xl md:text-4xl font-semibold text-foreground text-center tracking-tight mb-8">
          What's on your mind today?
        </h1>

        <form onSubmit={handleSubmit} className="w-full max-w-2xl mb-6">
          <div className="relative">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask about any game, market, or move"
              className="h-14 md:h-16 text-base md:text-lg px-6 pr-14 bg-card border-border focus:border-primary rounded-xl"
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 bg-primary hover:bg-primary/90 rounded-lg"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        </form>

        <div className="flex flex-wrap justify-center gap-3 max-w-2xl">
          {EXAMPLE_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleExampleClick(prompt)}
              className="px-4 py-2 text-sm text-muted-foreground bg-card/50 hover:bg-card hover:text-foreground border border-border hover:border-primary/50 rounded-lg transition-all"
            >
              {prompt}
            </button>
          ))}
        </div>
      </motion.section>

      {/* Below the Fold Sections */}
      <div className="border-t border-border px-4 py-8 space-y-8">
        {/* Money Flows Section */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="text-sm text-foreground uppercase tracking-wider font-medium">
              Money Flows
            </h2>
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
                  className="flex items-center justify-between px-4 py-3 bg-card/50 border border-border rounded-lg text-sm"
                >
                  <span>
                    <span className="mr-2">{getSportEmoji(flow.sport)}</span>
                    <span className="text-foreground">{flow.team}</span>
                    <span className="text-muted-foreground ml-2">{flow.market}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground">{flow.oldValue > 0 ? "+" : ""}{flow.oldValue.toFixed(1)}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className={flow.newValue !== flow.oldValue ? "text-primary" : "text-foreground"}>
                      {flow.newValue > 0 ? "+" : ""}{flow.newValue.toFixed(1)}
                    </span>
                    <span className="text-muted-foreground text-xs">[{flow.timeAgo}]</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No recent movements detected.</p>
          )}

          <p className="text-xs text-muted-foreground mt-3">
            Odds refreshed periodically.{lastSync && ` Last update: ${lastSync}.`} Check DraftKings | FanDuel | Caesars for real-time.
          </p>
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
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-terminal-green animate-pulse" />
              <span>LIVE</span>
              {lastSync && <span className="text-border">| Updated: {lastSync}</span>}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 bg-card/50 rounded animate-pulse" />
              ))}
            </div>
          ) : upcomingGames.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {upcomingGames.map((game) => (
                <div
                  key={`${game.league}-${game.id}`}
                  className="flex items-center justify-between px-4 py-3 bg-card/50 border border-border rounded-lg text-sm"
                >
                  <span>
                    <span className="mr-2">{getSportEmoji(game.league)}</span>
                    <span className="text-foreground">{game.visitor_team_name}</span>
                    <span className="text-muted-foreground mx-2">@</span>
                    <span className="text-foreground">{game.home_team_name}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {game.spread !== undefined && game.spread !== null ? (
                      <>
                        <span className="text-primary">{game.spread > 0 ? "+" : ""}{game.spread}</span>
                        {game.total !== undefined && game.total !== null && (
                          <span className="ml-2">| {game.total}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No upcoming games found.</p>
          )}
        </motion.section>
      </div>
    </div>
  );
}
