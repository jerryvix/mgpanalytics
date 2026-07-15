import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Star, CalendarClock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { useFollows, FollowRow } from "@/hooks/useFollows";
import { TeamLogo } from "@/components/ui/TeamLogo";

const SPORT_TABLE: Record<string, { table: string; league?: string; slug: string }> = {
  NFL: { table: "games", league: "NFL", slug: "nfl" },
  NBA: { table: "nba_games", slug: "nba" },
  NCAAB: { table: "ncaab_games", slug: "ncaab" },
  NCAAF: { table: "ncaaf_games", slug: "ncaaf" },
  MLB: { table: "mlb_games", slug: "mlb" },
};

interface NextGame {
  team: string;
  sport: string;
  slug: string;
  opponent: string;
  isHome: boolean;
  date: string;
}

async function loadFollowedGames(teamFollows: FollowRow[]): Promise<NextGame[]> {
  const nowIso = new Date().toISOString();
  // group followed team names by sport
  const bySport = new Map<string, string[]>();
  for (const f of teamFollows) {
    if (!f.sport) continue;
    const name = f.entity_label || f.entity_key.split(":").slice(1).join(":");
    const arr = bySport.get(f.sport) || [];
    arr.push(name);
    bySport.set(f.sport, arr);
  }

  const results: NextGame[] = [];
  for (const [sport, teams] of bySport) {
    const cfg = SPORT_TABLE[sport];
    if (!cfg) continue;
    const list = teams.map((t) => `"${t.replace(/"/g, '')}"`).join(",");
    let q = supabase
      .from(cfg.table as "games")
      .select("home_team_name, visitor_team_name, date")
      .gte("date", nowIso)
      .or(`home_team_name.in.(${list}),visitor_team_name.in.(${list})`)
      .order("date", { ascending: true })
      .limit(40);
    if (cfg.league) q = q.eq("league", cfg.league);
    const { data } = await q;

    // earliest upcoming game per followed team
    const seen = new Set<string>();
    for (const g of (data || []) as any[]) {
      for (const team of teams) {
        if (seen.has(team)) continue;
        const isHome = g.home_team_name === team;
        const isAway = g.visitor_team_name === team;
        if (!isHome && !isAway) continue;
        seen.add(team);
        results.push({
          team,
          sport,
          slug: cfg.slug,
          opponent: isHome ? g.visitor_team_name : g.home_team_name,
          isHome,
          date: g.date,
        });
      }
    }
  }
  return results.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function YourTeams() {
  const { follows } = useFollows();
  const teamFollows = follows.filter((f) => f.entity_type === "team");

  const { data: games = [] } = useQuery({
    queryKey: ["your-teams-games", teamFollows.map((f) => f.entity_key).sort().join("|")],
    queryFn: () => loadFollowedGames(teamFollows),
    enabled: teamFollows.length > 0,
  });

  if (teamFollows.length === 0 || games.length === 0) return null;

  const label = (d: string) => {
    const dt = parseISO(d);
    const days = differenceInCalendarDays(dt, new Date());
    if (days <= 0) return `Today · ${format(dt, "h:mm a")}`;
    if (days === 1) return `Tomorrow · ${format(dt, "h:mm a")}`;
    return format(dt, "EEE MMM d");
  };

  return (
    <Card className="bg-card border-terminal-green/25">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Star className="w-4 h-4 fill-terminal-amber text-terminal-amber" />
          <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
            Your Teams' Next Games
          </h2>
        </div>
        <div className="space-y-2">
          {games.map((g) => (
            <Link
              key={`${g.sport}-${g.team}`}
              to={`/dashboard/${g.slug}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 hover:border-terminal-green/40 transition-colors group"
            >
              <span className="flex items-center gap-2 text-sm font-mono min-w-0">
                <TeamLogo sport={g.sport} name={g.team} size={22} />
                <span className="truncate">
                  <span className="font-bold text-foreground group-hover:text-terminal-green transition-colors">
                    {g.team}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {g.isHome ? "vs" : "@"} {g.opponent}
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono shrink-0">
                <CalendarClock className="w-3 h-3" />
                {label(g.date)}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
