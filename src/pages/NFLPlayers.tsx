import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PlayersGrid } from "@/components/players/PlayersGrid";

const NFL_POSITIONS = ["QB", "RB", "WR", "TE", "FB"];

export default function NFLPlayers() {
  const [teams, setTeams] = useState<string[]>([]);

  const { data: players = [], isLoading } = useQuery({
    queryKey: ["nfl-players-slate"],
    queryFn: async () => {
      // Get slate window (now → +7 days)
      const now = new Date();
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

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
        .eq("sport", "NFL")
        .eq("is_featured", true)
        .gte("slate_window_end", now.toISOString())
        .order("usage_rank", { ascending: true });

      if (error) {
        console.error("Error fetching NFL players:", error);
        return [];
      }

      // Get stats for these players
      if (data && data.length > 0) {
        const playerIds = data.map((p) => p.id);
        const { data: statsData } = await supabase
          .from("player_season_stats")
          .select("player_id, pass_yards, rush_yards, rec_yards")
          .in("player_id", playerIds)
          .eq("sport", "NFL")
          .eq("season", 2024);

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
        <h1 className="text-2xl font-bold text-foreground">NFL Players</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Featured players for upcoming NFL games
        </p>
      </div>

      <PlayersGrid
        sport="NFL"
        players={players}
        teams={teams}
        positions={NFL_POSITIONS}
        slateWindow="7 days"
        isLoading={isLoading}
      />
    </div>
  );
}
