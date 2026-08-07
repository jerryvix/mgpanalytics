// Fantasy finish leaderboard — the discovery surface for the trajectory
// analyzer. Reads entirely from the nflverse-backed rank views (no BDL
// dependency), so it works even when live-API search is down. Rows link to
// the player detail page (Fantasy tab) when the name matches a known player.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { supabase } from "@/integrations/supabase/client";
import { isTopTenFinish, normalizePlayerName } from "@/utils/fantasyTrends";

const POS_GROUPS = ["QB", "RB", "WR", "TE"] as const;
type PosGroup = (typeof POS_GROUPS)[number];

interface BoardRow {
  rank: number;
  name: string;
  team: string | null;
  totalPpr: number | null;
  ppgPpr: number | null;
  games: number | null;
  playerId: string | null; // players.id when the name matches, for linking
}

async function loadBoard(posGroup: PosGroup): Promise<{ season: number; rows: BoardRow[] } | null> {
  const { data: latest } = await supabase
    .from("nfl_fantasy_season_ranks")
    .select("season")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest?.season) return null;

  const [{ data: ranks }, { data: players }] = await Promise.all([
    supabase
      .from("nfl_fantasy_season_ranks")
      .select("player_name, team, total_ppr, ppg_ppr, games, position_rank")
      .eq("season", latest.season)
      .eq("pos_group", posGroup)
      .lte("position_rank", 15)
      .order("position_rank", { ascending: true }),
    supabase.from("players").select("id, name").eq("sport", "NFL"),
  ]);

  const idByName = new Map<string, string>();
  for (const p of players || []) {
    idByName.set(normalizePlayerName(p.name), p.id);
  }

  const rows: BoardRow[] = (ranks || []).map((r) => ({
    rank: r.position_rank ?? 0,
    name: r.player_name ?? "",
    team: r.team,
    totalPpr: r.total_ppr,
    ppgPpr: r.ppg_ppr,
    games: r.games,
    playerId: idByName.get(normalizePlayerName(r.player_name ?? "")) ?? null,
  }));

  return { season: latest.season, rows };
}

export function FantasyLeadersBoard() {
  const [posGroup, setPosGroup] = useState<PosGroup>("RB");
  const { data, isLoading } = useQuery({
    queryKey: ["nfl-fantasy-leaders", posGroup],
    queryFn: () => loadBoard(posGroup),
    staleTime: 60 * 60 * 1000, // finished season — effectively static
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-muted-foreground font-mono">
          {data?.season ?? "Last"} season-end PPR finishes — click a player for their multi-year trajectory.
        </p>
        <div className="flex gap-1">
          {POS_GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => setPosGroup(g)}
              className={`px-3 py-1 rounded text-xs font-mono font-bold border transition-colors ${
                g === posGroup
                  ? "bg-terminal-green/20 text-terminal-green border-terminal-green/40"
                  : "bg-muted/30 text-muted-foreground border-border hover:border-terminal-green/40"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : !data || data.rows.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground font-mono">No fantasy finish data yet.</p>
          </CardContent>
        </Card>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <Trophy className="w-4 h-4 text-terminal-green" />
                <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
                  {data.season} {posGroup} Fantasy Finishes (PPR)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left font-medium pl-4 pr-1 py-2 w-12">#</th>
                      <th className="text-left font-medium px-1 py-2">Player</th>
                      <th className="text-left font-medium px-1 py-2">Team</th>
                      <th className="text-right font-medium px-2 py-2">PPR Pts</th>
                      <th className="text-right font-medium px-2 py-2">PPG</th>
                      <th className="text-right font-medium pr-4 py-2">G</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <tr key={`${r.rank}-${r.name}`} className={`border-b border-border/40 ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                        <td className={`pl-4 pr-1 py-2 font-mono font-bold ${isTopTenFinish(r.rank) ? "text-terminal-green" : "text-muted-foreground"}`}>
                          {posGroup}{r.rank}
                        </td>
                        <td className="px-1 py-2">
                          {r.playerId ? (
                            <Link
                              to={`/dashboard/nfl/players/${r.playerId}`}
                              className="font-medium text-foreground hover:text-terminal-green transition-colors"
                            >
                              {r.name}
                            </Link>
                          ) : (
                            <span className="font-medium text-foreground">{r.name}</span>
                          )}
                        </td>
                        <td className="px-1 py-2">
                          {r.team && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-mono">
                              <TeamLogo sport="NFL" name={r.team} abbr={r.team} size={14} /> {r.team}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-mono font-bold tabular-nums">
                          {r.totalPpr?.toFixed(1) ?? "—"}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">{r.ppgPpr?.toFixed(1) ?? "—"}</td>
                        <td className="pr-4 py-2 text-right font-mono tabular-nums">{r.games ?? "—"}</td>
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
