import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Why MGP: public positioning page. Every claim on this page traces to the
// Jul 2026 competitive audit (docs/positioning.md). Rules for this surface:
// benefit language only, no category jargon, no analogies, no em dashes,
// and nothing the codebase can't back up today. If a feature ships or dies,
// update docs/positioning.md and this copy together.

const CONTRAST_ROWS: Array<{ typical: string; mgp: string }> = [
  {
    typical: "AI chat guesses lines from training data",
    mgp: "Answers locked to synced odds with timestamps",
  },
  {
    typical: "Trends with no source attached",
    mgp: "Source and capture date on every insight",
  },
  {
    typical: "Averages American odds across books",
    mgp: "Converts to probability first, so the math holds",
  },
  {
    typical: "Sells picks and locks",
    mgp: "Explains the market. Never tells you what to bet",
  },
  {
    typical: "Odds here, scores there, stats somewhere else",
    mgp: "One screen",
  },
];

const SECTIONS: Array<{ index: string; title: string; body: string }> = [
  {
    index: "01",
    title: "No invented numbers",
    body:
      "Most AI chat tools answer market questions from model memory. Memory is stale and it makes things up. Our analyst is blocked from doing that. The odds, streaks and stat leaders in every answer come straight from synced data. Market numbers are never pulled from memory or the open web. If the data is old you see a staleness warning instead of a confident wrong answer.",
  },
  {
    index: "02",
    title: "Every insight carries its receipt",
    body:
      "Each curated angle ships with a source and a capture date. You can see where a claim came from on the card itself. Anything we cannot verify never reaches your screen. An automated check blocks unsourced or hedged claims before release. Humans grade the output for accuracy after that.",
  },
  {
    index: "03",
    title: "The full picture on one screen",
    body:
      "Odds from DraftKings, FanDuel, Caesars and BetRivers. Line movement history with the math done right. We convert to implied probability before comparing books because averaging American odds gives wrong answers. Live scores refresh every minute. Hit streaks and batter versus pitcher history sit on the same screen. No tab hopping.",
  },
];

const sectionMotion = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5 },
};

const WhyMGP = () => {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Animated scan line effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-full h-px bg-gradient-to-r from-transparent via-terminal-green/20 to-transparent animate-scan" />
      </div>

      {/* Grid background pattern */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `
            linear-gradient(hsl(var(--terminal-green) / 0.1) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--terminal-green) / 0.1) 1px, transparent 1px)
          `,
          backgroundSize: "50px 50px",
        }}
      />

      <div className="relative z-10 max-w-3xl mx-auto px-4 py-12 md:py-20">
        {/* Back to landing */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
          <Link
            to="/"
            className="text-xs font-mono text-muted-foreground hover:text-terminal-green transition-colors"
          >
            [ ← MGP ]
          </Link>
        </motion.div>

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mt-10 mb-14"
        >
          <h1 className="text-3xl md:text-5xl font-bold text-foreground leading-tight mb-5">
            An analyst that never makes numbers up.
          </h1>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-2xl">
            Ask about a line and you get the line we synced. Not a guess. When our data is more
            than six hours old the answer says so. And it will never tell you what to bet. It
            teaches. You decide.
          </p>
          <p className="mt-5 font-mono text-[11px] tracking-widest uppercase text-terminal-green">
            Grounded answers • Sourced insights • One screen
          </p>
        </motion.div>

        {/* Differentiators */}
        <div className="space-y-5">
          {SECTIONS.map((s) => (
            <motion.section key={s.index} {...sectionMotion}>
              <Card className="bg-gradient-to-b from-card to-card/70 border-terminal-green/30">
                <CardContent className="p-6">
                  <div className="flex items-baseline gap-3 mb-3">
                    <span className="font-mono text-xs text-terminal-green/60">{s.index}</span>
                    <h2 className="font-mono text-sm md:text-base font-bold uppercase tracking-widest text-terminal-green">
                      {s.title}
                    </h2>
                  </div>
                  <p className="text-sm md:text-base text-muted-foreground leading-relaxed">{s.body}</p>
                </CardContent>
              </Card>
            </motion.section>
          ))}
        </div>

        {/* Contrast */}
        <motion.section {...sectionMotion} className="mt-14">
          <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-foreground mb-4">
            Typical tools vs MGP
          </h2>
          <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
            <div className="hidden md:grid md:grid-cols-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="px-4 py-2.5">Typical tools</span>
              <span className="px-4 py-2.5 text-terminal-green">MGP</span>
            </div>
            {CONTRAST_ROWS.map((row, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-2 bg-card/50">
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  <span className="md:hidden font-mono text-[10px] uppercase tracking-widest block mb-1">
                    Typical tools
                  </span>
                  {row.typical}
                </div>
                <div className="px-4 py-3 text-sm text-foreground md:border-l md:border-border">
                  <span className="md:hidden font-mono text-[10px] uppercase tracking-widest text-terminal-green block mb-1">
                    MGP
                  </span>
                  {row.mgp}
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Honest limits */}
        <motion.section {...sectionMotion} className="mt-10">
          <Card className="bg-card/60 border-terminal-amber/30">
            <CardContent className="p-6">
              <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-terminal-amber mb-3">
                What we do not do
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Odds sync on a schedule, not tick by tick. We cover four major books, not fifty. We
                never sell picks. And when data is stale we say so instead of pretending.
              </p>
            </CardContent>
          </Card>
        </motion.section>

        {/* CTA */}
        <motion.section {...sectionMotion} className="mt-14 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-5">See it for yourself.</h2>
          <Button
            asChild
            className="bg-terminal-green/20 hover:bg-terminal-green/30 text-terminal-green border border-terminal-green/50 font-mono"
            variant="outline"
          >
            <Link to="/">CREATE FREE ACCOUNT →</Link>
          </Button>
          <div className="mt-4">
            <Link
              to="/"
              className="text-xs font-mono text-muted-foreground hover:text-terminal-green transition-colors"
            >
              [ ALREADY HAVE ACCESS? SIGN IN ]
            </Link>
          </div>
        </motion.section>

        {/* Footer */}
        <footer className="mt-16 pb-4 text-center text-xs font-mono text-muted-foreground/50">
          <p>© 2026 MGP ANALYTICS • ALL RIGHTS RESERVED</p>
        </footer>
      </div>
    </div>
  );
};

export default WhyMGP;
