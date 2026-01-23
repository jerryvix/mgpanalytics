import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Users, Info, Loader2, Database, Globe } from "lucide-react";
import { PlayersGrid } from "@/components/players/PlayersGrid";
import { NFLPlayerCard } from "@/components/players/NFLPlayerCard";
import { searchNFLPlayers, NFLPlayer } from "@/services/balldontlie/nflPlayers";

const NFL_POSITIONS = ["QB", "RB", "WR", "TE", "FB"];

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export default function NFLPlayers() {
  const [activeTab, setActiveTab] = useState<"slate" | "search">("slate");
  const [searchQuery, setSearchQuery] = useState("");
  const [teams, setTeams] = useState<string[]>([]);
  
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Slate players from database
  const { data: slatePlayers = [], isLoading: slateLoading } = useQuery({
    queryKey: ["nfl-players-slate"],
    queryFn: async () => {
      const now = new Date();
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const { data, error } = await supabase
        .from("players")
        .select(`
          id,
          name,
          team_name,
          position,
          injury_status,
          is_featured,
          featured_reason,
          usage_rank
        `)
        .eq("sport", "NFL")
        .eq("is_featured", true)
        .gte("slate_window_end", now.toISOString())
        .order("usage_rank", { ascending: true });

      if (error) {
        console.error("Error fetching NFL players:", error);
        return [];
      }

      if (data && data.length > 0) {
        const playerIds = data.map((p) => p.id);
        const { data: statsData } = await supabase
          .from("player_season_stats")
          .select("player_id, pass_yards, rush_yards, rec_yards")
          .in("player_id", playerIds)
          .eq("sport", "NFL")
          .eq("season", 2024);

        const statsMap = new Map();
        for (const stat of statsData || []) {
          statsMap.set(stat.player_id, stat);
        }

        return data.map((player) => ({
          ...player,
          stats: statsMap.get(player.id),
        }));
      }

      return data || [];
    },
    refetchInterval: 60000,
  });

  // API search results
  const { 
    data: searchResults, 
    isLoading: searchLoading,
    isFetching: searchFetching 
  } = useQuery({
    queryKey: ["nfl-players-search", debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) {
        return { data: [] };
      }
      return searchNFLPlayers(debouncedSearch, 25);
    },
    enabled: activeTab === "search" && debouncedSearch.length >= 2,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Extract unique teams from slate players
  useEffect(() => {
    if (slatePlayers.length > 0) {
      const uniqueTeams = [...new Set(slatePlayers.map((p) => p.team_name))].sort();
      setTeams(uniqueTeams);
    }
  }, [slatePlayers]);

  const apiPlayers = searchResults?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">NFL Players</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Search players or view featured players for upcoming games
        </p>
      </div>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "slate" | "search")}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="slate" className="gap-2">
            <Database className="w-4 h-4" />
            Slate Players
          </TabsTrigger>
          <TabsTrigger value="search" className="gap-2">
            <Globe className="w-4 h-4" />
            Search All Players
          </TabsTrigger>
        </TabsList>

        {/* Slate Players Tab */}
        <TabsContent value="slate" className="mt-6">
          <PlayersGrid
            sport="NFL"
            players={slatePlayers}
            teams={teams}
            positions={NFL_POSITIONS}
            slateWindow="7 days"
            isLoading={slateLoading}
          />
        </TabsContent>

        {/* Search Tab */}
        <TabsContent value="search" className="mt-6 space-y-6">
          {/* Info Banner */}
          <Card className="bg-primary/5 border-primary/30">
            <CardContent className="p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <span className="text-foreground font-medium">Live Search: </span>
                Search the Ball Don't Lie database for any NFL player. 
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
                {apiPlayers.length} player{apiPlayers.length !== 1 ? "s" : ""} found
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
                  Enter a player name to search the Ball Don't Lie database.
                </p>
              </CardContent>
            </Card>
          ) : searchLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="h-28 animate-pulse bg-muted/30" />
              ))}
            </div>
          ) : apiPlayers.length === 0 ? (
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
              {apiPlayers.map((player: NFLPlayer) => (
                <NFLPlayerCard
                  key={player.id}
                  id={player.id}
                  firstName={player.first_name}
                  lastName={player.last_name}
                  position={player.position}
                  positionAbbreviation={player.position_abbreviation}
                  team={player.team}
                  jerseyNumber={player.jersey_number}
                  height={player.height}
                  weight={player.weight}
                  college={player.college}
                  experience={player.experience}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
