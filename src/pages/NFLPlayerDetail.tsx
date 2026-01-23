import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, User } from "lucide-react";
import { 
  getNFLPlayer, 
  getNFLPlayerStats, 
  getNFLPlayerGameLogs,
  NFLPlayer 
} from "@/services/balldontlie/nflPlayers";
import { NFLPlayerStatsCard } from "@/components/players/NFLPlayerStatsCard";
import { NFLGameLog } from "@/components/players/NFLGameLog";

export default function NFLPlayerDetail() {
  const { playerId } = useParams<{ playerId: string }>();
  
  // Extract numeric ID from "bdl-123" format
  const bdlId = playerId?.startsWith("bdl-") ? playerId.substring(4) : null;
  
  const { data: player, isLoading: playerLoading, error: playerError } = useQuery({
    queryKey: ["bdl-nfl-player", bdlId],
    queryFn: async () => {
      if (!bdlId) return null;
      return getNFLPlayer(bdlId);
    },
    enabled: !!bdlId,
    staleTime: 60000,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["bdl-nfl-player-stats", bdlId],
    queryFn: async () => {
      if (!bdlId) return null;
      return getNFLPlayerStats(bdlId, 2024);
    },
    enabled: !!bdlId,
    staleTime: 60000,
  });

  const { data: gameLogs = [], isLoading: gameLogsLoading } = useQuery({
    queryKey: ["bdl-nfl-player-game-logs", bdlId],
    queryFn: async () => {
      if (!bdlId) return [];
      return getNFLPlayerGameLogs(bdlId, 2024, 17);
    },
    enabled: !!bdlId,
    staleTime: 60000,
  });

  const isLoading = playerLoading;

  const getPositionColor = (pos: string) => {
    switch (pos) {
      case "QB":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      case "RB":
      case "FB":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "WR":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "TE":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      default:
        return "bg-terminal-green/20 text-terminal-green border-terminal-green/30";
    }
  };

  if (!bdlId) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-foreground">Invalid player ID</h2>
        <Link to="/dashboard/nfl/players">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Players
          </Button>
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (playerError || !player) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-foreground">Player not found</h2>
        <p className="text-muted-foreground mt-2">
          Unable to load player data from Ball Don't Lie API.
        </p>
        <Link to="/dashboard/nfl/players">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Players
          </Button>
        </Link>
      </div>
    );
  }

  const fullName = `${player.first_name} ${player.last_name}`;
  const posAbbr = player.position_abbreviation || player.position;

  // Calculate season averages for highlighting in game log
  const seasonAverages = stats ? {
    pass_yards: stats.games_played && stats.pass_yards ? stats.pass_yards / stats.games_played : undefined,
    rush_yards: stats.games_played && stats.rush_yards ? stats.rush_yards / stats.games_played : undefined,
    rec_yards: stats.games_played && stats.rec_yards ? stats.rec_yards / stats.games_played : undefined,
    receptions: stats.games_played && stats.receptions ? stats.receptions / stats.games_played : undefined,
  } : undefined;

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link to="/dashboard/nfl/players">
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to NFL Players
        </Button>
      </Link>

      {/* Player Header */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Avatar with jersey number */}
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <User className="w-12 h-12 text-muted-foreground" />
              </div>
              {player.jersey_number && (
                <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-terminal-green flex items-center justify-center">
                  <span className="text-xs font-bold text-background">#{player.jersey_number}</span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 space-y-3">
              <div>
                <h1 className="text-2xl font-bold text-foreground">{fullName}</h1>
                <div className="flex items-center gap-3 text-muted-foreground mt-1">
                  <Badge variant="outline" className={getPositionColor(posAbbr)}>
                    {posAbbr}
                  </Badge>
                  {player.team && (
                    <>
                      <span>|</span>
                      <span className="font-medium">{player.team.full_name}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Bio Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm pt-2">
                {player.height && (
                  <div className="bg-muted/30 rounded-lg p-2">
                    <span className="text-muted-foreground block text-xs">Height</span>
                    <span className="text-foreground font-medium">{player.height}</span>
                  </div>
                )}
                {player.weight && (
                  <div className="bg-muted/30 rounded-lg p-2">
                    <span className="text-muted-foreground block text-xs">Weight</span>
                    <span className="text-foreground font-medium">
                      {typeof player.weight === 'string' ? player.weight : `${player.weight} lbs`}
                    </span>
                  </div>
                )}
                {player.age && (
                  <div className="bg-muted/30 rounded-lg p-2">
                    <span className="text-muted-foreground block text-xs">Age</span>
                    <span className="text-foreground font-medium">{player.age}</span>
                  </div>
                )}
                {player.college && (
                  <div className="bg-muted/30 rounded-lg p-2">
                    <span className="text-muted-foreground block text-xs">College</span>
                    <span className="text-foreground font-medium">{player.college}</span>
                  </div>
                )}
                {player.experience !== null && player.experience !== undefined && (
                  <div className="bg-muted/30 rounded-lg p-2">
                    <span className="text-muted-foreground block text-xs">Experience</span>
                    <span className="text-foreground font-medium">
                      {typeof player.experience === 'string' ? player.experience : 
                        player.experience === 0 ? "Rookie" : `${player.experience} yr${player.experience !== 1 ? "s" : ""}`}
                    </span>
                  </div>
                )}
                {player.team?.conference && (
                  <div className="bg-muted/30 rounded-lg p-2">
                    <span className="text-muted-foreground block text-xs">Conference</span>
                    <span className="text-foreground font-medium">{player.team.conference}</span>
                  </div>
                )}
                {player.team?.division && (
                  <div className="bg-muted/30 rounded-lg p-2">
                    <span className="text-muted-foreground block text-xs">Division</span>
                    <span className="text-foreground font-medium">{player.team.division}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Season Stats */}
      <NFLPlayerStatsCard 
        stats={stats} 
        position={posAbbr} 
        isLoading={statsLoading} 
      />

      {/* Game Log */}
      <NFLGameLog 
        gameLogs={gameLogs} 
        position={posAbbr} 
        seasonAverages={seasonAverages}
        isLoading={gameLogsLoading} 
      />
    </div>
  );
}
