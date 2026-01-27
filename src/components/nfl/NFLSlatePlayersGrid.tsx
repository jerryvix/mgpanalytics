import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Users, AlertCircle, RefreshCw, Trophy } from "lucide-react";
import { NFLSlateLeaderCard } from "./NFLSlateLeaderCard";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";

const EDGE_FUNCTION_URL = `https://pgrrbkhxukxvzzauviyp.supabase.co/functions/v1/nfl-slate-leaders`;

interface LeaderPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_abbreviation: string;
  team: {
    id: number;
    abbreviation: string;
    full_name: string;
    name: string;
  } | null;
  jersey_number: string | null;
  stat_value: number;
  stat_type: string;
  rank: number;
}

interface SlateData {
  game: {
    id: number;
    date: string;
    time: string;
    datetime: string;
    week: number;
    status: string;
    home_team: {
      id: number;
      abbreviation: string;
      full_name: string;
      name: string;
    };
    visitor_team: {
      id: number;
      abbreviation: string;
      full_name: string;
      name: string;
    };
  } | null;
  leaders: {
    passing: LeaderPlayer[];
    rushing: LeaderPlayer[];
    receiving: LeaderPlayer[];
  };
  message?: string;
  isSuperBowl?: boolean;
  isPlayoffs?: boolean;
  seasonComplete?: boolean;
}

export function NFLSlatePlayersGrid() {
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery<SlateData>({
    queryKey: ["nfl-slate-leaders"],
    queryFn: async () => {
      const response = await fetch(EDGE_FUNCTION_URL, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch slate data');
      }
      
      return response.json();
    },
    refetchInterval: 30 * 60 * 1000, // Refresh every 30 minutes
    staleTime: 5 * 60 * 1000, // Consider stale after 5 minutes
  });

  const formatGameTime = (datetime: string | undefined, date: string | undefined) => {
    try {
      if (datetime) {
        return format(parseISO(datetime), "EEEE, MMM d 'at' h:mm a");
      }
      if (date) {
        return format(parseISO(date), "EEEE, MMM d");
      }
    } catch (e) {
      return date || "TBD";
    }
    return "TBD";
  };

  const getLastUpdated = () => {
    if (!dataUpdatedAt) return null;
    const minutes = Math.floor((Date.now() - dataUpdatedAt) / 60000);
    if (minutes < 1) return "Just now";
    if (minutes === 1) return "1 min ago";
    return `${minutes} mins ago`;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="bg-destructive/10 border-destructive/30">
        <CardContent className="p-6 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Failed to Load Leaders</h3>
          <p className="text-muted-foreground text-sm mb-4">
            {error instanceof Error ? error.message : "An error occurred"}
          </p>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // No upcoming games state - check if season is complete
  if (!data?.game) {
    const seasonComplete = data?.seasonComplete;
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-8 text-center">
          <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {seasonComplete ? "Season Complete" : "No Upcoming Games"}
          </h3>
          <p className="text-muted-foreground text-sm">
            {seasonComplete 
              ? "The NFL season has concluded. Check back for next season!"
              : "There are no NFL games scheduled. Check back closer to game day for the top slate leaders."
            }
          </p>
        </CardContent>
      </Card>
    );
  }

  const { game, leaders, isSuperBowl, isPlayoffs } = data;
  const allLeaders = [
    ...leaders.passing.map(p => ({ ...p, category: "passing" as const })),
    ...leaders.rushing.map(p => ({ ...p, category: "rushing" as const })),
    ...leaders.receiving.map(p => ({ ...p, category: "receiving" as const })),
  ];

  // No leaders found state
  if (allLeaders.length === 0) {
    return (
      <div className="space-y-6">
        {/* Game Header */}
        <Card className="bg-muted/30 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-lg font-bold">
                  <span>{game.visitor_team.abbreviation}</span>
                  <span className="text-muted-foreground">@</span>
                  <span>{game.home_team.abbreviation}</span>
                </div>
                <Badge variant="outline">Week {game.week}</Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>{formatGameTime(game.datetime, game.date)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Stats Available</h3>
            <p className="text-muted-foreground text-sm">
              Season stats for these teams are not available yet. Check back after the season starts.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Game Header */}
      <Card className="bg-gradient-to-r from-muted/50 to-muted/30 border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 text-xl font-bold">
                <span className="text-foreground">{game.visitor_team.abbreviation}</span>
                <span className="text-muted-foreground text-sm">@</span>
                <span className="text-foreground">{game.home_team.abbreviation}</span>
              </div>
              {isSuperBowl ? (
                <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 gap-1">
                  <Trophy className="w-3 h-3" />
                  Super Bowl LIX
                </Badge>
              ) : isPlayoffs ? (
                <Badge variant="secondary">Playoffs</Badge>
              ) : (
                <Badge variant="secondary">Week {game.week}</Badge>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>{formatGameTime(game.datetime, game.date)}</span>
              </div>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {game.visitor_team.full_name} vs {game.home_team.full_name}
          </div>
        </CardContent>
      </Card>

      {/* Info Banner */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="w-4 h-4" />
          <span>{allLeaders.length} top leaders</span>
          <span className="text-muted-foreground/50">•</span>
          <span>Last updated: {getLastUpdated()}</span>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => refetch()} 
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Leaders Grid - Organized by Category */}
      <div className="space-y-6">
        {/* Passing Leaders */}
        {leaders.passing.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              PASSING LEADERS
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {leaders.passing.map((player) => (
                <NFLSlateLeaderCard
                  key={`pass-${player.id}`}
                  id={player.id}
                  firstName={player.first_name}
                  lastName={player.last_name}
                  position={player.position}
                  positionAbbreviation={player.position_abbreviation}
                  team={player.team}
                  jerseyNumber={player.jersey_number}
                  statValue={player.stat_value}
                  statType={player.stat_type}
                  rank={player.rank}
                  category="passing"
                />
              ))}
            </div>
          </div>
        )}

        {/* Rushing Leaders */}
        {leaders.rushing.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              RUSHING LEADERS
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {leaders.rushing.map((player) => (
                <NFLSlateLeaderCard
                  key={`rush-${player.id}`}
                  id={player.id}
                  firstName={player.first_name}
                  lastName={player.last_name}
                  position={player.position}
                  positionAbbreviation={player.position_abbreviation}
                  team={player.team}
                  jerseyNumber={player.jersey_number}
                  statValue={player.stat_value}
                  statType={player.stat_type}
                  rank={player.rank}
                  category="rushing"
                />
              ))}
            </div>
          </div>
        )}

        {/* Receiving Leaders */}
        {leaders.receiving.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              RECEIVING LEADERS
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {leaders.receiving.map((player) => (
                <NFLSlateLeaderCard
                  key={`rec-${player.id}`}
                  id={player.id}
                  firstName={player.first_name}
                  lastName={player.last_name}
                  position={player.position}
                  positionAbbreviation={player.position_abbreviation}
                  team={player.team}
                  jerseyNumber={player.jersey_number}
                  statValue={player.stat_value}
                  statType={player.stat_type}
                  rank={player.rank}
                  category="receiving"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
