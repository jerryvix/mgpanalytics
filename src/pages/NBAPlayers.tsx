import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { NBASlatePlayersGrid } from "@/components/nba/NBASlatePlayersGrid";

export default function NBAPlayers() {
  const [viewMode, setViewMode] = useState<"slate" | "all">("slate");

  const { data: result, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["nba-top-slate-players", viewMode],
    queryFn: async () => {
      const now = new Date();
      const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      // 1. Get games in next 48 hours
      const { data: upcomingGames, error: gamesError } = await supabase
        .from("nba_games")
        .select("id, home_team_name, visitor_team_name, date, status")
        .gte("date", now.toISOString())
        .lte("date", in48Hours.toISOString())
        .neq("status", "Final");

      if (gamesError) {
        console.error("Error fetching NBA games:", gamesError);
        return { players: [], games: [], teams: [], hasGames: false };
      }

      if (!upcomingGames || upcomingGames.length === 0) {
        return { players: [], games: upcomingGames || [], teams: [], hasGames: false };
      }

      // 2. Get unique team names from upcoming games
      const teamNames = [...new Set(
        upcomingGames.flatMap(g => [g.home_team_name, g.visitor_team_name])
      )].filter(Boolean);

      // 3. Get players from those teams, excluding "Out" status
      const { data: playersData, error: playersError } = await supabase
        .from("players")
        .select(`
          id,
          name,
          team_name,
          position,
          injury_status,
          headshot_url
        `)
        .eq("sport", "NBA")
        .in("team_name", teamNames)
        .neq("injury_status", "Out");

      if (playersError) {
        console.error("Error fetching players:", playersError);
        return { players: [], games: upcomingGames, teams: teamNames, hasGames: true };
      }

      if (!playersData || playersData.length === 0) {
        return { players: [], games: upcomingGames, teams: teamNames, hasGames: true };
      }

      // 4. Get stats for these players (try current season, fall back to previous)
      const playerIds = playersData.map(p => p.id);
      const currentDbSeason = new Date().getMonth() >= 9 ? new Date().getFullYear() + 1 : new Date().getFullYear();
      let { data: statsData } = await supabase
        .from("player_season_stats")
        .select("player_id, points_per_game, rebounds_per_game, assists_per_game, minutes_per_game, games_played")
        .in("player_id", playerIds)
        .eq("sport", "NBA")
        .eq("season", currentDbSeason);

      // Fallback: if no stats for current season, try previous season
      if (!statsData || statsData.length === 0) {
        const fallback = await supabase
          .from("player_season_stats")
          .select("player_id, points_per_game, rebounds_per_game, assists_per_game, minutes_per_game, games_played")
          .in("player_id", playerIds)
          .eq("sport", "NBA")
          .eq("season", currentDbSeason - 1);
        statsData = fallback.data;
      }

      // Create stats lookup map
      const statsMap = new Map<string, {
        points_per_game: number | null;
        rebounds_per_game: number | null;
        assists_per_game: number | null;
        minutes_per_game: number | null;
        games_played: number | null;
      }>();
      
      for (const stat of statsData || []) {
        if (stat.points_per_game !== null && stat.player_id) {
          statsMap.set(stat.player_id, stat);
        }
      }

      // 5. Create game context lookup (team -> game info)
      const gameContextMap = new Map<string, { opponent: string; date: Date; isHome: boolean }>();
      for (const game of upcomingGames) {
        const gameDate = new Date(game.date);
        gameContextMap.set(game.home_team_name, {
          opponent: game.visitor_team_name,
          date: gameDate,
          isHome: true,
        });
        gameContextMap.set(game.visitor_team_name, {
          opponent: game.home_team_name,
          date: gameDate,
          isHome: false,
        });
      }

      // 6. Check which players have props today
      const today = new Date().toISOString().split("T")[0];
      const { data: propsData } = await supabase
        .from("player_props")
        .select("player_id")
        .in("player_id", playerIds)
        .eq("sport", "NBA")
        .gte("game_date", today)
        .eq("is_active", true);

      const playerIdsWithProps = new Set((propsData || []).map(p => p.player_id));

      // 7. Combine players with stats and game context
      const playersWithStats = playersData
        .map(player => {
          const stats = statsMap.get(player.id);
          const gameContext = player.team_name ? gameContextMap.get(player.team_name) : undefined;
          return {
            ...player,
            stats,
            gameContext,
            ppg: stats?.points_per_game ?? null,
            hasProps: playerIdsWithProps.has(player.id),
          };
        })
        // Filter to only players with PPG stats
        .filter(p => p.ppg !== null && p.ppg > 0)
        // Sort by PPG descending
        .sort((a, b) => (b.ppg ?? 0) - (a.ppg ?? 0));

      // 8. Take top 10 for slate view, all for all view
      const finalPlayers = viewMode === "slate" 
        ? playersWithStats.slice(0, 10)
        : playersWithStats;

      // Add rank to each player
      const rankedPlayers = finalPlayers.map((player, index) => ({
        ...player,
        rank: index + 1,
      }));

      return { 
        players: rankedPlayers, 
        games: upcomingGames, 
        teams: teamNames,
        hasGames: true,
        totalWithStats: playersWithStats.length,
      };
    },
    refetchInterval: 30 * 60 * 1000,
  });

  const { players = [], games = [], teams = [], hasGames = false, totalWithStats = 0 } = result || {};

  return (
    <NBASlatePlayersGrid
      players={players as never}
      games={games}
      teams={teams}
      hasGames={hasGames}
      isLoading={isLoading}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : null}
      onRefresh={() => refetch()}
      totalWithStats={totalWithStats}
    />
  );
}
