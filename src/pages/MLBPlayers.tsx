import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, Search, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MLBSlatePlayerCard } from "@/components/mlb/MLBSlatePlayerCard";
import { HitStreakTable, HitStreakRow } from "@/components/mlb/HitStreakTable";

const mlbSeason = () => new Date().getFullYear();

interface SeasonStat {
  player_id: string;
  batting_avg: number | null;
  ops: number | null;
  home_runs: number | null;
  rbi: number | null;
  at_bats: number | null;
  hit_streak: number | null;
  hit_streak_avg: number | null;
}

async function loadMlbPlayers() {
  const season = mlbSeason();
  const today = new Date().toISOString().split("T")[0];

  // Players
  const { data: players } = await supabase
    .from("players")
    .select("id, name, team_name, team_abbr, position, headshot_url")
    .eq("sport", "MLB")
    .eq("status", "active");

  const playerIds = (players || []).map((p) => p.id);
  if (playerIds.length === 0) return { grid: [], streaks: [] as HitStreakRow[] };

  // Season stats (chunk the .in filter for large id sets)
  const stats: SeasonStat[] = [];
  for (let i = 0; i < playerIds.length; i += 300) {
    const { data } = await supabase
      .from("player_season_stats")
      .select("player_id, batting_avg, ops, home_runs, rbi, at_bats, hit_streak, hit_streak_avg")
      .eq("sport", "MLB")
      .eq("season", season)
      .in("player_id", playerIds.slice(i, i + 300));
    if (data) stats.push(...(data as SeasonStat[]));
  }
  const statMap = new Map(stats.map((s) => [s.player_id, s]));

  // Last-7-game avg from game logs (only for streaking players, to bound the query)
  const streakingIds = stats.filter((s) => (s.hit_streak ?? 0) > 0).map((s) => s.player_id);
  const l7Map = new Map<string, number>();
  if (streakingIds.length > 0) {
    const { data: logs } = await supabase
      .from("player_game_logs")
      .select("player_id, game_date, hits, at_bats")
      .eq("sport", "MLB")
      .eq("season", season)
      .in("player_id", streakingIds)
      .order("game_date", { ascending: false });
    const byPlayer = new Map<string, { hits: number; ab: number }[]>();
    for (const log of logs || []) {
      const arr = byPlayer.get(log.player_id) || [];
      if (arr.length < 7) arr.push({ hits: log.hits || 0, ab: log.at_bats || 0 });
      byPlayer.set(log.player_id, arr);
    }
    for (const [pid, games] of byPlayer) {
      const ab = games.reduce((s, g) => s + g.ab, 0);
      const hits = games.reduce((s, g) => s + g.hits, 0);
      if (ab > 0) l7Map.set(pid, hits / ab);
    }
  }

  // Next matchup + probable pitcher, keyed by team name. Reach back 5h
  // (same as the slate) so a game that's underway still counts as the
  // team's matchup — that's what the live badge hangs off.
  const in7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: games } = await supabase
    .from("mlb_games")
    .select("home_team_name, visitor_team_name, date, starting_pitcher_home, starting_pitcher_away")
    .gte("date", new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString())
    .lte("date", in7)
    .order("date", { ascending: true });
  const nextByTeam = new Map<string, { opponent: string; pitcher: string | null; date: string }>();
  for (const g of games || []) {
    if (!nextByTeam.has(g.home_team_name)) {
      nextByTeam.set(g.home_team_name, { opponent: g.visitor_team_name, pitcher: g.starting_pitcher_away, date: g.date });
    }
    if (!nextByTeam.has(g.visitor_team_name)) {
      nextByTeam.set(g.visitor_team_name, { opponent: g.home_team_name, pitcher: g.starting_pitcher_home, date: g.date });
    }
  }

  // Props flag
  const propIds = new Set<string>();
  for (let i = 0; i < playerIds.length; i += 300) {
    const { data: props } = await supabase
      .from("player_props")
      .select("player_id")
      .eq("sport", "MLB")
      .gte("game_date", today)
      .eq("is_active", true)
      .in("player_id", playerIds.slice(i, i + 300));
    for (const p of props || []) propIds.add(p.player_id);
  }

  // Hit-streak rows — 5+ games qualifies as a genuine "hot" streak
  const streaks: HitStreakRow[] = stats
    .filter((s) => (s.hit_streak ?? 0) >= 5)
    .map((s) => {
      const p = players!.find((pp) => pp.id === s.player_id)!;
      const next = p?.team_name ? nextByTeam.get(p.team_name) : undefined;
      return {
        playerId: s.player_id,
        name: p?.name || "Unknown",
        team: p?.team_abbr || p?.team_name || "",
        teamName: p?.team_name || null,
        headshotUrl: p?.headshot_url || undefined,
        streak: s.hit_streak ?? 0,
        seasonAvg: s.batting_avg ?? 0,
        streakAvg: s.hit_streak_avg ?? 0,
        last7Avg: l7Map.get(s.player_id) ?? null,
        nextOpponent: next?.opponent || null,
        nextPitcher: next?.pitcher || null,
        nextGameDate: next?.date || null,
      };
    })
    .sort((a, b) => b.streak - a.streak || b.streakAvg - a.streakAvg);

  // Player grid — qualified hitters (>=40 AB) ranked by OPS
  const grid = (players || [])
    .map((p) => ({ player: p, stat: statMap.get(p.id) }))
    .filter((x) => x.stat && (x.stat.at_bats ?? 0) >= 40 && (x.stat.ops ?? 0) > 0)
    .sort((a, b) => (b.stat!.ops ?? 0) - (a.stat!.ops ?? 0))
    .map((x, index) => ({
      ...x.player,
      stat: x.stat!,
      rank: index + 1,
      hasProps: propIds.has(x.player.id),
    }));

  return { grid, streaks };
}

export default function MLBPlayers() {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["mlb-players"],
    queryFn: loadMlbPlayers,
    refetchInterval: 30 * 60 * 1000,
  });

  const grid = data?.grid || [];
  const streaks = data?.streaks || [];
  const filtered = grid.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.team_name || "").toLowerCase().includes(search.toLowerCase())
  );
  const visible = showAll ? filtered : filtered.slice(0, 12);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 p-4 sm:p-6"
    >
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <span role="img" aria-label="baseball">⚾</span> MLB Players
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Hot hitters, hit streaks, and the season's top bats.
        </p>
      </div>

      {/* Hit streak table — the headline feature */}
      <HitStreakTable rows={streaks} isLoading={isLoading} />

      {/* Player grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
            <Flame className="w-4 h-4 text-terminal-green" />
            Top Bats by OPS
          </h2>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search players or teams…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 font-mono text-sm"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading players…
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            No qualified hitters yet. Data populates as the season's stats sync in.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visible.map((p) => (
                <MLBSlatePlayerCard
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  team={p.team_abbr || p.team_name || ""}
                  position={p.position || ""}
                  headshotUrl={p.headshot_url || undefined}
                  rank={p.rank}
                  battingAvg={p.stat.batting_avg ?? undefined}
                  homeRuns={p.stat.home_runs ?? undefined}
                  rbi={p.stat.rbi ?? undefined}
                  ops={p.stat.ops ?? undefined}
                  hitStreak={p.stat.hit_streak ?? undefined}
                  hasProps={p.hasProps}
                  showRank={!search}
                />
              ))}
            </div>
            {!showAll && filtered.length > visible.length && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
                  Show all {filtered.length} hitters
                </Button>
              </div>
            )}
          </>
        )}
        <p className="text-[11px] text-muted-foreground font-mono">
          Batting averages shown to three decimals. Qualified = 40+ at-bats. {mlbSeason()} season.
        </p>
      </div>
    </motion.div>
  );
}
