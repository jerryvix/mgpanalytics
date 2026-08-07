import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp, Flame, Lightbulb, ArrowRightLeft, Signal } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { WinProbBar } from "@/components/ui/WinProbBar";
import { consensusAmerican, consensusPriceMove } from "@/lib/odds";
import { trendingFor } from "@/data/trendingBets";
import { format, parseISO } from "date-fns";

// Game Insights — the tap-a-game deep dive. Every number here is real MGP
// data: synced sportsbook lines, odds_history movement, and player stats we
// compute ourselves. No simulated or "estimated" figures — if a section has
// no verified data, it doesn't render. Adding a sport = one config entry
// plus (optionally) a sport-specific rail.

export type InsightsSport = "MLB" | "NFL" | "NCAAF";

interface SportConfig {
  oddsTable: string;
  spreadLabel: string;
}

const SPORT_CONFIG: Record<InsightsSport, SportConfig> = {
  MLB: { oddsTable: "mlb_odds", spreadLabel: "Run Line" },
  NFL: { oddsTable: "odds", spreadLabel: "Spread" },
  NCAAF: { oddsTable: "ncaaf_odds", spreadLabel: "Spread" },
};

const SPORTSBOOKS = ["draftkings", "fanduel", "caesars", "betrivers"];
const SPORTSBOOK_LABELS: Record<string, string> = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  caesars: "Caesars",
  betrivers: "BetRivers",
};

export interface InsightsGame {
  id: string | number;
  date: string;
  home_team_name: string;
  visitor_team_name: string;
  venue?: string | null;
  starting_pitcher_home?: string | null;
  starting_pitcher_away?: string | null;
}

interface BookOdds {
  sportsbook: string;
  spread_value: number | null;
  spread_odds: number | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
  total_value: number | null;
  total_over_odds: number | null;
  total_under_odds: number | null;
}

interface MoveInsight {
  label: string;
  from: string;
  to: string;
  detail: string;
}

interface HotBat {
  name: string;
  team: string;
  streak: number;
  streakAvg: number | null;
  seasonAvg: number | null;
}

const fmtPrice = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : v > 0 ? `+${v}` : `${v}`;
const fmtAvg = (v: number | null) => (v == null ? "—" : v.toFixed(3).replace(/^0/, ""));
const short = (full: string) => full.split(" ").pop() || full;

async function loadInsights(sport: InsightsSport, game: InsightsGame) {
  const cfg = SPORT_CONFIG[sport];

  // 1) Every book's current lines for this game
  const { data: oddsData } = await supabase
    .from(cfg.oddsTable as "odds")
    .select("*")
    .eq("game_id", game.id as never)
    .in("sportsbook", SPORTSBOOKS);
  const books = ((oddsData || []) as unknown as BookOdds[]);

  // Consensus moneyline across books → no-vig win probability
  const consHome = consensusAmerican(books.map((b) => b.moneyline_home));
  const consAway = consensusAmerican(books.map((b) => b.moneyline_away));

  // 2) Line movement since open. odds_history rows carry their own team
  // names (their game ids come from the odds feed, not our games table),
  // so match by team name, then anchor totals through the matched feed id.
  const since = new Date(Date.now() - 3 * 24 * 3600_000).toISOString();
  const { data: hist } = await supabase
    .from("odds_history")
    .select("game_id, bookmaker, odds_type, opening_line, current_line, team")
    .eq("sport", sport)
    .gte("timestamp", since)
    .not("opening_line", "is", null)
    .not("current_line", "is", null)
    .in("team", [game.home_team_name, game.visitor_team_name]);

  // Dominant feed game id for this matchup (doubleheaders: most-covered game)
  const idCounts = new Map<string, number>();
  for (const r of hist || []) idCounts.set(r.game_id, (idCounts.get(r.game_id) || 0) + 1);
  const feedId = [...idCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  let totalRows: typeof hist = [];
  if (feedId) {
    const { data: totals } = await supabase
      .from("odds_history")
      .select("game_id, bookmaker, odds_type, opening_line, current_line, team")
      .eq("sport", sport)
      .eq("game_id", feedId)
      .gte("timestamp", since)
      .in("team", ["Over"])
      .not("opening_line", "is", null)
      .not("current_line", "is", null);
    totalRows = totals || [];
  }

  const moves: MoveInsight[] = [];
  for (const teamName of [game.visitor_team_name, game.home_team_name]) {
    const rows = (hist || []).filter(
      (r) => r.team === teamName && (!feedId || r.game_id === feedId) && r.odds_type.toLowerCase().includes("moneyline")
    );
    const c = consensusPriceMove(rows.map((r) => ({ open: r.opening_line, current: r.current_line })));
    if (c && Math.abs(c.move) >= 1) {
      moves.push({
        label: `${short(teamName)} ML`,
        from: fmtPrice(c.open),
        to: fmtPrice(c.current),
        detail: `${c.move > 0 ? "steamed" : "drifting"} · ${c.move > 0 ? "+" : ""}${c.move} pts implied · ${c.books} book${c.books === 1 ? "" : "s"}`,
      });
    }
  }
  if (totalRows.length) {
    const valid = totalRows.filter((r) => r.opening_line != null && r.current_line != null);
    if (valid.length) {
      const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
      const open = Math.round(avg(valid.map((r) => r.opening_line!)) * 10) / 10;
      const curr = Math.round(avg(valid.map((r) => r.current_line!)) * 10) / 10;
      if (Math.abs(curr - open) >= 0.5) {
        moves.push({
          label: "Total",
          from: `${open}`,
          to: `${curr}`,
          detail: `${curr > open ? "climbing" : "dropping"} · ${valid.length} book${valid.length === 1 ? "" : "s"}`,
        });
      }
    }
  }

  // 3) Hot bats in this game (MLB) — real streaks from our own game logs
  let hotBats: HotBat[] = [];
  if (sport === "MLB") {
    const { data: players } = await supabase
      .from("players")
      .select("id, name, team_name, team_abbr")
      .eq("sport", "MLB")
      .eq("status", "active")
      .in("team_name", [game.home_team_name, game.visitor_team_name]);
    const ids = (players || []).map((p) => p.id);
    if (ids.length) {
      const { data: stats } = await supabase
        .from("player_season_stats")
        .select("player_id, hit_streak, hit_streak_avg, batting_avg")
        .eq("sport", "MLB")
        .eq("season", new Date().getFullYear())
        .gte("hit_streak", 5)
        .in("player_id", ids)
        .order("hit_streak", { ascending: false })
        .limit(6);
      const pm = new Map((players || []).map((p) => [p.id, p]));
      hotBats = (stats || []).map((s) => {
        const p = pm.get(s.player_id);
        return {
          name: p?.name || "Unknown",
          team: p?.team_abbr || short(p?.team_name || ""),
          streak: s.hit_streak as number,
          streakAvg: s.hit_streak_avg as number | null,
          seasonAvg: s.batting_avg as number | null,
        };
      });
    }
  }

  // 4) Verified angles touching either team — curated, checkable facts only
  const angles = trendingFor(sport)
    .filter((b) =>
      [game.home_team_name, game.visitor_team_name].some(
        (t) => b.subject.includes(short(t)) || b.nugget.includes(short(t))
      )
    )
    .slice(0, 3);

  return { books, consHome, consAway, moves, hotBats, angles };
}

// Best price per market side across books — line shopping, the most
// concrete truthful edge we can hand someone.
function bestIdx(books: BookOdds[], pick: (b: BookOdds) => number | null): Set<number> {
  let best: number | null = null;
  for (const b of books) {
    const v = pick(b);
    if (v == null) continue;
    if (best == null || v > best) best = v;
  }
  const out = new Set<number>();
  if (best == null) return out;
  books.forEach((b, i) => {
    if (pick(b) === best) out.add(i);
  });
  return out;
}

export function GameInsightsSheet({
  sport,
  game,
  open,
  onOpenChange,
}: {
  sport: InsightsSport;
  game: InsightsGame | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const cfg = SPORT_CONFIG[sport];
  const { data, isLoading } = useQuery({
    queryKey: ["game-insights", sport, game?.id],
    queryFn: () => loadInsights(sport, game!),
    enabled: open && !!game,
    staleTime: 60_000,
  });

  const orderedBooks = SPORTSBOOKS.map((key) => ({
    key,
    odds: data?.books.find((b) => b.sportsbook.toLowerCase().includes(key)) || null,
  }));
  const present = orderedBooks.filter((b) => b.odds) as Array<{ key: string; odds: BookOdds }>;
  const bestMlHome = bestIdx(present.map((p) => p.odds), (b) => b.moneyline_home);
  const bestMlAway = bestIdx(present.map((p) => p.odds), (b) => b.moneyline_away);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-background/85 backdrop-blur-xl border-l border-terminal-green/30 w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-terminal-green/20">
          <SheetTitle className="font-mono text-foreground">
            {game && (
              <div>
                <div className="flex items-center gap-2 text-lg">
                  <TeamLogo sport={sport} name={game.visitor_team_name} size={20} />
                  {short(game.visitor_team_name)}
                  <span className="text-terminal-green">@</span>
                  <TeamLogo sport={sport} name={game.home_team_name} size={20} />
                  {short(game.home_team_name)}
                </div>
                <p className="text-xs text-muted-foreground font-normal mt-1">
                  {format(parseISO(game.date), "EEE MMM d, h:mm a")}
                  {game.venue ? ` · ${game.venue}` : ""}
                </p>
                {(game.starting_pitcher_away || game.starting_pitcher_home) && (
                  <p className="text-xs text-muted-foreground font-normal mt-0.5">
                    ⚾ {game.starting_pitcher_away || "TBD"} vs {game.starting_pitcher_home || "TBD"}
                  </p>
                )}
              </div>
            )}
          </SheetTitle>
        </SheetHeader>

        {isLoading || !game ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-terminal-green" />
            <span className="ml-2 font-mono text-sm text-muted-foreground">BUILDING GAME INTEL...</span>
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            {/* Market consensus — no-vig win probability */}
            {data?.consHome != null && data?.consAway != null && (
              <section>
                <SectionTitle icon={<Signal className="w-3.5 h-3.5" />} text="Market Read" />
                <div className="border border-border rounded-lg p-3 bg-card/50 space-y-2">
                  <WinProbBar
                    homeName={game.home_team_name}
                    awayName={game.visitor_team_name}
                    moneylineHome={data.consHome}
                    moneylineAway={data.consAway}
                  />
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Consensus of {present.length} book{present.length === 1 ? "" : "s"}, vig removed —
                    the market's own probability, not an MGP pick.
                  </p>
                </div>
              </section>
            )}

            {/* Line movement since open */}
            {(data?.moves.length ?? 0) > 0 && (
              <section>
                <SectionTitle icon={<ArrowRightLeft className="w-3.5 h-3.5" />} text="Line Movement" />
                <div className="border border-border rounded-lg p-3 bg-card/50 divide-y divide-dashed divide-border">
                  {data!.moves.map((m, i) => (
                    <div key={i} className="py-2 first:pt-0 last:pb-0 text-sm">
                      {m.label}
                      <span className="float-right font-mono font-bold text-terminal-green tabular-nums">
                        {m.from} → {m.to}
                      </span>
                      <span className="block font-mono text-[10px] text-muted-foreground mt-0.5">{m.detail}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Hot bats (MLB) */}
            {(data?.hotBats.length ?? 0) > 0 && (
              <section>
                <SectionTitle icon={<Flame className="w-3.5 h-3.5" />} text="Hot Bats in This Game" />
                <div className="border border-border rounded-lg p-3 bg-card/50 divide-y divide-dashed divide-border">
                  {data!.hotBats.map((h, i) => (
                    <div key={i} className="py-2 first:pt-0 last:pb-0 text-sm flex items-baseline justify-between gap-2">
                      <span>
                        {h.name} <span className="text-muted-foreground font-mono text-[10px]">{h.team}</span>
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-right">
                        <b className="text-terminal-amber">{h.streak}-game streak</b>
                        <span className="text-muted-foreground"> · {fmtAvg(h.streakAvg)} in it · {fmtAvg(h.seasonAvg)} szn</span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Verified angles */}
            {(data?.angles.length ?? 0) > 0 && (
              <section>
                <SectionTitle icon={<Lightbulb className="w-3.5 h-3.5" />} text="Verified Angles" />
                <div className="border border-border rounded-lg p-3 bg-card/50 divide-y divide-dashed divide-border">
                  {data!.angles.map((a) => (
                    <div key={a.id} className="py-2 first:pt-0 last:pb-0 text-sm">
                      {a.nugget}
                      <span className="block font-mono text-[10px] text-muted-foreground mt-0.5">
                        verified · Trending Bets integrity rules apply
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Book-by-book board with best-price highlight */}
            <section>
              <SectionTitle icon={<TrendingUp className="w-3.5 h-3.5" />} text="Shop the Line" />
              {present.length === 0 ? (
                <p className="text-xs text-muted-foreground font-mono border border-border rounded-lg p-4 bg-card/50">
                  No lines from tracked books yet — they post through the day.
                </p>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-3 py-2 border-b border-border font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>Book</span>
                    <span className="text-right">{cfg.spreadLabel}</span>
                    <span className="text-right">ML (A/H)</span>
                    <span className="text-right">Total</span>
                  </div>
                  {present.map(({ key, odds }, i) => (
                    <div
                      key={key}
                      className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-3 py-2 border-b border-border/60 last:border-none font-mono text-[11px] tabular-nums items-center bg-card/50"
                    >
                      <span className="text-foreground">{SPORTSBOOK_LABELS[key]}</span>
                      <span className="text-right text-muted-foreground">
                        {odds.spread_value != null ? `${fmtPrice(odds.spread_value)} (${fmtPrice(odds.spread_odds)})` : "—"}
                      </span>
                      <span className="text-right">
                        <span className={bestMlAway.has(i) ? "text-terminal-green font-bold" : "text-muted-foreground"}>
                          {fmtPrice(odds.moneyline_away)}
                        </span>
                        <span className="text-muted-foreground"> / </span>
                        <span className={bestMlHome.has(i) ? "text-terminal-green font-bold" : "text-muted-foreground"}>
                          {fmtPrice(odds.moneyline_home)}
                        </span>
                      </span>
                      <span className="text-right text-muted-foreground">
                        {odds.total_value != null
                          ? `${odds.total_value} O${fmtPrice(odds.total_over_odds)}/U${fmtPrice(odds.total_under_odds)}`
                          : "—"}
                      </span>
                    </div>
                  ))}
                  <p className="px-3 py-2 font-mono text-[10px] text-muted-foreground bg-card/30">
                    <b className="text-terminal-green">Green</b> = best moneyline price available. Same bet, better payout.
                  </p>
                </div>
              )}
            </section>

            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Everything above is synced sportsbook data and MGP-computed stats — market signal,
              not a recommendation. Sections without verified data simply don't show.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SectionTitle({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-widest mb-2 text-terminal-amber">
      {icon} {text}
    </div>
  );
}
