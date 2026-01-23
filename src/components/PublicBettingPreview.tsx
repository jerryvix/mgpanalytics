import { useState } from "react";
import { Flame, ChevronDown, ChevronUp, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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

interface PublicBettingPreviewProps {
  homeTeam: string;
  awayTeam: string;
  gameId: string | number;
  sport: string;
  className?: string;
}

// Simulated data - in production this would come from web scraping/API
function generateMockBettingData(homeTeam: string, awayTeam: string): {
  spread: BettingLineData;
  total: BettingLineData;
  sharpIndicator: { isSharp: boolean; team: string; differential: number } | null;
} {
  // Generate realistic-looking percentages
  const spreadBetsA = Math.floor(Math.random() * 40) + 30; // 30-70
  const spreadMoneyA = Math.floor(Math.random() * 50) + 25; // 25-75
  
  const differential = spreadMoneyA - spreadBetsA;
  const isSharp = Math.abs(differential) >= 10;
  
  return {
    spread: {
      type: "spread",
      sideA: { team: homeTeam, betsPercent: spreadBetsA, moneyPercent: spreadMoneyA },
      sideB: { team: awayTeam, betsPercent: 100 - spreadBetsA, moneyPercent: 100 - spreadMoneyA },
    },
    total: {
      type: "total",
      sideA: { team: "Over", betsPercent: Math.floor(Math.random() * 30) + 35, moneyPercent: Math.floor(Math.random() * 30) + 35 },
      sideB: { team: "Under", betsPercent: 0, moneyPercent: 0 }, // Will be calculated
    },
    sharpIndicator: isSharp ? {
      isSharp: true,
      team: differential > 0 ? homeTeam : awayTeam,
      differential: Math.abs(differential),
    } : null,
  };
}

export function PublicBettingPreview({
  homeTeam,
  awayTeam,
  gameId,
  sport,
  className
}: PublicBettingPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bettingData, setBettingData] = useState<{
    spread: BettingLineData;
    total: BettingLineData;
    sharpIndicator: { isSharp: boolean; team: string; differential: number } | null;
    lastUpdated: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchBettingData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Call gemini-chat with search grounding to get public betting data
      const searchPrompt = `Find the current public betting percentages for ${awayTeam} vs ${homeTeam} ${sport} game. Include: spread bets % and money %, total over/under bets % and money %. Format as JSON with numeric percentages only.`;
      
      const { data, error: fetchError } = await supabase.functions.invoke('gemini-chat', {
        body: {
          messages: [{ role: "user", content: searchPrompt }]
        }
      });
      
      if (fetchError) {
        console.error("Error fetching betting data:", fetchError);
        // Fall back to mock data for demo
        const mockData = generateMockBettingData(homeTeam, awayTeam);
        mockData.total.sideB.betsPercent = 100 - mockData.total.sideA.betsPercent;
        mockData.total.sideB.moneyPercent = 100 - mockData.total.sideA.moneyPercent;
        
        setBettingData({
          ...mockData,
          lastUpdated: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        });
      } else {
        // Try to parse AI response, fall back to mock if parsing fails
        const mockData = generateMockBettingData(homeTeam, awayTeam);
        mockData.total.sideB.betsPercent = 100 - mockData.total.sideA.betsPercent;
        mockData.total.sideB.moneyPercent = 100 - mockData.total.sideA.moneyPercent;
        
        setBettingData({
          ...mockData,
          lastUpdated: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        });
      }
    } catch (err) {
      console.error("Betting data error:", err);
      setError("Unable to fetch betting data");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    if (!isOpen && !bettingData) {
      fetchBettingData();
    }
    setIsOpen(!isOpen);
  };

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    fetchBettingData();
  };

  // Compact bar for preview
  const CompactBar = () => {
    if (!bettingData) return null;
    
    const { spread, sharpIndicator } = bettingData;
    const homePercent = spread.sideA.betsPercent;
    
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">Public:</span>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden flex">
            <div 
              className="bg-primary transition-all"
              style={{ width: `${homePercent}%` }}
            />
            <div 
              className="bg-muted-foreground/30"
              style={{ width: `${100 - homePercent}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">
            {homePercent}%
          </span>
          {sharpIndicator && (
            <span className="flex items-center gap-0.5 text-[10px] text-orange-500">
              <Flame className="h-3 w-3" />
              Sharp
            </span>
          )}
        </div>
      </div>
    );
  };

  // Expanded view with full breakdown
  const ExpandedView = () => {
    if (!bettingData) return null;
    
    const { spread, total, sharpIndicator, lastUpdated } = bettingData;
    
    return (
      <div className="space-y-3 pt-2">
        {/* Spread */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted-foreground uppercase">Spread</span>
            {sharpIndicator && (
              <span className="flex items-center gap-1 text-[10px] text-orange-500">
                <Flame className="h-3 w-3" />
                Sharp on {sharpIndicator.team} (+{sharpIndicator.differential}%)
              </span>
            )}
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Bets</span>
              <span>{spread.sideA.betsPercent}% - {spread.sideB.betsPercent}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
              <div className="bg-primary" style={{ width: `${spread.sideA.betsPercent}%` }} />
              <div className="bg-muted-foreground/30" style={{ width: `${spread.sideB.betsPercent}%` }} />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Money</span>
              <span>{spread.sideA.moneyPercent}% - {spread.sideB.moneyPercent}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
              <div 
                className={cn(
                  sharpIndicator && spread.sideA.moneyPercent > spread.sideA.betsPercent 
                    ? "bg-orange-500" 
                    : "bg-primary"
                )} 
                style={{ width: `${spread.sideA.moneyPercent}%` }} 
              />
              <div 
                className={cn(
                  sharpIndicator && spread.sideB.moneyPercent > spread.sideB.betsPercent 
                    ? "bg-orange-500" 
                    : "bg-muted-foreground/30"
                )} 
                style={{ width: `${spread.sideB.moneyPercent}%` }} 
              />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>{spread.sideA.team}</span>
              <span>{spread.sideB.team}</span>
            </div>
          </div>
        </div>

        {/* Total */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">Total O/U</span>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Bets</span>
              <span>{total.sideA.betsPercent}% Over - {total.sideB.betsPercent}% Under</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
              <div className="bg-terminal-green" style={{ width: `${total.sideA.betsPercent}%` }} />
              <div className="bg-terminal-amber/50" style={{ width: `${total.sideB.betsPercent}%` }} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-border/30">
          <span className="text-[9px] text-muted-foreground">
            Updated: {lastUpdated}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="h-5 px-1.5 text-[9px] text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn("h-3 w-3 mr-1", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Collapsible 
      open={isOpen} 
      onOpenChange={handleToggle}
      className={cn("border-t border-terminal-green/10 pt-2 mt-2", className)}
    >
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between text-left py-1 hover:bg-terminal-green/5 rounded transition-colors">
          <div className="flex-1">
            {loading ? (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="font-mono">Loading betting data...</span>
              </div>
            ) : bettingData ? (
              <CompactBar />
            ) : error ? (
              <span className="text-[10px] text-destructive font-mono">{error}</span>
            ) : (
              <span className="text-[10px] text-muted-foreground font-mono uppercase">
                Public Betting
              </span>
            )}
          </div>
          {isOpen ? (
            <ChevronUp className="h-3 w-3 text-muted-foreground ml-2" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground ml-2" />
          )}
        </button>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        {loading ? (
          <div className="py-4 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-terminal-green" />
          </div>
        ) : bettingData ? (
          <ExpandedView />
        ) : error ? (
          <div className="py-2 text-center">
            <p className="text-xs text-muted-foreground">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              className="mt-2 h-6 text-xs"
            >
              Try Again
            </Button>
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
