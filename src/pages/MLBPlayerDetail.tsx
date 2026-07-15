import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Flame } from "lucide-react";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { TrendChart, TrendPoint } from "@/components/ui/TrendChart";
import { CountUp } from "@/components/ui/CountUp";
import { FollowButton } from "@/components/ui/FollowButton";

const mlbSeason = () => new Date().getFullYear();

interface GameLog {
  game_date: string | null;
  hits: number | null;
  at_bats: number | null;
  home_runs: number | null;
  rbi: number | null;
  opponent_abbr: string | null;
}

async function loadPlayer(playerId: string) {
  const season = mlbSeason();
  const [{ data: player }, { data: stats }, { data: logs }] = await Promise.all([
    supabase
      .from("players")
      .select("id, name, team_name, team_abbr, position, headshot_url")
      .eq("id", playerId)
      .maybeSingle(),
    supabase
      .from("player_season_stats")
      .select("batting_avg, ops, home_runs, rbi, at_bats, hit_streak, hit_streak_avg")
      .eq("sport", "MLB")
      .eq("season", season)
      .eq("player_id", playerId)
      .maybeSingle(),
    supabase
      .from("player_game_logs")
      .select("game_date, hits, at_bats, home_runs, rbi, opponent_abbr")
      .eq("sport", "MLB")
      .eq("season", season)
      .eq("player_id", playerId)
      .order("game_date", { ascending: false })
      .limit(30),
  ]);
  return { player, stats, logs: ((logs || []) as GameLog[]).reverse() }; // oldest → newest
}

// Rolling 10-game batting average across the log window — the form curve.
function rollingAvgPoints(logs: GameLog[]): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (let i = 9; i < logs.length; i++) {
    const win = logs.slice(i - 9, i + 1);
    const ab = win.reduce((s, g) => s + (g.at_bats || 0), 0);
    const hits = win.reduce((s, g) => s + (g.hits || 0), 0);
    if (ab === 0) continue;
    const g = logs[i];
    const when = g.game_date ? format(parseISO(g.game_date), "MMM d") : "";
    points.push({
      label: `${when}${g.opponent_abbr ? ` vs ${g.opponent_abbr}` : ""} — 10-game AVG ${(hits / ab).toFixed(3).replace(/^0/, "")}`,
      value: hits / ab,
    });
  }
  return points;
}

const fmtAvg = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : v.toFixed(3).replace(/^0/, "");

export default function MLBPlayerDetail() {
  const { playerId } = useParams<{ playerId: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["mlb-player", playerId],
    queryFn: () => loadPlayer(playerId!),
    enabled: !!playerId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const player = data?.player;
  if (!player) {
    return (
      <div className="space-y-4">
        <Link to="/dashboard/mlb/players" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-terminal-green font-mono">
          <ArrowLeft className="w-4 h-4" /> MLB Players
        </Link>
        <p className="text-muted-foreground font-mono">Player not found.</p>
      </div>
    );
  }

  const stats = data.stats;
  const logs = data.logs;
  const chartPoints = rollingAvgPoints(logs);
  const recent = [...logs].reverse().slice(0, 10); // newest first for the table

  return (
    <div className="space-y-4 max-w-3xl">
      <Link to="/dashboard/mlb/players" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-terminal-green font-mono">
        <ArrowLeft className="w-4 h-4" /> MLB Players
      </Link>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0">
              {player.headshot_url ? (
                <img src={player.headshot_url} alt={player.name} className="w-full h-full object-cover" />
              ) : (
                <span className="font-bold text-muted-foreground">
                  {player.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2)}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-foreground truncate">{player.name}</h1>
                <FollowButton
                  entity={{ entityType: "player", entityKey: player.id, entityLabel: player.name, sport: "MLB" }}
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
                {player.team_abbr && (
                  <TeamLogo sport="MLB" name={player.team_name || player.team_abbr} abbr={player.team_abbr} size={18} />
                )}
                <span>{player.team_name || player.team_abbr}</span>
                {player.position && (
                  <>
                    <span>•</span>
                    <span>{player.position}</span>
                  </>
                )}
              </div>
            </div>
            {(stats?.hit_streak ?? 0) >= 5 && (
              <Badge className="bg-terminal-amber/15 text-terminal-amber border-terminal-amber/30 font-mono shrink-0">
                <Flame className="w-3 h-3 mr-1" />
                {stats!.hit_streak}-game hit streak
              </Badge>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Season stat tiles */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="grid grid-cols-4 gap-2"
        >
          {[
            { label: "AVG", node: <span>{fmtAvg(stats.batting_avg)}</span> },
            { label: "OPS", node: <span>{stats.ops === null ? "—" : stats.ops.toFixed(3)}</span> },
            { label: "HR", node: <CountUp value={stats.home_runs ?? 0} /> },
            { label: "RBI", node: <CountUp value={stats.rbi ?? 0} /> },
          ].map((t) => (
            <Card key={t.label} className="bg-card border-border">
              <CardContent className="p-3 text-center">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{t.label}</div>
                <div className="text-xl font-bold font-mono tabular-nums text-terminal-green">{t.node}</div>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      )}

      {/* Form chart */}
      {chartPoints.length >= 2 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground mb-1">
                Form Curve
              </h2>
              <p className="text-[11px] text-muted-foreground mb-2">
                Rolling 10-game batting average vs. season line — is the bat heating up or cooling off?
              </p>
              <TrendChart
                points={chartPoints}
                refValue={stats?.batting_avg ?? undefined}
                refLabel="Season"
              />
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Recent games */}
      {recent.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground px-4 py-3 border-b border-border">
                Last {recent.length} Games
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left font-medium px-4 py-2">Date</th>
                      <th className="text-left font-medium px-2 py-2">Opp</th>
                      <th className="text-right font-medium px-2 py-2">H-AB</th>
                      <th className="text-right font-medium px-2 py-2">HR</th>
                      <th className="text-right font-medium px-4 py-2">RBI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((g, i) => (
                      <tr key={i} className={`border-b border-border/50 ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                        <td className="px-4 py-2 font-mono text-muted-foreground">
                          {g.game_date ? format(parseISO(g.game_date), "MMM d") : "—"}
                        </td>
                        <td className="px-2 py-2 font-mono">
                          <span className="inline-flex items-center gap-1.5">
                            {g.opponent_abbr && (
                              <TeamLogo sport="MLB" name={g.opponent_abbr} abbr={g.opponent_abbr} size={14} />
                            )}
                            {g.opponent_abbr || "—"}
                          </span>
                        </td>
                        <td className={`px-2 py-2 text-right font-mono tabular-nums ${(g.hits || 0) > 0 ? "text-terminal-green" : "text-muted-foreground"}`}>
                          {g.hits ?? 0}-{g.at_bats ?? 0}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">{g.home_runs ?? 0}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">{g.rbi ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
