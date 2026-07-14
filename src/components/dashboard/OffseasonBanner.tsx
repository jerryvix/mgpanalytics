import { motion } from "framer-motion";

interface OffseasonBannerProps {
  sport: "NBA" | "NCAAB";
}

// Month ranges (0-indexed) when each sport is between seasons
const OFFSEASON: Record<OffseasonBannerProps["sport"], { months: number[]; returns: string }> = {
  NBA: { months: [6, 7, 8], returns: "October" }, // Jul–Sep
  NCAAB: { months: [3, 4, 5, 6, 7, 8, 9], returns: "November" }, // Apr–Oct
};

export const OffseasonBanner = ({ sport }: OffseasonBannerProps) => {
  const config = OFFSEASON[sport];
  if (!config.months.includes(new Date().getMonth())) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-border bg-card/60 px-4 py-3 flex items-center gap-3"
    >
      <span className="text-xl" role="img" aria-label="palm tree">
        🌴
      </span>
      <div className="font-mono text-xs sm:text-sm">
        <span className="text-terminal-green tracking-widest">OFFSEASON</span>
        <span className="text-muted-foreground">
          {" "}
          — {sport} is poolside in Cancún. Live data returns when the season tips off in {config.returns}. Last
          season's numbers below are final.
        </span>
      </div>
    </motion.div>
  );
};
