import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, User, Activity, Calendar, TrendingUp, ExternalLink } from "lucide-react";
import { getNFLPlayer, getNFLPlayerStats, NFLPlayer, NFLPlayerStats } from "@/services/balldontlie/nflPlayers";

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
    staleTime: 60000, // Cache for 1 minute
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

  const isLoading = playerLoading || statsLoading;

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

  const renderStats = () => {
    if (!stats) return null;
    const position = player?.position_abbreviation || player?.position;

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <StatCard label="Games" value={stats.games_played?.toString() || "0"} />
        
        {(position === "QB") && (
          <>
            <StatCard label="Pass Yards" value={stats.pass_yards?.toLocaleString() || "0"} highlight />
            <StatCard label="Pass TDs" value={stats.pass_td?.toString() || "0"} />
            <StatCard label="Completions" value={stats.pass_completions?.toString() || "0"} />
            <StatCard label="Attempts" value={stats.pass_attempts?.toString() || "0"} />
            <StatCard label="Interceptions" value={stats.interceptions?.toString() || "0"} />
            <StatCard 
              label="Comp %" 
              value={stats.pass_attempts && stats.pass_attempts > 0 
                ? ((stats.pass_completions || 0) / stats.pass_attempts * 100).toFixed(1) + "%" 
                : "—"
              } 
            />
            <StatCard label="Passer Rating" value={stats.passer_rating?.toFixed(1) || "—"} />
          </>
        )}
        
        {(position === "RB" || position === "FB") && (
          <>
            <StatCard label="Rush Yards" value={stats.rush_yards?.toLocaleString() || "0"} highlight />
            <StatCard label="Rush TDs" value={stats.rush_td?.toString() || "0"} />
            <StatCard label="Attempts" value={stats.rush_attempts?.toString() || "0"} />
            <StatCard label="YPC" value={stats.yards_per_carry?.toFixed(1) || "—"} />
            <StatCard label="Receptions" value={stats.receptions?.toString() || "0"} />
            <StatCard label="Rec Yards" value={stats.rec_yards?.toLocaleString() || "0"} />
            <StatCard label="Rec TDs" value={stats.rec_td?.toString() || "0"} />
          </>
        )}
        
        {(position === "WR" || position === "TE") && (
          <>
            <StatCard label="Rec Yards" value={stats.rec_yards?.toLocaleString() || "0"} highlight />
            <StatCard label="Rec TDs" value={stats.rec_td?.toString() || "0"} />
            <StatCard label="Receptions" value={stats.receptions?.toString() || "0"} />
            <StatCard label="Targets" value={stats.targets?.toString() || "0"} />
            <StatCard label="YPR" value={stats.yards_per_reception?.toFixed(1) || "—"} />
          </>
        )}

        {/* Fallback for other positions - show whatever stats we have */}
        {!["QB", "RB", "FB", "WR", "TE"].includes(position || "") && (
          <>
            {stats.pass_yards && <StatCard label="Pass Yards" value={stats.pass_yards.toLocaleString()} />}
            {stats.rush_yards && <StatCard label="Rush Yards" value={stats.rush_yards.toLocaleString()} />}
            {stats.rec_yards && <StatCard label="Rec Yards" value={stats.rec_yards.toLocaleString()} />}
          </>
        )}
      </div>
    );
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
        <Skeleton className="h-32 w-full" />
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
                      {typeof player.experience === 'string' 
                        ? player.experience 
                        : player.experience === 0 
                          ? "Rookie" 
                          : `${player.experience} yr${player.experience !== 1 ? "s" : ""}`}
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
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            2024 Season Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          {renderStats()}
          {!stats && (
            <p className="text-muted-foreground text-sm">
              No stats available for the 2024 season.
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border">
            Source: Ball Don't Lie API
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
