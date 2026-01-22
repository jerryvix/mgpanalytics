import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Loader2, Database, Users, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface JoshAllenData {
  first_name: string;
  last_name: string;
  position: string;
  team_abbr: string;
  season: number | null;
  games_played: number | null;
  pass_yards: number | null;
  pass_td: number | null;
  pass_int: number | null;
  rush_yards: number | null;
  rush_td: number | null;
}

interface TopPasserData {
  first_name: string;
  last_name: string;
  pass_yards: number;
  pass_td: number;
}

interface PositionData {
  position: string;
  count: number;
}

export function DataInspector() {
  const [isLoading, setIsLoading] = useState(false);
  const [joshAllenData, setJoshAllenData] = useState<JoshAllenData[] | null>(null);
  const [topPassersData, setTopPassersData] = useState<TopPasserData[] | null>(null);
  const [positionData, setPositionData] = useState<PositionData[] | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const runDiagnostics = async () => {
    setIsLoading(true);
    setHasRun(true);

    try {
      // Query 1: Josh Allen's actual data
      const { data: joshData } = await supabase
        .from("players")
        .select(`
          first_name,
          last_name,
          position,
          team_abbr,
          player_season_stats (
            season,
            games_played,
            pass_yards,
            pass_td,
            pass_int,
            rush_yards,
            rush_td
          )
        `)
        .ilike("first_name", "josh")
        .ilike("last_name", "allen")
        .eq("sport", "NFL");

      // Flatten the joined data
      const flattenedJoshData: JoshAllenData[] = [];
      if (joshData) {
        for (const player of joshData) {
          const stats = player.player_season_stats;
          if (stats && stats.length > 0) {
            for (const stat of stats) {
              flattenedJoshData.push({
                first_name: player.first_name || "",
                last_name: player.last_name || "",
                position: player.position || "",
                team_abbr: player.team_abbr || "",
                season: stat.season,
                games_played: stat.games_played,
                pass_yards: stat.pass_yards,
                pass_td: stat.pass_td,
                pass_int: stat.pass_int,
                rush_yards: stat.rush_yards,
                rush_td: stat.rush_td,
              });
            }
          } else {
            flattenedJoshData.push({
              first_name: player.first_name || "",
              last_name: player.last_name || "",
              position: player.position || "",
              team_abbr: player.team_abbr || "",
              season: null,
              games_played: null,
              pass_yards: null,
              pass_td: null,
              pass_int: null,
              rush_yards: null,
              rush_td: null,
            });
          }
        }
      }
      setJoshAllenData(flattenedJoshData);

      // Query 2: Top 5 passers (using join)
      const { data: passersRaw } = await supabase
        .from("player_season_stats")
        .select(`
          pass_yards,
          pass_td,
          players!inner (
            first_name,
            last_name,
            sport
          )
        `)
        .eq("players.sport", "NFL")
        .gt("pass_yards", 1000)
        .order("pass_yards", { ascending: false })
        .limit(5);

      const passersFlat: TopPasserData[] = (passersRaw || []).map((row: any) => ({
        first_name: row.players?.first_name || "",
        last_name: row.players?.last_name || "",
        pass_yards: row.pass_yards || 0,
        pass_td: row.pass_td || 0,
      }));
      setTopPassersData(passersFlat);

      // Query 3: Position values
      const { data: positions } = await supabase
        .rpc("get_position_counts" as any);

      // Fallback: manual count if RPC doesn't exist
      if (!positions) {
        const { data: allPlayers } = await supabase
          .from("players")
          .select("position")
          .eq("sport", "NFL");

        if (allPlayers) {
          const positionCounts: Record<string, number> = {};
          for (const p of allPlayers) {
            const pos = p.position || "Unknown";
            positionCounts[pos] = (positionCounts[pos] || 0) + 1;
          }
          const sorted = Object.entries(positionCounts)
            .map(([position, count]) => ({ position, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
          setPositionData(sorted);
        }
      } else {
        setPositionData(positions as PositionData[]);
      }
    } catch (error) {
      console.error("Diagnostics error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="md:col-span-2"
    >
      <Card className="bg-card border-terminal-amber/30">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
            <Search className="w-4 h-4 text-terminal-amber" />
            Data Inspector
          </CardTitle>
          <Badge variant="outline" className="border-terminal-amber text-terminal-amber text-[10px]">
            DEBUG
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center font-mono text-xs border-terminal-amber/50 hover:bg-terminal-amber/10"
            onClick={runDiagnostics}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                Running Queries...
              </>
            ) : (
              <>
                <Database className="w-3 h-3 mr-2" />
                Run Diagnostic Queries
              </>
            )}
          </Button>

          {hasRun && !isLoading && (
            <div className="space-y-6">
              {/* Query 1: Josh Allen */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="w-3 h-3 text-terminal-green" />
                  <span className="font-mono text-xs text-muted-foreground">
                    Query 1: Josh Allen's Data
                  </span>
                  <Badge variant="outline" className="text-[9px] px-1">
                    {joshAllenData?.length || 0} rows
                  </Badge>
                </div>
                {joshAllenData && joshAllenData.length > 0 ? (
                  <div className="overflow-auto max-h-48 rounded border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-mono text-[10px] h-8">Name</TableHead>
                          <TableHead className="font-mono text-[10px] h-8">Pos</TableHead>
                          <TableHead className="font-mono text-[10px] h-8">Team</TableHead>
                          <TableHead className="font-mono text-[10px] h-8">Season</TableHead>
                          <TableHead className="font-mono text-[10px] h-8">GP</TableHead>
                          <TableHead className="font-mono text-[10px] h-8">Pass Yds</TableHead>
                          <TableHead className="font-mono text-[10px] h-8">Pass TD</TableHead>
                          <TableHead className="font-mono text-[10px] h-8">INT</TableHead>
                          <TableHead className="font-mono text-[10px] h-8">Rush Yds</TableHead>
                          <TableHead className="font-mono text-[10px] h-8">Rush TD</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {joshAllenData.map((row, idx) => (
                          <TableRow key={idx} className="font-mono text-[10px]">
                            <TableCell className="py-1">
                              {row.first_name} {row.last_name}
                            </TableCell>
                            <TableCell className="py-1">{row.position}</TableCell>
                            <TableCell className="py-1">{row.team_abbr}</TableCell>
                            <TableCell className="py-1">{row.season ?? "—"}</TableCell>
                            <TableCell className="py-1">{row.games_played ?? "—"}</TableCell>
                            <TableCell className="py-1 text-terminal-green">
                              {row.pass_yards?.toLocaleString() ?? "—"}
                            </TableCell>
                            <TableCell className="py-1 text-terminal-green">
                              {row.pass_td ?? "—"}
                            </TableCell>
                            <TableCell className="py-1 text-terminal-red">
                              {row.pass_int ?? "—"}
                            </TableCell>
                            <TableCell className="py-1 text-terminal-cyan">
                              {row.rush_yards?.toLocaleString() ?? "—"}
                            </TableCell>
                            <TableCell className="py-1 text-terminal-cyan">
                              {row.rush_td ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-xs font-mono text-muted-foreground bg-muted/30 p-2 rounded">
                    No "Josh Allen" found in NFL players
                  </div>
                )}
              </div>

              {/* Query 2: Top Passers */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Trophy className="w-3 h-3 text-terminal-cyan" />
                  <span className="font-mono text-xs text-muted-foreground">
                    Query 2: Top 5 Passers (pass_yards &gt; 1000)
                  </span>
                  <Badge variant="outline" className="text-[9px] px-1">
                    {topPassersData?.length || 0} rows
                  </Badge>
                </div>
                {topPassersData && topPassersData.length > 0 ? (
                  <div className="overflow-auto max-h-40 rounded border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-mono text-[10px] h-8">#</TableHead>
                          <TableHead className="font-mono text-[10px] h-8">Name</TableHead>
                          <TableHead className="font-mono text-[10px] h-8">Pass Yards</TableHead>
                          <TableHead className="font-mono text-[10px] h-8">Pass TD</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topPassersData.map((row, idx) => (
                          <TableRow key={idx} className="font-mono text-[10px]">
                            <TableCell className="py-1">{idx + 1}</TableCell>
                            <TableCell className="py-1">
                              {row.first_name} {row.last_name}
                            </TableCell>
                            <TableCell className="py-1 text-terminal-green">
                              {row.pass_yards?.toLocaleString()}
                            </TableCell>
                            <TableCell className="py-1 text-terminal-green">
                              {row.pass_td}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-xs font-mono text-muted-foreground bg-muted/30 p-2 rounded">
                    No players with pass_yards &gt; 1000 found (column may be empty)
                  </div>
                )}
              </div>

              {/* Query 3: Positions */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="w-3 h-3 text-terminal-amber" />
                  <span className="font-mono text-xs text-muted-foreground">
                    Query 3: Position Values (QB vs Quarterback?)
                  </span>
                  <Badge variant="outline" className="text-[9px] px-1">
                    {positionData?.length || 0} positions
                  </Badge>
                </div>
                {positionData && positionData.length > 0 ? (
                  <div className="overflow-auto max-h-48 rounded border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-mono text-[10px] h-8">Position</TableHead>
                          <TableHead className="font-mono text-[10px] h-8">Count</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {positionData.map((row, idx) => (
                          <TableRow key={idx} className="font-mono text-[10px]">
                            <TableCell className="py-1">
                              <code className="bg-muted px-1 rounded">
                                {row.position || "(empty)"}
                              </code>
                            </TableCell>
                            <TableCell className="py-1">{row.count?.toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-xs font-mono text-muted-foreground bg-muted/30 p-2 rounded">
                    No position data found
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="bg-muted/30 rounded p-3 font-mono text-xs space-y-1">
                <div className="text-muted-foreground font-semibold">Summary:</div>
                <div>
                  • Josh Allen found: <span className={joshAllenData && joshAllenData.length > 0 ? "text-terminal-green" : "text-terminal-red"}>
                    {joshAllenData && joshAllenData.length > 0 ? "Yes" : "No"}
                  </span>
                </div>
                <div>
                  • Has season stats: <span className={joshAllenData?.some(r => r.season !== null) ? "text-terminal-green" : "text-terminal-red"}>
                    {joshAllenData?.some(r => r.season !== null) ? "Yes" : "No"}
                  </span>
                </div>
                <div>
                  • pass_yards column populated: <span className={topPassersData && topPassersData.length > 0 ? "text-terminal-green" : "text-terminal-red"}>
                    {topPassersData && topPassersData.length > 0 ? "Yes" : "No (data may be in raw_data JSON)"}
                  </span>
                </div>
                <div>
                  • Position format: <span className="text-terminal-amber">
                    {positionData?.[0]?.position || "Unknown"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
