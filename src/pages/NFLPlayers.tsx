import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Users, Info, Loader2, Globe, Trophy, TrendingUp, Flame, Crosshair } from "lucide-react";
import { PropFuturesBoard } from "@/components/players/PropFuturesBoard";
import { BacktestOverview } from "@/components/players/backtest/BacktestOverview";
import { NFLPlayerCard } from "@/components/players/NFLPlayerCard";
import { supabase } from "@/integrations/supabase/client";
import { NFLSlatePlayersGrid } from "@/components/nfl";
import { FantasyLeadersBoard } from "@/components/nfl/FantasyLeadersBoard";

// DB-backed player search result (replaces the dead Ball Don't Lie live search)
interface DbPlayerResult {
  id: string;
  external_id: string;
  name: string;
  position: string | null;
  team_abbr: string | null;
  team_name: string | null;
  college: string | null;
  experience: string | null;
}

const POSITION_ABBR: Record<string, string> = {
  quarterback: "QB",
  "running back": "RB",
  fullback: "FB",
  "wide receiver": "WR",
  "tight end": "TE",
};

async function searchDbPlayers(query: string): Promise<DbPlayerResult[]> {
  // "%aj%brown%"-style pattern so multi-word queries match across the full name
  const pattern = "%" + query.trim().replace(/[%_]/g, "").replace(/\s+/g, "%") + "%";
  const { data, error } = await supabase
    .from("players")
    .select("id, external_id, name, position, team_abbr, team_name, college, experience")
    .eq("sport", "NFL")
    // Free agents stay searchable (their stats and pages still exist); their
    // club is cleared by sync-nfl-players, so the card reads "Free Agent"
    .ilike("name", pattern)
    .order("name")
    .limit(25);
  if (error) throw error;
  return (data || []) as DbPlayerResult[];
}
import { useNFLSlateLeaders } from "@/hooks/useNFLSlateLeaders";

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Mar-Aug there is no slate to lead - open on the Fantasy finishes board so
// the first thing a visitor sees is a full table, never an empty state.
function nflOffseason(): boolean {
  const m = new Date().getMonth(); // 0 = Jan
  return m >= 2 && m <= 7;
}

export default function NFLPlayers() {
  const [activeTab, setActiveTab] = useState<"slate" | "search" | "season" | "futures" | "fantasy" | "accuracy">(
    nflOffseason() ? "fantasy" : "slate"
  );
  const [searchQuery, setSearchQuery] = useState("");

  const { data: slateData } = useNFLSlateLeaders({ enabled: activeTab === "slate" });
  
  const debouncedSearch = useDebounce(searchQuery, 300);

  // DB search results
  const {
    data: searchResults,
    isLoading: searchLoading,
    isFetching: searchFetching
  } = useQuery({
    queryKey: ["nfl-players-db-search", debouncedSearch],
    queryFn: () => searchDbPlayers(debouncedSearch),
    enabled: activeTab === "search" && debouncedSearch.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  const dbPlayers = searchResults || [];

  const headerTitle =
    activeTab === "slate" && slateData?.isSuperBowl && slateData.game
      ? `Super Bowl: ${slateData.game.visitor_team.name} @ ${slateData.game.home_team.name}`
      : "NFL Players";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{headerTitle}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Top leaders for the next upcoming game
        </p>
      </div>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "slate" | "search" | "season" | "futures" | "fantasy" | "accuracy")}>
        {/* Five tabs are ~560px wide: on phones they scroll inside their own
            strip instead of pushing the whole page sideways */}
        <div className="max-w-full overflow-x-auto scrollbar-hide">
        <TabsList className="bg-muted/50 w-max">
          <TabsTrigger value="slate" className="gap-2 text-xs sm:text-sm">
            <Trophy className="w-4 h-4" />
            <span className="hidden sm:inline">Top </span>Leaders
          </TabsTrigger>
          <TabsTrigger value="search" className="gap-2 text-xs sm:text-sm">
            <Globe className="w-4 h-4" />
            <span className="hidden sm:inline">Search All </span>Players
          </TabsTrigger>
          <TabsTrigger value="fantasy" className="gap-2 text-xs sm:text-sm">
            <Flame className="w-4 h-4" />
            Fantasy
          </TabsTrigger>
          <TabsTrigger value="futures" className="gap-2 text-xs sm:text-sm">
            <TrendingUp className="w-4 h-4" />
            Futures
          </TabsTrigger>
          <TabsTrigger value="accuracy" className="gap-2 text-xs sm:text-sm">
            <Crosshair className="w-4 h-4" />
            Where Oddsmakers Missed
          </TabsTrigger>
        </TabsList>
        </div>

        {/* Top Leaders Tab */}
        <TabsContent value="slate" className="mt-6">
          <NFLSlatePlayersGrid />
        </TabsContent>

        {/* Search Tab */}
        <TabsContent value="search" className="mt-6 space-y-6">
          {/* Info Banner */}
          <Card className="bg-primary/5 border-primary/30">
            <CardContent className="p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <span className="text-foreground font-medium">Player Search: </span>
                Search MGP's NFL player database (skill positions).
                Enter at least 2 characters to search.
              </div>
            </CardContent>
          </Card>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search any NFL player by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-background"
            />
            {(searchLoading || searchFetching) && debouncedSearch.length >= 2 && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
            )}
          </div>

          {/* Results Count */}
          {debouncedSearch.length >= 2 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              <span>
                {dbPlayers.length} player{dbPlayers.length !== 1 ? "s" : ""} found
              </span>
            </div>
          )}

          {/* Search Results */}
          {debouncedSearch.length < 2 ? (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center">
                <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">Search NFL Players</h3>
                <p className="text-muted-foreground text-sm">
                  Enter a player name to search MGP's database.
                </p>
              </CardContent>
            </Card>
          ) : searchLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="h-28 animate-pulse bg-muted/30" />
              ))}
            </div>
          ) : dbPlayers.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No Players Found</h3>
                <p className="text-muted-foreground text-sm">
                  No players match "{debouncedSearch}". Try a different search term.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dbPlayers.map((player) => {
                const [firstName, ...rest] = player.name.split(" ");
                const pos = player.position || "";
                return (
                  <NFLPlayerCard
                    key={player.id}
                    id={Number(player.external_id)}
                    firstName={firstName}
                    lastName={rest.join(" ")}
                    position={pos}
                    positionAbbreviation={POSITION_ABBR[pos.toLowerCase()] || pos}
                    team={player.team_abbr ? { name: player.team_name || player.team_abbr, abbreviation: player.team_abbr } : null}
                    college={player.college}
                    experience={player.experience}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* 2025 Leaders tab hidden per owner (Jul 2026) - SeasonLeaders component
            kept for reuse; the data still powers MGP Angle grounding. */}

        {/* Fantasy Finishes Tab - nflverse-backed, links into the trajectory analyzer */}
        <TabsContent value="fantasy" className="mt-6">
          <FantasyLeadersBoard />
        </TabsContent>

        {/* Season Futures Tab - player prop futures (team totals live under Games > Futures) */}
        <TabsContent value="futures" className="mt-6">
          <PropFuturesBoard sport="NFL" view="players" />
        </TabsContent>

        {/* Accuracy Tab - projection backtester: preseason numbers vs actual results */}
        <TabsContent value="accuracy" className="mt-6">
          <BacktestOverview />
        </TabsContent>
      </Tabs>
    </div>
  );
}
