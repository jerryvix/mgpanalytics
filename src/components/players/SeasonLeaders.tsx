import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { TeamLogo } from "@/components/ui/TeamLogo";

// Last season's league leaders — the offseason answer to "who actually
// produced?", sitting right next to this season's prop-futures lines so
// users can compare the O/U to real recent output.

const BOARDS = [
  { column: "pass_yards", label: "Passing Yards" },
  { column: "rush_yards", label: "Rushing Yards" },
  { column: "rec_yards", label: "Receiving Yards" },
  { column: "sacks", label: "Sacks" },
] as const;

interface LeaderRow {
  name: string;
  team: string | null;
  headshot: string | null;
  value: number;
}

async function loadLeaders(season: number): Promise<Record<string, LeaderRow[]>> {
  const out: Record<string, LeaderRow[]> = {};
  for (const b of BOARDS) {
    const { data: stats } = await supabase
      .from("player_season_stats")
      .select(`player_id, ${b.column}`)
      .eq("sport", "NFL")
      .eq("season", season)
      .not(b.column, "is", null)
      .gt(b.column, 0)
      .order(b.column, { ascending: false })
      .limit(14); // extra rows so dedup still leaves a top 10
    if (!stats?.length) continue;
    const ids = [...new Set(stats.map((s: any) => s.player_id))];
    const { data: players } = await supabase
      .from("players")
      .select("id, name, team_abbr, headshot_url")
      .in("id", ids);
    const pmap = new Map((players || []).map((p: any) => [p.id, p]));
    const seen = new Set<string>();
    out[b.column] = stats
      .map((s: any) => {
        const p = pmap.get(s.player_id);
        if (!p || seen.has(p.name)) return null;
        seen.add(p.name);
        return { name: p.name, team: p.team_abbr, headshot: p.headshot_url, value: s[b.column] };
      })
      .filter(Boolean)
      .slice(0, 10) as LeaderRow[];
  }
  return out;
}

export function SeasonLeaders({ season = 2025 }: { season?: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["nfl-season-leaders", season],
    queryFn: () => loadLeaders(season),
    staleTime: 60 * 60 * 1000, // finished season — effectively static
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {BOARDS.map((b) => (
          <Skeleton key={b.column} className="h-72 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground font-mono">
        {season} season, final — how last year's production stacks up against this year's futures lines.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {BOARDS.map((b, bi) => {
          const rows = data?.[b.column] || [];
          if (rows.length === 0) return null;
          return (
            <motion.div
              key={b.column}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: bi * 0.06 }}
            >
              <Card className="bg-card border-border h-full">
                <CardContent className="p-0">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                    <Trophy className="w-4 h-4 text-terminal-green" />
                    <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
                      {b.label}
                    </h3>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={r.name} className={`border-b border-border/40 ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                          <td className="pl-4 pr-1 py-1.5 font-mono text-muted-foreground w-8">{i + 1}</td>
                          <td className="px-1 py-1.5">
                            <span className="inline-flex items-center gap-2 font-medium text-foreground">
                              {r.headshot && (
                                <img
                                  src={r.headshot}
                                  alt=""
                                  loading="lazy"
                                  className="w-6 h-6 rounded-full object-cover bg-muted"
                                  onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                                />
                              )}
                              {r.name}
                            </span>
                          </td>
                          <td className="px-1 py-1.5">
                            {r.team && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-mono">
                                <TeamLogo sport="NFL" name={r.team} abbr={r.team} size={14} /> {r.team}
                              </span>
                            )}
                          </td>
                          <td className="pr-4 py-1.5 text-right font-mono font-bold tabular-nums text-terminal-green">
                            {Number(r.value).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
