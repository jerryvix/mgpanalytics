import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Flame, Lightbulb, TrendingDown as TD, Signal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { LiveBadge } from "@/components/ui/LiveBadge";
import { useLiveScores } from "@/hooks/useLiveScores";
import { isFinalStatus } from "@/lib/gameStatus";
import { trendingFor } from "@/data/trendingBets";
import { format, parseISO, isSameDay, addDays } from "date-fns";

// Today's Board — the day-to-day companion to the Season Long futures view.
// Layout approved from the v3 mockup: odds grid on the left, three rails on
// the right (Sharpest Moves, Market Signal, Streaks & Angles). Odds come from
// the same synced tables the slates use; movement comes from odds_history;
// live scores from the same ESPN polling as everywhere else.

type BoardSport = "MLB" | "NFL" | "NCAAF";

const GAME_TABLE: Record<BoardSport, string> = { MLB: "mlb_games", NFL: "games", NCAAF: "ncaaf_games" };
const ODDS_TABLE: Record<BoardSport, string> = { MLB: "mlb_odds", NFL: "odds", NCAAF: "ncaaf_odds" };

interface BoardGame {
  id: string | number;
  date: string;
  status: string;
  home_team_name: string;
  visitor_team_name: string;
  venue?: string | null;
  starting_pitcher_home?: string | null;
  starting_pitcher_away?: string | null;
  home_team_id?: string | null;
  visitor_team_id?: string | null;
}

interface BoardOdds {
  game_id: string | number;
  spread_value: number | null;
  spread_odds: number | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
  total_value: number | null;
  total_over_odds: number | null;
  total_under_odds: number | null;
}

interface MoveRow {
  gameId: string;
  market: string; // Spread | Moneyline | Total
  team: string | null;
  move: number;
  open: number;
  current: number;
  books: number;
  teamsInGame: string[];
}

const fmtPrice = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : v > 0 ? `+${v}` : `${v}`;
const fmtLine = fmtPrice;

const marketLabel = (t: string) => {
  const k = t.toLowerCase();
  if (k.includes("spread")) return "Spread";
  if (k.includes("total") || k.includes("over") || k.includes("under")) return "Total";
  return "Moneyline";
};

const MOVE_THRESHOLD: Record<string, number> = { Spread: 0.5, Total: 0.5, Moneyline: 10 };

async function loadBoard(sport: BoardSport) {
  const windowStart = new Date(Date.now() - 5 * 3600_000).toISOString();
  const windowEnd = new Date(Date.now() + 72 * 3600_000).toISOString();

  let gq = supabase
    .from(GAME_TABLE[sport] as "games")
    .select("*")
    .gte("date", windowStart)
    .lte("date", windowEnd)
    .order("date", { ascending: true })
    .limit(40);
  if (sport === "NFL") gq = gq.eq("league", "NFL");
  const { data: games } = await gq;
  const list = ((games || []) as unknown as BoardGame[]).filter((g) => !isFinalStatus(g.status));

  // DraftKings lines for the grid
  let oddsMap = new Map<string, BoardOdds>();
  if (list.length) {
    const { data: odds } = await supabase
      .from(ODDS_TABLE[sport] as "odds")
      .select("*")
      .in("game_id", list.map((g) => g.id))
      .ilike("sportsbook", "%draftkings%");
    oddsMap = new Map(((odds || []) as unknown as BoardOdds[]).map((o) => [String(o.game_id), o]));
  }

  // Line movement — odds_history rows carry their own team names, so no
  // fragile id-join with the games table is needed.
  const since = new Date(Date.now() - 3 * 24 * 3600_000).toISOString();
  const { data: hist } = await supabase
    .from("odds_history")
    .select("game_id, bookmaker, odds_type, opening_line, current_line, team")
    .eq("sport", sport)
    .gte("timestamp", since)
    .not("opening_line", "is", null)
    .not("current_line", "is", null);

  const teamsByGame = new Map<string, Set<string>>();
  for (const r of hist || []) {
    if (!r.team) continue;
    const s = teamsByGame.get(r.game_id) || new Set<string>();
    s.add(r.team);
    teamsByGame.set(r.game_id, s);
  }

  const groups = new Map<string, { moves: number[]; opens: number[]; currents: number[]; team: string | null; gameId: string; market: string }>();
  for (const r of hist || []) {
    const market = marketLabel(r.odds_type);
    const key = `${r.game_id}|${market}|${r.team ?? ""}`;
    const g = groups.get(key) || { moves: [], opens: [], currents: [], team: r.team, gameId: r.game_id, market };
    g.moves.push((r.current_line ?? 0) - (r.opening_line ?? 0));
    g.opens.push(r.opening_line ?? 0);
    g.currents.push(r.current_line ?? 0);
    groups.set(key, g);
  }
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const moves: MoveRow[] = [...groups.values()]
    .map((g) => ({
      gameId: g.gameId,
      market: g.market,
      team: g.team,
      move: Math.round(avg(g.moves) * 10) / 10,
      open: Math.round(avg(g.opens) * 10) / 10,
      current: Math.round(avg(g.currents) * 10) / 10,
      books: g.moves.length,
      teamsInGame: [...(teamsByGame.get(g.gameId) || [])],
    }))
    .filter((m) => Math.abs(m.move) >= (MOVE_THRESHOLD[m.market] ?? 0.5))
    .sort((a, b) => Math.abs(b.move) - Math.abs(a.move));

  // Hot streak names for the meta line + Streaks & Angles rail (MLB data)
  let streaks: Array<{ name: string; team: string | null; streak: number; streakAvg: number | null }> = [];
  if (sport === "MLB") {
    const { data: s } = await supabase
      .from("player_season_stats")
      .select("player_id, hit_streak, hit_streak_avg")
      .eq("sport", "MLB")
      .eq("season", new Date().getFullYear())
      .gte("hit_streak", 6)
      .order("hit_streak", { ascending: false })
      .limit(5);
    if (s?.length) {
      const { data: ps } = await supabase.from("players").select("id, name, team_abbr").in("id", s.map((x) => x.player_id));
      const pm = new Map((ps || []).map((p) => [p.id, p]));
      streaks = s
        .map((x) => {
          const p = pm.get(x.player_id);
          return p ? { name: p.name, team: p.team_abbr, streak: x.hit_streak as number, streakAvg: x.hit_streak_avg as number | null } : null;
        })
        .filter(Boolean) as typeof streaks;
    }
  }

  return { games: list, oddsMap, moves, streaks };
}

const shortName = (full: string) => full.split(" ").pop() || full;
const fmtAvg = (v: number | null) => (v == null ? "" : v.toFixed(3).replace(/^0/, ""));

export function TodaysBoard({ sport }: { sport: BoardSport }) {
  const [dayOffset, setDayOffset] = useState(0);
  const live = useLiveScores(sport);
  const { data, isLoading } = useQuery({
    queryKey: ["todays-board", sport],
    queryFn: () => loadBoard(sport),
    refetchInterval: 5 * 60 * 1000,
  });

  const days = useMemo(() => [0, 1, 2].map((o) => addDays(new Date(), o)), []);
  const dayGames = useMemo(() => {
    if (!data?.games) return [];
    const day = days[dayOffset];
    return data.games.filter((g) => isSameDay(parseISO(g.date), day));
  }, [data, dayOffset, days]);

  // moneyline movement direction per team (matched by name against history rows)
  const mlMoveFor = (team: string): number | null => {
    const m = data?.moves.find((x) => x.market === "Moneyline" && x.team === team);
    return m ? m.move : null;
  };

  const sharpest = (data?.moves || []).slice(0, 3);
  const signal = (data?.moves || []).filter((m) => m.market === "Moneyline" || m.market === "Total").slice(0, 2);
  const todaysTeams = new Set(dayGames.flatMap((g) => [g.home_team_name, g.visitor_team_name]));
  const angles = trendingFor(sport)
    .filter((b) => [...todaysTeams].some((t) => b.nugget.includes(shortName(t)) || b.subject.includes(shortName(t))))
    .slice(0, 2);
  const spreadLabel = sport === "MLB" ? "Run Line" : "Spread";

  return (
    <div className="space-y-4">
      {/* Date chips */}
      <div className="flex items-center gap-2 font-mono text-[11px]">
        {days.map((d, i) => (
          <button
            key={i}
            onClick={() => setDayOffset(i)}
            className={`px-3 py-1 rounded-full border uppercase tracking-wider transition-colors ${
              dayOffset === i
                ? "text-terminal-amber border-terminal-amber/50 bg-terminal-amber/10"
                : "text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            {i === 0 ? `Today · ${format(d, "EEE MMM d")}` : format(d, "EEE MMM d")}
          </button>
        ))}
        <span className="ml-auto text-muted-foreground hidden sm:inline">
          <span className="text-terminal-green">●</span> live scores 60s
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_290px] gap-4 items-start">
        {/* Odds grid */}
        <Card className="bg-gradient-to-b from-card to-card/70 border-border overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-[1fr_88px_88px_88px] gap-2 px-4 py-2.5 border-b border-border font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>Matchup</span>
              <span className="text-center">{spreadLabel}</span>
              <span className="text-center">Money</span>
              <span className="text-center">Total</span>
            </div>
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground font-mono">Loading the board…</div>
            ) : dayGames.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground font-mono">
                No {sport} games on this date{dayOffset === 0 ? " — the board lights up on game days" : ""}.
              </div>
            ) : (
              dayGames.map((g, gi) => {
                const o = data!.oddsMap.get(String(g.id));
                const liveGame = live.getGame(g.visitor_team_name, g.home_team_name);
                const hot = data!.streaks.find(
                  (s) => s.team && (g.home_team_name.includes(s.team) || g.visitor_team_name.includes(s.team) ||
                    getTeamLast(g.home_team_name) === s.team || getTeamLast(g.visitor_team_name) === s.team)
                );
                const awayMlMove = mlMoveFor(g.visitor_team_name);
                const homeMlMove = mlMoveFor(g.home_team_name);
                return (
                  <motion.div
                    key={String(g.id)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(gi * 0.04, 0.3) }}
                    className="grid grid-cols-[1fr_88px_88px_88px] gap-2 px-4 py-3 border-b border-border/60 items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-semibold text-sm">
                        <TeamLogo sport={sport} name={g.visitor_team_name} espnId={g.visitor_team_id} size={18} />
                        <span className="truncate">{shortName(g.visitor_team_name)}</span>
                        {liveGame?.state !== "pre" && liveGame?.awayScore != null && (
                          <span className="ml-auto font-mono tabular-nums">{liveGame.awayScore}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 font-semibold text-sm mt-1.5">
                        <TeamLogo sport={sport} name={g.home_team_name} espnId={g.home_team_id} size={18} />
                        <span className="truncate">{shortName(g.home_team_name)}</span>
                        {liveGame?.state !== "pre" && liveGame?.homeScore != null && (
                          <span className="ml-auto font-mono tabular-nums">{liveGame.homeScore}</span>
                        )}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground mt-1.5 truncate">
                        {liveGame?.state === "in" ? (
                          <span className="inline-flex items-center gap-1.5"><LiveBadge detail={liveGame.detail} /></span>
                        ) : (
                          format(parseISO(g.date), "h:mm a")
                        )}
                        {g.venue ? ` · ${g.venue}` : ""}
                        {sport === "MLB" && g.starting_pitcher_away && g.starting_pitcher_home
                          ? ` · ${lastWord(g.starting_pitcher_away)} vs ${lastWord(g.starting_pitcher_home)}`
                          : ""}
                        {hot ? ` · ${hot.name} ${hot.streak}-game hit streak 🔥` : ""}
                      </div>
                    </div>
                    <PillCol
                      top={o?.spread_value != null ? `${fmtLine(-o.spread_value)} ${fmtPrice(o.spread_odds)}` : "—"}
                      bottom={o?.spread_value != null ? `${fmtLine(o.spread_value)} ${fmtPrice(o.spread_odds)}` : "—"}
                    />
                    <PillCol
                      top={fmtPrice(o?.moneyline_away)}
                      bottom={fmtPrice(o?.moneyline_home)}
                      topMove={awayMlMove}
                      bottomMove={homeMlMove}
                    />
                    <PillCol
                      top={o?.total_value != null ? `O ${o.total_value} ${fmtPrice(o.total_over_odds)}` : "—"}
                      bottom={o?.total_value != null ? `U ${o.total_value} ${fmtPrice(o.total_under_odds)}` : "—"}
                    />
                  </motion.div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Rails */}
        <div className="space-y-4">
          <Rail title="Sharpest Moves" icon={<TD className="w-3.5 h-3.5" />} color="text-terminal-amber">
            {sharpest.length === 0 ? (
              <RailQuiet text="Lines are quiet — moves appear as books shift." />
            ) : (
              sharpest.map((m, i) => (
                <div key={i} className="py-2 border-b border-dashed border-border last:border-none text-sm">
                  <span className="font-mono text-terminal-amber text-[11px] mr-1.5">#{i + 1}</span>
                  {m.team ? shortName(m.team) : m.teamsInGame.map(shortName).join("/") || "Game"} {m.market}
                  <span className="float-right font-mono font-bold text-terminal-green tabular-nums">
                    {fmtLine(m.open)} → {fmtLine(m.current)}
                  </span>
                  <span className="block font-mono text-[10px] text-muted-foreground mt-0.5">
                    moved across {m.books} book{m.books === 1 ? "" : "s"}
                  </span>
                </div>
              ))
            )}
          </Rail>

          <Rail title="Market Signal" icon={<Flame className="w-3.5 h-3.5" />} color="text-terminal-amber">
            {signal.length === 0 ? (
              <RailQuiet text="No strong one-way movement yet today." />
            ) : (
              signal.map((m, i) => (
                <div key={i} className="py-2 border-b border-dashed border-border last:border-none text-sm">
                  <span className="font-mono text-terminal-amber text-[11px] mr-1.5">#{i + 1}</span>
                  {m.team ? `${shortName(m.team)} ML` : `${m.teamsInGame.map(shortName).join("/")} Total`}
                  <span className="float-right font-mono font-bold text-terminal-green tabular-nums">{fmtLine(m.current)}</span>
                  <span className="block font-mono text-[10px] text-muted-foreground mt-0.5">
                    {m.move > 0 ? "steamed up" : "bet down"} from {fmtLine(m.open)}
                  </span>
                </div>
              ))
            )}
            <p className="font-mono text-[10px] text-muted-foreground pt-2">
              "Most-backed" here means market signal — biggest line moves across books.
            </p>
          </Rail>

          <Rail title="Streaks & Angles" icon={<Lightbulb className="w-3.5 h-3.5" />} color="text-terminal-green">
            {data?.streaks.slice(0, 2).map((s, i) => (
              <div key={`s${i}`} className="py-2 border-b border-dashed border-border text-sm">
                {s.name} {s.team ? `(${s.team})` : ""} rides a {s.streak}-game hit streak
                {s.streakAvg ? ` (${fmtAvg(s.streakAvg)} during it)` : ""}.
                <span className="block font-mono text-[10px] text-muted-foreground mt-0.5">live from MGP data</span>
              </div>
            ))}
            {angles.map((b) => (
              <div key={b.id} className="py-2 border-b border-dashed border-border last:border-none text-sm">
                {b.nugget.length > 160 ? b.nugget.slice(0, 157) + "…" : b.nugget}
                <span className="block font-mono text-[10px] text-muted-foreground mt-0.5">
                  verified · Trending Bets integrity rules apply
                </span>
              </div>
            ))}
            {(data?.streaks.length ?? 0) === 0 && angles.length === 0 && (
              <RailQuiet text="Angles land here on game days." />
            )}
          </Rail>
        </div>
      </div>

      <div className="flex items-start gap-1.5">
        <Signal className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-[10px] text-muted-foreground leading-relaxed max-w-2xl">
          Lines shown are the latest synced sportsbook numbers and refresh through the day; scores and game
          state update live. Market moves reflect what books are doing — not an MGP recommendation.
        </p>
      </div>
    </div>
  );
}

function lastWord(s: string) {
  return s.trim().split(/\s+/).pop() || s;
}
function getTeamLast(s: string) {
  return s.trim().split(/\s+/).pop() || s;
}

function PillCol({ top, bottom, topMove, bottomMove }: { top: string; bottom: string; topMove?: number | null; bottomMove?: number | null }) {
  const arrow = (mv?: number | null) =>
    mv == null ? null : (
      <span className={`text-[9px] ml-0.5 ${mv > 0 ? "text-terminal-green" : "text-red-400"}`}>{mv > 0 ? "▲" : "▼"}</span>
    );
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-mono text-[11px] text-center py-1.5 px-1 border border-border rounded-md bg-terminal-green/5 tabular-nums whitespace-nowrap overflow-hidden">
        <b className="text-terminal-green font-bold">{top}</b>
        {arrow(topMove)}
      </div>
      <div className="font-mono text-[11px] text-center py-1.5 px-1 border border-border rounded-md bg-terminal-green/5 tabular-nums whitespace-nowrap overflow-hidden">
        <b className="text-terminal-green font-bold">{bottom}</b>
        {arrow(bottomMove)}
      </div>
    </div>
  );
}

function Rail({ title, icon, color, children }: { title: string; icon: React.ReactNode; color: string; children: React.ReactNode }) {
  return (
    <Card className="bg-gradient-to-b from-card to-card/70 border-border">
      <CardContent className="p-3.5">
        <div className={`flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-widest mb-1 ${color}`}>
          {icon} {title}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function RailQuiet({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground py-2">{text}</p>;
}
