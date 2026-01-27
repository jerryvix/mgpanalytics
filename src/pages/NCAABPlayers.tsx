import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PlayersGrid } from "@/components/players/PlayersGrid";

const NCAAB_POSITIONS = ["PG", "SG", "SF", "PF", "C", "G", "F"];

export default function NCAABPlayers() {
  const [teams, setTeams] = useState<string[]>([]);

  const { data: players = [], isLoading } = useQuery({
    queryKey: ["ncaab-players-slate"],
    queryFn: async () => {
      // Get slate window (now → +24h)
      const now = new Date();
      const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Get featured players in slate window
      const { data, error } = await supabase
        .from("players")
        .select(`
          id,
          name,
          team_name,
          position,
          injury_status,
          is_featured,
          featured_reason,
          usage_rank
        `)
        .eq("sport", "NCAAB")
        .eq("is_featured", true)
        .gte("slate_window_end", now.toISOString())
        .order("usage_rank", { ascending: true });

      if (error) {
        console.error("Error fetching NCAAB players:", error);
        return [];
      }

      // Get stats for these players
      if (data && data.length > 0) {
        const playerIds = data.map((p) => p.id);
        const { data: statsData } = await supabase
          .from("player_season_stats")
          .select("player_id, points_per_game, rebounds_per_game, assists_per_game, minutes_per_game")
          .in("player_id", playerIds)
          .eq("sport", "NCAAB")
          .eq("season", 2025);

        const statsMap = new Map();
        for (const stat of statsData || []) {
          statsMap.set(stat.player_id, stat);
        }

        return data.map((player) => ({
          ...player,
          stats: statsMap.get(player.id),
        }));
      }

      return data || [];
    },
    refetchInterval: 60000, // Refresh every minute
  });

  // Extract unique teams from players
  useEffect(() => {
    if (players.length > 0) {
      const uniqueTeams = [...new Set(players.map((p) => p.team_name))].sort();
      setTeams(uniqueTeams);
    }
  }, [players]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">NCAAB Players</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Featured players for upcoming college basketball games
        </p>
      </div>

      <PlayersGrid
        sport="NCAAB"
        players={players}
        teams={teams}
        positions={NCAAB_POSITIONS}
        slateWindow="24 hours"
        isLoading={isLoading}
      />

      {/* Performance Delta Disclaimer */}
      <div className="pt-4 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground/70 leading-relaxed text-left">
          Performance Delta: Percentage variance between current Postseason form and 2025 Season baseline averages.
        </p>
      </div>
    </div>
  );
}
