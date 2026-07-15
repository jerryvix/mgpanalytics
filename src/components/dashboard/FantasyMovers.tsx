import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { TrendingUp, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { FormBar } from "@/components/ui/FormBar";
import { heatText, avgDeltaHeat, hoverLift } from "@/lib/heat";
import { TeamLogo } from "@/components/ui/TeamLogo";

interface Mover {
  playerId: string;
  name: string;
  team: string | null;
  seasonAvg: number;
  formAvg: number;
  delta: number;
  streak: number;
  form: boolean[];
  headshotUrl: string | null;
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
  const [{ data: players }, { data: logs }] = await Promise.all([
    supabase.from("players").select("id, name, team_abbr, headshot_url").in("id", ids),
    supabase
      .from("player_game_logs")
      .select("player_id, game_date, hits")
      .eq("sport", "MLB")
      .eq("season", season)
      .in("player_id", ids)
      .order("game_date", { ascending: false }),
  ]);
  const pmap = new Map((players || []).map((p) => [p.id, p]));

  // last 10 games per player, oldest → newest, hit = 1+ hits
  const formMap = new Map<string, boolean[]>();
  for (const log of logs || []) {
    const arr = formMap.get(log.player_id) || [];
    if (arr.length < 10) arr.push((log.hits || 0) > 0);
    formMap.set(log.player_id, arr);
  }

  return rows
    .map((r) => {
      const p = pmap.get(r.player_id);
      if (!p) return null;
      return {
        playerId: r.player_id,
        name: p.name,
        team: p.team_abbr,
        headshotUrl: (p as { headshot_url?: string | null }).headshot_url ?? null,
        seasonAvg: r.seasonAvg,
        formAvg: r.formAvg,
        delta: r.formAvg - r.seasonAvg,
        streak: r.streak,
        form: (formMap.get(r.player_id) || []).reverse(),
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
            Hot Bats
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
              className={`flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 hover:border-terminal-green/40 group ${hoverLift}`}
            >
              {m.headshotUrl && (
                <img
                  src={m.headshotUrl}
                  alt={m.name}
                  loading="lazy"
                  className="w-9 h-9 rounded-full object-cover bg-muted shrink-0"
                  onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-semibold text-foreground text-sm truncate group-hover:text-terminal-green transition-colors">
                  <span className="truncate">{m.name}</span>
                  {m.team ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground font-normal shrink-0">
                      · <TeamLogo sport="MLB" name={m.team} abbr={m.team} size={14} /> {m.team}
                    </span>
                  ) : null}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  Season {fmtAvg(m.seasonAvg)} → Last {m.streak}:{" "}
                  <span className="text-terminal-green">{fmtAvg(m.formAvg)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {m.form.length > 0 && <FormBar games={m.form} />}
                <span className={`inline-flex items-center gap-0.5 font-mono text-sm font-bold ${heatText(avgDeltaHeat(m.delta))}`}>
                  <TrendingUp className="w-3.5 h-3.5" />+{fmtAvg(m.delta)}
                </span>
              </div>
            </Link>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          Bars = last 10 games, oldest → newest: <span className="text-terminal-green">tall green</span> = got a
          hit, short gray = hitless. NFL hot hands appear here in-season.
        </p>
      </CardContent>
    </Card>
  );
}
