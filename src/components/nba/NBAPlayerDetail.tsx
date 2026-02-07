import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  User,
  TrendingUp,
  Zap,
  Calendar,
  BarChart3,
  Target,
  AlertTriangle,
} from "lucide-react";
import { NBAGameLog } from "./NBAGameLog";
import { NBAAdvancedStats } from "./NBAAdvancedStats";
import { NBASplits } from "./NBASplits";

interface NBAPlayerDetailProps {
  playerId: string;
}

// Simple stat display component for traditional stats
function SimpleStatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-lg border ${highlight ? "border-terminal-green/50 bg-terminal-green/5" : "border-border bg-card"}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono ${highlight ? "text-terminal-green" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

export function NBAPlayerDetail({ playerId }: NBAPlayerDetailProps) {
  const navigate = useNavigate();

  // Fetch player info
  const { data: player, isLoading: playerLoading } = useQuery({
    queryKey: ["nba-player", playerId],
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

  // Fetch season stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["nba-player-stats", playerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("player_season_stats")
        .select("*")
        .eq("player_id", playerId)
        .eq("sport", "NBA")
        .eq("season", new Date().getMonth() >= 9 ? new Date().getFullYear() + 1 : new Date().getFullYear())
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: !!playerId,
  });

  // Fetch game logs
  const { data: gameLogs = [], isLoading: gameLogsLoading } = useQuery({
    queryKey: ["nba-player-game-logs", playerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("player_game_logs")
        .select("*")
        .eq("player_id", playerId)
        .eq("sport", "NBA")
        .eq("season", new Date().getMonth() >= 9 ? new Date().getFullYear() + 1 : new Date().getFullYear())
        .order("game_date", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!playerId,
  });

  // Fetch upcoming props for this player
  const { data: props = [] } = useQuery({
    queryKey: ["nba-player-props", playerId],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("player_props")
        .select("*")
        .eq("player_id", playerId)
        .eq("sport", "NBA")
        .gte("game_date", today)
        .eq("is_active", true);

      if (error) throw error;
      return data || [];
    },
    enabled: !!playerId,
  });

  // Fetch graded prop results
  const { data: propResults = [] } = useQuery({
    queryKey: ["nba-player-prop-results", playerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("player_props")
        .select("*")
        .eq("player_id", playerId)
        .eq("sport", "NBA")
        .eq("graded", true)
        .order("game_date", { ascending: false })
        .limit(30);

      if (error) throw error;
      return data || [];
    },
    enabled: !!playerId,
  });

  if (playerLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-32 col-span-1" />
          <Skeleton className="h-32 col-span-3" />
        </div>
      </div>
    );
  }

  if (!player) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-12 text-center">
          <User className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-foreground">Player not found</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate("/dashboard/nba/players")}
          >
            Back to Players
          </Button>
        </CardContent>
      </Card>
    );
  }

  const seasonAverages = stats
    ? {
        points: stats.points_per_game || 0,
        rebounds: stats.rebounds_per_game || 0,
        assists: stats.assists_per_game || 0,
        minutes: stats.minutes_per_game || 0,
      }
    : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
      </div>

      {/* Player Bio Card */}
      <Card className="bg-card border-border overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* Photo/Avatar */}
          <div className="w-full md:w-48 bg-gradient-to-br from-terminal-cyan/20 to-terminal-green/10 flex items-center justify-center p-6">
            {player.headshot_url ? (
              <img
                src={player.headshot_url}
                alt={player.name}
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
                  <h1 className="text-2xl font-bold text-foreground">{player.name}</h1>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Badge variant="outline">{player.position || "—"}</Badge>
                  <span>•</span>
                  <span>{player.team_name || "Free Agent"}</span>
                </div>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                {player.injury_status && player.injury_status !== "Healthy" && (
                  <Badge className="bg-destructive/20 text-destructive border-destructive/50">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    {player.injury_designation || player.injury_status}
                  </Badge>
                )}
                {player.is_featured && (
                  <Badge className="bg-terminal-amber/20 text-terminal-amber border-terminal-amber/50">
                    ⭐ Featured
                  </Badge>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 mt-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-terminal-green">
                    {stats.points_per_game?.toFixed(1) || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">PPG</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {stats.rebounds_per_game?.toFixed(1) || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">RPG</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {stats.assists_per_game?.toFixed(1) || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">APG</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {(stats.field_goal_pct || 0).toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground">FG%</p>
                </div>
                <div className="text-center hidden md:block">
                  <p className="text-2xl font-bold text-foreground">{stats.games_played || 0}</p>
                  <p className="text-xs text-muted-foreground">GP</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="traditional" className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-4">
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
          <TabsTrigger value="splits" className="text-xs sm:text-sm">
            <BarChart3 className="w-4 h-4 mr-1.5 hidden sm:inline" />
            Splits
          </TabsTrigger>
          <TabsTrigger value="props" className="text-xs sm:text-sm">
            <Target className="w-4 h-4 mr-1.5 hidden sm:inline" />
            Props
          </TabsTrigger>
        </TabsList>

        {/* Traditional Stats */}
        <TabsContent value="traditional">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                {(() => {
                  const s = stats?.season || (new Date().getMonth() >= 9 ? new Date().getFullYear() + 1 : new Date().getFullYear());
                  return `${s - 1}-${String(s).slice(2)} Season Stats`;
                })()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
              ) : stats ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  <SimpleStatCard label="Games" value={stats.games_played?.toString() || "0"} />
                  <SimpleStatCard label="PPG" value={stats.points_per_game?.toFixed(1) || "0.0"} highlight />
                  <SimpleStatCard label="RPG" value={stats.rebounds_per_game?.toFixed(1) || "0.0"} />
                  <SimpleStatCard label="APG" value={stats.assists_per_game?.toFixed(1) || "0.0"} />
                  <SimpleStatCard label="MPG" value={stats.minutes_per_game?.toFixed(1) || "0.0"} />
                  <SimpleStatCard label="SPG" value={stats.steals_per_game?.toFixed(1) || "0.0"} />
                  <SimpleStatCard label="BPG" value={stats.blocks_per_game?.toFixed(1) || "0.0"} />
                  <SimpleStatCard label="TO" value={stats.turnovers_per_game?.toFixed(1) || "0.0"} />
                  <SimpleStatCard label="FG%" value={(stats.field_goal_pct || 0).toFixed(1) + "%"} />
                  <SimpleStatCard label="3P%" value={(stats.three_point_pct || 0).toFixed(1) + "%"} />
                  <SimpleStatCard label="FT%" value={(stats.free_throw_pct || 0).toFixed(1) + "%"} />
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No season stats available. Try syncing from the Admin Panel.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Stats */}
        <TabsContent value="advanced">
          <NBAAdvancedStats
            stats={stats}
            gameLogs={gameLogs}
            position={player.position || ""}
            isLoading={statsLoading}
          />
        </TabsContent>

        {/* Game Log */}
        <TabsContent value="gamelog">
          <NBAGameLog
            gameLogs={gameLogs}
            playerName={player.name}
            seasonAverages={seasonAverages}
            isLoading={gameLogsLoading}
          />
        </TabsContent>

        {/* Splits */}
        <TabsContent value="splits">
          <NBASplits
            gameLogs={gameLogs}
            playerName={player.name}
            isLoading={gameLogsLoading}
          />
        </TabsContent>

        {/* Props */}
        <TabsContent value="props">
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
                      const label = {
                        points: "Points", rebounds: "Rebounds", assists: "Assists",
                        threes: "3-Pointers", blocks: "Blocks", steals: "Steals",
                        turnovers: "Turnovers", "pts+reb+ast": "PTS+REB+AST",
                        "pts+reb": "PTS+REB", "pts+ast": "PTS+AST", "reb+ast": "REB+AST",
                      }[propType] || propType;

                      return (
                        <div key={propType} className="border border-border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-sm text-foreground font-semibold">{label}</span>
                            <span className="font-mono text-lg text-terminal-cyan font-bold">O/U {primary.line}</span>
                          </div>
                          <div className="space-y-1">
                            {typeProps.map((prop) => {
                              const bookLabel = {
                                draftkings: "DraftKings", fanduel: "FanDuel",
                                betmgm: "BetMGM", caesars: "Caesars",
                              }[prop.sportsbook.toLowerCase()] || prop.sportsbook;
                              const fmtOdds = (o: number | null) => o === null ? "—" : o > 0 ? `+${o}` : `${o}`;
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
                            const label = {
                              points: "PTS", rebounds: "REB", assists: "AST",
                              threes: "3PM", blocks: "BLK", steals: "STL",
                              turnovers: "TO", "pts+reb+ast": "P+R+A",
                              "pts+reb": "P+R", "pts+ast": "P+A", "reb+ast": "R+A",
                            }[prop.prop_type] || prop.prop_type;
                            const date = prop.game_date
                              ? new Date(prop.game_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
                              : "—";
                            return (
                              <tr key={prop.id} className="border-b border-border/50">
                                <td className="py-1.5 pr-2 text-muted-foreground">{date}</td>
                                <td className="py-1.5 pr-2">{label}</td>
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

            {/* Recent Game Context */}
            {gameLogs.length > 0 && (
              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <div className="bg-terminal-green/5 border border-terminal-green/20 rounded-lg p-4">
                    <h4 className="font-mono text-sm text-terminal-green mb-3">RECENT CONTEXT</h4>
                    <div className="space-y-2 text-sm font-mono">
                      <p className="text-muted-foreground">
                        Last 5 games:{" "}
                        <span className="text-foreground">
                          {gameLogs.slice(0, 5).map((g) => g.points).join(", ")} PTS
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Last 5 avg:{" "}
                        <span className="text-foreground">
                          {(gameLogs.slice(0, 5).reduce((a, g) => a + (g.points || 0), 0) / Math.min(gameLogs.length, 5)).toFixed(1)} PPG
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Season avg:{" "}
                        <span className="text-foreground">{stats?.points_per_game?.toFixed(1) || "—"} PPG</span>
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
