import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Lightbulb, Flame, ShieldCheck, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { edgeOfTheDay } from "@/data/edges";
import { useChat } from "@/contexts/ChatContext";

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
  const { openWithQuery } = useChat();
  const { data: live } = useQuery({
    queryKey: ["daily-edge-live-streak"],
    queryFn: liveHitStreakEdge,
    refetchInterval: 30 * 60 * 1000,
  });

  const fmtAvg = (v: number | null) => (v == null ? "" : v.toFixed(3).replace(/^0/, ""));

  return (
    <div className="space-y-2">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="bg-gradient-to-br from-terminal-green/10 via-card to-card border-terminal-green/30 overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-terminal-green" />
              <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-terminal-green">
                Edge of the Day
              </span>
              {edge.confidence === "high" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-terminal-green/15 border border-terminal-green/30 px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider text-terminal-green">
                  <ShieldCheck className="w-3 h-3" />
                  High Confidence
                </span>
              )}
              <span className="text-[10px] text-muted-foreground font-mono ml-auto">
                {SPORT_EMOJI[edge.sport]} {edge.sport}
              </span>
            </div>

            <h2 className="text-lg sm:text-xl font-semibold text-foreground text-balance">{edge.headline}</h2>
            <p className="text-sm text-foreground/85 mt-1 leading-relaxed max-w-3xl">{edge.detail}</p>

            <div className="mt-3 flex flex-col sm:flex-row sm:items-stretch gap-3">
              {/* The wager this edge informs */}
              {edge.market && (
                <div className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-terminal-green/10 border border-terminal-green/25 px-3 py-2">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-terminal-green">
                    The Wager
                  </span>
                  <span className="text-xs text-foreground">{edge.market.label}</span>
                  <span className="font-mono text-xs font-bold text-terminal-green tabular-nums">
                    {edge.market.line}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">{edge.market.book}</span>
                </div>
              )}

              {/* Supporting stat block - real, sourced comparisons only */}
              {edge.stat && (
                <div className="rounded-lg bg-card/80 border border-border px-3 py-2 flex-1 min-w-[200px]">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                    {edge.stat.label}
                  </p>
                  <div className="space-y-1">
                    {edge.stat.rows.map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-3 text-xs">
                        <span className={row.highlight ? "text-foreground" : "text-muted-foreground"}>
                          {row.label}
                        </span>
                        <span
                          className={`font-mono font-bold tabular-nums ${
                            row.highlight ? "text-terminal-green" : "text-muted-foreground"
                          }`}
                        >
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[10px] text-muted-foreground font-mono">source: {edge.source}</p>
              <button
                onClick={() => openWithQuery(`Tell me more about: ${edge.headline}`)}
                className="inline-flex items-center gap-1 text-xs font-medium text-terminal-green hover:text-terminal-green/80 transition-colors shrink-0"
              >
                View Full Analysis
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Hot Right Now - live computed edge; cyan marks it as a real-time data
          state (per MGP's color system), not a curated/static insight. */}
      {live && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <Card className="bg-card border-terminal-cyan/30">
            <CardContent className="p-3 px-4">
              <Link
                to={`/dashboard/mlb/players/${live.playerId}`}
                className="flex items-center gap-2 group"
              >
                <Flame className="w-4 h-4 text-terminal-cyan shrink-0" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-terminal-cyan shrink-0">
                  Hot Right Now
                </span>
                <span className="text-xs text-foreground">
                  <span className="font-semibold group-hover:text-terminal-cyan transition-colors">
                    {live.name}
                  </span>{" "}
                  {live.team ? `(${live.team}) ` : ""}
                  is on a{" "}
                  <span className="font-bold text-terminal-cyan tabular-nums font-mono">{live.streak}-game</span>{" "}
                  hit streak
                  {live.streakAvg ? (
                    <>
                      {" "}
                      - batting <span className="font-mono tabular-nums">{fmtAvg(live.streakAvg)}</span> during it
                    </>
                  ) : null}
                  .
                </span>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
