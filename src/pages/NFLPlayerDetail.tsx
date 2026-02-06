import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, User, TrendingUp, Zap, Calendar, Target } from "lucide-react";
import { NFLPlayerStatsCard } from "@/components/players/NFLPlayerStatsCard";
import { NFLGameLog } from "@/components/players/NFLGameLog";
import { NFLAdvancedStats } from "@/components/players/NFLAdvancedStats";

export default function NFLPlayerDetail() {
  const { playerId } = useParams<{ playerId: string }>();

  // Extract numeric ID from "bdl-123" format (external_id in DB)
  const externalId = playerId?.startsWith("bdl-") ? playerId.substring(4) : playerId;

  // Fetch player from DB by external_id
  const { data: player, isLoading: playerLoading, error: playerError } = useQuery({
    queryKey: ["nfl-player-db", externalId],
    queryFn: async () => {
      if (!externalId) return null;
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("external_id", externalId)
        .eq("sport", "NFL")
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!externalId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch season stats from DB
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["nfl-player-stats-db", player?.id],
    queryFn: async () => {
      if (!player?.id) return null;
      const { data, error } = await supabase
        .from("player_season_stats")
        .select("*")
        .eq("player_id", player.id)
        .eq("sport", "NFL")
        .eq("season_type", "regular")
        .order("season", { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: !!player?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch game logs from DB
  const { data: gameLogs = [], isLoading: gameLogsLoading } = useQuery({
    queryKey: ["nfl-player-gamelogs-db", player?.id],
    queryFn: async () => {
      if (!player?.id) return [];
      const { data, error } = await supabase
        .from("player_game_logs")
        .select("*")
        .eq("player_id", player.id)
        .eq("sport", "NFL")
        .order("game_date", { ascending: false })
        .limit(20);
      if (error) throw error;
      // Map DB columns to the format NFLGameLog component expects
      return (data || []).map((log: any) => ({
        game_id: log.game_id,
        game_date: log.game_date,
        opponent: log.opponent_name || log.opponent_abbr,
        is_home: log.home_away === "home",
        pass_yards: log.pass_yards,
        pass_td: log.pass_td,
        pass_attempts: log.pass_attempts,
        pass_completions: log.pass_completions,
        interceptions: log.pass_int,
        passer_rating: log.passer_rating,
        rush_yards: log.rush_yards,
        rush_td: log.rush_td,
        rush_attempts: log.rush_attempts,
        receptions: log.receptions,
        rec_yards: log.rec_yards,
        rec_td: log.rec_td,
        targets: log.targets,
      }));
    },
    enabled: !!player?.id,
    staleTime: 5 * 60 * 1000,
  });

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

  if (!externalId) {
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

  if (playerLoading) {
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
          This player hasn't been synced yet or doesn't exist.
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

  const fullName = player.name || `${player.first_name || ""} ${player.last_name || ""}`.trim();
  const posAbbr = player.position || "";

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
                  {player.team_name && (
                    <>
                      <span>|</span>
                      <span className="font-medium">{player.team_name}</span>
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
                    <span className="text-foreground font-medium">{player.weight} lbs</span>
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
                      {player.experience === 0 ? "Rookie" : `${player.experience} yr${player.experience !== 1 ? "s" : ""}`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Tabs */}
      <Tabs defaultValue="traditional" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="traditional" className="text-xs sm:text-sm">
            <TrendingUp className="w-4 h-4 mr-1.5 hidden sm:inline" />
            Traditional
          </TabsTrigger>
          <TabsTrigger value="advanced" className="text-xs sm:text-sm">
            <Zap className="w-4 h-4 mr-1.5 hidden sm:inline" />
            Advanced
          </TabsTrigger>
          <TabsTrigger value="gamelog" className="text-xs sm:text-sm">
            <Calendar className="w-4 h-4 mr-1.5 hidden sm:inline" />
            Game Log
          </TabsTrigger>
          <TabsTrigger value="betting" className="text-xs sm:text-sm">
            <Target className="w-4 h-4 mr-1.5 hidden sm:inline" />
            Betting
          </TabsTrigger>
        </TabsList>

        <TabsContent value="traditional">
          <NFLPlayerStatsCard
            stats={stats}
            position={posAbbr}
            isLoading={statsLoading}
          />
        </TabsContent>

        <TabsContent value="advanced">
          <NFLAdvancedStats
            stats={stats}
            gameLogs={gameLogs}
            position={posAbbr}
            isLoading={statsLoading || gameLogsLoading}
          />
        </TabsContent>

        <TabsContent value="gamelog">
          <NFLGameLog
            gameLogs={gameLogs}
            position={posAbbr}
            seasonAverages={seasonAverages}
            isLoading={gameLogsLoading}
          />
        </TabsContent>

        <TabsContent value="betting">
          <Card className="bg-card border-border">
            <CardContent className="p-6">
              <div className="text-center py-8">
                <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Betting Trends Coming Soon
                </h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Player prop betting history, line movements, and performance
                  against closing lines will be available here.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
