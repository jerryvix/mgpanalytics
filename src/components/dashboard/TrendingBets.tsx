import { motion } from "framer-motion";
import { Lightbulb, TrendingUp, Trophy, Target, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trendingFor, TrendingBet, BetCategory } from "@/data/trendingBets";

const CATEGORY_ORDER: BetCategory[] = ["Win Totals", "Awards", "Division", "Championship", "Game Props"];

const CATEGORY_META: Record<BetCategory, { icon: typeof Trophy; label: string }> = {
  "Win Totals": { icon: TrendingUp, label: "Season Win Totals" },
  Awards: { icon: Trophy, label: "Award Races" },
  Division: { icon: Target, label: "Division Odds" },
  Championship: { icon: Trophy, label: "Championship Futures" },
  "Game Props": { icon: Target, label: "Game Props" },
};

function BetRow({ bet, index }: { bet: TrendingBet; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <Card className="bg-card border-border hover:border-terminal-green/40 transition-colors">
        <CardContent className="p-4">
          {/* The bet */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-foreground truncate">{bet.subject}</div>
              <div className="text-xs text-muted-foreground font-mono">{bet.market}</div>
            </div>
            <div className="text-right shrink-0">
              <Badge className="bg-terminal-green/15 text-terminal-green border-terminal-green/30 font-mono tabular-nums">
                {bet.line}
              </Badge>
              {bet.odds && (
                <div className="text-[10px] text-muted-foreground font-mono mt-1">{bet.odds}</div>
              )}
            </div>
          </div>

          {/* The insight nugget — the whole point of the tab */}
          <div className="mt-3 rounded-lg bg-terminal-amber/5 border border-terminal-amber/20 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Lightbulb className="w-3.5 h-3.5 text-terminal-amber" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-terminal-amber">
                Did you know
              </span>
            </div>
            <p className="text-sm text-foreground/90 leading-relaxed">{bet.nugget}</p>
            <p className="text-[10px] text-muted-foreground font-mono mt-2">
              {bet.book} · source: {bet.source}
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface TrendingBetsProps {
  sport: "NFL" | "NCAAF";
}

export function TrendingBets({ sport }: TrendingBetsProps) {
  const bets = trendingFor(sport);
  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: bets.filter((b) => b.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground tracking-wide font-mono flex items-center gap-2">
          <span role="img" aria-label="chart increasing">📈</span> {sport} TRENDING BETS
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Season-long markets with an angle most people miss — every bet paired with a verifiable stat
          that gives it a fresh read. Odds shown are live sportsbook lines; insights are sourced from
          real history.
        </p>
      </motion.div>

      {bets.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-sm text-muted-foreground font-mono">
            Trending markets load in as {sport} futures boards open. Check back soon.
          </CardContent>
        </Card>
      ) : (
        byCategory.map((group) => {
          const Meta = CATEGORY_META[group.cat];
          const Icon = Meta.icon;
          return (
            <div key={group.cat} className="space-y-3">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-terminal-green" />
                <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
                  {Meta.label}
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {group.items.map((bet, i) => (
                  <BetRow key={bet.id} bet={bet} index={i} />
                ))}
              </div>
            </div>
          );
        })
      )}

      <div className="flex items-start gap-1.5 pt-1">
        <Info className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-[10px] text-muted-foreground leading-relaxed max-w-2xl">
          Insights reflect historical fact, not predictions — context to inform your own read, not an MGP
          pick. Once games begin, weekly and in-season prop markets appear here alongside the season-long bets.
        </p>
      </div>
    </div>
  );
}
