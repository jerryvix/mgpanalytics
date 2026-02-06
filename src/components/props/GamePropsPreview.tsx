import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { BarChart3, User } from "lucide-react";

interface GamePropsPreviewProps {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
}

interface TopProp {
  playerName: string;
  propType: string;
  line: number;
  odds: number;
  team: string;
}

const formatOdds = (odds: number | null): string => {
  if (odds === null || odds === undefined) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
};

const getPropTypeShort = (propType: string): string => {
  const shorts: Record<string, string> = {
    points: "pts",
    rebounds: "reb",
    assists: "ast",
    threes: "3PM",
    blocks: "blk",
    steals: "stl",
  };
  return shorts[propType] || propType;
};

export function GamePropsPreview({ gameId, homeTeam, awayTeam }: GamePropsPreviewProps) {
  const { data: topProps = [], isLoading } = useQuery({
    queryKey: ["game-props-preview", gameId],
    queryFn: async () => {
      // Get today's date
      const today = new Date().toISOString().split('T')[0];

      // Fetch props for players on these teams
      const { data: props, error } = await supabase
        .from("player_props")
        .select(`
          id,
          prop_type,
          line,
          over_odds,
          sportsbook,
          player_id,
          players!inner (
            id,
            name,
            team_name
          )
        `)
        .eq("game_id", gameId)
        .eq("sport", "NBA")
        .eq("is_active", true)
        .eq("prop_type", "points") // Focus on points props for preview
        .order("line", { ascending: false })
        .limit(4);

      if (error) {
        console.error("Error fetching game props:", error);
        return [];
      }

      // If no props by game_id, try by team names
      if (!props || props.length === 0) {
        const { data: playerProps, error: playerError } = await supabase
          .from("player_props")
          .select(`
            id,
            prop_type,
            line,
            over_odds,
            sportsbook,
            player_id,
            players!inner (
              id,
              name,
              team_name
            )
          `)
          .eq("sport", "NBA")
          .eq("is_active", true)
          .eq("prop_type", "points")
          .in("players.team_name", [homeTeam, awayTeam])
          .order("line", { ascending: false })
          .limit(4);

        if (playerError || !playerProps) {
          return [];
        }

        return playerProps.map((p: any) => ({
          playerName: p.players.name,
          propType: p.prop_type,
          line: p.line,
          odds: p.over_odds,
          team: p.players.team_name,
        }));
      }

      return props.map((p: any) => ({
        playerName: p.players.name,
        propType: p.prop_type,
        line: p.line,
        odds: p.over_odds,
        team: p.players.team_name,
      }));
    },
  });

  if (isLoading) {
    return (
      <div className="mt-2 pt-2 border-t border-border">
        <div className="flex items-center gap-2 mb-1.5">
          <BarChart3 className="w-3 h-3 text-muted-foreground animate-pulse" />
          <span className="font-mono text-[9px] text-muted-foreground uppercase">Loading Props...</span>
        </div>
      </div>
    );
  }

  if (!topProps.length) {
    return null; // Don't show section if no props
  }

  return (
    <div className="mt-2 pt-2 border-t border-border">
      <div className="flex items-center gap-2 mb-1.5">
        <BarChart3 className="w-3 h-3 text-terminal-cyan" />
        <span className="font-mono text-[9px] text-terminal-cyan uppercase tracking-wider">Top Props</span>
      </div>

      <div className="space-y-1">
        {topProps.slice(0, 2).map((prop, index) => (
          <div
            key={index}
            className="flex items-center justify-between text-[10px] font-mono"
          >
            <div className="flex items-center gap-1.5 truncate">
              <User className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="text-foreground truncate">{prop.playerName.split(' ').pop()}</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-terminal-green">O{prop.line}</span>
              <span className="text-muted-foreground">{getPropTypeShort(prop.propType)}</span>
              <span className="text-muted-foreground">({formatOdds(prop.odds)})</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
