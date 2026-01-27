import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Calendar, Users, AlertCircle, RefreshCw, Trophy, Zap } from "lucide-react";
import { NFLSlateLeaderCard } from "./NFLSlateLeaderCard";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { useNFLSlateLeaders } from "@/hooks/useNFLSlateLeaders";

export function NFLSlatePlayersGrid() {
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } =
    useNFLSlateLeaders();

  const formatGameDate = (datetime: string | undefined, date: string | undefined) => {
    try {
      if (datetime) {
        return format(parseISO(datetime), "EEEE, MMMM d, yyyy");
      }
      if (date) {
        return format(parseISO(date), "EEEE, MMMM d, yyyy");
      }
    } catch {
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
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
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

  // No upcoming games state
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

  const { game, leaders, isSuperBowl, isPlayoffs, statsSource } = data;
  const allLeaders = [
    ...leaders.passing.map(p => ({ ...p, category: "passing" as const })),
    ...leaders.rushing.map(p => ({ ...p, category: "rushing" as const })),
    ...leaders.receiving.map(p => ({ ...p, category: "receiving" as const })),
  ];

  // No leaders found
  if (allLeaders.length === 0) {
    return (
      <div className="space-y-6">
        <Card className="bg-muted/30 border-border">
          <CardContent className="p-4">
            <div className="text-lg font-bold">
              {game.visitor_team.abbreviation} @ {game.home_team.abbreviation}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Stats Available</h3>
            <p className="text-muted-foreground text-sm">
              Season stats for these teams are not available yet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dynamic Game Header */}
      <Card className="bg-gradient-to-r from-muted/60 via-muted/40 to-muted/60 border-border overflow-hidden">
        <CardContent className="p-5">
          <div className="flex flex-col gap-3">
            {/* Event Badge */}
            <div className="flex items-center gap-2">
              {isSuperBowl ? (
                <Badge className="bg-gradient-to-r from-amber-500/40 to-yellow-500/30 text-amber-300 border-amber-500/50 gap-1.5 px-3 py-1.5 text-sm font-bold">
                  <Trophy className="w-4 h-4" />
                  Super Bowl LX
                </Badge>
              ) : isPlayoffs ? (
                <Badge className="bg-gradient-to-r from-purple-500/40 to-indigo-500/30 text-purple-300 border-purple-500/50 gap-1.5 px-3 py-1.5">
                  <Zap className="w-4 h-4" />
                  NFL Playoffs
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  Week {game.week}
                </Badge>
              )}
            </div>

            {/* Matchup Title */}
            <div className="flex items-center gap-3">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                {isSuperBowl
                  ? "Super Bowl LX: Patriots @ Seahawks - Feb 8, 2026"
                  : (
                      <>
                        {game.visitor_team.full_name}
                        <span className="text-muted-foreground mx-2 text-xl">@</span>
                        {game.home_team.full_name}
                      </>
                    )}
              </h2>
            </div>

            {/* Date */}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span className="text-sm font-medium">{formatGameDate(game.datetime, game.date)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Source & Refresh */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span>{allLeaders.length} team leaders</span>
          </div>
            {statsSource && (
              <>
                <span className="text-muted-foreground/50">•</span>
                <span>{statsSource}</span>
              </>
            )}
          <span className="text-muted-foreground/50">•</span>
          <span>Updated: {getLastUpdated()}</span>
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

      {/* Leaders Grid by Category */}
      <div className="space-y-8">
        {/* Passing Leaders */}
        {leaders.passing.length > 0 && (
          <section>
            <h3 className="text-sm font-bold text-muted-foreground mb-4 flex items-center gap-2 uppercase tracking-wider">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
              Passing Leaders
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                  detailedStats={player.detailed_stats}
                  headshotUrl={player.headshot_url ?? null}
                />
              ))}
            </div>
          </section>
        )}

        {/* Rushing Leaders */}
        {leaders.rushing.length > 0 && (
          <section>
            <h3 className="text-sm font-bold text-muted-foreground mb-4 flex items-center gap-2 uppercase tracking-wider">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              Rushing Leaders
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                  detailedStats={player.detailed_stats}
                />
              ))}
            </div>
          </section>
        )}

        {/* Receiving Leaders */}
        {leaders.receiving.length > 0 && (
          <section>
            <h3 className="text-sm font-bold text-muted-foreground mb-4 flex items-center gap-2 uppercase tracking-wider">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
              Receiving Leaders
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                  detailedStats={player.detailed_stats}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Performance Delta Disclaimer */}
      <div className="mt-8 pt-4 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground/70 leading-relaxed text-left">
          Performance Delta: Percentage variance between current Postseason form and 2025 Season baseline averages.
        </p>
      </div>
    </div>
  );
}
