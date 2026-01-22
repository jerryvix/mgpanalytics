import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, User, Activity, Calendar, TrendingUp, Target } from "lucide-react";

export default function PlayerProfile() {
  const { sport, playerId } = useParams<{ sport: string; playerId: string }>();
  const sportUpper = sport?.toUpperCase() || "NFL";

  const { data: player, isLoading: playerLoading } = useQuery({
    queryKey: ["player", playerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("id", playerId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!playerId,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["player-stats", playerId, sportUpper],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("player_season_stats")
        .select("*")
        .eq("player_id", playerId)
        .eq("sport", sportUpper)
        .order("season", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: !!playerId,
  });

  const { data: upcomingGames = [] } = useQuery({
    queryKey: ["player-games", playerId, sportUpper],
    queryFn: async () => {
      const { data: associations } = await supabase
        .from("player_game_associations")
        .select("nfl_game_id, nba_game_id, ncaab_game_id, is_starter")
        .eq("player_id", playerId)
        .eq("sport", sportUpper);

      if (!associations || associations.length === 0) return [];

      // Fetch the actual games based on sport
      const gameIds = associations.map((a) => 
        a.nfl_game_id || a.nba_game_id || a.ncaab_game_id
      ).filter(Boolean) as string[];

      if (gameIds.length === 0) return [];

      let gamesTable: "games" | "nba_games" | "ncaab_games" = "games";
      if (sportUpper === "NBA") gamesTable = "nba_games";
      if (sportUpper === "NCAAB") gamesTable = "ncaab_games";

      const { data: games } = await supabase
        .from(gamesTable)
        .select("id, date, home_team_name, visitor_team_name, status")
        .in("id", gameIds)
        .gte("date", new Date().toISOString())
        .order("date", { ascending: true })
        .limit(3);

      return games || [];
    },
    enabled: !!playerId,
  });

  const isLoading = playerLoading || statsLoading;

  const getInjuryBadgeColor = (status: string) => {
    switch (status) {
      case "Out":
      case "IR":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      case "Doubtful":
        return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "Questionable":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      default:
        return "bg-green-500/20 text-green-400 border-green-500/30";
    }
  };

  const renderNFLStats = () => {
    if (!stats) return null;

    const position = player?.position;

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {position === "QB" && (
          <>
            <StatCard label="Pass Yards" value={stats.pass_yards?.toLocaleString() || "0"} />
            <StatCard label="Pass TDs" value={stats.pass_td?.toString() || "0"} />
            <StatCard label="Completions" value={stats.pass_completions?.toString() || "0"} />
            <StatCard label="Interceptions" value={stats.pass_int?.toString() || "0"} />
          </>
        )}
        {(position === "RB" || position === "FB") && (
          <>
            <StatCard label="Rush Yards" value={stats.rush_yards?.toLocaleString() || "0"} />
            <StatCard label="Rush TDs" value={stats.rush_td?.toString() || "0"} />
            <StatCard label="Attempts" value={stats.rush_attempts?.toString() || "0"} />
            <StatCard label="Receptions" value={stats.receptions?.toString() || "0"} />
          </>
        )}
        {(position === "WR" || position === "TE") && (
          <>
            <StatCard label="Rec Yards" value={stats.rec_yards?.toLocaleString() || "0"} />
            <StatCard label="Rec TDs" value={stats.rec_td?.toString() || "0"} />
            <StatCard label="Receptions" value={stats.receptions?.toString() || "0"} />
            <StatCard label="Targets" value={stats.targets?.toString() || "0"} />
          </>
        )}
        <StatCard label="Games Played" value={stats.games_played?.toString() || "0"} />
      </div>
    );
  };

  const renderNBAStats = () => {
    if (!stats) return null;

    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="PPG" value={stats.points_per_game?.toFixed(1) || "0.0"} highlight />
        <StatCard label="RPG" value={stats.rebounds_per_game?.toFixed(1) || "0.0"} />
        <StatCard label="APG" value={stats.assists_per_game?.toFixed(1) || "0.0"} />
        <StatCard label="SPG" value={stats.steals_per_game?.toFixed(1) || "0.0"} />
        <StatCard label="BPG" value={stats.blocks_per_game?.toFixed(1) || "0.0"} />
        <StatCard label="FG%" value={((stats.field_goal_pct || 0) * 100).toFixed(1) + "%"} />
        <StatCard label="3P%" value={((stats.three_point_pct || 0) * 100).toFixed(1) + "%"} />
        <StatCard label="FT%" value={((stats.free_throw_pct || 0) * 100).toFixed(1) + "%"} />
        <StatCard label="MPG" value={stats.minutes_per_game?.toFixed(1) || "0.0"} />
        <StatCard label="Games" value={stats.games_played?.toString() || "0"} />
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-foreground">Player not found</h2>
        <Link to={`/dashboard/${sport}/players`}>
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Players
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link to={`/dashboard/${sport}/players`}>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to {sportUpper} Players
        </Button>
      </Link>

      {/* Player Header */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Avatar */}
            <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <User className="w-12 h-12 text-muted-foreground" />
            </div>

            {/* Info */}
            <div className="flex-1 space-y-3">
              <div>
                <h1 className="text-2xl font-bold text-foreground">{player.name}</h1>
                <div className="flex items-center gap-3 text-muted-foreground mt-1">
                  <span className="font-mono font-bold text-terminal-green">{player.position}</span>
                  <span>•</span>
                  <span>{player.team_name}</span>
                  {player.jersey_number && (
                    <>
                      <span>•</span>
                      <span>#{player.jersey_number}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                <Badge className={getInjuryBadgeColor(player.injury_status || "Healthy")}>
                  <Activity className="w-3 h-3 mr-1" />
                  {player.injury_status || "Healthy"}
                </Badge>
                {player.is_featured && (
                  <Badge variant="outline" className="border-terminal-green/50 text-terminal-green">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Featured
                  </Badge>
                )}
                {player.usage_rank && player.usage_rank <= 5 && (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-400">
                    <Target className="w-3 h-3 mr-1" />
                    Usage Rank #{player.usage_rank}
                  </Badge>
                )}
              </div>

              {/* Bio */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {player.height && (
                  <div>
                    <span className="text-muted-foreground">Height: </span>
                    <span className="text-foreground">{player.height}</span>
                  </div>
                )}
                {player.weight && (
                  <div>
                    <span className="text-muted-foreground">Weight: </span>
                    <span className="text-foreground">{player.weight} lbs</span>
                  </div>
                )}
                {player.age && (
                  <div>
                    <span className="text-muted-foreground">Age: </span>
                    <span className="text-foreground">{player.age}</span>
                  </div>
                )}
                {player.college && (
                  <div>
                    <span className="text-muted-foreground">College: </span>
                    <span className="text-foreground">{player.college}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Season Stats */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            {stats?.season || "2024"} Season Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sportUpper === "NFL" ? renderNFLStats() : renderNBAStats()}
          {!stats && (
            <p className="text-muted-foreground text-sm">No stats available for this season.</p>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Games */}
      {upcomingGames.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Upcoming Games
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingGames.map((game: any) => (
                <div
                  key={game.id}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                >
                  <div>
                    <div className="font-medium text-foreground">
                      {game.visitor_team_name} @ {game.home_team_name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(game.date).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {game.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-muted/30 rounded-lg p-3 text-center">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-bold ${highlight ? "text-terminal-green" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}
