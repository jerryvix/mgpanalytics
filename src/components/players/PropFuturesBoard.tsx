import { Fragment, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, TrendingUp, Info, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { FuturesInsight } from "@/components/players/FuturesInsight";
import { NCAAF_TEAM_IDS } from "@/data/ncaafTeamIds";
import { NFL_FUTURES, NCAAF_FUTURES } from "@/data/propFutures";

// Pre-season futures board: team win totals + season-long player props.
// Static by design — these lines mostly move only on major trades/injuries,
// so we snapshot once before the season rather than paying for a live feed.

const MARKET_LABELS: Record<string, string> = {
  "Regular Season Wins": "Team Win Totals",
  "Regular Season - Total Passing Yards": "Passing Yards",
  "Regular Season - Total Passing Touchdowns": "Passing TDs",
  "Regular Season - Total Rushing Yards": "Rushing Yards",
  "Regular Season - Total Rushing Touchdowns": "Rushing TDs",
  "Regular Season - Total Receiving Yards": "Receiving Yards",
  "Regular Season - Total Receiving Touchdowns": "Receiving TDs",
  "Regular Season - Total Sacks": "Sacks",
};

const MARKET_ORDER = Object.keys(MARKET_LABELS);

interface PropFuturesBoardProps {
  sport: "NFL" | "NCAAF";
  /** "team" = win totals only (Games > Futures); "players" = prop futures only
   *  (Players > Futures); "all" = everything. */
  view?: "team" | "players" | "all";
}

export function PropFuturesBoard({ sport, view = "all" }: PropFuturesBoardProps) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const data = sport === "NFL" ? NFL_FUTURES : NCAAF_FUTURES;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    let scoped = data;
    if (view === "team") scoped = scoped.filter((f) => f.market === "Regular Season Wins");
    if (view === "players") scoped = scoped.filter((f) => f.market !== "Regular Season Wins");
    const filtered = q ? scoped.filter((f) => f.subject.toLowerCase().includes(q)) : scoped;
    return MARKET_ORDER.map((market) => ({
      market,
      label: MARKET_LABELS[market] ?? market,
      items: filtered
        .filter((f) => f.market === market)
        .sort((a, b) => b.line - a.line),
    })).filter((g) => g.items.length > 0);
  }, [data, query, view]);

  const isTeamMarket = (market: string) => market === "Regular Season Wins";
  const espnIdFor = (subject: string) => (sport === "NCAAF" ? NCAAF_TEAM_IDS[subject] ?? null : null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h2 className="font-mono text-lg font-bold text-foreground tracking-wide">
            {sport} SEASON FUTURES
          </h2>
          <p className="text-xs text-muted-foreground font-mono">
            Season-long O/U board
            <span className="text-terminal-green"> · tap any line for the MGP Angle</span>
          </p>
        </div>
        <div className="relative sm:ml-auto sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={sport === "NFL" ? "Search team or player…" : "Search team…"}
            className="pl-8 font-mono text-sm"
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-10 text-center text-sm text-muted-foreground font-mono">
            No futures match "{query}".
          </CardContent>
        </Card>
      ) : (
        groups.map((group, gi) => (
          <motion.div
            key={group.market}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(gi * 0.06, 0.3) }}
            className="space-y-2"
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-terminal-green" />
              <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
                {group.label}
              </h3>
              <span className="text-[10px] text-muted-foreground font-mono">
                {group.items.length} lines · O/U
              </span>
            </div>
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground border-b border-border">
                        <th className="text-left font-medium px-4 py-2">
                          {isTeamMarket(group.market) ? "Team" : "Player"}
                        </th>
                        <th className="text-right font-medium px-2 py-2">Line</th>
                        <th className="text-right font-medium px-2 py-2">Over</th>
                        <th className="text-right font-medium px-4 py-2">Under</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((f, i) => {
                        const rowKey = `${f.market}-${f.subject}`;
                        const expandable = true; // every line gets an MGP Angle
                        const teamRow = isTeamMarket(group.market);
                        const isOpen = expanded === rowKey;
                        return (
                          <Fragment key={rowKey}>
                            <tr
                              onClick={expandable ? () => setExpanded(isOpen ? null : rowKey) : undefined}
                              className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${
                                i % 2 === 1 ? "bg-muted/10" : ""
                              } ${expandable ? "cursor-pointer" : ""}`}
                            >
                              <td className="px-4 py-2 font-medium text-foreground">
                                <span className="inline-flex items-center gap-2">
                                  {expandable &&
                                    (isOpen ? (
                                      <ChevronDown className="w-3.5 h-3.5 text-terminal-green shrink-0" />
                                    ) : (
                                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                    ))}
                                  {teamRow && (
                                    <TeamLogo sport={sport} name={f.subject} espnId={espnIdFor(f.subject)} size={18} />
                                  )}
                                  {f.subject}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-right font-mono font-bold tabular-nums text-terminal-green">
                                {f.line}
                              </td>
                              <td className="px-2 py-2 text-right">
                                <Badge className="bg-terminal-green/10 text-terminal-green border-terminal-green/30 font-mono tabular-nums text-xs">
                                  O {f.over}
                                </Badge>
                              </td>
                              <td className="px-4 py-2 text-right">
                                <Badge className="bg-terminal-amber/10 text-terminal-amber border-terminal-amber/30 font-mono tabular-nums text-xs">
                                  U {f.under}
                                </Badge>
                              </td>
                            </tr>
                            {isOpen && (
                              <tr className="border-b border-border/50">
                                <td colSpan={4} className="px-4 pb-2">
                                  <FuturesInsight
                                    sport={sport}
                                    subject={f.subject}
                                    line={f.line}
                                    over={f.over}
                                    under={f.under}
                                    kind={teamRow ? "team" : "player"}
                                    marketLabel={group.label}
                                  />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))
      )}

      <div className="flex items-start gap-1.5">
        <Info className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-[10px] text-muted-foreground leading-relaxed max-w-2xl">
          Season-long futures captured before the season — lines can move on major trades or injuries.
          In-season live props will get their own view once the season starts.
        </p>
      </div>
    </div>
  );
}
