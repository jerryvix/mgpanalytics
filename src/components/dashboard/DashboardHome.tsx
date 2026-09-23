import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Search,
  Calendar,
  RefreshCw,
  Settings2,
  TrendingUp,
  Target,
  Activity,
  BarChart3,
  Users2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useChat } from "@/contexts/ChatContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { OnboardingModal } from "@/components/onboarding";
import { DailyEdge } from "@/components/dashboard/DailyEdge";
import { StreakBadge } from "@/components/dashboard/StreakBadge";
import { StreakCard } from "@/components/dashboard/StreakCard";
import { MyFollows } from "@/components/dashboard/MyFollows";
import { YourTeams } from "@/components/dashboard/YourTeams";
import { FantasyMovers } from "@/components/dashboard/FantasyMovers";
import { EdgeTicker } from "@/components/dashboard/EdgeTicker";
import { TodaysTopGames, type TopGame } from "@/components/dashboard/TodaysTopGames";
import { RecentActivity } from "@/components/dashboard/RecentActivity";

interface Game {
  id: number | string;
  home_team_name: string;
  visitor_team_name: string;
  date: string;
  status: string;
  league: string;
}

interface GameWithOdds extends Game {
  spread: number | null;
  spreadOdds: number | null;
  total: number | null;
  hasOdds: boolean;
  lineMove: number | null;
}

interface QuickPrompt {
  label: string;
  icon: typeof Search;
  iconClassName: string;
}

const QUICK_PROMPTS: QuickPrompt[] = [
  { label: "Who are tonight's biggest favorites?", icon: TrendingUp, iconClassName: "text-terminal-green" },
  { label: "What's the best value play today?", icon: Target, iconClassName: "text-terminal-green" },
  { label: "Show me tonight's slate", icon: Calendar, iconClassName: "text-terminal-blue" },
  { label: "How has the line moved?", icon: Activity, iconClassName: "text-terminal-blue" },
  { label: "Player prop edges", icon: BarChart3, iconClassName: "text-terminal-blue" },
  { label: "Compare teams", icon: Users2, iconClassName: "text-terminal-blue" },
];

const ALL_SPORTS = ["NFL", "NBA", "NCAAB", "NCAAF", "MLB"] as const;

const SPORT_CONFIG: Record<string, { emoji: string; label: string }> = {
  NFL: { emoji: "🏈", label: "NFL" },
  NBA: { emoji: "🏀", label: "NBA" },
  NCAAB: { emoji: "🏀", label: "NCAAB" },
  NCAAF: { emoji: "🏈", label: "NCAAF" },
  MLB: { emoji: "⚾", label: "MLB" },
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Still up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardHome() {
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const { openWithQuery, setActiveSports: setChatActiveSports, setLastDataRefresh } = useChat();
  const [upcomingGames, setUpcomingGames] = useState<GameWithOdds[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { preferredSports } = useTrialStatus();
  const [showSetup, setShowSetup] = useState(false);

  // Sport filter pills - initialized from profile, locally toggled
  const [activeSports, setActiveSports] = useState<string[]>(ALL_SPORTS as unknown as string[]);
  const initializedFromProfile = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync activeSports from profile once loaded
  useEffect(() => {
    if (!initializedFromProfile.current && preferredSports.length > 0) {
      setActiveSports(preferredSports);
      initializedFromProfile.current = true;
    }
  }, [preferredSports]);

  // Keep ChatContext in sync so chatbot knows which sports are active
  useEffect(() => {
    setChatActiveSports(activeSports);
  }, [activeSports, setChatActiveSports]);

  // Persist sport filter changes to profile with debounce
  const persistSports = useCallback(async (sports: string[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ preferred_sports: sports })
          .eq("id", user.id);
      }
    } catch (e) {
      console.error("Error persisting sport preferences:", e);
    }
  }, []);

  const toggleSportFilter = (sport: string) => {
    setActiveSports(prev => {
      const next = prev.includes(sport)
        ? prev.filter(s => s !== sport)
        : [...prev, sport];
      // Require at least 1
      if (next.length === 0) return prev;

      // Debounce DB write
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => persistSports(next), 2000);

      return next;
    });
  };

  // Cleanup debounce on unmount - flush pending save
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    fetchData();
  }, [activeSports]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      let nflGames: any[] | null = null;
      let nbaGames: any[] | null = null;
      let ncaabGames: any[] | null = null;
      let mlbGames: any[] | null = null;
      let ncaafGames: any[] | null = null;

      // The user's preferred sports, PLUS whatever is actually in season -
      // the home page should never hide the sport playing games this week.
      const month = now.getMonth(); // 0 = Jan
      const inSeasonNow = [
        ...(month >= 2 && month <= 10 ? ["MLB"] : []),
        ...(month >= 7 || month <= 0 ? ["NFL", "NCAAF"] : []),
        ...(month >= 9 || month <= 5 ? ["NBA"] : []),
        ...(month >= 10 || month <= 3 ? ["NCAAB"] : []),
      ];
      const effectiveSports = [...new Set([...activeSports, ...inSeasonNow])];

      if (effectiveSports.includes("NFL")) {
        let { data } = await supabase
          .from("games")
          .select("*")
          .eq("league", "NFL")
          .not("status", "ilike", "%final%")
          .gte("date", now.toISOString())
          .lte("date", in48Hours.toISOString())
          .order("date", { ascending: true })
          .limit(10);

        if (!data?.length) {
          const { data: extended } = await supabase
            .from("games")
            .select("*")
            .eq("league", "NFL")
            .not("status", "ilike", "%final%")
            .gte("date", now.toISOString())
            .lte("date", in7Days.toISOString())
            .order("date", { ascending: true })
            .limit(10);
          data = extended;
        }
        nflGames = data;
      }

      if (effectiveSports.includes("NBA")) {
        let { data } = await supabase
          .from("nba_games")
          .select("*")
          .not("status", "ilike", "%final%")
          .gte("date", now.toISOString())
          .lte("date", in48Hours.toISOString())
          .order("date", { ascending: true })
          .limit(10);

        if (!data?.length) {
          const { data: extended } = await supabase
            .from("nba_games")
            .select("*")
            .not("status", "ilike", "%final%")
            .gte("date", now.toISOString())
            .lte("date", in7Days.toISOString())
            .order("date", { ascending: true })
            .limit(10);
          data = extended;
        }
        nbaGames = data;
      }

      if (effectiveSports.includes("NCAAB")) {
        let { data } = await supabase
          .from("ncaab_games")
          .select("*")
          .not("status", "ilike", "%final%")
          .gte("date", now.toISOString())
          .lte("date", in48Hours.toISOString())
          .order("date", { ascending: true })
          .limit(10);

        if (!data?.length) {
          const { data: extended } = await supabase
            .from("ncaab_games")
            .select("*")
            .not("status", "ilike", "%final%")
            .gte("date", now.toISOString())
            .lte("date", in7Days.toISOString())
            .order("date", { ascending: true })
            .limit(10);
          data = extended;
        }
        ncaabGames = data;
      }

      if (effectiveSports.includes("MLB")) {
        let { data } = await supabase
          .from("mlb_games")
          .select("*")
          .not("status", "ilike", "%final%")
          .gte("date", now.toISOString())
          .lte("date", in48Hours.toISOString())
          .order("date", { ascending: true })
          .limit(10);

        if (!data?.length) {
          const { data: extended } = await supabase
            .from("mlb_games")
            .select("*")
            .not("status", "ilike", "%final%")
            .gte("date", now.toISOString())
            .lte("date", in7Days.toISOString())
            .order("date", { ascending: true })
            .limit(10);
          data = extended;
        }
        mlbGames = data;
      }

      if (effectiveSports.includes("NCAAF")) {
        const { data } = await supabase
          .from("ncaaf_games")
          .select("*")
          .not("status", "ilike", "%final%")
          .gte("date", now.toISOString())
          .lte("date", in48Hours.toISOString())
          .order("date", { ascending: true })
          .limit(10);
        ncaafGames = data;
      }

      // Fetch odds for each sport's games
      const nflGameIds = nflGames?.map(g => g.id) || [];
      const { data: nflOdds } = nflGameIds.length > 0
        ? await supabase
            .from("odds")
            .select("*")
            .in("game_id", nflGameIds)
            .eq("sportsbook", "draftkings")
        : { data: [] };

      const nbaGameIds = nbaGames?.map(g => g.id) || [];
      const { data: nbaOdds } = nbaGameIds.length > 0
        ? await supabase
            .from("nba_odds")
            .select("*")
            .in("game_id", nbaGameIds)
            .eq("sportsbook", "draftkings")
        : { data: [] };

      const ncaabGameIds = ncaabGames?.map(g => g.id) || [];
      const { data: ncaabOdds } = ncaabGameIds.length > 0
        ? await supabase
            .from("ncaab_odds")
            .select("*")
            .in("game_id", ncaabGameIds)
            .eq("sportsbook", "draftkings")
        : { data: [] };

      const mlbGameIds = mlbGames?.map(g => g.id) || [];
      const { data: mlbOdds } = mlbGameIds.length > 0
        ? await supabase
            .from("mlb_odds")
            .select("*")
            .in("game_id", mlbGameIds)
            .eq("sportsbook", "draftkings")
        : { data: [] };

      const ncaafGameIds = ncaafGames?.map(g => g.id) || [];
      const { data: ncaafOdds } = ncaafGameIds.length > 0
        ? await supabase
            .from("ncaaf_odds")
            .select("*")
            .in("game_id", ncaafGameIds)
            .eq("sportsbook", "draftkings")
        : { data: [] };

      // Combine games with odds
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
          spreadOdds: odds?.spread_odds ?? null,
          total: odds?.total_value ?? null,
          hasOdds: !!odds,
          lineMove: null,
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
          spreadOdds: odds?.spread_odds ?? null,
          total: odds?.total_value ?? null,
          hasOdds: !!odds,
          lineMove: null,
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
          spreadOdds: odds?.spread_odds ?? null,
          total: odds?.total_value ?? null,
          hasOdds: !!odds,
          lineMove: null,
        });
      });

      mlbGames?.forEach(game => {
        const odds = mlbOdds?.find(o => o.game_id === game.id);
        gamesWithOdds.push({
          id: game.id,
          home_team_name: game.home_team_name,
          visitor_team_name: game.visitor_team_name,
          date: game.date,
          status: game.status,
          league: "MLB",
          spread: odds?.spread_value ?? null,
          spreadOdds: odds?.spread_odds ?? null,
          total: odds?.total_value ?? null,
          hasOdds: !!odds,
          lineMove: null,
        });
      });

      ncaafGames?.forEach(game => {
        const odds = ncaafOdds?.find(o => o.game_id === game.id);
        gamesWithOdds.push({
          id: game.id,
          home_team_name: game.home_team_name,
          visitor_team_name: game.visitor_team_name,
          date: game.date,
          status: game.status,
          league: "NCAAF",
          spread: odds?.spread_value ?? null,
          spreadOdds: odds?.spread_odds ?? null,
          total: odds?.total_value ?? null,
          hasOdds: !!odds,
          lineMove: null,
        });
      });

      // Sort: games with odds first, then by date
      gamesWithOdds.sort((a, b) => {
        if (a.hasOdds && !b.hasOdds) return -1;
        if (!a.hasOdds && b.hasOdds) return 1;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });

      // Real line movement from odds_history, mapped back onto the games
      // we're actually displaying (NFL/NBA/NCAAB have snapshot history today).
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const allGameIds = [
        ...nflGameIds.map(id => String(id)),
        ...nbaGameIds.map(id => String(id)),
        ...ncaabGameIds.map(id => String(id))
      ];

      if (allGameIds.length > 0) {
        const { data: snapshots } = await supabase
          .from("odds_history")
          .select("*")
          .in("game_id", allGameIds)
          .eq("odds_type", "spread")
          .gte("timestamp", sevenDaysAgo.toISOString())
          .order("timestamp", { ascending: true });

        if (snapshots && snapshots.length > 0) {
          const snapshotsByGame: Record<string, typeof snapshots> = {};
          snapshots.forEach(s => {
            (snapshotsByGame[s.game_id] ||= []).push(s);
          });

          const moveByGameId = new Map<string, number>();
          Object.entries(snapshotsByGame).forEach(([gameId, gameSnapshots]) => {
            if (gameSnapshots.length < 2) return;
            const openSnapshot = gameSnapshots[0];
            const currentSnapshot = gameSnapshots[gameSnapshots.length - 1];
            const movement = (currentSnapshot.current_line ?? 0) - (openSnapshot.current_line ?? 0);
            moveByGameId.set(gameId, movement);
          });

          gamesWithOdds.forEach(game => {
            const move = moveByGameId.get(String(game.id));
            if (move !== undefined) game.lineMove = move;
          });
        }
      }

      setUpcomingGames(gamesWithOdds.slice(0, 6));
      setLastDataRefresh(new Date());
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

  return (
    <div className="flex flex-col">
      {/* Live Edge Ticker */}
      <EdgeTicker />

      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative flex flex-col items-center justify-center px-0 py-6 md:px-4 md:py-14 overflow-hidden"
      >
        {/* Subtle sports-adjacent background treatment - decorative only */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, hsl(var(--terminal-green)) 0%, transparent 35%), radial-gradient(circle at 80% 30%, hsl(var(--terminal-blue)) 0%, transparent 35%)",
          }}
        />

        <p className="text-xs md:text-sm text-muted-foreground mb-2 font-medium">
          {getGreeting()}. Here's what's moving.
        </p>

        <h1 className="text-xl md:text-4xl font-semibold text-foreground text-center tracking-tight mb-4 md:mb-6">
          What's on your mind{" "}
          <span className="bg-gradient-to-r from-terminal-green to-terminal-green/70 bg-clip-text text-transparent">
            today?
          </span>
        </h1>

        <form onSubmit={handleSubmit} className="w-full max-w-2xl mb-4 md:mb-6">
          <div className="relative">
            <Search className="absolute left-4 md:left-5 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-muted-foreground pointer-events-none" />
            <Input
              data-coach="hero-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Ask about any game, market, or move..."
              className={`h-14 md:h-[4.5rem] text-base md:text-lg pl-11 pr-14 md:pl-14 md:pr-16 bg-card border-border rounded-xl transition-shadow ${
                searchFocused ? "border-primary ring-2 ring-primary/30" : ""
              }`}
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 md:h-11 md:w-11 bg-primary hover:bg-primary/90 rounded-lg"
            >
              <ArrowRight className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground text-center">
            MGP is AI driven and can make mistakes. Please double-check responses.
          </p>
        </form>

        <div className="flex flex-col md:flex-row md:flex-wrap md:justify-center gap-2 md:gap-3 w-full max-w-3xl">
          {QUICK_PROMPTS.map((prompt) => {
            const Icon = prompt.icon;
            return (
              <button
                key={prompt.label}
                onClick={() => handleExampleClick(prompt.label)}
                className="flex items-center gap-2 px-3 py-2 text-xs md:text-sm text-muted-foreground bg-card/50 hover:bg-card hover:text-foreground border border-border hover:border-primary/50 rounded-lg transition-all text-left"
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${prompt.iconClassName}`} />
                {prompt.label}
              </button>
            );
          })}
        </div>
      </motion.section>

      {/* Below the Fold Sections */}
      <div className="border-t border-border px-0 md:px-4 py-5 md:py-6 space-y-5 md:space-y-6">
        {/* Market Coverage - a data-filtering control, not navigation */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-mono text-[11px] text-foreground uppercase tracking-widest font-bold">
              Market Coverage
            </h2>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {ALL_SPORTS.map(sport => {
              const active = activeSports.includes(sport);
              const config = SPORT_CONFIG[sport];
              return (
                <button
                  key={sport}
                  onClick={() => toggleSportFilter(sport)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap shrink-0 ${
                    active
                      ? "bg-terminal-blue/10 text-terminal-blue border-terminal-blue/30"
                      : "bg-card/50 text-muted-foreground border-border hover:border-terminal-blue/30 hover:text-foreground"
                  }`}
                >
                  <span>{config.emoji}</span>
                  <span>{config.label}</span>
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSetup(true)}
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <Settings2 className="w-4 h-4 mr-1.5" />
                <span className="hidden sm:inline">Setup</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing || loading}
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline ml-1.5">Refresh</span>
              </Button>
            </div>
          </div>
        </section>

        {/* Today's Top Games */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
          <TodaysTopGames games={upcomingGames as TopGame[]} loading={loading} />
        </motion.div>

        {/* Edge of the Day - the habit hook */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
          <DailyEdge />
        </motion.div>

        {/* Recent Activity */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
          <RecentActivity />
        </motion.div>

        {/* Secondary / personalized content */}
        <div className="pt-2 border-t border-border/60 space-y-5 md:space-y-6">
          <div className="flex items-center gap-2">
            <StreakBadge />
          </div>
          <StreakCard />
          <YourTeams />
          <MyFollows />
          <FantasyMovers />
        </div>
      </div>

      {/* Setup / Onboarding Modal - manually triggered */}
      <OnboardingModal
        open={showSetup}
        dismissible
        onComplete={(sports) => {
          setShowSetup(false);
          if (sports && sports.length > 0) {
            setActiveSports(sports);
          }
        }}
      />
    </div>
  );
}
