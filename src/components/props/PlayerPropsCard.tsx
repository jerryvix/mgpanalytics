import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart3, TrendingUp, TrendingDown, AlertCircle, ExternalLink } from "lucide-react";

interface PlayerProp {
  id: string;
  prop_type: string;
  line: number;
  over_odds: number | null;
  under_odds: number | null;
  sportsbook: string;
  opponent_team?: string;
}

interface PlayerPropsCardProps {
  playerName: string;
  injuryStatus?: string;
  opponentTeam?: string;
  props: PlayerProp[];
  isLoading?: boolean;
  onViewAllClick?: () => void;
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

const getPropTypeIcon = (propType: string): string => {
  const icons: Record<string, string> = {
    points: "🏀",
    rebounds: "📊",
    assists: "🎯",
    threes: "🔥",
    blocks: "🛡️",
    steals: "👋",
  };
  return icons[propType] || "📈";
};

export function PlayerPropsCard({
  playerName,
  injuryStatus,
  opponentTeam,
  props,
  isLoading,
  onViewAllClick,
}: PlayerPropsCardProps) {
  const isPlayerOut = injuryStatus === "Out" || injuryStatus === "IR";

  // Group props by type, showing best line per type
  const propsByType = props.reduce((acc, prop) => {
    if (!acc[prop.prop_type] || prop.sportsbook === "draftkings") {
      acc[prop.prop_type] = prop;
    }
    return acc;
  }, {} as Record<string, PlayerProp>);

  // Priority order for display
  const priorityOrder = ["points", "rebounds", "assists", "threes", "blocks", "steals"];
  const sortedProps = Object.values(propsByType).sort((a, b) => {
    const aIndex = priorityOrder.indexOf(a.prop_type);
    const bIndex = priorityOrder.indexOf(b.prop_type);
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  // Show top 4 props
  const displayProps = sortedProps.slice(0, 4);

  if (isLoading) {
    return (
      <div className="bg-muted/20 border border-border rounded-lg p-3 mt-3">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="w-3 h-3 text-terminal-cyan animate-pulse" />
          <span className="font-mono text-[10px] text-terminal-cyan uppercase tracking-wider">
            Loading Props...
          </span>
        </div>
        <div className="space-y-1.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 bg-muted/30 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isPlayerOut) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mt-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-3 h-3 text-red-400" />
          <span className="font-mono text-[10px] text-red-400 uppercase tracking-wider">
            No props available - Player ruled out
          </span>
        </div>
      </div>
    );
  }

  if (!props.length) {
    return (
      <div className="bg-muted/20 border border-border rounded-lg p-3 mt-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3 h-3 text-muted-foreground" />
          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
            Props pending
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-terminal-cyan/5 border border-terminal-cyan/20 rounded-lg p-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3 h-3 text-terminal-cyan" />
          <span className="font-mono text-[10px] text-terminal-cyan uppercase tracking-wider">
            Today's Props
          </span>
        </div>
        {opponentTeam && (
          <Badge variant="outline" className="text-[9px] border-muted-foreground/30 text-muted-foreground">
            vs {opponentTeam}
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        {displayProps.map((prop) => (
          <div
            key={`${prop.prop_type}-${prop.sportsbook}`}
            className="flex items-center justify-between text-xs font-mono"
          >
            <div className="flex items-center gap-1.5">
              <span>{getPropTypeIcon(prop.prop_type)}</span>
              <span className="text-muted-foreground">{getPropTypeLabel(prop.prop_type)}:</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-foreground">O/U {prop.line}</span>
              <span className="text-muted-foreground">(</span>
              <span className="text-terminal-green">{formatOdds(prop.over_odds)}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-terminal-amber">{formatOdds(prop.under_odds)}</span>
              <span className="text-muted-foreground">)</span>
            </div>
          </div>
        ))}
      </div>

      {sortedProps.length > 4 && onViewAllClick && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 h-6 text-[10px] text-terminal-cyan hover:text-terminal-cyan hover:bg-terminal-cyan/10"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onViewAllClick();
          }}
        >
          <ExternalLink className="w-3 h-3 mr-1" />
          View All {sortedProps.length} Props
        </Button>
      )}
    </div>
  );
}
