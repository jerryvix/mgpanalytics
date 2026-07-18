import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Why MGP: public positioning page. Every claim traces to docs/positioning.md.
// Voice rules for this surface (owner-set): positive benefits only, nothing
// defensive, no jargon, no analogies, no em dashes, one line per card.

const SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: "No guesses. Just real numbers.",
    body: "Every answer pulls the live line straight from the books.",
  },
  {
    title: "Get specialized data and insights.",
    body: "Hit streaks, pitcher matchups and market moves, with the source on every card.",
  },
  {
    title: "Stop checking multiple apps.",
    body: "Odds, line moves, live scores and hot streaks in one place.",
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
            Bet Smarter, Not Harder. Get real insights.
          </h1>
          <p className="font-mono text-[11px] tracking-widest uppercase text-terminal-green">
            Real numbers • Specialized insights • One screen
          </p>
        </motion.div>

        {/* Benefit cards */}
        <div className="space-y-5">
          {SECTIONS.map((s) => (
            <motion.section key={s.title} {...sectionMotion}>
              <Card className="bg-gradient-to-b from-card to-card/70 border-terminal-green/30">
                <CardContent className="p-6">
                  <h2 className="font-mono text-sm md:text-base font-bold uppercase tracking-widest text-terminal-green mb-2">
                    {s.title}
                  </h2>
                  <p className="text-sm md:text-base text-muted-foreground leading-relaxed">{s.body}</p>
                </CardContent>
              </Card>
            </motion.section>
          ))}
        </div>

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
