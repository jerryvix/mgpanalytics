import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EDGE_POOL } from "@/data/edges";
import { TeamLogo } from "@/components/ui/TeamLogo";

// A live, always-moving ticker across the top of the dashboard - the signature
// "Bloomberg for prediction markets" moment. Motion signals the app is alive and
// keeps eyes on the page. Reuses data we already sync (live spreads + line
// movement, MLB hit streaks) plus the evergreen edge pool; degrades gracefully
// to just nuggets in the offseason.

interface MarketMoverItem {
  kind: "mover";
  sport: string;
  team: string;
  spread: number | null;
  spreadOdds: number | null;
  movement: number | null; // signed line movement vs. open, when we have history
}

interface NuggetItem {
  kind: "nugget";
  icon: string;
  text: string;
  teamAbbr?: string;
  sport?: string;
  headshotUrl?: string;
}

type TickerItem = MarketMoverItem | NuggetItem;

const formatLine = (value: number | null) => {
  if (value === null || value === undefined) return null;
  return value > 0 ? `+${value}` : String(value);
};

// Top upcoming NFL spreads with real line movement, when we have it - this is
// the "market feed" half of the ticker.
async function loadMarketMovers(): Promise<MarketMoverItem[]> {
  const now = new Date();
  const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const { data: games } = await supabase
    .from("games")
    .select("id, home_team_name")
    .eq("league", "NFL")
    .not("status", "ilike", "%final%")
    .gte("date", now.toISOString())
    .lte("date", in48Hours.toISOString())
    .order("date", { ascending: true })
    .limit(8);

  if (!games?.length) return [];

  const gameIds = games.map((g) => g.id);
  const { data: odds } = await supabase
    .from("odds")
    .select("game_id, spread_value, spread_odds")
    .in("game_id", gameIds)
    .eq("sportsbook", "draftkings");

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const { data: snapshots } = await supabase
    .from("odds_history")
    .select("game_id, current_line, timestamp")
    .in("game_id", gameIds.map((id) => String(id)))
    .eq("odds_type", "spread")
    .gte("timestamp", sevenDaysAgo.toISOString())
    .order("timestamp", { ascending: true });

  const snapshotsByGame: Record<string, typeof snapshots> = {};
  (snapshots || []).forEach((s) => {
    (snapshotsByGame[s.game_id] ||= []).push(s);
  });

  const items: MarketMoverItem[] = [];
  for (const game of games) {
    const gameOdds = odds?.find((o) => o.game_id === game.id);
    if (!gameOdds) continue;

    const gameSnapshots = snapshotsByGame[String(game.id)];
    let movement: number | null = null;
    if (gameSnapshots && gameSnapshots.length >= 2) {
      const open = gameSnapshots[0].current_line ?? 0;
      const current = gameSnapshots[gameSnapshots.length - 1].current_line ?? 0;
      movement = current - open;
    }

    items.push({
      kind: "mover",
      sport: "NFL",
      team: game.home_team_name,
      spread: gameOdds.spread_value ?? null,
      spreadOdds: gameOdds.spread_odds ?? null,
      movement,
    });
  }

  // Real movement first - that's the market-data signal worth surfacing.
  items.sort((a, b) => Math.abs(b.movement ?? 0) - Math.abs(a.movement ?? 0));
  return items.slice(0, 6);
}

async function loadNuggets(): Promise<NuggetItem[]> {
  const items: NuggetItem[] = [];
  const season = new Date().getFullYear();

  const { data: streaks } = await supabase
    .from("player_season_stats")
    .select("player_id, hit_streak, hit_streak_avg")
    .eq("sport", "MLB")
    .eq("season", season)
    .gte("hit_streak", 6)
    .order("hit_streak", { ascending: false })
    .limit(6);

  if (streaks && streaks.length) {
    const ids = streaks.map((s) => s.player_id);
    const { data: players } = await supabase
      .from("players")
      .select("id, name, team_abbr, headshot_url")
      .in("id", ids);
    const pmap = new Map((players || []).map((p) => [p.id, p]));
    for (const s of streaks) {
      const p = pmap.get(s.player_id);
      if (!p) continue;
      items.push({
        kind: "nugget",
        icon: "🔥",
        text: `${p.name}${p.team_abbr ? ` (${p.team_abbr})` : ""} - ${s.hit_streak}-game hit streak`,
        teamAbbr: p.team_abbr ?? undefined,
        sport: "MLB",
        headshotUrl: (p as { headshot_url?: string | null }).headshot_url ?? undefined,
      });
    }
  }

  for (const e of EDGE_POOL.slice(0, 5)) {
    items.push({ kind: "nugget", icon: "💡", text: e.headline });
  }

  return items;
}

export function EdgeTicker() {
  const { data: movers = [] } = useQuery({
    queryKey: ["edge-ticker-movers"],
    queryFn: loadMarketMovers,
    refetchInterval: 5 * 60 * 1000,
  });
  const { data: nuggets = [] } = useQuery({
    queryKey: ["edge-ticker-nuggets"],
    queryFn: loadNuggets,
    refetchInterval: 15 * 60 * 1000,
  });

  const items: TickerItem[] = [...movers, ...nuggets];
  if (items.length === 0) return null;
  const loop = [...items, ...items]; // duplicate for a seamless scroll

  return (
    <div className="relative overflow-hidden border-y border-terminal-cyan/20 bg-card/60 py-1.5">
      <div className="pointer-events-none absolute left-0 top-0 z-10 flex h-full items-center bg-card/90 px-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-terminal-cyan">
          ● Live Edges
        </span>
      </div>
      <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-16 bg-gradient-to-l from-background to-transparent" />
      <motion.div
        className="flex whitespace-nowrap pl-28"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ repeat: Infinity, ease: "linear", duration: Math.max(30, items.length * 6) }}
      >
        {loop.map((it, i) =>
          it.kind === "mover" ? (
            <span key={i} className="mx-4 inline-flex items-center gap-1.5 font-mono text-xs">
              <span className="text-muted-foreground">{it.sport}</span>
              <TeamLogo sport={it.sport} name={it.team} size={14} />
              <span className="text-foreground">{it.team}</span>
              {it.spread !== null && <span className="text-foreground/90">{formatLine(it.spread)}</span>}
              {it.spreadOdds !== null && <span className="text-muted-foreground">{formatLine(it.spreadOdds)}</span>}
              {it.movement !== null && it.movement !== 0 && (
                <span
                  className={`inline-flex items-center gap-0.5 font-bold ${
                    it.movement > 0 ? "text-terminal-green" : "text-destructive"
                  }`}
                >
                  {it.movement > 0 ? (
                    <ArrowUpRight className="w-3 h-3" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3" />
                  )}
                  {formatLine(Number(it.movement.toFixed(1)))}
                </span>
              )}
              <span className="text-terminal-cyan/40 ml-4">|</span>
            </span>
          ) : (
            <span key={i} className="mx-4 inline-flex items-center gap-1.5 font-mono text-xs text-foreground/90">
              <span>{it.icon}</span>
              {it.headshotUrl && (
                <img
                  src={it.headshotUrl}
                  alt=""
                  loading="lazy"
                  className="w-5 h-5 rounded-full object-cover bg-muted"
                  onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                />
              )}
              {it.teamAbbr && <TeamLogo sport={it.sport ?? "MLB"} name={it.teamAbbr} abbr={it.teamAbbr} size={14} />}
              <span>{it.text}</span>
              <span className="text-terminal-cyan/40 ml-4">|</span>
            </span>
          )
        )}
      </motion.div>
    </div>
  );
}
