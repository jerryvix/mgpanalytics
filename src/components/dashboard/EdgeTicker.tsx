import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { EDGE_POOL } from "@/data/edges";
import { TeamLogo } from "@/components/ui/TeamLogo";

// A live, always-moving ticker across the top of the dashboard — the signature
// "Bloomberg for prediction markets" moment. Motion signals the app is alive and
// keeps eyes on the page. Reuses data we already sync (MLB hit streaks) plus the
// evergreen edge pool; degrades gracefully to just nuggets in the offseason.

interface TickerItem {
  icon: string;
  text: string;
  teamAbbr?: string; // when present, a small team logo renders before the text
  sport?: string;
  headshotUrl?: string; // tiny player headshot, when we have one
}

async function loadTicker(): Promise<TickerItem[]> {
  const items: TickerItem[] = [];
  const season = new Date().getFullYear();

  // Top active MLB hit streaks
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
        icon: "🔥",
        text: `${p.name}${p.team_abbr ? ` (${p.team_abbr})` : ""} — ${s.hit_streak}-game hit streak`,
        teamAbbr: p.team_abbr ?? undefined,
        sport: "MLB",
        headshotUrl: (p as { headshot_url?: string | null }).headshot_url ?? undefined,
      });
    }
  }

  // A few evergreen edges to keep it full year-round
  for (const e of EDGE_POOL.slice(0, 5)) {
    items.push({ icon: "💡", text: e.headline });
  }

  return items;
}

export function EdgeTicker() {
  const { data: items = [] } = useQuery({
    queryKey: ["edge-ticker"],
    queryFn: loadTicker,
    refetchInterval: 15 * 60 * 1000,
  });

  if (items.length === 0) return null;
  const loop = [...items, ...items]; // duplicate for a seamless scroll

  return (
    <div className="relative overflow-hidden border-y border-terminal-green/20 bg-card/60 py-1.5">
      <div className="pointer-events-none absolute left-0 top-0 z-10 flex h-full items-center bg-card/90 px-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-terminal-green">
          ● Live Edges
        </span>
      </div>
      <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-16 bg-gradient-to-l from-background to-transparent" />
      <motion.div
        className="flex whitespace-nowrap pl-28"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ repeat: Infinity, ease: "linear", duration: Math.max(30, items.length * 6) }}
      >
        {loop.map((it, i) => (
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
            <span className="text-terminal-green/40 ml-4">|</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}
