import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  PropContext, 
  GradingResult, 
  gradeProp, 
  getGradeColor, 
  getGradeBgColor,
  PropType 
} from "@/utils/matchupGrader";
import { CheckCircle2, AlertCircle, TrendingUp, Target, Shield, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PropAnalysisProps {
  playerName: string;
  propType: PropType;
  line: number;
  position: string;
  seasonAvg: number;
  last5Avg: number;
  last5Games?: { value: number; opponent: string }[];
  advancedStats?: {
    epa?: number;
    targetShare?: number;
    airYardsShare?: number;
    catchRate?: number;
    yardsAfterContact?: number;
    explosiveRate?: number;
    snapShare?: number;
    pressureRate?: number;
  };
  matchup?: {
    opponent: string;
    opponentRank: number;
    opponentAvgAllowed: number;
    opponentLast3Avg: number;
  };
  situational?: {
    isHomeGame: boolean;
    isDome: boolean;
    weatherConcern: boolean;
  };
}

const PROP_TYPE_LABELS: Record<PropType, string> = {
  passing_yards: "Passing Yards",
  rushing_yards: "Rushing Yards",
  receiving_yards: "Receiving Yards",
  receptions: "Receptions",
  pass_td: "Passing TDs",
  rush_td: "Rushing TDs",
  rec_td: "Receiving TDs",
  fantasy: "Fantasy Points"
};

export function PropAnalysis({
  playerName,
  propType,
  line,
  position,
  seasonAvg,
  last5Avg,
  last5Games = [],
  advancedStats = {},
  matchup,
  situational
}: PropAnalysisProps) {
  // Calculate hit rate from last 5 games
  const last5HitRate = last5Games.length > 0
    ? last5Games.filter(g => g.value > line).length / last5Games.length
    : seasonAvg > line ? 0.6 : 0.4;

  // Build context for grading
  const context: PropContext = {
    playerName,
    propType,
    line,
    position,
    seasonAvg,
    last5Avg,
    last5HitRate,
    advancedStats,
    matchup: matchup ? {
      opponentRank: matchup.opponentRank,
      opponentAvgAllowed: matchup.opponentAvgAllowed,
      opponentLast3Avg: matchup.opponentLast3Avg
    } : undefined,
    situational
  };

  const result = gradeProp(context);

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">{playerName}</CardTitle>
            <p className="text-sm text-muted-foreground">
              O/U {line} {PROP_TYPE_LABELS[propType]}
            </p>
          </div>
          <GradeBadge result={result} />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Quick Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          <StatBox 
            label="Season Avg" 
            value={seasonAvg.toFixed(1)} 
            vsLine={seasonAvg - line}
          />
          <StatBox 
            label="Last 5 Avg" 
            value={last5Avg.toFixed(1)} 
            vsLine={last5Avg - line}
          />
          <StatBox 
            label="Hit Rate" 
            value={`${Math.round(last5HitRate * 100)}%`}
            highlight={last5HitRate >= 0.6}
          />
        </div>

        <Separator className="bg-border/30" />

        {/* Advanced Context */}
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Advanced Context
          </h4>
          <div className="space-y-1.5 text-sm">
            {getAdvancedContextItems(propType, advancedStats, line).map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-muted-foreground">├─</span>
                <span>{item.label}:</span>
                <span className={item.positive ? "text-green-500" : item.negative ? "text-red-400" : ""}>
                  {item.value}
                </span>
                {item.positive && <span className="text-green-500">✓</span>}
                {item.negative && <span className="text-red-400">⚠</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Matchup Info */}
        {matchup && (
          <>
            <Separator className="bg-border/30" />
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                vs {matchup.opponent} Defense
              </h4>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground">├─</span>
                  <span>Rank vs {propType.includes("pass") || propType.includes("rec") ? "Pass" : "Run"}:</span>
                  <span className={matchup.opponentRank <= 10 ? "text-green-500" : matchup.opponentRank >= 25 ? "text-red-400" : ""}>
                    {matchup.opponentRank}th
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground">├─</span>
                  <span>Avg Allowed:</span>
                  <span className={matchup.opponentAvgAllowed > line ? "text-green-500" : ""}>
                    {matchup.opponentAvgAllowed.toFixed(1)}/game
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground">└─</span>
                  <span>Last 3 Games:</span>
                  <span>{matchup.opponentLast3Avg.toFixed(1)}/game</span>
                </div>
              </div>
            </div>
          </>
        )}

        <Separator className="bg-border/30" />

        {/* Factors to Consider */}
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Factors to Consider
          </h4>
          <div className="space-y-1.5">
            {result.favorableFactors.slice(0, 3).map((factor, i) => (
              <div key={`fav-${i}`} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <span>{factor}</span>
              </div>
            ))}
            {result.concernFactors.slice(0, 2).map((factor, i) => (
              <div key={`con-${i}`} className="flex items-start gap-2 text-sm">
                <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <span>{factor}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="flex items-start gap-2 p-2 rounded bg-muted/30 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            This analysis provides data and statistics only. Past performance does not guarantee future results. 
            Please gamble responsibly.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// Grade Badge Component
function GradeBadge({ result }: { result: GradingResult }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <div className={`px-3 py-1.5 rounded-lg border ${getGradeBgColor(result.grade)}`}>
            <span className={`text-xl font-bold ${getGradeColor(result.grade)}`}>
              {result.grade}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-sm">{result.summary}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Confidence: {result.confidence}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Stat Box Component
function StatBox({ 
  label, 
  value, 
  vsLine,
  highlight 
}: { 
  label: string; 
  value: string; 
  vsLine?: number;
  highlight?: boolean;
}) {
  const isPositive = vsLine !== undefined ? vsLine > 0 : highlight;
  const isNegative = vsLine !== undefined ? vsLine < 0 : false;

  return (
    <div className="text-center p-2 rounded-lg bg-muted/30">
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-lg font-semibold ${
        isPositive ? "text-green-500" : isNegative ? "text-red-400" : ""
      }`}>
        {value}
      </div>
      {vsLine !== undefined && (
        <div className={`text-xs ${vsLine >= 0 ? "text-green-500" : "text-red-400"}`}>
          {vsLine >= 0 ? "+" : ""}{vsLine.toFixed(1)} vs line
        </div>
      )}
    </div>
  );
}

// Helper to get advanced context items based on prop type
function getAdvancedContextItems(
  propType: PropType, 
  stats: PropAnalysisProps["advancedStats"],
  line: number
): { label: string; value: string; positive?: boolean; negative?: boolean }[] {
  const items: { label: string; value: string; positive?: boolean; negative?: boolean }[] = [];

  if (!stats) return items;

  if (propType === "passing_yards") {
    if (stats.epa !== undefined) {
      items.push({ 
        label: "EPA/Play", 
        value: stats.epa.toFixed(2),
        positive: stats.epa > 0.1
      });
    }
    if (stats.pressureRate !== undefined) {
      items.push({ 
        label: "Pressure Rate", 
        value: `${stats.pressureRate.toFixed(1)}%`,
        positive: stats.pressureRate < 28,
        negative: stats.pressureRate > 35
      });
    }
  }

  if (propType === "rushing_yards") {
    if (stats.yardsAfterContact !== undefined) {
      items.push({ 
        label: "YAC/Carry", 
        value: stats.yardsAfterContact.toFixed(1),
        positive: stats.yardsAfterContact > 3
      });
    }
    if (stats.explosiveRate !== undefined) {
      items.push({ 
        label: "Explosive Rate", 
        value: `${stats.explosiveRate.toFixed(1)}%`,
        positive: stats.explosiveRate > 12
      });
    }
    if (stats.snapShare !== undefined) {
      items.push({ 
        label: "Snap Share", 
        value: `${stats.snapShare.toFixed(1)}%`,
        positive: stats.snapShare > 60,
        negative: stats.snapShare < 45
      });
    }
  }

  if (propType === "receiving_yards" || propType === "receptions") {
    if (stats.targetShare !== undefined) {
      items.push({ 
        label: "Target Share", 
        value: `${stats.targetShare.toFixed(1)}%`,
        positive: stats.targetShare > 22
      });
    }
    if (stats.catchRate !== undefined) {
      items.push({ 
        label: "Catch Rate", 
        value: `${stats.catchRate.toFixed(1)}%`,
        positive: stats.catchRate > 70,
        negative: stats.catchRate < 58
      });
    }
    if (stats.airYardsShare !== undefined) {
      items.push({ 
        label: "Air Yards Share", 
        value: `${stats.airYardsShare.toFixed(1)}%`,
        positive: stats.airYardsShare > 25
      });
    }
  }

  return items;
}

export default PropAnalysis;
