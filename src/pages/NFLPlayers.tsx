import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Users, Info, Loader2, Globe, Trophy } from "lucide-react";
import { NFLPlayerCard } from "@/components/players/NFLPlayerCard";
import { searchNFLPlayers, NFLPlayer } from "@/services/balldontlie/nflPlayers";
import { NFLSlatePlayersGrid } from "@/components/nfl";
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

export default function NFLPlayers() {
  const [activeTab, setActiveTab] = useState<"slate" | "search">("slate");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: slateData } = useNFLSlateLeaders({ enabled: activeTab === "slate" });
  
  const debouncedSearch = useDebounce(searchQuery, 300);

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
  });

  const apiPlayers = searchResults?.data || [];

  const headerTitle =
    activeTab === "slate" && slateData?.isSuperBowl
      ? "Super Bowl LX: Patriots @ Seahawks - Feb 8, 2026"
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
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "slate" | "search")}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="slate" className="gap-2">
            <Trophy className="w-4 h-4" />
            Top Leaders
          </TabsTrigger>
          <TabsTrigger value="search" className="gap-2">
            <Globe className="w-4 h-4" />
            Search All Players
          </TabsTrigger>
        </TabsList>

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
