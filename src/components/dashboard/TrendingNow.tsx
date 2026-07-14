import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Flame, ArrowRight, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type Sport = "NFL" | "NCAAF";

// odds_history stores one row per game/market/book with opening + current line.
// "Trending" = the market has moved a line meaningfully since it opened.
interface OddsHistoryRow {
  game_id: string;
  bookmaker: string;
  odds_type: string; // "spread" | "total" | "moneyline"
  opening_line: number | null;
  current_line: number | null;
  team: string | null;
  timestamp: string | null;
}

interface TrendingItem {
  gameId: string;
  matchup: string;
  market: string;
  open: number;
  current: number;
  move: number; // signed consensus move
  books: number;
  direction: "up" | "down";
  subject: string; // e.g. "Total", team name for spread
}

const GAME_TABLE: Record<Sport, { table: string; league?: string }> = {
  NFL: { table: "games", league: "NFL" },
  NCAAF: { table: "ncaaf_games" },
};

// Minimum move to count as "trending" per market type
const MOVE_THRESHOLD: Record<string, number> = {
  spread: 0.5,
  total: 1.0,
  moneyline: 15,
};

const marketLabel = (t: string) => {
  const k = t.toLowerCase();
  if (k.includes("spread")) return "Spread";
  if (k.includes("total") || k.includes("over") || k.includes("under")) return "Total";
  if (k.includes("money") || k === "h2h" || k === "ml") return "Moneyline";
  return t;
};

const fmtLine = (v: number, market: string) => {
  if (market === "Moneyline") return v >= 0 ? `+${v}` : `${v}`;
  if (market === "Spread") return v > 0 ? `+${v}` : `${v}`;
  return `${v}`;
};

async function loadTrending(sport: Sport): Promise<TrendingItem[]> {
  const cfg = GAME_TABLE[sport];
  // Recent line history only — movement is meaningful near game time
  const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows } = await supabase
    .from("odds_history")
    .select("game_id, bookmaker, odds_type, opening_line, current_line, team, timestamp")
    .eq("sport", sport)
    .gte("timestamp", since)
    .not("opening_line", "is", null)
    .not("current_line", "is", null);

  const history = (rows || []) as OddsHistoryRow[];
  if (history.length === 0) return [];

  // Consensus move per (game, market): average of (current - opening) across books
  const groups = new Map<
    string,
    { gameId: string; market: string; moves: number[]; opens: number[]; currents: number[]; subject: string }
  >();
  for (const r of history) {
    const market = marketLabel(r.odds_type);
    const key = `${r.game_id}|${market}`;
    const move = (r.current_line ?? 0) - (r.opening_line ?? 0);
    const g = groups.get(key) || {
      gameId: r.game_id,
      market,
      moves: [],
      opens: [],
      currents: [],
      subject: market === "Total" ? "Total" : r.team || "",
    };
    g.moves.push(move);
    g.opens.push(r.opening_line ?? 0);
    g.currents.push(r.current_line ?? 0);
    if (market !== "Total" && r.team && !g.subject) g.subject = r.team;
    groups.set(key, g);
  }

  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const candidates = [...groups.values()]
    .map((g) => {
      const move = avg(g.moves);
      const market = g.market;
      return {
        gameId: g.gameId,
        market,
        open: Math.round(avg(g.opens) * 10) / 10,
        current: Math.round(avg(g.currents) * 10) / 10,
        move: Math.round(move * 10) / 10,
        books: g.moves.length,
        subject: g.subject,
      };
    })
    .filter((c) => Math.abs(c.move) >= (MOVE_THRESHOLD[c.market.toLowerCase()] ?? 0.5));

  if (candidates.length === 0) return [];

  // Resolve matchup names
  const gameIds = [...new Set(candidates.map((c) => c.gameId))];
  const { data: games } = await supabase
    .from(cfg.table as "games")
    .select("id, home_team_name, visitor_team_name")
    .in("id", gameIds);
  const nameMap = new Map(
    (games || []).map((g: any) => [String(g.id), `${g.visitor_team_name} @ ${g.home_team_name}`])
  );

  return candidates
    .filter((c) => nameMap.has(String(c.gameId)))
    .map((c) => ({
      gameId: c.gameId,
      matchup: nameMap.get(String(c.gameId))!,
      market: c.market,
      open: c.open,
      current: c.current,
      move: c.move,
      books: c.books,
      direction: c.move >= 0 ? ("up" as const) : ("down" as const),
      subject: c.subject,
    }))
    .sort((a, b) => Math.abs(b.move) - Math.abs(a.move))
    .slice(0, 6);
}

interface TrendingNowProps {
  sport: Sport;
}

export function TrendingNow({ sport }: TrendingNowProps) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["trending", sport],
    queryFn: () => loadTrending(sport),
    refetchInterval: 15 * 60 * 1000,
  });

  return (
    <Card className="bg-card border-terminal-green/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg" role="img" aria-label="chart increasing">📈</span>
          <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
            Line Movement
          </h2>
          <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
            Where the market is moving
          </span>
        </div>

        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground font-mono">Reading the market…</div>
        ) : items.length === 0 ? (
          <div className="py-6 text-center space-y-1">
            <p className="text-sm text-foreground font-mono">Lines are quiet right now</p>
            <p className="text-xs text-muted-foreground">
              Movement picks up as kickoff nears. This board lights up once books start shifting {sport} lines.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {items.map((item, i) => {
              const Arrow = item.direction === "up" ? TrendingUp : TrendingDown;
              const moveColor = "text-terminal-amber";
              return (
                <motion.div
                  key={`${item.gameId}-${item.market}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="rounded-lg border border-border bg-muted/20 p-3 hover:border-terminal-green/40 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-mono text-foreground truncate">{item.matchup}</span>
                    {i === 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-terminal-amber shrink-0">
                        <Flame className="w-3 h-3" /> HOT
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm font-mono">
                    <span className="text-muted-foreground text-xs uppercase tracking-wide">
                      {item.subject && item.market !== "Total" ? item.subject.split(" ").pop() : ""} {item.market}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 font-mono tabular-nums">
                    <span className="text-muted-foreground line-through text-sm">
                      {fmtLine(item.open, item.market)}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-foreground font-bold text-sm">{fmtLine(item.current, item.market)}</span>
                    <span className={`inline-flex items-center gap-0.5 text-xs ${moveColor} ml-auto`}>
                      <Arrow className="w-3 h-3" />
                      {item.move > 0 ? "+" : ""}
                      {item.move}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono mt-1.5">
                    Moved across {item.books} book{item.books === 1 ? "" : "s"} · {sport}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        <div className="flex items-start gap-1.5 pt-1 border-t border-border/50">
          <Info className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Reflects sportsbook line movement — what the broader market is backing, not an MGP recommendation.
            Lines that move the most, fastest, rise to the top.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
