import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Lightbulb, Flame } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { edgeOfTheDay } from "@/data/edges";

const SPORT_EMOJI: Record<string, string> = {
  NFL: "🏈",
  NCAAF: "🏈",
  MLB: "⚾",
  NBA: "🏀",
  General: "📊",
};

// A live, computed edge: the hottest active MLB hit streak right now.
async function liveHitStreakEdge() {
  const season = new Date().getFullYear();
  const { data } = await supabase
    .from("player_season_stats")
    .select("player_id, hit_streak, hit_streak_avg")
    .eq("sport", "MLB")
    .eq("season", season)
    .gte("hit_streak", 8)
    .order("hit_streak", { ascending: false })
    .limit(1);
  const top = data?.[0];
  if (!top) return null;
  const { data: player } = await supabase
    .from("players")
    .select("id, name, team_abbr")
    .eq("id", top.player_id)
    .single();
  if (!player) return null;
  return {
    playerId: player.id,
    name: player.name,
    team: player.team_abbr as string | null,
    streak: top.hit_streak as number,
    streakAvg: (top.hit_streak_avg as number) ?? null,
  };
}

export function DailyEdge() {
  const edge = edgeOfTheDay();
  const { data: live } = useQuery({
    queryKey: ["daily-edge-live-streak"],
    queryFn: liveHitStreakEdge,
    refetchInterval: 30 * 60 * 1000,
  });

  const fmtAvg = (v: number | null) => (v == null ? "" : v.toFixed(3).replace(/^0/, ""));

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="bg-gradient-to-br from-terminal-green/10 via-card to-card border-terminal-green/30 overflow-hidden">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-terminal-green" />
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-terminal-green">
              Edge of the Day
            </span>
            <span className="text-[10px] text-muted-foreground font-mono ml-auto">
              {SPORT_EMOJI[edge.sport]} {edge.sport}
            </span>
          </div>

          <h2 className="text-lg sm:text-xl font-bold text-foreground text-balance">{edge.headline}</h2>
          <p className="text-sm text-foreground/85 mt-1 leading-relaxed max-w-3xl">{edge.detail}</p>
          <p className="text-[10px] text-muted-foreground font-mono mt-2">source: {edge.source}</p>

          {/* Live computed edge — the hottest bat right now */}
          {live && (
            <Link
              to={`/dashboard/mlb/players/${live.playerId}`}
              className="mt-3 flex items-center gap-2 rounded-lg bg-terminal-amber/10 border border-terminal-amber/25 px-3 py-2 hover:border-terminal-amber/50 transition-colors group"
            >
              <Flame className="w-4 h-4 text-terminal-amber shrink-0" />
              <span className="text-xs text-foreground">
                <span className="font-mono text-terminal-amber font-bold">LIVE</span>{" "}
                <span className="font-semibold group-hover:text-terminal-green transition-colors">
                  {live.name}
                </span>{" "}
                {live.team ? `(${live.team}) ` : ""}
                is on a{" "}
                <span className="font-bold text-terminal-amber tabular-nums">{live.streak}-game</span>{" "}
                hit streak
                {live.streakAvg ? (
                  <>
                    {" "}
                    — batting <span className="font-mono tabular-nums">{fmtAvg(live.streakAvg)}</span> during it
                  </>
                ) : null}
                .
              </span>
            </Link>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
