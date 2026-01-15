import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const nbaGames = [
  {
    id: 1,
    away: "LAL Lakers",
    home: "BOS Celtics",
    spread: "BOS -5.5",
    total: "228.5",
    time: "7:30 PM",
    status: "upcoming",
  },
  {
    id: 2,
    away: "GSW Warriors",
    home: "PHX Suns",
    spread: "GSW -2.0",
    total: "234.0",
    time: "9:00 PM",
    status: "upcoming",
  },
  {
    id: 3,
    away: "MIL Bucks",
    home: "MIA Heat",
    spread: "MIL -3.5",
    total: "221.5",
    time: "8:00 PM",
    status: "upcoming",
  },
  {
    id: 4,
    away: "DEN Nuggets",
    home: "OKC Thunder",
    spread: "OKC -1.0",
    total: "226.0",
    time: "8:30 PM",
    status: "upcoming",
  },
  {
    id: 5,
    away: "NYK Knicks",
    home: "PHI 76ers",
    spread: "PHI -4.0",
    total: "218.5",
    time: "7:00 PM",
    status: "upcoming",
  },
];

export function NBASlate() {
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
            NBA SLATE
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            2024-25 Season • Regular Season
          </p>
        </div>
        <Badge variant="outline" className="border-terminal-cyan text-terminal-cyan">
          {nbaGames.length} GAMES
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
            {nbaGames.map((game, index) => (
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
                    className="border-terminal-cyan/50 text-terminal-cyan text-[10px]"
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
