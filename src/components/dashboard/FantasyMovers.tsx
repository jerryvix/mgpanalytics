import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { TrendingUp, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface Mover {
  playerId: string;
  name: string;
  team: string | null;
  seasonAvg: number;
  formAvg: number;
  delta: number;
  streak: number;
}

// Fantasy/DFS "form edge": hitters producing well above their season line right
// now. Computed live from data we already sync (season AVG vs current hit-streak
// AVG). NFL fantasy-point form slots in here the same way once the season opens.
async function loadFormMovers(): Promise<Mover[]> {
  const season = new Date().getFullYear();
  const { data: stats } = await supabase
    .from("player_season_stats")
    .select("player_id, batting_avg, hit_streak, hit_streak_avg")
    .eq("sport", "MLB")
    .eq("season", season)
    .gte("hit_streak", 5)
    .not("hit_streak_avg", "is", null);

  const rows = (stats || [])
    .map((s) => ({
      player_id: s.player_id as string,
      seasonAvg: (s.batting_avg as number) ?? 0,
      formAvg: (s.hit_streak_avg as number) ?? 0,
      streak: (s.hit_streak as number) ?? 0,
    }))
    .filter((s) => s.formAvg - s.seasonAvg >= 0.08) // meaningfully above their norm
    .sort((a, b) => b.formAvg - b.seasonAvg - (a.formAvg - a.seasonAvg))
    .slice(0, 6);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.player_id);
  const { data: players } = await supabase.from("players").select("id, name, team_abbr").in("id", ids);
  const pmap = new Map((players || []).map((p) => [p.id, p]));

  return rows
    .map((r) => {
      const p = pmap.get(r.player_id);
      if (!p) return null;
      return {
        playerId: r.player_id,
        name: p.name,
        team: p.team_abbr,
        seasonAvg: r.seasonAvg,
        formAvg: r.formAvg,
        delta: r.formAvg - r.seasonAvg,
        streak: r.streak,
      };
    })
    .filter(Boolean) as Mover[];
}

const fmtAvg = (v: number) => v.toFixed(3).replace(/^0/, "");

export function FantasyMovers() {
  const { data: movers = [], isLoading } = useQuery({
    queryKey: ["fantasy-form-movers"],
    queryFn: loadFormMovers,
    refetchInterval: 30 * 60 * 1000,
  });

  if (isLoading || movers.length === 0) return null;

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-4 h-4 text-terminal-green" />
          <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
            Fantasy Form Movers
          </h2>
          <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">
            Hitters running hot vs. their season line
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          {movers.map((m) => (
            <Link
              key={m.playerId}
              to={`/dashboard/mlb/players/${m.playerId}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 hover:border-terminal-green/40 transition-colors group"
            >
              <div className="min-w-0">
                <div className="font-semibold text-foreground text-sm truncate group-hover:text-terminal-green transition-colors">
                  {m.name} {m.team ? <span className="text-muted-foreground font-normal">· {m.team}</span> : null}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  Season {fmtAvg(m.seasonAvg)} → Last {m.streak}:{" "}
                  <span className="text-terminal-green">{fmtAvg(m.formAvg)}</span>
                </div>
              </div>
              <span className="inline-flex items-center gap-0.5 text-terminal-green font-mono text-sm shrink-0">
                <TrendingUp className="w-3.5 h-3.5" />+{fmtAvg(m.delta)}
              </span>
            </Link>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          Recent form vs. season baseline — a quick DFS/fantasy read. NFL fantasy-point movers appear here in-season.
        </p>
      </CardContent>
    </Card>
  );
}
