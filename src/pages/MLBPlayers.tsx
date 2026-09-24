import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, Search, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MLBSlatePlayerCard } from "@/components/mlb/MLBSlatePlayerCard";
import { HitStreakTable, HitStreakRow } from "@/components/mlb/HitStreakTable";
import { selectAll } from "../../supabase/functions/_shared/select-all";
import { queryView } from "@/lib/queryView";

const mlbSeason = () => new Date().getFullYear();

interface SeasonStat {
  player_id: string;
  batting_avg: number | null;
  on_base_pct: number | null;
  slugging_pct: number | null;
  ops: number | null;
  home_runs: number | null;
  rbi: number | null;
  at_bats: number | null;
  hit_streak: number | null;
  hit_streak_avg: number | null;
  /** MLB batting-title qualified (3.1 PA per team game), set by sync-mlb-hitting. */
  qualified: unknown;
}

interface PlayerRow {
  id: string;
  name: string;
  team_name: string | null;
  team_abbr: string | null;
  position: string | null;
  headshot_url: string | null;
}

async function loadMlbPlayers() {
  const season = mlbSeason();
  const today = new Date().toISOString().split("T")[0];

  // Season lines first, then only the players who have one. The old order
  // (every MLB player, then their stats) hit PostgREST's silent 1,000-row cap:
  // there are 1,250 MLB players, so a quarter of them, streaks included, never
  // reached this page.
  // (Generated types call player_id nullable; it never is on these rows.)
  const stats = (await selectAll<Record<string, unknown>>(
    () =>
      supabase
        .from("player_season_stats")
        .select(
          "player_id, batting_avg, on_base_pct, slugging_pct, ops, home_runs, rbi, at_bats, hit_streak, hit_streak_avg, qualified:raw_data->qualified"
        )
        .eq("sport", "MLB")
        .eq("season", season)
        .eq("season_type", "regular")
        .order("player_id"),
    { label: "MLB season stats" }
  )) as unknown as SeasonStat[];
  const statMap = new Map(stats.map((s) => [s.player_id, s]));

  const statIds = stats.map((s) => s.player_id);
  const players: PlayerRow[] = [];
  for (let i = 0; i < statIds.length; i += 200) {
    const { data, error } = await supabase
      .from("players")
      .select("id, name, team_name, team_abbr, position, headshot_url")
      .eq("sport", "MLB")
      .eq("status", "active")
      .in("id", statIds.slice(i, i + 200));
    // A failed read must surface as an error, not as "no hitters yet"
    if (error) throw new Error(`MLB players failed to load: ${error.message}`);
    if (data) players.push(...(data as PlayerRow[]));
  }
  const playerIds = players.map((p) => p.id);
  if (playerIds.length === 0) {
    return { grid: [], searchPool: [], streaks: [] as HitStreakRow[], teamAbbr: new Map<string, string>(), qualifiedRule: false };
  }
  const playerMap = new Map(players.map((p) => [p.id, p]));

  // Team abbreviations, data-driven from the players we already fetched
  // ("San Diego Padres" → "SD") - no hand-kept 30-team map to go stale.
  const abbrByTeamName = new Map<string, string>();
  for (const p of players) {
    if (p.team_name && p.team_abbr && !abbrByTeamName.has(p.team_name)) {
      abbrByTeamName.set(p.team_name, p.team_abbr);
    }
  }

  // Next matchup + probable pitcher, keyed by team name. Reach back 5h
  // (same as the slate) so a game that's underway still counts as the
  // team's matchup - that's what the live badge hangs off.
  const in7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  // Only the fallback for when MLB's schedule is unreachable (the table reads
  // MLB's live schedule first), so a failure here degrades, not errors.
  const { data: games, error: gamesError } = await supabase
    .from("mlb_games")
    .select("home_team_name, visitor_team_name, date, starting_pitcher_home, starting_pitcher_away")
    .gte("date", new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString())
    .lte("date", in7)
    .order("date", { ascending: true });
  if (gamesError) console.error("MLB next-game fallback unavailable:", gamesError.message);
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
    for (const p of props || []) if (p.player_id) propIds.add(p.player_id);
  }

  // Hit-streak rows - 5+ games qualifies as a genuine "hot" streak
  const streaks: HitStreakRow[] = stats
    .filter((s) => (s.hit_streak ?? 0) >= 5 && playerMap.has(s.player_id))
    .map((s) => {
      const p = playerMap.get(s.player_id)!;
      const next = p.team_name ? nextByTeam.get(p.team_name) : undefined;
      return {
        playerId: s.player_id,
        name: p.name || "Unknown",
        team: p.team_abbr || p.team_name || "",
        teamName: p.team_name || null,
        headshotUrl: p.headshot_url || undefined,
        streak: s.hit_streak ?? 0,
        seasonAvg: s.batting_avg ?? 0,
        obp: s.on_base_pct,
        slg: s.slugging_pct,
        ops: s.ops,
        homeRuns: s.home_runs,
        streakAvg: s.hit_streak_avg ?? 0,
        nextOpponent: next?.opponent || null,
        nextOpponentAbbr: next?.opponent ? abbrByTeamName.get(next.opponent) || null : null,
        nextPitcher: next?.pitcher || null,
        nextGameDate: next?.date || null,
      };
    })
    .sort((a, b) => b.streak - a.streak || b.streakAvg - a.streakAvg);

  // Player grid ranked by OPS. Every hitter has a season row now (streaks
  // need them), so "40+ AB" would let a September call-up with 63 AB top the
  // board; rank MLB batting-title qualifiers instead, and keep the 40 AB rule
  // only until the sync has stamped the qualified flag.
  const qualifiedRule = stats.some((s) => typeof s.qualified === "boolean");
  const withStats = players
    .map((p) => ({ player: p, stat: statMap.get(p.id)! }))
    .filter((x) => x.stat && (x.stat.ops ?? 0) > 0 && (x.stat.at_bats ?? 0) >= 40)
    .sort((a, b) => (b.stat.ops ?? 0) - (a.stat.ops ?? 0));
  const toCard = (x: (typeof withStats)[number], index: number) => ({
    ...x.player,
    stat: x.stat,
    rank: index + 1,
    hasProps: propIds.has(x.player.id),
  });
  const grid = withStats.filter((x) => !qualifiedRule || x.stat.qualified === true).map(toCard);
  // Search reaches every hitter with 40+ AB, not just qualifiers.
  const searchPool = withStats.map(toCard);

  return { grid, searchPool, streaks, teamAbbr: abbrByTeamName, qualifiedRule };
}

export default function MLBPlayers() {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const query = useQuery({
    queryKey: ["mlb-players"],
    queryFn: loadMlbPlayers,
    refetchInterval: 30 * 60 * 1000,
  });
  const { data, refetch } = query;
  // Empty-state copy only after a successful read that came back empty; a
  // paused first read waits, a failed one offers Retry (src/lib/queryView.ts).
  const view = queryView(query);
  const retry = () => void refetch();

  const grid = data?.grid || [];
  const streaks = data?.streaks || [];
  const teamAbbr = data?.teamAbbr;
  const filtered = (search ? data?.searchPool || [] : grid).filter(
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

      {/* Hit streak table - the headline feature */}
      <HitStreakTable
        rows={streaks}
        isLoading={view === "loading"}
        isPaused={view === "waiting"}
        isError={view === "error"}
        onRetry={retry}
        teamAbbr={(name) => teamAbbr?.get(name) ?? null}
      />

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

        {view === "loading" ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading players…
          </div>
        ) : view === "waiting" ? (
          <div className="text-center py-16 text-sm space-y-1" role="status">
            <p className="text-foreground">Waiting for a connection…</p>
            <p className="text-muted-foreground text-xs">Hitters load as soon as you're back online.</p>
          </div>
        ) : view === "error" ? (
          <div className="text-center py-16 text-sm space-y-3" role="alert">
            <p className="text-foreground">Couldn't load MLB hitters.</p>
            <p className="text-muted-foreground text-xs">Check your connection and try again.</p>
            <Button variant="outline" size="sm" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            {search
              ? "No hitters match that search."
              : "No qualified hitters yet. Data populates as the season's stats sync in."}
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
          Batting averages shown to three decimals.{" "}
          {data?.qualifiedRule
            ? "Ranked hitters are batting-title qualified (3.1 plate appearances per team game); search covers everyone with 40+ at-bats."
            : "Qualified = 40+ at-bats."}{" "}
          {mlbSeason()} season.
        </p>
      </div>
    </motion.div>
  );
}
