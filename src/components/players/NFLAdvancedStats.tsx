import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Info } from "lucide-react";
import { StatCard } from "@/components/stats/StatCard";
import {
  calculateAdvancedStats,
  AdvancedStats,
  AdvancedStatsInput,
} from "@/utils/advancedStatsCalculator";
import { getStatDefinitions } from "@/data/statDefinitions";
import { getPositionGroup } from "@/utils/nflStatsFormatters";

interface NFLAdvancedStatsProps {
  stats: AdvancedStatsInput | null | undefined;
  position: string;
}

/**
 * Advanced stats computed from stored season stats. Shows only the stats that have a
 * value for this player and renders nothing when there are none, so the page never shows
 * an empty or placeholder card. NFLPlayerDetail hides the tab in that case.
 */
export function NFLAdvancedStats({ stats, position }: NFLAdvancedStatsProps) {
  const advancedStats = calculateAdvancedStats(stats, position);
  const cards = getStatDefinitions(getPositionGroup(position)).flatMap((def) => {
    const value = advancedStats[def.key as keyof AdvancedStats];
    return typeof value === "number" ? [{ def, value }] : [];
  });

  if (cards.length === 0) return null;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5 text-terminal-green" />
            Advanced Stats
          </CardTitle>
          <Badge variant="outline" className="border-muted-foreground/30 text-xs">
            <Info className="w-3 h-3 mr-1" />
            Hover for Definitions
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {cards.map(({ def, value }) => (
            <StatCard
              key={def.key}
              name={def.name}
              shortName={def.shortName}
              value={value}
              description={def.description}
              format={def.format}
              leagueAverage={def.leagueAverage}
              higherIsBetter={def.higherIsBetter}
              unit={def.unit}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
