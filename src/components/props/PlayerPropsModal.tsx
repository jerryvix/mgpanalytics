import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3, TrendingUp, Trophy, Target } from "lucide-react";

interface PlayerProp {
  id: string;
  prop_type: string;
  line: number;
  over_odds: number | null;
  under_odds: number | null;
  sportsbook: string;
  opponent_team?: string;
}

interface PlayerPropsModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerName: string;
  opponentTeam?: string;
  props: PlayerProp[];
  seasonAvg?: {
    points_per_game?: number;
    rebounds_per_game?: number;
    assists_per_game?: number;
    steals_per_game?: number;
    blocks_per_game?: number;
  };
}

const formatOdds = (odds: number | null): string => {
  if (odds === null || odds === undefined) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
};

const getPropTypeLabel = (propType: string): string => {
  const labels: Record<string, string> = {
    points: "Points",
    rebounds: "Rebounds",
    assists: "Assists",
    threes: "3-Pointers",
    blocks: "Blocks",
    steals: "Steals",
    turnovers: "Turnovers",
    "pts+reb+ast": "PTS+REB+AST",
    "pts+reb": "PTS+REB",
    "pts+ast": "PTS+AST",
    "reb+ast": "REB+AST",
  };
  return labels[propType] || propType;
};

const getSportsbookLabel = (sportsbook: string): string => {
  const labels: Record<string, string> = {
    draftkings: "DraftKings",
    fanduel: "FanDuel",
    betmgm: "BetMGM",
    caesars: "Caesars",
    pointsbet: "PointsBet",
    barstool: "Barstool",
  };
  return labels[sportsbook.toLowerCase()] || sportsbook;
};

const getSportsbookColor = (sportsbook: string): string => {
  const colors: Record<string, string> = {
    draftkings: "text-green-400 border-green-500/30",
    fanduel: "text-blue-400 border-blue-500/30",
    betmgm: "text-amber-400 border-amber-500/30",
    caesars: "text-purple-400 border-purple-500/30",
  };
  return colors[sportsbook.toLowerCase()] || "text-muted-foreground border-muted";
};

export function PlayerPropsModal({
  isOpen,
  onClose,
  playerName,
  opponentTeam,
  props,
  seasonAvg,
}: PlayerPropsModalProps) {
  // Group props by type
  const propsByType = props.reduce((acc, prop) => {
    if (!acc[prop.prop_type]) {
      acc[prop.prop_type] = [];
    }
    acc[prop.prop_type].push(prop);
    return acc;
  }, {} as Record<string, PlayerProp[]>);

  // Get season avg for comparison
  const getSeasonAvgForProp = (propType: string): number | null => {
    if (!seasonAvg) return null;
    const mapping: Record<string, keyof typeof seasonAvg> = {
      points: "points_per_game",
      rebounds: "rebounds_per_game",
      assists: "assists_per_game",
      steals: "steals_per_game",
      blocks: "blocks_per_game",
    };
    const key = mapping[propType];
    return key ? seasonAvg[key] || null : null;
  };

  // Find best over/under odds across sportsbooks
  const findBestOdds = (propsForType: PlayerProp[]) => {
    let bestOver = { odds: -999, sportsbook: "" };
    let bestUnder = { odds: -999, sportsbook: "" };

    for (const prop of propsForType) {
      if (prop.over_odds !== null && prop.over_odds > bestOver.odds) {
        bestOver = { odds: prop.over_odds, sportsbook: prop.sportsbook };
      }
      if (prop.under_odds !== null && prop.under_odds > bestUnder.odds) {
        bestUnder = { odds: prop.under_odds, sportsbook: prop.sportsbook };
      }
    }

    return { bestOver, bestUnder };
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-mono">
            <BarChart3 className="w-5 h-5 text-terminal-cyan" />
            {playerName} Props
          </DialogTitle>
          {opponentTeam && (
            <div className="flex items-center gap-2 mt-1">
              <Target className="w-3 h-3 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">vs {opponentTeam}</span>
            </div>
          )}
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pr-4">
            {Object.entries(propsByType).map(([propType, propsForType]) => {
              const seasonAvgValue = getSeasonAvgForProp(propType);
              const { bestOver, bestUnder } = findBestOdds(propsForType);
              const primaryProp = propsForType[0];

              return (
                <div
                  key={propType}
                  className="bg-muted/20 border border-border rounded-lg p-3"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-foreground">
                        {getPropTypeLabel(propType)}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] border-terminal-cyan/50 text-terminal-cyan"
                      >
                        O/U {primaryProp.line}
                      </Badge>
                    </div>
                    {seasonAvgValue !== null && (
                      <div className="flex items-center gap-1 text-xs">
                        <TrendingUp className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Avg:</span>
                        <span
                          className={
                            seasonAvgValue > primaryProp.line
                              ? "text-terminal-green"
                              : "text-terminal-amber"
                          }
                        >
                          {seasonAvgValue.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Best Odds Highlight */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-terminal-green/10 border border-terminal-green/30 rounded p-2">
                      <div className="text-[10px] text-terminal-green uppercase mb-1">Best Over</div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-bold text-terminal-green">
                          {formatOdds(bestOver.odds)}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          {getSportsbookLabel(bestOver.sportsbook)}
                        </span>
                      </div>
                    </div>
                    <div className="bg-terminal-amber/10 border border-terminal-amber/30 rounded p-2">
                      <div className="text-[10px] text-terminal-amber uppercase mb-1">Best Under</div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-bold text-terminal-amber">
                          {formatOdds(bestUnder.odds)}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          {getSportsbookLabel(bestUnder.sportsbook)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* All Sportsbooks */}
                  <div className="space-y-1.5">
                    {propsForType.map((prop) => (
                      <div
                        key={`${prop.sportsbook}-${prop.id}`}
                        className="flex items-center justify-between text-xs font-mono"
                      >
                        <Badge
                          variant="outline"
                          className={`text-[9px] ${getSportsbookColor(prop.sportsbook)}`}
                        >
                          {getSportsbookLabel(prop.sportsbook)}
                        </Badge>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Line: {prop.line}</span>
                          <span className="text-terminal-green">{formatOdds(prop.over_odds)}</span>
                          <span className="text-muted-foreground">/</span>
                          <span className="text-terminal-amber">{formatOdds(prop.under_odds)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {Object.keys(propsByType).length === 0 && (
              <div className="text-center py-8">
                <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No props available</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
