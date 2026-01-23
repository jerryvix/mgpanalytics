import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  name: string;
  shortName: string;
  value: number | string | undefined;
  description: string;
  format?: "number" | "decimal" | "percent" | "rate";
  leagueAverage?: number;
  higherIsBetter?: boolean;
  trend?: number[]; // Last 5 game values
  rank?: number;
  unit?: string;
  className?: string;
}

function formatValue(
  value: number | string | undefined,
  format: string,
  unit?: string
): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  
  switch (format) {
    case "number":
      return value.toLocaleString();
    case "decimal":
      return value.toFixed(2);
    case "percent":
    case "rate":
      return `${value.toFixed(1)}${unit || "%"}`;
    default:
      return String(value);
  }
}

function MiniSparkline({ data, isPositive }: { data: number[]; isPositive: boolean }) {
  if (!data || data.length === 0) return null;
  
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * 40;
    const y = 12 - ((val - min) / range) * 10;
    return `${x},${y}`;
  }).join(" ");
  
  return (
    <svg width="40" height="14" className="inline-block ml-1">
      <polyline
        points={points}
        fill="none"
        stroke={isPositive ? "hsl(var(--terminal-green))" : "hsl(var(--muted-foreground))"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ComparisonBar({ 
  value, 
  leagueAverage, 
  higherIsBetter 
}: { 
  value: number; 
  leagueAverage: number;
  higherIsBetter: boolean;
}) {
  // Calculate where the value falls relative to league average
  // Center the bar at 50%, league average is the middle
  const ratio = value / leagueAverage;
  const position = Math.min(95, Math.max(5, ratio * 50));
  
  const isGood = higherIsBetter ? value > leagueAverage : value < leagueAverage;
  
  return (
    <div className="w-full mt-2">
      <div className="h-1.5 bg-muted rounded-full overflow-hidden relative">
        {/* Center line for league average */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-muted-foreground/50" />
        {/* Value indicator */}
        <div 
          className={cn(
            "absolute top-0 bottom-0 w-2 rounded-full transition-all",
            isGood ? "bg-terminal-green" : "bg-destructive/70"
          )}
          style={{ left: `calc(${position}% - 4px)` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
        <span>Below Avg</span>
        <span>Avg: {leagueAverage.toFixed(1)}</span>
        <span>Above Avg</span>
      </div>
    </div>
  );
}

export function StatCard({
  name,
  shortName,
  value,
  description,
  format = "decimal",
  leagueAverage,
  higherIsBetter = true,
  trend,
  rank,
  unit,
  className
}: StatCardProps) {
  const numValue = typeof value === "number" ? value : parseFloat(String(value)) || 0;
  const isAboveAvg = leagueAverage 
    ? (higherIsBetter ? numValue > leagueAverage : numValue < leagueAverage)
    : false;
  
  // Calculate trend direction from last 5 games
  const trendDirection = trend && trend.length >= 2
    ? trend[trend.length - 1] - trend[0]
    : 0;
  
  const TrendIcon = trendDirection > 0 ? TrendingUp : trendDirection < 0 ? TrendingDown : Minus;
  const trendColor = trendDirection > 0 
    ? (higherIsBetter ? "text-terminal-green" : "text-destructive")
    : trendDirection < 0 
    ? (higherIsBetter ? "text-destructive" : "text-terminal-green")
    : "text-muted-foreground";

  return (
    <Card className={cn(
      "p-3 bg-card border-border hover:border-primary/30 transition-colors",
      className
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 cursor-help">
                  <span className="text-xs text-muted-foreground font-medium truncate">
                    {shortName}
                  </span>
                  <Info className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="font-medium mb-1">{name}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className={cn(
              "text-xl font-bold font-mono",
              isAboveAvg ? "text-terminal-green" : "text-foreground"
            )}>
              {formatValue(value, format, unit)}
            </span>
            
            {trend && trend.length > 0 && (
              <div className="flex items-center">
                <TrendIcon className={cn("h-3 w-3", trendColor)} />
                <MiniSparkline data={trend} isPositive={trendDirection > 0} />
              </div>
            )}
          </div>
        </div>
        
        {rank && (
          <Badge 
            variant="outline" 
            className={cn(
              "text-[10px] font-mono flex-shrink-0",
              rank <= 10 ? "border-terminal-green/50 text-terminal-green" :
              rank <= 32 ? "border-muted-foreground/30" :
              "border-destructive/50 text-destructive"
            )}
          >
            #{rank}
          </Badge>
        )}
      </div>
      
      {leagueAverage !== undefined && value !== undefined && typeof value === "number" && (
        <ComparisonBar 
          value={numValue} 
          leagueAverage={leagueAverage} 
          higherIsBetter={higherIsBetter}
        />
      )}
    </Card>
  );
}
