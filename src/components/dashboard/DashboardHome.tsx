import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowRight, TrendingUp, Calendar, RefreshCw, ArrowUpRight, ArrowDownRight, Settings2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useChat } from "@/contexts/ChatContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { getTeamAbbrev } from "@/utils/teamAbbreviations";
import { OnboardingModal } from "@/components/onboarding";
import { DailyEdge } from "@/components/dashboard/DailyEdge";

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
  spread: number | null;
  total: number | null;
  hasOdds: boolean;
}

type FreshnessLevel = "high" | "limited" | "stale";

interface SyncFreshness {
  level: FreshnessLevel;
  label: string;
}

function computeFreshness(lastSyncAt: string | null, lastSyncStatus: string | null, recordsSynced: number | null): SyncFreshness {
  if (!lastSyncAt || !lastSyncStatus) return { level: "stale", label: "Stale" };
  const minutesAgo = (Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60);
  if (lastSyncStatus !== "success") return { level: "stale", label: "Stale" };
  if (minutesAgo > 30) return { level: "stale", label: "Stale" };
  if ((recordsSynced ?? 0) === 0) return { level: "limited", label: "Limited" };
  return { level: "high", label: "Live" };
}

const freshnessColors: Record<FreshnessLevel, string> = {
  high: "bg-terminal-green/20 text-terminal-green border-terminal-green/30",
  limited: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  stale: "bg-muted text-muted-foreground border-border",
};

const EXAMPLE_PROMPTS = [
  "What's on tonight's slate?",
  "Who are tonight's biggest favorites?",
  "How do the spreads look this week?",
];

const ALL_SPORTS = ["NFL", "NBA", "NCAAB"] as const;

const SPORT_CONFIG: Record<string, { emoji: string; label: string }> = {
  NFL: { emoji: "\uD83C\uDFC8", label: "NFL" },
  NBA: { emoji: "\uD83C\uDFC0", label: "NBA" },
  NCAAB: { emoji: "\uD83C\uDFC0", label: "NCAAB" },
};

const getSportEmoji = (league?: string) => {
  if (!league) return "\uD83C\uDFC8";
  const l = league.toUpperCase();
  if (l.includes("NFL") || l.includes("NCAAF")) return "\uD83C\uDFC8";
  if (l.includes("NBA") || l.includes("NCAAB")) return "\uD83C\uDFC0";
  if (l.includes("MLB")) return "\u26BE";
  return "\uD83C\uDFC8";
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
  const { openWithQuery, setActiveSports: setChatActiveSports } = useChat();
  const [moneyFlows, setMoneyFlows] = useState<OddsMovement[]>([]);
  const [upcomingGames, setUpcomingGames] = useState<GameWithOdds[]>([]);
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dataFreshness, setDataFreshness] = useState<Record<string, SyncFreshness>>({});
  const isMobile = useIsMobile();
  const { preferredSports } = useTrialStatus();
  const [showSetup, setShowSetup] = useState(false);

  // Sport filter pills — initialized from profile, locally toggled
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

  // Cleanup debounce on unmount — flush pending save
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        // Fire a final persist synchronously via the ref
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

      // Only fetch sports the user has active
      if (activeSports.includes("NFL")) {
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

      if (activeSports.includes("NBA")) {
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

      if (activeSports.includes("NCAAB")) {
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

      // Fetch Money Flows from odds_history
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const allGameIds = [
        ...nflGameIds.map(id => String(id)),
        ...nbaGameIds.map(id => String(id)),
        ...ncaabGameIds.map(id => String(id))
      ];

      const movements: OddsMovement[] = [];

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
            if (!snapshotsByGame[s.game_id]) {
              snapshotsByGame[s.game_id] = [];
            }
            snapshotsByGame[s.game_id].push(s);
          });

          Object.entries(snapshotsByGame).forEach(([gameId, gameSnapshots]) => {
            if (gameSnapshots.length < 2) return;

            const openSnapshot = gameSnapshots[0];
            const currentSnapshot = gameSnapshots[gameSnapshots.length - 1];
            const movement = (currentSnapshot.current_line ?? 0) - (openSnapshot.current_line ?? 0);

            const nflGame = nflGames?.find(g => String(g.id) === gameId);
            const nbaGame = nbaGames?.find(g => String(g.id) === gameId);
            const ncaabGame = ncaabGames?.find(g => String(g.id) === gameId);
            const game = nflGame || nbaGame || ncaabGame;

            if (game && Math.abs(movement) >= 0.5) {
              movements.push({
                id: gameId,
                gameId: gameId,
                team: game.home_team_name,
                opponent: game.visitor_team_name,
                market: "spread",
                openValue: openSnapshot.current_line,
                currentValue: currentSnapshot.current_line,
                movement: movement,
                lastUpdated: new Date(currentSnapshot.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
                sport: nflGame ? "NFL" : nbaGame ? "NBA" : "NCAAB",
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
              openValue: game.spread ?? null,
              currentValue: game.spread ?? null,
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

      // Fetch data freshness from sync_schedule
      try {
        const { data: schedules } = await supabase
          .from("sync_schedule")
          .select("sport, data_type, last_sync_at, last_sync_status, records_synced");

        if (schedules) {
          const freshness: Record<string, SyncFreshness> = {};
          for (const s of schedules) {
            const key = `${s.sport}-${s.data_type}`;
            freshness[key] = computeFreshness(s.last_sync_at, s.last_sync_status, s.records_synced);
          }
          setDataFreshness(freshness);
        }
      } catch (e) {
        console.error("Error fetching sync freshness:", e);
      }

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
    if (value === null || value === undefined) return "\u2014";
    return value > 0 ? `+${value}` : String(value);
  };

  const displayTeam = (name: string, league?: string) => {
    return isMobile ? getTeamAbbrev(name, league) : name;
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
              data-coach="hero-input"
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
        {/* Sport Filter Pills + Refresh */}
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
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-card/50 text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
                }`}
              >
                <span>{config.emoji}</span>
                <span>{config.label}</span>
              </button>
            );
          })}
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

        {/* Daily Edge — the habit hook */}
        <DailyEdge />

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
              {(() => {
                const oddsKeys = Object.keys(dataFreshness).filter(k => k.includes("odds"));
                const best = oddsKeys.length > 0
                  ? oddsKeys.reduce((best, k) => {
                      const level = dataFreshness[k].level;
                      if (level === "high") return dataFreshness[k];
                      if (level === "limited" && best.level !== "high") return dataFreshness[k];
                      return best;
                    }, dataFreshness[oddsKeys[0]])
                  : null;
                return best ? (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${freshnessColors[best.level]}`}>
                    {best.label}
                  </span>
                ) : null;
              })()}
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
                    <span className="text-muted-foreground truncate">{displayTeam(flow.opponent, flow.sport)}</span>
                    <span className="text-muted-foreground shrink-0">@</span>
                    <span className="text-foreground font-medium truncate">{displayTeam(flow.team, flow.sport)}</span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {flow.hasMovement && flow.movement !== null ? (
                      <>
                        <span className="text-muted-foreground">{formatLine(flow.openValue)}</span>
                        <span className="text-muted-foreground">{"\u2192"}</span>
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
                          ? `${formatLine(flow.currentValue)} \u2014 no movement yet`
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
              {(() => {
                const gameKeys = Object.keys(dataFreshness).filter(k => k.includes("games"));
                const best = gameKeys.length > 0
                  ? gameKeys.reduce((best, k) => {
                      const level = dataFreshness[k].level;
                      if (level === "high") return dataFreshness[k];
                      if (level === "limited" && best.level !== "high") return dataFreshness[k];
                      return best;
                    }, dataFreshness[gameKeys[0]])
                  : null;
                return best ? (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${freshnessColors[best.level]}`}>
                    {best.label}
                  </span>
                ) : null;
              })()}
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
                    <span className="text-foreground truncate">{displayTeam(game.visitor_team_name, game.league)}</span>
                    <span className="text-muted-foreground shrink-0">@</span>
                    <span className="text-foreground truncate">{displayTeam(game.home_team_name, game.league)}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground shrink-0">
                    <span className="text-xs">{formatGameTime(game.date)}</span>
                    {game.hasOdds && game.spread !== null ? (
                      <span className="text-primary">
                        {getTeamAbbrev(game.home_team_name, game.league)} {formatLine(game.spread)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">{"\u2014"}</span>
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

      {/* Setup / Onboarding Modal — manually triggered */}
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
