import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const nflGames = [
  {
    id: 1,
    away: "KC Chiefs",
    home: "BUF Bills",
    spread: "BUF -2.5",
    total: "48.5",
    time: "1:00 PM",
    status: "upcoming",
  },
  {
    id: 2,
    away: "PHI Eagles",
    home: "DAL Cowboys",
    spread: "PHI -3.0",
    total: "44.5",
    time: "4:25 PM",
    status: "upcoming",
  },
  {
    id: 3,
    away: "SF 49ers",
    home: "SEA Seahawks",
    spread: "SF -6.5",
    total: "46.0",
    time: "8:20 PM",
    status: "upcoming",
  },
  {
    id: 4,
    away: "MIA Dolphins",
    home: "NYJ Jets",
    spread: "MIA -1.5",
    total: "42.5",
    time: "1:00 PM",
    status: "upcoming",
  },
];

export function NFLSlate() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-wide">
            NFL SLATE
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            Week 18 • Regular Season
          </p>
        </div>
        <Badge variant="outline" className="border-terminal-green text-terminal-green">
          {nflGames.length} GAMES
        </Badge>
      </motion.div>

      {/* Games Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="bg-card border-border">
          <CardHeader className="border-b border-border">
            <div className="grid grid-cols-12 text-xs font-mono text-muted-foreground uppercase tracking-wider">
              <div className="col-span-4">Matchup</div>
              <div className="col-span-2 text-center">Spread</div>
              <div className="col-span-2 text-center">Total</div>
              <div className="col-span-2 text-center">Time</div>
              <div className="col-span-2 text-center">Status</div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {nflGames.map((game, index) => (
              <motion.div
                key={game.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="grid grid-cols-12 items-center p-4 border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors"
              >
                <div className="col-span-4 font-mono">
                  <div className="text-sm text-foreground">{game.away}</div>
                  <div className="text-sm text-muted-foreground">@ {game.home}</div>
                </div>
                <div className="col-span-2 text-center">
                  <span className="font-mono text-terminal-amber">
                    {game.spread}
                  </span>
                </div>
                <div className="col-span-2 text-center">
                  <span className="font-mono text-foreground">
                    {game.total}
                  </span>
                </div>
                <div className="col-span-2 text-center">
                  <span className="font-mono text-muted-foreground text-sm">
                    {game.time}
                  </span>
                </div>
                <div className="col-span-2 text-center">
                  <Badge 
                    variant="outline" 
                    className="border-terminal-green/50 text-terminal-green text-[10px]"
                  >
                    UPCOMING
                  </Badge>
                </div>
              </motion.div>
            ))}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
