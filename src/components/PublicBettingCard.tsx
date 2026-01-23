import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Flame, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface BettingSide {
  team: string;
  betsPercent: number;
  moneyPercent: number;
}

interface BettingLineData {
  type: "spread" | "total" | "moneyline";
  line?: number;
  sideA: BettingSide;
  sideB: BettingSide;
}

interface PublicBettingCardProps {
  homeTeam: string;
  awayTeam: string;
  spread?: BettingLineData;
  total?: BettingLineData;
  moneyline?: BettingLineData;
  lastUpdated?: string;
}

function SharpIndicator({ 
  betsPercent, 
  moneyPercent, 
  team 
}: { 
  betsPercent: number; 
  moneyPercent: number; 
  team: string;
}) {
  const differential = moneyPercent - betsPercent;
  const isSharp = Math.abs(differential) >= 10;
  
  if (!isSharp) return null;
  
  const isPositive = differential > 0;
  
  return (
    <div className={cn(
      "flex items-center gap-1.5 text-xs font-medium mt-1",
      isPositive ? "text-orange-500 dark:text-orange-400" : "text-muted-foreground"
    )}>
      {isPositive ? (
        <>
          <Flame className="h-3 w-3" />
          <span>Sharp money on {team} ({differential > 0 ? "+" : ""}{differential.toFixed(0)}%)</span>
        </>
      ) : (
        <>
          <AlertTriangle className="h-3 w-3" />
          <span>Public fading {team}</span>
        </>
      )}
    </div>
  );
}

function BettingLineRow({ line, label }: { line: BettingLineData; label: string }) {
  const majorityBets = line.sideA.betsPercent > line.sideB.betsPercent ? "sideA" : "sideB";
  const majorityMoney = line.sideA.moneyPercent > line.sideB.moneyPercent ? "sideA" : "sideB";
  const splitDetected = majorityBets !== majorityMoney;
  
  return (
    <div className="space-y-2 py-3 border-b border-border/50 last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {splitDetected && (
          <Badge variant="outline" className="text-xs border-orange-500/50 text-orange-500 dark:text-orange-400">
            <Flame className="h-3 w-3 mr-1" />
            Split
          </Badge>
        )}
      </div>
      
      {/* Bets Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Bets</span>
          <span>{line.sideA.betsPercent}% - {line.sideB.betsPercent}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden flex">
          <div 
            className="bg-primary transition-all"
            style={{ width: `${line.sideA.betsPercent}%` }}
          />
          <div 
            className="bg-secondary"
            style={{ width: `${line.sideB.betsPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{line.sideA.team}</span>
          <span>{line.sideB.team}</span>
        </div>
      </div>
      
      {/* Money Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Money</span>
          <span>{line.sideA.moneyPercent}% - {line.sideB.moneyPercent}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden flex">
          <div 
            className={cn(
              "transition-all",
              splitDetected && majorityMoney === "sideA" ? "bg-orange-500" : "bg-primary"
            )}
            style={{ width: `${line.sideA.moneyPercent}%` }}
          />
          <div 
            className={cn(
              "transition-all",
              splitDetected && majorityMoney === "sideB" ? "bg-orange-500" : "bg-secondary"
            )}
            style={{ width: `${line.sideB.moneyPercent}%` }}
          />
        </div>
      </div>
      
      {/* Sharp Indicators */}
      <SharpIndicator 
        betsPercent={line.sideA.betsPercent} 
        moneyPercent={line.sideA.moneyPercent}
        team={line.sideA.team}
      />
      <SharpIndicator 
        betsPercent={line.sideB.betsPercent} 
        moneyPercent={line.sideB.moneyPercent}
        team={line.sideB.team}
      />
    </div>
  );
}

export function PublicBettingCard({
  homeTeam,
  awayTeam,
  spread,
  total,
  moneyline,
  lastUpdated
}: PublicBettingCardProps) {
  return (
    <Card className="border-terminal-green/20 bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-mono">
            {awayTeam} @ {homeTeam}
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            Public Betting
          </Badge>
        </div>
        {lastUpdated && (
          <p className="text-xs text-muted-foreground">Updated: {lastUpdated}</p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {spread && (
          <BettingLineRow 
            line={spread} 
            label={`Spread (${spread.line ? (spread.line >= 0 ? `+${spread.line}` : spread.line) : "TBD"})`}
          />
        )}
        
        {total && (
          <BettingLineRow 
            line={total} 
            label={`Total (${total.line || "TBD"})`}
          />
        )}
        
        {moneyline && (
          <BettingLineRow 
            line={moneyline} 
            label="Moneyline"
          />
        )}
        
        {!spread && !total && !moneyline && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No betting data available
          </p>
        )}
      </CardContent>
    </Card>
  );
}
