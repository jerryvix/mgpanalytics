import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Info, Users } from "lucide-react";
import { PlayerCard } from "./PlayerCard";

interface Player {
  id: string;
  name: string;
  team_name: string;
  position: string;
  injury_status: string;
  is_featured: boolean;
  featured_reason: string | null;
  usage_rank: number | null;
  headshot_url?: string | null;
}

interface PlayerWithStats extends Player {
  stats?: {
    pass_yards?: number;
    rush_yards?: number;
    rec_yards?: number;
    points_per_game?: number;
    rebounds_per_game?: number;
    assists_per_game?: number;
    minutes_per_game?: number;
  };
}

interface PlayersGridProps {
  sport: "NFL" | "NBA" | "NCAAB";
  players: PlayerWithStats[];
  teams: string[];
  positions: string[];
  slateWindow: string;
  isLoading?: boolean;
}

export function PlayersGrid({
  sport,
  players,
  teams,
  positions,
  slateWindow,
  isLoading,
}: PlayersGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [selectedPosition, setSelectedPosition] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // Filter players
  const filteredPlayers = players.filter((player) => {
    const matchesSearch = player.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTeam = selectedTeam === "all" || player.team_name === selectedTeam;
    const matchesPosition = selectedPosition === "all" || player.position === selectedPosition;
    const matchesStatus =
      selectedStatus === "all" ||
      (selectedStatus === "healthy" && player.injury_status === "Healthy") ||
      (selectedStatus === "injured" && player.injury_status !== "Healthy");

    return matchesSearch && matchesTeam && matchesPosition && matchesStatus;
  });

  // Sort: Injured first, then by usage rank ascending
  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    // Injured players first
    const aInjured = a.injury_status !== "Healthy";
    const bInjured = b.injury_status !== "Healthy";
    if (aInjured && !bInjured) return -1;
    if (!aInjured && bInjured) return 1;
    // Then by usage rank
    return (a.usage_rank || 999) - (b.usage_rank || 999);
  });

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <Card className="bg-terminal-green/5 border-terminal-green/30">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-terminal-green flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <span className="text-foreground font-medium">Slate Players: </span>
            Showing players relevant to games in the next {slateWindow}. 
            Players update automatically when the slate refreshes.
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
            {teams.map((team) => (
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
            {positions.map((pos) => (
              <SelectItem key={pos} value={pos}>
                {pos}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-full md:w-36">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="healthy">Healthy</SelectItem>
            <SelectItem value="injured">Injured</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results Count */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="w-4 h-4" />
        <span>
          {sortedPlayers.length} player{sortedPlayers.length !== 1 ? "s" : ""} 
          {filteredPlayers.length !== players.length && ` (filtered from ${players.length})`}
        </span>
      </div>

      {/* Player Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="h-40 animate-pulse bg-muted/30" />
          ))}
        </div>
      ) : sortedPlayers.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Players Found</h3>
            <p className="text-muted-foreground text-sm">
              {players.length === 0
                ? `No players found for upcoming games. Player data will appear when games are scheduled.`
                : "No players match your current filters. Try adjusting your search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedPlayers.map((player) => (
            <PlayerCard
              key={player.id}
              id={player.id}
              name={player.name}
              team={player.team_name}
              position={player.position}
              sport={sport}
              injuryStatus={player.injury_status}
              isFeatured={player.is_featured}
              featuredReason={player.featured_reason || undefined}
              usageRank={player.usage_rank || undefined}
              headshotUrl={player.headshot_url || undefined}
              passYards={player.stats?.pass_yards}
              rushYards={player.stats?.rush_yards}
              recYards={player.stats?.rec_yards}
              pointsPerGame={player.stats?.points_per_game}
              reboundsPerGame={player.stats?.rebounds_per_game}
              assistsPerGame={player.stats?.assists_per_game}
              minutesPerGame={player.stats?.minutes_per_game}
            />
          ))}
        </div>
      )}
    </div>
  );
}
