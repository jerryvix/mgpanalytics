import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Info, Users, RefreshCw, Calendar, Flame } from "lucide-react";
import { NBASlatePlayerCard } from "./NBASlatePlayerCard";

const NBA_POSITIONS = ["PG", "SG", "SF", "PF", "C", "G", "F"];

interface GameContext {
  opponent: string;
  date: Date;
  isHome: boolean;
}

interface SlatePlayer {
  id: string;
  name: string;
  team_name: string;
  position: string;
  injury_status: string;
  headshot_url: string | null;
  rank: number;
  ppg: number | null;
  stats?: {
    points_per_game: number | null;
    rebounds_per_game: number | null;
    assists_per_game: number | null;
    minutes_per_game: number | null;
    games_played: number | null;
  };
  gameContext?: GameContext;
}

interface NBASlatePlayersGridProps {
  players: SlatePlayer[];
  games: Array<{ id: string; home_team_name: string; visitor_team_name: string; date: string }>;
  teams: string[];
  hasGames: boolean;
  isLoading: boolean;
  viewMode: "slate" | "all";
  onViewModeChange: (mode: "slate" | "all") => void;
  lastUpdated: Date | null;
  onRefresh: () => void;
  totalWithStats: number;
}

export function NBASlatePlayersGrid({
  players,
  games,
  teams,
  hasGames,
  isLoading,
  viewMode,
  onViewModeChange,
  lastUpdated,
  onRefresh,
  totalWithStats,
}: NBASlatePlayersGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [selectedPosition, setSelectedPosition] = useState<string>("all");

  // Filter players
  const filteredPlayers = players.filter((player) => {
    const matchesSearch = player.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTeam = selectedTeam === "all" || player.team_name === selectedTeam;
    const matchesPosition = selectedPosition === "all" || player.position === selectedPosition;
    return matchesSearch && matchesTeam && matchesPosition;
  });

  // Get time ago string
  const getTimeAgo = (date: Date | null) => {
    if (!date) return "Never";
    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return "Just now";
    if (minutes === 1) return "1 min ago";
    if (minutes < 60) return `${minutes} mins ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  };

  // Empty state when no games
  if (!isLoading && !hasGames) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">NBA Players</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Top scorers with games in the next 48 hours
          </p>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <Calendar className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No Games Scheduled</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
              There are no NBA games in the next 48 hours. Check back closer to game day for the top slate players.
            </p>
            <Button variant="outline" onClick={onRefresh}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">NBA Players</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Top scorers with games in the next 48 hours
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "slate" ? "default" : "outline"}
            size="sm"
            onClick={() => onViewModeChange("slate")}
            className="text-xs"
          >
            <Flame className="w-3 h-3 mr-1" />
            Top 10 Slate
          </Button>
          <Button
            variant={viewMode === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => onViewModeChange("all")}
            className="text-xs"
          >
            All Players
          </Button>
        </div>
      </div>

      {/* Info Banner */}
      <Card className="bg-terminal-green/5 border-terminal-green/30">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-terminal-green flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <span className="text-foreground font-medium">
              {viewMode === "slate" ? "Top 10 PPG Leaders: " : "All Slate Players: "}
            </span>
            {viewMode === "slate" 
              ? "Showing top 10 PPG leaders on today's slate. Players marked \"Out\" are excluded."
              : `Showing all ${totalWithStats} players with stats on today's slate, sorted by PPG.`
            }
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search players by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-background"
          />
        </div>

        <Select value={selectedTeam} onValueChange={setSelectedTeam}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="All Teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {teams.sort().map((team) => (
              <SelectItem key={team} value={team}>
                {team}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedPosition} onValueChange={setSelectedPosition}>
          <SelectTrigger className="w-full md:w-36">
            <SelectValue placeholder="All Positions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Positions</SelectItem>
            {NBA_POSITIONS.map((pos) => (
              <SelectItem key={pos} value={pos}>
                {pos}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          className="shrink-0"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Results Count & Last Updated */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4" />
          <span>
            {filteredPlayers.length} player{filteredPlayers.length !== 1 ? "s" : ""}
            {filteredPlayers.length !== players.length && ` (filtered from ${players.length})`}
          </span>
          <span className="text-muted-foreground/50">•</span>
          <span>{games.length} games in next 48h</span>
        </div>
        <span className="text-xs">Last updated: {getTimeAgo(lastUpdated)}</span>
      </div>

      {/* Player Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(viewMode === "slate" ? 10 : 8)].map((_, i) => (
            <Card key={i} className="h-48 animate-pulse bg-muted/30" />
          ))}
        </div>
      ) : filteredPlayers.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Players Found</h3>
            <p className="text-muted-foreground text-sm">
              {players.length === 0
                ? "No players with stats found for upcoming games."
                : "No players match your current filters. Try adjusting your search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredPlayers.map((player) => (
            <NBASlatePlayerCard
              key={player.id}
              id={player.id}
              name={player.name}
              team={player.team_name}
              position={player.position}
              injuryStatus={player.injury_status}
              headshotUrl={player.headshot_url || undefined}
              rank={player.rank}
              pointsPerGame={player.stats?.points_per_game ?? undefined}
              reboundsPerGame={player.stats?.rebounds_per_game ?? undefined}
              assistsPerGame={player.stats?.assists_per_game ?? undefined}
              minutesPerGame={player.stats?.minutes_per_game ?? undefined}
              gameContext={player.gameContext}
              showRank={viewMode === "slate"}
            />
          ))}
        </div>
      )}

      {/* Performance Delta Disclaimer */}
      <div className="mt-8 pt-4 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground/70 leading-relaxed text-left">
          Performance Delta: Percentage variance between current Postseason form and 2025 Season baseline averages.
        </p>
      </div>
    </div>
  );
}
