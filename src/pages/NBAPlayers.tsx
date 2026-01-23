import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PlayersGrid } from "@/components/players/PlayersGrid";

const NBA_POSITIONS = ["PG", "SG", "SF", "PF", "C", "G", "F"];

export default function NBAPlayers() {
  const [teams, setTeams] = useState<string[]>([]);

  const { data: players = [], isLoading } = useQuery({
    queryKey: ["nba-players-slate"],
    queryFn: async () => {
      // Get slate window (now → +48h)
      const now = new Date();
      const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

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
          usage_rank,
          headshot_url
        `)
        .eq("sport", "NBA")
        .eq("is_featured", true)
        .gte("slate_window_end", now.toISOString())
        .order("usage_rank", { ascending: true });

      if (error) {
        console.error("Error fetching NBA players:", error);
        return [];
      }

      // Get stats for these players
      if (data && data.length > 0) {
        const playerIds = data.map((p) => p.id);
        const { data: statsData } = await supabase
          .from("player_season_stats")
          .select("player_id, points_per_game, rebounds_per_game, assists_per_game, minutes_per_game, games_played")
          .in("player_id", playerIds)
          .eq("sport", "NBA")
          .eq("season", 2025);

        const statsMap = new Map();
        for (const stat of statsData || []) {
          // Only include stats if they have actual data
          if (stat.points_per_game !== null || stat.games_played !== null) {
            statsMap.set(stat.player_id, stat);
          }
        }

        return data.map((player) => {
          const playerStats = statsMap.get(player.id);
          return {
            ...player,
            stats: playerStats,
            hasStats: !!playerStats,
          };
        });
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
        <h1 className="text-2xl font-bold text-foreground">NBA Players</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Featured players for upcoming NBA games
        </p>
      </div>

      <PlayersGrid
        sport="NBA"
        players={players}
        teams={teams}
        positions={NBA_POSITIONS}
        slateWindow="48 hours"
        isLoading={isLoading}
      />
    </div>
  );
}
