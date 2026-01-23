import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Info } from "lucide-react";
import { StatCard } from "@/components/stats/StatCard";
import { NFLPlayerStats, NFLGameLogEntry } from "@/services/balldontlie/nflPlayers";
import { 
  calculateAdvancedStats, 
  getStatTrend,
  AdvancedStats 
} from "@/utils/advancedStatsCalculator";
import { 
  getStatDefinitions, 
  StatDefinition 
} from "@/data/statDefinitions";
import { getPositionGroup } from "@/utils/nflStatsFormatters";

interface NFLAdvancedStatsProps {
  stats: NFLPlayerStats | null;
  gameLogs: NFLGameLogEntry[];
  position: string;
  isLoading?: boolean;
}

function AdvancedStatsGrid({ 
  advancedStats, 
  definitions,
  gameLogs 
}: { 
  advancedStats: AdvancedStats;
  definitions: StatDefinition[];
  gameLogs: NFLGameLogEntry[];
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {definitions.map((def) => {
        const value = advancedStats[def.key as keyof AdvancedStats];
        
        // Get trend data if we have a matching stat in game logs
        const trendKey = def.key.includes("yards") ? 
          (def.key.includes("pass") ? "pass_yards" : 
           def.key.includes("rush") ? "rush_yards" : 
           def.key.includes("rec") ? "rec_yards" : undefined) : 
          undefined;
        
        const trendData = trendKey ? 
          getStatTrend(gameLogs, trendKey, 5).map(t => t.value) : 
          undefined;
        
        return (
          <StatCard
            key={def.key}
            name={def.name}
            shortName={def.shortName}
            value={value}
            description={def.description}
            format={def.format}
            leagueAverage={def.leagueAverage}
            higherIsBetter={def.higherIsBetter}
            trend={trendData}
            unit={def.unit}
          />
        );
      })}
    </div>
  );
}

export function NFLAdvancedStats({ 
  stats, 
  gameLogs, 
  position, 
  isLoading 
}: NFLAdvancedStatsProps) {
  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Advanced Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="h-24 bg-muted/30 animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const positionGroup = getPositionGroup(position);
  const definitions = getStatDefinitions(positionGroup);
  
  if (definitions.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Advanced Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Advanced stats are not available for this position.
          </p>
        </CardContent>
      </Card>
    );
  }

  const advancedStats = calculateAdvancedStats(stats, gameLogs, position);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5 text-terminal-green" />
            Advanced Stats
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-muted-foreground/30 text-xs">
              <Info className="w-3 h-3 mr-1" />
              Hover for definitions
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Advanced metrics with league average comparisons. Green indicates above-average performance.
        </p>
      </CardHeader>
      <CardContent>
        <AdvancedStatsGrid 
          advancedStats={advancedStats}
          definitions={definitions}
          gameLogs={gameLogs}
        />
        
        <div className="mt-4 pt-3 border-t border-border">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <p>
              Some advanced stats are calculated from available data and may differ from official sources. 
              EPA, CPOE, and other play-by-play metrics are estimated from season totals.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
