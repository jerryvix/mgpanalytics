import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, User, TrendingUp, Zap, Calendar, Target, BarChart3 } from "lucide-react";
import { NFLPlayerStatsCard } from "@/components/players/NFLPlayerStatsCard";
import { NFLGameLog } from "@/components/players/NFLGameLog";
import { NFLAdvancedStats } from "@/components/players/NFLAdvancedStats";
import { getPositionGroup } from "@/utils/nflStatsFormatters";

/** Detect if we're currently in a sport's postseason period */
function isInPostseason(sport: "NFL" | "NBA" | "NCAAB" | "MLB"): boolean {
  const month = new Date().getMonth(); // 0=Jan
  const day = new Date().getDate();
  switch (sport) {
    case "NFL":   return month === 0 || (month === 1 && day <= 15); // Jan 1 – Feb 15
    case "NBA":   return month >= 3 && month <= 5;                  // Apr – Jun
    case "NCAAB": return month === 2 || month === 3;                // Mar – Apr (March Madness)
    case "MLB":   return month === 9 || month === 10;               // Oct – Nov (World Series)
    default:      return false;
  }
}

/** Normalize full position names (e.g. "Quarterback") to abbreviations (e.g. "QB") */
function normalizePosition(pos: string): string {
  const map: Record<string, string> = {
    quarterback: "QB",
    "running back": "RB",
    fullback: "FB",
    "wide receiver": "WR",
    "tight end": "TE",
  };
  return map[pos.toLowerCase()] || pos;
}

export default function NFLPlayerDetail() {
  const { playerId } = useParams<{ playerId: string }>();
  const [seasonType, setSeasonType] = useState<"regular" | "postseason">(
    isInPostseason("NFL") ? "postseason" : "regular"
  );

  // Support both ID formats: "bdl-123" (BDL external_id) or UUID (Supabase ID)
  const isBdlId = playerId?.startsWith("bdl-");
  const lookupId = isBdlId ? playerId!.substring(4) : playerId;

  // Fetch player from DB — by external_id for BDL IDs, by id for UUIDs
  const { data: player, isLoading: playerLoading, error: playerError } = useQuery({
    queryKey: ["nfl-player-db", lookupId, isBdlId],
    queryFn: async () => {
      if (!lookupId) return null;
      let query = supabase.from("players").select("*").eq("sport", "NFL");
      if (isBdlId) {
        query = query.eq("external_id", lookupId);
      } else {
        query = query.eq("id", lookupId);
      }
      const { data, error } = await query.single();
      if (error) throw error;
      return data;
    },
    enabled: !!lookupId,
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

  // Fetch postseason stats from DB
  const { data: postseasonStats, isLoading: postseasonLoading } = useQuery({
    queryKey: ["nfl-player-postseason-stats-db", player?.id],
    queryFn: async () => {
      if (!player?.id) return null;
      const { data, error } = await supabase
        .from("player_season_stats")
        .select("*")
        .eq("player_id", player.id)
        .eq("sport", "NFL")
        .eq("season_type", "postseason")
        .order("season", { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: !!player?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Auto-fallback: if defaulted to postseason but no data, switch to regular
  useEffect(() => {
    if (seasonType === "postseason" && !postseasonLoading && !postseasonStats) {
      setSeasonType("regular");
    }
  }, [postseasonStats, postseasonLoading, seasonType]);

  // Fetch game logs from DB — filtered by season type
  // NFL regular season = weeks 1-18, postseason = weeks 19+ (or null week with Jan/Feb dates)
  const { data: gameLogs = [], isLoading: gameLogsLoading } = useQuery({
    queryKey: ["nfl-player-gamelogs-db", player?.id, seasonType],
    queryFn: async () => {
      if (!player?.id) return [];
      let query = supabase
        .from("player_game_logs")
        .select("*")
        .eq("player_id", player.id)
        .eq("sport", "NFL")
        .order("game_date", { ascending: false })
        .limit(20);

      // Filter by week if the column is available
      if (seasonType === "postseason") {
        query = query.gt("week", 18);
      } else {
        query = query.lte("week", 18);
      }

      const { data, error } = await query;
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

  // Fetch upcoming props
  const { data: props = [] } = useQuery({
    queryKey: ["nfl-player-props", player?.id],
    queryFn: async () => {
      if (!player?.id) return [];
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("player_props")
        .select("*")
        .eq("player_id", player.id)
        .eq("sport", "NFL")
        .gte("game_date", today)
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!player?.id,
  });

  // Fetch graded prop results
  const { data: propResults = [] } = useQuery({
    queryKey: ["nfl-player-prop-results", player?.id],
    queryFn: async () => {
      if (!player?.id) return [];
      const { data, error } = await supabase
        .from("player_props")
        .select("*")
        .eq("player_id", player.id)
        .eq("sport", "NFL")
        .eq("graded", true)
        .order("game_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data || [];
    },
    enabled: !!player?.id,
  });

  const getPositionColor = (pos: string) => {
    const norm = normalizePosition(pos);
    switch (norm) {
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

  if (!lookupId) {
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
        <h2 className="text-xl font-semibold text-foreground">No Betting Markets Available</h2>
        <p className="text-muted-foreground mt-2 max-w-md mx-auto">
          This player does not have betting-relevant markets in MGP.
          Only skill-position players (QB, RB, WR, TE) are supported.
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
  const posAbbr = normalizePosition(player.position || "");
  const posGroup = getPositionGroup(posAbbr);

  // Calculate season averages for highlighting in game log (uses selected season type)
  const activeStats = seasonType === "postseason" && postseasonStats ? postseasonStats : stats;
  const seasonAverages = activeStats ? {
    pass_yards: activeStats.games_played && activeStats.pass_yards ? activeStats.pass_yards / activeStats.games_played : undefined,
    rush_yards: activeStats.games_played && activeStats.rush_yards ? activeStats.rush_yards / activeStats.games_played : undefined,
    rec_yards: activeStats.games_played && activeStats.rec_yards ? activeStats.rec_yards / activeStats.games_played : undefined,
    receptions: activeStats.games_played && activeStats.receptions ? activeStats.receptions / activeStats.games_played : undefined,
  } : undefined;

  // Season label
  const seasonLabel = stats?.season ? String(stats.season) : (() => {
    const now = new Date();
    return String(now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1);
  })();

  // Prop type display labels
  const propLabel = (type: string) => ({
    pass_yards: "Pass Yards", rush_yards: "Rush Yards", rec_yards: "Rec Yards",
    pass_td: "Pass TDs", rush_td: "Rush TDs", receptions: "Receptions",
    pass_completions: "Completions", pass_attempts: "Pass Attempts",
    interceptions: "Interceptions", points: "Points", assists: "Assists",
    "pass+rush_yards": "Pass+Rush Yds", anytime_td: "Anytime TD",
  }[type] || type);

  const fmtOdds = (o: number | null) => o === null ? "—" : o > 0 ? `+${o}` : `${o}`;

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
      <Card className="bg-card border-border overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* Photo/Avatar */}
          <div className="w-full md:w-48 bg-gradient-to-br from-red-500/10 to-terminal-green/10 flex items-center justify-center p-6">
            {player.headshot_url ? (
              <img
                src={player.headshot_url}
                alt={fullName}
                className="w-32 h-32 rounded-full object-cover border-2 border-terminal-cyan/50"
              />
            ) : (
              <div className="w-32 h-32 rounded-full bg-muted flex items-center justify-center">
                <User className="w-16 h-16 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 p-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  {player.jersey_number && (
                    <span className="text-3xl font-bold text-terminal-cyan">#{player.jersey_number}</span>
                  )}
                  <h1 className="text-2xl font-bold text-foreground">{fullName}</h1>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Badge variant="outline" className={getPositionColor(posAbbr)}>
                    {posAbbr}
                  </Badge>
                  <span>|</span>
                  <span className="font-medium">{player.team_name || "Free Agent"}</span>
                </div>
              </div>

              {/* Injury badge */}
              {player.injury_status && player.injury_status !== "Healthy" && (
                <Badge className="bg-destructive/20 text-destructive border-destructive/50">
                  {player.injury_designation || player.injury_status}
                </Badge>
              )}
            </div>

            {/* Bio Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm pt-4">
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

            {/* Quick Stats Summary */}
            {stats && (
              <div className="grid grid-cols-4 md:grid-cols-5 gap-3 mt-4">
                {posGroup === "QB" && (
                  <>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-terminal-green">{stats.pass_yards?.toLocaleString() || "—"}</p>
                      <p className="text-xs text-muted-foreground">Pass Yds</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{stats.pass_td || "—"}</p>
                      <p className="text-xs text-muted-foreground">TDs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-destructive">{(stats as any).pass_int || "—"}</p>
                      <p className="text-xs text-muted-foreground">INTs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{stats.passer_rating?.toFixed(1) || "—"}</p>
                      <p className="text-xs text-muted-foreground">Rating</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{stats.games_played || 0}</p>
                      <p className="text-xs text-muted-foreground">GP</p>
                    </div>
                  </>
                )}
                {posGroup === "RB" && (
                  <>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-terminal-green">{stats.rush_yards?.toLocaleString() || "—"}</p>
                      <p className="text-xs text-muted-foreground">Rush Yds</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{stats.rush_td || "—"}</p>
                      <p className="text-xs text-muted-foreground">Rush TDs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{stats.rec_yards?.toLocaleString() || "—"}</p>
                      <p className="text-xs text-muted-foreground">Rec Yds</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{stats.games_played || 0}</p>
                      <p className="text-xs text-muted-foreground">GP</p>
                    </div>
                  </>
                )}
                {posGroup === "WR_TE" && (
                  <>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-terminal-green">{stats.rec_yards?.toLocaleString() || "—"}</p>
                      <p className="text-xs text-muted-foreground">Rec Yds</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{stats.receptions || "—"}</p>
                      <p className="text-xs text-muted-foreground">Rec</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{stats.rec_td || "—"}</p>
                      <p className="text-xs text-muted-foreground">TDs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{stats.games_played || 0}</p>
                      <p className="text-xs text-muted-foreground">GP</p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Season Type Filter */}
      {postseasonStats && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm text-muted-foreground">Viewing:</span>
          <Select value={seasonType} onValueChange={(v) => setSeasonType(v as "regular" | "postseason")}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="regular">Regular Season</SelectItem>
              <SelectItem value="postseason">Postseason</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

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
            stats={seasonType === "postseason" && postseasonStats ? postseasonStats : stats}
            position={posAbbr}
            isLoading={seasonType === "postseason" ? postseasonLoading : statsLoading}
          />
        </TabsContent>

        <TabsContent value="advanced">
          <NFLAdvancedStats
            stats={seasonType === "postseason" && postseasonStats ? postseasonStats : stats}
            gameLogs={gameLogs}
            position={posAbbr}
            isLoading={(seasonType === "postseason" ? postseasonLoading : statsLoading) || gameLogsLoading}
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
          <div className="space-y-4">
            {/* Upcoming Props */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Upcoming Props
                </CardTitle>
              </CardHeader>
              <CardContent>
                {props.length > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(
                      props.reduce((acc: Record<string, typeof props>, p) => {
                        if (!acc[p.prop_type]) acc[p.prop_type] = [];
                        acc[p.prop_type].push(p);
                        return acc;
                      }, {})
                    ).map(([propType, typeProps]) => {
                      const primary = typeProps.find((p) => p.sportsbook === "draftkings") || typeProps[0];
                      return (
                        <div key={propType} className="border border-border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-sm text-foreground font-semibold">{propLabel(propType)}</span>
                            <span className="font-mono text-lg text-terminal-cyan font-bold">O/U {primary.line}</span>
                          </div>
                          <div className="space-y-1">
                            {typeProps.map((prop) => {
                              const bookLabel = {
                                draftkings: "DraftKings", fanduel: "FanDuel",
                                betmgm: "BetMGM", caesars: "Caesars",
                              }[prop.sportsbook.toLowerCase()] || prop.sportsbook;
                              return (
                                <div key={`${prop.prop_type}-${prop.sportsbook}`} className="flex items-center justify-between text-xs font-mono">
                                  <span className="text-muted-foreground">{bookLabel}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-terminal-green">{fmtOdds(prop.over_odds)}</span>
                                    <span className="text-muted-foreground">/</span>
                                    <span className="text-terminal-amber">{fmtOdds(prop.under_odds)}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No upcoming props available. Props typically release on game day around 10 AM ET.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Prop Results History */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Prop Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                {propResults.length > 0 ? (
                  <>
                    {/* Hit Rate Summary */}
                    {(() => {
                      const scored = propResults.filter((p) => p.result === "over" || p.result === "under");
                      const overs = scored.filter((p) => p.result === "over").length;
                      return scored.length > 0 ? (
                        <div className="bg-terminal-cyan/5 border border-terminal-cyan/20 rounded-lg p-3 mb-4">
                          <p className="font-mono text-xs text-terminal-cyan">
                            Overall: {overs}/{scored.length} Overs hit ({((overs / scored.length) * 100).toFixed(0)}%)
                          </p>
                        </div>
                      ) : null;
                    })()}

                    {/* Results Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs font-mono">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground">
                            <th className="text-left py-2 pr-2">Date</th>
                            <th className="text-left py-2 pr-2">Prop</th>
                            <th className="text-right py-2 pr-2">Line</th>
                            <th className="text-right py-2 pr-2">Actual</th>
                            <th className="text-right py-2">Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {propResults.map((prop) => {
                            const date = prop.game_date
                              ? new Date(prop.game_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
                              : "—";
                            return (
                              <tr key={prop.id} className="border-b border-border/50">
                                <td className="py-1.5 pr-2 text-muted-foreground">{date}</td>
                                <td className="py-1.5 pr-2">{propLabel(prop.prop_type)}</td>
                                <td className="py-1.5 pr-2 text-right">{prop.line}</td>
                                <td className="py-1.5 pr-2 text-right font-semibold">{prop.actual_value ?? "—"}</td>
                                <td className="py-1.5 text-right">
                                  {prop.result === "over" && (
                                    <Badge className="bg-terminal-green/20 text-terminal-green border-terminal-green/50 text-[10px]">OVER</Badge>
                                  )}
                                  {prop.result === "under" && (
                                    <Badge className="bg-terminal-amber/20 text-terminal-amber border-terminal-amber/50 text-[10px]">UNDER</Badge>
                                  )}
                                  {prop.result === "push" && (
                                    <Badge variant="outline" className="text-[10px]">PUSH</Badge>
                                  )}
                                  {prop.result === "void" && (
                                    <Badge variant="outline" className="text-[10px] text-muted-foreground">VOID</Badge>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No prop results yet. Results appear after games are completed and graded.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
