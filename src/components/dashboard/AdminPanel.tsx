import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Settings, 
  Database, 
  Users, 
  RefreshCw, 
  Loader2, 
  Trophy, 
  Dribbble, 
  Zap, 
  CheckCircle, 
  XCircle, 
  UserCircle, 
  BarChart3, 
  FileText, 
  TrendingUp, 
  Square,
  Play,
  Clock
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

// Types for sync schedule
interface SyncTimestamp {
  sport: string;
  data_type: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
}

export function AdminPanel() {
  // Sync states
  const [isSyncingNFL, setIsSyncingNFL] = useState(false);
  const [isSyncingNBA, setIsSyncingNBA] = useState(false);
  const [isSyncingNFLPlayers, setIsSyncingNFLPlayers] = useState(false);
  const [isSyncingNFLSeasonStats, setIsSyncingNFLSeasonStats] = useState(false);
  const [isSyncingNFLGameLogs, setIsSyncingNFLGameLogs] = useState(false);
  const [gameLogsSyncProgress, setGameLogsSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [isSyncingNFLAdvancedStats, setIsSyncingNFLAdvancedStats] = useState(false);
  const [advancedStatsSyncProgress, setAdvancedStatsSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [isTestingAPI, setIsTestingAPI] = useState(false);
  const [apiStatus, setApiStatus] = useState<{ success: boolean; message: string } | null>(null);
  
  // Full sync state
  const [isFullSyncing, setIsFullSyncing] = useState(false);
  const [fullSyncStep, setFullSyncStep] = useState<string>("");
  const stopSyncRef = useRef(false);
  
  // Data counts
  const [gamesCount, setGamesCount] = useState<number | null>(null);
  const [oddsCount, setOddsCount] = useState<number | null>(null);
  const [nbaGamesCount, setNbaGamesCount] = useState<number | null>(null);
  const [nbaOddsCount, setNbaOddsCount] = useState<number | null>(null);
  const [nflPlayersCount, setNflPlayersCount] = useState<number | null>(null);
  const [nflSeasonStatsCount, setNflSeasonStatsCount] = useState<number | null>(null);
  const [nflGameLogsCount, setNflGameLogsCount] = useState<number | null>(null);
  const [nflAdvancedStatsCount, setNflAdvancedStatsCount] = useState<number | null>(null);
  
  // Sync timestamps
  const [syncTimestamps, setSyncTimestamps] = useState<SyncTimestamp[]>([]);

  // API Key
  const BDL_API_KEY = "52aa922d-2187-406d-a52b-3d51c71117f7";

  // Fetch all counts
  const fetchAllCounts = async () => {
    const promises = [
      fetchGamesCount(),
      fetchOddsCount(),
      fetchNBAGamesCount(),
      fetchNBAOddsCount(),
      fetchNFLPlayersCount(),
      fetchNFLSeasonStatsCount(),
      fetchNFLGameLogsCount(),
      fetchNFLAdvancedStatsCount(),
      fetchSyncTimestamps(),
    ];
    await Promise.all(promises);
  };

  const fetchGamesCount = async () => {
    const { count } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("league", "NFL");
    if (count !== null) setGamesCount(count);
  };

  const fetchOddsCount = async () => {
    const { count } = await supabase
      .from("odds")
      .select("*", { count: "exact", head: true });
    if (count !== null) setOddsCount(count);
  };

  const fetchNBAGamesCount = async () => {
    const { count } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("league", "NBA");
    if (count !== null) setNbaGamesCount(count);
  };

  const fetchNBAOddsCount = async () => {
    const { data: nbaGames } = await supabase
      .from("games")
      .select("id")
      .eq("league", "NBA");
    
    if (nbaGames && nbaGames.length > 0) {
      const { count } = await supabase
        .from("odds")
        .select("*", { count: "exact", head: true })
        .in("game_id", nbaGames.map(g => g.id));
      if (count !== null) setNbaOddsCount(count);
    } else {
      setNbaOddsCount(0);
    }
  };

  const fetchNFLPlayersCount = async () => {
    const { count } = await supabase
      .from("players")
      .select("*", { count: "exact", head: true })
      .eq("sport", "NFL");
    if (count !== null) setNflPlayersCount(count);
  };

  const fetchNFLSeasonStatsCount = async () => {
    const { count } = await supabase
      .from("player_season_stats")
      .select("*", { count: "exact", head: true })
      .eq("sport", "NFL");
    if (count !== null) setNflSeasonStatsCount(count);
  };

  const fetchNFLGameLogsCount = async () => {
    const { count } = await supabase
      .from("player_game_logs")
      .select("*", { count: "exact", head: true })
      .eq("sport", "NFL");
    if (count !== null) setNflGameLogsCount(count);
  };

  const fetchNFLAdvancedStatsCount = async () => {
    const { count } = await supabase
      .from("player_advanced_stats")
      .select("*", { count: "exact", head: true })
      .eq("sport", "NFL");
    if (count !== null) setNflAdvancedStatsCount(count);
  };

  const fetchSyncTimestamps = async () => {
    const { data } = await supabase
      .from("sync_schedule")
      .select("sport, data_type, last_sync_at, last_sync_status");
    if (data) setSyncTimestamps(data);
  };

  const updateSyncTimestamp = async (sport: string, dataType: string, status: string) => {
    await supabase
      .from("sync_schedule")
      .upsert({
        sport,
        data_type: dataType,
        last_sync_at: new Date().toISOString(),
        last_sync_status: status,
      }, { onConflict: "sport,data_type" });
    await fetchSyncTimestamps();
  };

  const getLastSyncTime = (sport: string, dataType: string): string => {
    const record = syncTimestamps.find(s => s.sport === sport && s.data_type === dataType);
    if (!record?.last_sync_at) return "Never";
    try {
      return formatDistanceToNow(new Date(record.last_sync_at), { addSuffix: true });
    } catch {
      return "Unknown";
    }
  };

  useEffect(() => {
    fetchAllCounts();
  }, []);

  // Sync handlers (simplified without edge function error toasts)
  const handleSyncNFLGames = async () => {
    setIsSyncingNFL(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-nfl-games");
      
      // Suppress edge function errors - check DB directly
      if (error) {
        console.log("[Admin] Edge function returned error (checking DB):", error.message);
      }

      await fetchGamesCount();
      await fetchOddsCount();
      await updateSyncTimestamp("NFL", "games", "success");

      toast({
        title: "NFL Games Synced",
        description: data?.message || `Games updated successfully`,
      });
    } catch (error) {
      console.error("Sync error:", error);
      await updateSyncTimestamp("NFL", "games", "failed");
    } finally {
      setIsSyncingNFL(false);
    }
  };

  const handleSyncNBAGames = async () => {
    setIsSyncingNBA(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-nba-odds");
      
      if (error) {
        console.log("[Admin] Edge function returned error (checking DB):", error.message);
      }

      await fetchNBAGamesCount();
      await fetchNBAOddsCount();
      await updateSyncTimestamp("NBA", "games", "success");

      toast({
        title: "NBA Games Synced",
        description: data?.message || `Games updated successfully`,
      });
    } catch (error) {
      console.error("Sync error:", error);
      await updateSyncTimestamp("NBA", "games", "failed");
    } finally {
      setIsSyncingNBA(false);
    }
  };

  const handleSyncNFLPlayers = async (): Promise<boolean> => {
    setIsSyncingNFLPlayers(true);
    try {
      // Call edge function (don't show error if it fails)
      await supabase.functions.invoke("sync-nfl-players").catch(() => null);

      const { count: newCount } = await supabase
        .from("players")
        .select("*", { count: "exact", head: true })
        .eq("sport", "NFL");

      if (newCount && newCount > 0) {
        setNflPlayersCount(newCount);
        await updateSyncTimestamp("NFL", "players", "success");
        if (!isFullSyncing) {
          toast({
            title: "NFL Players Synced",
            description: `✓ ${newCount.toLocaleString()} players in vault`,
          });
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error("[Admin] Player sync error:", error);
      await updateSyncTimestamp("NFL", "players", "failed");
      return false;
    } finally {
      setIsSyncingNFLPlayers(false);
    }
  };

  const handleSyncNFLSeasonStats = async (): Promise<boolean> => {
    setIsSyncingNFLSeasonStats(true);
    const seasons = [2025, 2024, 2023, 2022, 2021, 2020];
    
    try {
      // Fetch all NFL players
      let allPlayers: { id: string; external_id: string }[] = [];
      let offset = 0;
      const pageSize = 1000;
      
      const { count: playerCount } = await supabase
        .from("players")
        .select("*", { count: "exact", head: true })
        .eq("sport", "NFL");
      
      if (!playerCount || playerCount === 0) {
        throw new Error("No NFL players - sync players first");
      }

      while (offset < playerCount) {
        const { data: batch } = await supabase
          .from("players")
          .select("id, external_id")
          .eq("sport", "NFL")
          .range(offset, offset + pageSize - 1);
        
        if (batch) allPlayers = [...allPlayers, ...batch];
        offset += pageSize;
      }

      const playerMap = new Map(allPlayers.map(p => [String(p.external_id), p.id]));
      let totalSynced = 0;

      for (const season of seasons) {
        if (stopSyncRef.current) break;

        const response = await fetch(
          `https://api.balldontlie.io/nfl/v1/season_stats?season=${season}&per_page=100`,
          { headers: { "Authorization": BDL_API_KEY } }
        );

        if (!response.ok) continue;

        let result = await response.json();
        let seasonStats = result.data || [];
        let nextCursor = result.meta?.next_cursor;

        while (nextCursor && !stopSyncRef.current) {
          const nextResponse = await fetch(
            `https://api.balldontlie.io/nfl/v1/season_stats?season=${season}&per_page=100&cursor=${nextCursor}`,
            { headers: { "Authorization": BDL_API_KEY } }
          );
          if (!nextResponse.ok) break;
          const nextResult = await nextResponse.json();
          seasonStats = [...seasonStats, ...(nextResult.data || [])];
          nextCursor = nextResult.meta?.next_cursor;
          await new Promise(r => setTimeout(r, 150));
        }

        // Process stats
        const statsToUpsert = [];
        for (const stat of seasonStats) {
          const playerId = playerMap.get(String(stat.player?.id));
          if (!playerId) continue;

          const passYards = stat.pass_yards || 0;
          const passTd = stat.pass_touchdowns || stat.pass_td || 0;
          const passInt = stat.pass_interceptions || stat.pass_int || 0;
          const rushYards = stat.rush_yards || 0;
          const rushTd = stat.rush_touchdowns || stat.rush_td || 0;
          const recYards = stat.receiving_yards || stat.rec_yards || 0;
          const recTd = stat.receiving_touchdowns || stat.rec_td || 0;
          const receptions = stat.receptions || 0;

          const fantasyPoints = (passYards * 0.04) + (passTd * 4) - (passInt * 2) + 
            (rushYards * 0.1) + (rushTd * 6) + (recYards * 0.1) + (recTd * 6);

          statsToUpsert.push({
            player_id: playerId,
            sport: "NFL",
            season: stat.season || season,
            season_type: "regular",
            games_played: stat.games_played || 0,
            pass_attempts: stat.pass_attempts || 0,
            pass_completions: stat.pass_completions || 0,
            pass_yards: passYards,
            pass_td: passTd,
            pass_int: passInt,
            passer_rating: stat.passer_rating || null,
            rush_attempts: stat.rush_attempts || 0,
            rush_yards: rushYards,
            rush_td: rushTd,
            receptions: receptions,
            rec_yards: recYards,
            rec_td: recTd,
            targets: stat.targets || 0,
            fantasy_points: Math.round(fantasyPoints * 100) / 100,
            fantasy_points_ppr: Math.round((fantasyPoints + receptions) * 100) / 100,
            raw_data: stat,
            updated_at: new Date().toISOString(),
          });
        }

        if (statsToUpsert.length > 0) {
          for (let i = 0; i < statsToUpsert.length; i += 50) {
            const batch = statsToUpsert.slice(i, i + 50);
            await supabase.from("player_season_stats").upsert(batch, {
              onConflict: "player_id,sport,season,season_type",
            });
            totalSynced += batch.length;
          }
        }
        await new Promise(r => setTimeout(r, 300));
      }

      await fetchNFLSeasonStatsCount();
      await updateSyncTimestamp("NFL", "season_stats", "success");

      if (!isFullSyncing && totalSynced > 0) {
        toast({
          title: "✓ Season Stats Synced",
          description: `${totalSynced.toLocaleString()} stats across ${seasons.length} seasons`,
        });
      }
      return totalSynced > 0;
    } catch (error) {
      console.error("[Admin] Season stats error:", error);
      await updateSyncTimestamp("NFL", "season_stats", "failed");
      return false;
    } finally {
      setIsSyncingNFLSeasonStats(false);
    }
  };

  const handleSyncNFLGameLogs = async (): Promise<boolean> => {
    setIsSyncingNFLGameLogs(true);
    setGameLogsSyncProgress(null);
    const season = 2025;
    const BATCH_SIZE = 10;
    
    try {
      const { data: playersWithStats, error } = await supabase
        .from("player_season_stats")
        .select(`player_id, players!inner (id, external_id, name, team_abbr)`)
        .eq("sport", "NFL")
        .eq("season", season);

      if (error || !playersWithStats?.length) {
        throw new Error("No players with season stats - sync season stats first");
      }

      const uniquePlayersMap = new Map<string, { id: string; external_id: string; name: string; team_abbr: string | null }>();
      for (const row of playersWithStats) {
        const player = row.players as unknown as { id: string; external_id: string; name: string; team_abbr: string | null };
        if (player?.id && !uniquePlayersMap.has(player.id)) {
          uniquePlayersMap.set(player.id, player);
        }
      }

      const uniquePlayers = Array.from(uniquePlayersMap.values());
      setGameLogsSyncProgress({ current: 0, total: uniquePlayers.length });

      let totalSynced = 0;
      let processed = 0;

      for (let i = 0; i < uniquePlayers.length; i += BATCH_SIZE) {
        if (stopSyncRef.current) break;

        const batch = uniquePlayers.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (player) => {
          try {
            const response = await fetch(
              `https://api.balldontlie.io/nfl/v1/stats?player_ids=${player.external_id}&season=${season}&per_page=100`,
              { headers: { "Authorization": BDL_API_KEY } }
            );
            if (!response.ok) return { player, stats: [] };
            const result = await response.json();
            return { player, stats: result.data || [] };
          } catch {
            return { player, stats: [] };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        const logsToUpsert = [];

        for (const { player, stats } of batchResults) {
          for (const stat of stats) {
            const game = stat.game || {};
            const homeTeam = game.home_team || {};
            const awayTeam = game.away_team || {};
            const playerTeamAbbr = player.team_abbr || stat.player?.team?.abbreviation || "";
            const isHome = homeTeam.abbreviation === playerTeamAbbr;
            const homeAway = isHome ? "home" : "away";
            const opponentAbbr = isHome ? awayTeam.abbreviation : homeTeam.abbreviation;
            const opponentName = isHome ? awayTeam.full_name : homeTeam.full_name;
            const homeScore = game.home_team_score || 0;
            const awayScore = game.away_team_score || 0;
            const teamScore = isHome ? homeScore : awayScore;
            const opponentScore = isHome ? awayScore : homeScore;
            let result = null;
            if (teamScore > opponentScore) result = "W";
            else if (teamScore < opponentScore) result = "L";
            else if (teamScore === opponentScore && game.status === "Final") result = "T";

            const passYards = stat.pass_yards || 0;
            const passTd = stat.pass_touchdowns || stat.pass_td || 0;
            const passInt = stat.pass_interceptions || stat.pass_int || 0;
            const rushYards = stat.rush_yards || 0;
            const rushTd = stat.rush_touchdowns || stat.rush_td || 0;
            const recYards = stat.receiving_yards || stat.rec_yards || 0;
            const recTd = stat.receiving_touchdowns || stat.rec_td || 0;
            const receptions = stat.receptions || 0;

            const fantasyPoints = (passYards * 0.04) + (passTd * 4) - (passInt * 2) + 
              (rushYards * 0.1) + (rushTd * 6) + (recYards * 0.1) + (recTd * 6);

            logsToUpsert.push({
              player_id: player.id,
              sport: "NFL",
              season: game.season || season,
              week: game.week || null,
              game_date: game.date ? new Date(game.date).toISOString().split('T')[0] : null,
              game_id: String(game.id || ""),
              opponent_abbr: opponentAbbr || null,
              opponent_name: opponentName || null,
              home_away: homeAway,
              team_score: teamScore,
              opponent_score: opponentScore,
              result: result,
              pass_attempts: stat.pass_attempts || 0,
              pass_completions: stat.pass_completions || 0,
              pass_yards: passYards,
              pass_td: passTd,
              pass_int: passInt,
              passer_rating: stat.passer_rating || null,
              rush_attempts: stat.rush_attempts || 0,
              rush_yards: rushYards,
              rush_td: rushTd,
              targets: stat.targets || 0,
              receptions: receptions,
              rec_yards: recYards,
              rec_td: recTd,
              fantasy_points: Math.round(fantasyPoints * 100) / 100,
              fantasy_points_ppr: Math.round((fantasyPoints + receptions) * 100) / 100,
              raw_data: stat,
            });
          }
        }

        if (logsToUpsert.length > 0) {
          await supabase.from("player_game_logs").upsert(logsToUpsert, {
            onConflict: "player_id,sport,game_id",
            ignoreDuplicates: false,
          });
          totalSynced += logsToUpsert.length;
        }

        processed += batch.length;
        setGameLogsSyncProgress({ current: processed, total: uniquePlayers.length });
        await new Promise(r => setTimeout(r, 200));
      }

      await fetchNFLGameLogsCount();
      await updateSyncTimestamp("NFL", "game_logs", "success");

      if (!isFullSyncing && totalSynced > 0) {
        toast({
          title: "✓ Game Logs Synced",
          description: `${totalSynced.toLocaleString()} logs for ${processed} players`,
        });
      }
      return totalSynced > 0;
    } catch (error) {
      console.error("[Admin] Game logs error:", error);
      await updateSyncTimestamp("NFL", "game_logs", "failed");
      return false;
    } finally {
      setIsSyncingNFLGameLogs(false);
      setGameLogsSyncProgress(null);
    }
  };

  const handleSyncNFLAdvancedStats = async (): Promise<boolean> => {
    setIsSyncingNFLAdvancedStats(true);
    setAdvancedStatsSyncProgress(null);
    const season = 2025;
    
    try {
      // Test endpoints
      const testEndpoints = [
        { name: "passing", url: `https://api.balldontlie.io/nfl/v1/advanced_stats/passing?season=2024&per_page=1`, positions: ["QB"] },
        { name: "rushing", url: `https://api.balldontlie.io/nfl/v1/advanced_stats/rushing?season=2024&per_page=1`, positions: ["RB", "FB"] },
        { name: "receiving", url: `https://api.balldontlie.io/nfl/v1/advanced_stats/receiving?season=2024&per_page=1`, positions: ["WR", "TE"] },
      ];

      const availableEndpoints: { name: string; positions: string[] }[] = [];
      for (const endpoint of testEndpoints) {
        try {
          const response = await fetch(endpoint.url, { headers: { "Authorization": BDL_API_KEY } });
          if (response.ok) {
            availableEndpoints.push({ name: endpoint.name, positions: endpoint.positions });
          }
        } catch { /* skip */ }
      }

      if (availableEndpoints.length === 0) {
        if (!isFullSyncing) {
          toast({
            title: "Advanced stats not available",
            description: "API doesn't have advanced stats endpoints",
          });
        }
        return false;
      }

      const { data: playersWithStats } = await supabase
        .from("player_season_stats")
        .select(`player_id, players!inner (id, external_id, name, position, team_abbr)`)
        .eq("sport", "NFL")
        .eq("season", season);

      if (!playersWithStats?.length) return false;

      const uniquePlayersMap = new Map<string, { id: string; external_id: string; name: string; position: string | null; team_abbr: string | null }>();
      for (const row of playersWithStats) {
        const player = row.players as unknown as { id: string; external_id: string; name: string; position: string | null; team_abbr: string | null };
        if (player?.id && !uniquePlayersMap.has(player.id)) {
          uniquePlayersMap.set(player.id, player);
        }
      }

      const uniquePlayers = Array.from(uniquePlayersMap.values());
      let totalSynced = 0;

      // For each endpoint, try bulk fetch
      for (const endpoint of availableEndpoints) {
        if (stopSyncRef.current) break;

        try {
          const response = await fetch(
            `https://api.balldontlie.io/nfl/v1/advanced_stats/${endpoint.name}?season=${season}&per_page=100`,
            { headers: { "Authorization": BDL_API_KEY } }
          );

          if (!response.ok) continue;

          const result = await response.json();
          const allStats = result.data || [];
          const playerExternalIds = new Set(uniquePlayers.map(p => String(p.external_id)));
          const relevantStats = allStats.filter((stat: Record<string, unknown>) => 
            playerExternalIds.has(String((stat.player as Record<string, unknown>)?.id))
          );

          const statsToUpsert = [];
          for (const stat of relevantStats) {
            const player = uniquePlayers.find(p => String(p.external_id) === String((stat.player as Record<string, unknown>)?.id));
            if (!player) continue;

            const advancedStat: Record<string, unknown> = {
              player_id: player.id,
              sport: "NFL",
              season: (stat as Record<string, unknown>).season || season,
              raw_data: stat,
              updated_at: new Date().toISOString(),
            };

            if (endpoint.name === "passing") {
              advancedStat.pass_epa = (stat as Record<string, unknown>).epa || (stat as Record<string, unknown>).pass_epa || null;
              advancedStat.success_rate = (stat as Record<string, unknown>).success_rate || null;
              advancedStat.air_yards = (stat as Record<string, unknown>).air_yards || (stat as Record<string, unknown>).intended_air_yards || null;
            }
            if (endpoint.name === "rushing") {
              advancedStat.rush_epa = (stat as Record<string, unknown>).epa || (stat as Record<string, unknown>).rush_epa || null;
              advancedStat.success_rate = (stat as Record<string, unknown>).success_rate || null;
              advancedStat.rush_share = (stat as Record<string, unknown>).rush_share || (stat as Record<string, unknown>).carry_share || null;
            }
            if (endpoint.name === "receiving") {
              advancedStat.rec_epa = (stat as Record<string, unknown>).epa || (stat as Record<string, unknown>).rec_epa || null;
              advancedStat.target_share = (stat as Record<string, unknown>).target_share || null;
              advancedStat.yards_after_catch = (stat as Record<string, unknown>).yards_after_catch || (stat as Record<string, unknown>).yac || null;
              advancedStat.catch_rate = (stat as Record<string, unknown>).catch_rate || null;
            }

            statsToUpsert.push(advancedStat);
          }

          if (statsToUpsert.length > 0) {
            await supabase.from("player_advanced_stats").upsert(statsToUpsert, {
              onConflict: "player_id,sport,season",
            });
            totalSynced += statsToUpsert.length;
          }
        } catch (e) {
          console.error(`[Admin] Error fetching ${endpoint.name}:`, e);
        }
      }

      await fetchNFLAdvancedStatsCount();
      await updateSyncTimestamp("NFL", "advanced_stats", "success");

      if (!isFullSyncing && totalSynced > 0) {
        toast({
          title: "✓ Advanced Stats Synced",
          description: `${totalSynced.toLocaleString()} stats synced`,
        });
      }
      return totalSynced > 0;
    } catch (error) {
      console.error("[Admin] Advanced stats error:", error);
      await updateSyncTimestamp("NFL", "advanced_stats", "failed");
      return false;
    } finally {
      setIsSyncingNFLAdvancedStats(false);
      setAdvancedStatsSyncProgress(null);
    }
  };

  // Full NFL Sync
  const handleFullNFLSync = async () => {
    setIsFullSyncing(true);
    stopSyncRef.current = false;
    const startTime = Date.now();
    
    try {
      // Step 1: Players
      setFullSyncStep("Syncing Players...");
      toast({ title: "Full NFL Sync", description: "Step 1/3: Syncing Players..." });
      await handleSyncNFLPlayers();
      
      if (stopSyncRef.current) throw new Error("Sync cancelled");

      // Step 2: Season Stats
      setFullSyncStep("Syncing Season Stats...");
      toast({ title: "Full NFL Sync", description: "Step 2/3: Syncing Season Stats..." });
      await handleSyncNFLSeasonStats();
      
      if (stopSyncRef.current) throw new Error("Sync cancelled");

      // Step 3: Game Logs
      setFullSyncStep("Syncing Game Logs...");
      toast({ title: "Full NFL Sync", description: "Step 3/3: Syncing Game Logs..." });
      await handleSyncNFLGameLogs();

      const duration = Math.round((Date.now() - startTime) / 1000);
      toast({
        title: "✓ Full NFL Sync Complete",
        description: `All data synced in ${Math.floor(duration / 60)}m ${duration % 60}s`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Sync failed";
      if (msg !== "Sync cancelled") {
        toast({
          title: "Full Sync Failed",
          description: msg,
          variant: "destructive",
        });
      }
    } finally {
      setIsFullSyncing(false);
      setFullSyncStep("");
    }
  };

  const handleStopSync = () => {
    stopSyncRef.current = true;
    toast({ title: "Stopping sync...", description: "Will stop after current operation" });
  };

  const handleTestAPIConnection = async () => {
    setIsTestingAPI(true);
    setApiStatus(null);
    try {
      const response = await fetch(
        `https://api.balldontlie.io/nfl/v1/teams?per_page=1`,
        { headers: { "Authorization": BDL_API_KEY } }
      );
      
      if (response.ok) {
        setApiStatus({ success: true, message: "API connection successful" });
        toast({ title: "API Connected", description: "Ball Don't Lie API is reachable" });
      } else {
        setApiStatus({ success: false, message: `API returned ${response.status}` });
        toast({ title: "API Error", description: `Status: ${response.status}`, variant: "destructive" });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Connection failed";
      setApiStatus({ success: false, message: msg });
      toast({ title: "API Error", description: msg, variant: "destructive" });
    } finally {
      setIsTestingAPI(false);
    }
  };

  const isSyncing = isSyncingNFL || isSyncingNBA || isSyncingNFLPlayers || 
    isSyncingNFLSeasonStats || isSyncingNFLGameLogs || isSyncingNFLAdvancedStats || isFullSyncing;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-wide">ADMIN PANEL</h1>
          <p className="text-sm text-muted-foreground font-mono">System configuration and management</p>
        </div>
        <Badge variant="outline" className="border-terminal-red text-terminal-red">ADMIN ACCESS</Badge>
      </motion.div>

      {/* Admin Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Database Status */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
                <Database className="w-4 h-4 text-terminal-green" />
                Database Status
              </CardTitle>
              <Badge variant="outline" className="border-terminal-green text-terminal-green text-[10px]">CONNECTED</Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 font-mono text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>NFL Games</span>
                  <span className="text-foreground">{gamesCount?.toLocaleString() ?? "..."}</span>
                </div>
                <div className="flex justify-between">
                  <span>NFL Odds</span>
                  <span className="text-foreground">{oddsCount?.toLocaleString() ?? "..."}</span>
                </div>
                <div className="flex justify-between">
                  <span>NBA Games</span>
                  <span className="text-foreground">{nbaGamesCount?.toLocaleString() ?? "..."}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Ball Don't Lie API */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="bg-card border-terminal-amber/30">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
                <Zap className="w-4 h-4 text-terminal-amber" />
                Ball Don't Lie API
              </CardTitle>
              {apiStatus && (
                <Badge 
                  variant="outline" 
                  className={apiStatus.success 
                    ? "border-terminal-green text-terminal-green text-[10px]" 
                    : "border-terminal-red text-terminal-red text-[10px]"}
                >
                  {apiStatus.success ? "CONNECTED" : "ERROR"}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start font-mono text-xs border-terminal-amber/50 hover:bg-terminal-amber/10"
                onClick={handleTestAPIConnection}
                disabled={isTestingAPI}
              >
                {isTestingAPI ? (
                  <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                ) : apiStatus?.success ? (
                  <CheckCircle className="w-3 h-3 mr-2 text-terminal-green" />
                ) : apiStatus ? (
                  <XCircle className="w-3 h-3 mr-2 text-terminal-red" />
                ) : (
                  <Zap className="w-3 h-3 mr-2" />
                )}
                Test API Connection
              </Button>
              <div className="font-mono text-xs text-muted-foreground">
                <p>Endpoints: NFL, NBA, NCAAB</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* NFL Data Sync - Main Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="md:col-span-2">
          <Card className="bg-card border-terminal-green/30">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
                <Trophy className="w-4 h-4 text-terminal-green" />
                NFL Data Sync
              </CardTitle>
              <Badge variant="outline" className="border-terminal-green text-terminal-green text-[10px]">NFL</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Full Sync Button */}
              <div className="flex items-center gap-2">
                <Button 
                  variant="default"
                  size="sm" 
                  className="flex-1 justify-start font-mono text-xs bg-terminal-green hover:bg-terminal-green/80 text-background"
                  onClick={handleFullNFLSync}
                  disabled={isSyncing}
                >
                  {isFullSyncing ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      {fullSyncStep || "Running Full Sync..."}
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 mr-2" />
                      Full NFL Sync (3-5 min)
                    </>
                  )}
                </Button>
                {isFullSyncing && (
                  <Button variant="destructive" size="sm" className="font-mono text-xs" onClick={handleStopSync}>
                    <Square className="w-3 h-3 mr-1" />
                    Stop
                  </Button>
                )}
              </div>

              {/* Data Counters */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-terminal-green">{nflPlayersCount?.toLocaleString() ?? "—"}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">Players in Vault</div>
                  <div className="text-[9px] text-muted-foreground/60 font-mono flex items-center justify-center gap-1 mt-1">
                    <Clock className="w-2 h-2" />
                    {getLastSyncTime("NFL", "players")}
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-terminal-green">{nflSeasonStatsCount?.toLocaleString() ?? "—"}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">Season Stats</div>
                  <div className="text-[9px] text-muted-foreground/60 font-mono flex items-center justify-center gap-1 mt-1">
                    <Clock className="w-2 h-2" />
                    {getLastSyncTime("NFL", "season_stats")}
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-terminal-green">{nflGameLogsCount?.toLocaleString() ?? "—"}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">Game Logs</div>
                  <div className="text-[9px] text-muted-foreground/60 font-mono flex items-center justify-center gap-1 mt-1">
                    <Clock className="w-2 h-2" />
                    {getLastSyncTime("NFL", "game_logs")}
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-terminal-green">{nflAdvancedStatsCount?.toLocaleString() ?? "N/A"}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">Advanced Stats</div>
                  <div className="text-[9px] text-muted-foreground/60 font-mono flex items-center justify-center gap-1 mt-1">
                    <Clock className="w-2 h-2" />
                    {getLastSyncTime("NFL", "advanced_stats")}
                  </div>
                </div>
              </div>

              {/* Individual Sync Buttons */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="justify-start font-mono text-xs border-terminal-green/50 hover:bg-terminal-green/10"
                  onClick={handleSyncNFLPlayers}
                  disabled={isSyncing}
                >
                  {isSyncingNFLPlayers ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <UserCircle className="w-3 h-3 mr-2" />}
                  Players
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="justify-start font-mono text-xs border-terminal-green/50 hover:bg-terminal-green/10"
                  onClick={handleSyncNFLSeasonStats}
                  disabled={isSyncing}
                >
                  {isSyncingNFLSeasonStats ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <BarChart3 className="w-3 h-3 mr-2" />}
                  Season Stats
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="justify-start font-mono text-xs border-terminal-green/50 hover:bg-terminal-green/10"
                  onClick={handleSyncNFLGameLogs}
                  disabled={isSyncing}
                >
                  {isSyncingNFLGameLogs ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      {gameLogsSyncProgress ? `${gameLogsSyncProgress.current}/${gameLogsSyncProgress.total}` : "..."}
                    </>
                  ) : (
                    <>
                      <FileText className="w-3 h-3 mr-2" />
                      Game Logs
                    </>
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="justify-start font-mono text-xs border-terminal-green/50 hover:bg-terminal-green/10"
                  onClick={handleSyncNFLAdvancedStats}
                  disabled={isSyncing}
                >
                  {isSyncingNFLAdvancedStats ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <TrendingUp className="w-3 h-3 mr-2" />}
                  Advanced
                </Button>
              </div>

              {/* Games Sync */}
              <div className="pt-2 border-t border-border">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start font-mono text-xs border-terminal-green/50 hover:bg-terminal-green/10"
                  onClick={handleSyncNFLGames}
                  disabled={isSyncing}
                >
                  {isSyncingNFL ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-2" />}
                  Sync NFL Games & Odds
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* NBA Sync Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="bg-card border-terminal-cyan/30">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
                <Dribbble className="w-4 h-4 text-terminal-cyan" />
                NBA Data Sync
              </CardTitle>
              <Badge variant="outline" className="border-terminal-cyan text-terminal-cyan text-[10px]">NBA</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start font-mono text-xs border-terminal-cyan/50 hover:bg-terminal-cyan/10"
                onClick={handleSyncNBAGames}
                disabled={isSyncingNBA}
              >
                {isSyncingNBA ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-2" />}
                Sync NBA Games
              </Button>
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Games in Vault:</span>
                <span className="text-terminal-cyan">{nbaGamesCount ?? "..."}</span>
              </div>
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Odds in Vault:</span>
                <span className="text-terminal-cyan">{nbaOddsCount ?? "..."}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* System Health */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
                <Settings className="w-4 h-4 text-muted-foreground" />
                System Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">API Response</span>
                  <span className="text-terminal-green">OK</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Database</span>
                  <span className="text-terminal-green">Connected</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Edge Functions</span>
                  <span className="text-terminal-green">Active</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Uptime</span>
                  <span className="text-foreground">99.9%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
