import { motion } from "framer-motion";
import { Clock } from "lucide-react";

interface ComingSoonProps {
  sport: string;
  emoji: string;
}

export function ComingSoon({ sport, emoji }: ComingSoonProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4"
    >
      <div className="text-6xl mb-6">{emoji}</div>
      <h1 className="text-2xl md:text-3xl font-semibold text-foreground mb-3">
        {sport}
      </h1>
      <div className="flex items-center gap-2 text-terminal-green mb-4">
        <Clock className="w-5 h-5" />
        <span className="text-lg font-medium">Coming Very Soon…</span>
      </div>
      <p className="text-muted-foreground max-w-md text-sm">
        We're building something great. Stay tuned for comprehensive {sport.toLowerCase()} analytics, odds comparison, and expert insights.
      </p>
    </motion.div>
  );
}
