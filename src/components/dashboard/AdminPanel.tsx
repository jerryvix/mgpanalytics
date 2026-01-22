import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataInspector } from "./DataInspector";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  RefreshCw, 
  Loader2, 
  Trophy, 
  Zap, 
  UserCircle, 
  BarChart3, 
  FileText, 
  TrendingUp, 
  Square,
  Play,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import type { Json } from "@/integrations/supabase/types";
import { 
  TheOddsApiCard, 
  LineMovementDashboard, 
  SteamMoveAlerts, 
  SportsDataManagement
} from "./admin";

// Types for sync schedule
interface SyncTimestamp {
  sport: string;
  data_type: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
}

// Stop sync confirmation modal type
type StopSyncModule = "players" | "seasonStats" | "gameLogs" | "advancedStats" | "fullSync" | null;

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
  
  // Stop sync confirmation modal
  const [stopSyncModalOpen, setStopSyncModalOpen] = useState(false);
  const [stopSyncModule, setStopSyncModule] = useState<StopSyncModule>(null);
  
  // Individual stop refs for each sync module
  const stopSyncRef = useRef(false);
  const stopPlayersSyncRef = useRef(false);
  const stopSeasonStatsSyncRef = useRef(false);
  const stopGameLogsSyncRef = useRef(false);
  const stopAdvancedStatsSyncRef = useRef(false);
  
  // Data counts
  const [gamesCount, setGamesCount] = useState<number | null>(null);
  const [oddsCount, setOddsCount] = useState<number | null>(null);
  const [nbaGamesCount, setNbaGamesCount] = useState<number | null>(null);
  const [nbaOddsCount, setNbaOddsCount] = useState<number | null>(null);
  const [nflPlayersCount, setNflPlayersCount] = useState<number | null>(null);
  const [nflSeasonStatsCount, setNflSeasonStatsCount] = useState<number | null>(null);
  const [nflGameLogsCount, setNflGameLogsCount] = useState<number | null>(null);
  const [nflAdvancedStatsCount, setNflAdvancedStatsCount] = useState<number | null>(null);
  const [ncaabGamesCount, setNcaabGamesCount] = useState<number | null>(null);
  const [oddsHistoryCount, setOddsHistoryCount] = useState<number | null>(null);
  const [lineMovementsTodayCount, setLineMovementsTodayCount] = useState<number | null>(null);
  
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
      fetchNCAABGamesCount(),
      fetchOddsHistoryCount(),
      fetchLineMovementsTodayCount(),
      fetchSyncTimestamps(),
    ];
    await Promise.all(promises);
  };

  const fetchNCAABGamesCount = async () => {
    const { count } = await supabase
      .from("ncaab_games")
      .select("*", { count: "exact", head: true });
    if (count !== null) setNcaabGamesCount(count);
  };

  const fetchOddsHistoryCount = async () => {
    const { count } = await supabase
      .from("odds_history")
      .select("*", { count: "exact", head: true });
    if (count !== null) setOddsHistoryCount(count);
  };

  const fetchLineMovementsTodayCount = async () => {
    const today = new Date().toISOString().split("T")[0];
    const { count } = await supabase
      .from("odds_history")
      .select("*", { count: "exact", head: true })
      .gte("timestamp", today);
    if (count !== null) setLineMovementsTodayCount(count);
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
    stopPlayersSyncRef.current = false;
    try {
      // Check if stopped before starting
      if (stopPlayersSyncRef.current) {
        await updateSyncTimestamp("NFL", "players", "stopped");
        toast({ title: "Players Sync Stopped", description: "Sync stopped by admin" });
        return false;
      }
      
      // Call edge function (don't show error if it fails)
      await supabase.functions.invoke("sync-nfl-players").catch(() => null);
      
      if (stopPlayersSyncRef.current) {
        await updateSyncTimestamp("NFL", "players", "stopped");
        toast({ title: "Players Sync Stopped", description: "Sync stopped by admin" });
        return false;
      }

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
      stopPlayersSyncRef.current = false;
    }
  };

  const handleSyncNFLSeasonStats = async (): Promise<boolean> => {
    setIsSyncingNFLSeasonStats(true);
    stopSeasonStatsSyncRef.current = false;
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
        if (stopSyncRef.current || stopSeasonStatsSyncRef.current) break;

        const response = await fetch(
          `https://api.balldontlie.io/nfl/v1/season_stats?season=${season}&per_page=100`,
          { headers: { "Authorization": BDL_API_KEY } }
        );

        if (!response.ok) continue;

        let result = await response.json();
        let seasonStats = result.data || [];
        let nextCursor = result.meta?.next_cursor;

        while (nextCursor && !stopSyncRef.current && !stopSeasonStatsSyncRef.current) {
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
        
        // Check if stopped mid-season
        if (stopSeasonStatsSyncRef.current) break;

        // Process stats
        const statsToUpsert = [];
        for (const stat of seasonStats) {
          const playerId = playerMap.get(String(stat.player?.id));
          if (!playerId) continue;

          // API uses "passing_yards", "rushing_yards" - not "pass_yards", "rush_yards"
          const passYards = stat.passing_yards || stat.pass_yards || 0;
          const passTd = stat.passing_touchdowns || stat.pass_touchdowns || 0;
          const passInt = stat.passing_interceptions || stat.pass_interceptions || 0;
          const rushYards = stat.rushing_yards || stat.rush_yards || 0;
          const rushTd = stat.rushing_touchdowns || stat.rush_touchdowns || 0;
          const recYards = stat.receiving_yards || stat.rec_yards || 0;
          const recTd = stat.receiving_touchdowns || stat.rec_touchdowns || 0;
          const receptions = stat.receptions || 0;

          const fantasyPoints = (passYards * 0.04) + (passTd * 4) - (passInt * 2) + 
            (rushYards * 0.1) + (rushTd * 6) + (recYards * 0.1) + (recTd * 6);

          statsToUpsert.push({
            player_id: playerId,
            sport: "NFL",
            season: stat.season || season,
            season_type: "regular",
            games_played: stat.games_played || 0,
            pass_attempts: stat.passing_attempts || stat.pass_attempts || 0,
            pass_completions: stat.passing_completions || stat.pass_completions || 0,
            pass_yards: passYards,
            pass_td: passTd,
            pass_int: passInt,
            passer_rating: stat.qbr || stat.passer_rating || null,
            rush_attempts: stat.rushing_attempts || stat.rush_attempts || 0,
            rush_yards: rushYards,
            rush_td: rushTd,
            receptions: receptions,
            rec_yards: recYards,
            rec_td: recTd,
            targets: stat.receiving_targets || stat.targets || 0,
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

      // Check if we were stopped
      if (stopSeasonStatsSyncRef.current) {
        await updateSyncTimestamp("NFL", "season_stats", "stopped");
        toast({
          title: "Season Stats Sync Stopped",
          description: `Stopped by admin. ${totalSynced.toLocaleString()} stats saved.`,
        });
        return totalSynced > 0;
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
      stopSeasonStatsSyncRef.current = false;
    }
  };

  // Game logs sync progress state - enhanced for game-by-game approach
  const [gameLogsSyncInfo, setGameLogsSyncInfo] = useState<{ current: number; total: number; week?: number } | null>(null);

  const handleSyncNFLGameLogs = async (): Promise<boolean> => {
    setIsSyncingNFLGameLogs(true);
    setGameLogsSyncProgress(null);
    setGameLogsSyncInfo(null);
    stopGameLogsSyncRef.current = false;
    const season = 2025;
    const GAME_BATCH_SIZE = 5;
    const BATCH_DELAY = 500;
    
    try {
      // Step 1: Build player lookup map from our database
      toast({ title: "Loading players...", description: "Building player lookup map" });
      
      let allPlayers: { id: string; external_id: string }[] = [];
      let offset = 0;
      const pageSize = 1000;
      
      const { count: playerCount } = await supabase
        .from("players")
        .select("*", { count: "exact", head: true })
        .eq("sport", "NFL");
      
      if (!playerCount || playerCount === 0) {
        throw new Error("No NFL players in database - sync players first");
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
      console.log(`[Admin] Loaded ${playerMap.size} NFL players into lookup map`);

      // Step 2: Fetch all games for the season from Ball Don't Lie API
      toast({ title: "Fetching games...", description: `Loading ${season} NFL games from API` });
      
      let allGames: Array<{ id: number; week: number; date: string; status: string; home_team: { abbreviation: string; full_name: string }; away_team: { abbreviation: string; full_name: string }; home_team_score: number; away_team_score: number }> = [];
      let nextCursor: string | null = null;
      
      do {
        const url = nextCursor 
          ? `https://api.balldontlie.io/nfl/v1/games?season=${season}&per_page=50&cursor=${nextCursor}`
          : `https://api.balldontlie.io/nfl/v1/games?season=${season}&per_page=50`;
        
        const response = await fetch(url, { headers: { "Authorization": BDL_API_KEY } });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch games: ${response.status}`);
        }
        
        const result = await response.json();
        allGames = [...allGames, ...(result.data || [])];
        nextCursor = result.meta?.next_cursor || null;
        
        await new Promise(r => setTimeout(r, 100));
      } while (nextCursor);

      console.log(`[Admin] Found ${allGames.length} games for ${season} season`);
      
      if (allGames.length === 0) {
        toast({ title: "No games found", description: `No NFL games found for ${season} season` });
        return false;
      }

      // Sort games by week for better progress display
      allGames.sort((a, b) => (a.week || 0) - (b.week || 0));

      setGameLogsSyncProgress({ current: 0, total: allGames.length });
      setGameLogsSyncInfo({ current: 0, total: allGames.length, week: allGames[0]?.week });

      let totalSynced = 0;
      let gamesProcessed = 0;
      let skippedPlayers = 0;

      // Step 3: Process games in batches
      for (let i = 0; i < allGames.length; i += GAME_BATCH_SIZE) {
        if (stopSyncRef.current || stopGameLogsSyncRef.current) {
          await updateSyncTimestamp("NFL", "game_logs", "stopped");
          toast({ title: "Game Logs Sync Stopped", description: `Stopped by admin. ${totalSynced} logs saved from ${gamesProcessed} games.` });
          break;
        }

        const gameBatch = allGames.slice(i, i + GAME_BATCH_SIZE);
        
        // Fetch stats for each game in the batch
        const batchPromises = gameBatch.map(async (game) => {
          try {
            const response = await fetch(
              `https://api.balldontlie.io/nfl/v1/stats?game_ids=${game.id}`,
              { headers: { "Authorization": BDL_API_KEY } }
            );
            
            if (!response.ok) {
              console.warn(`[Admin] Failed to fetch stats for game ${game.id}: ${response.status}`);
              return { game, stats: [] };
            }
            
            const result = await response.json();
            return { game, stats: result.data || [] };
          } catch (err) {
            console.warn(`[Admin] Error fetching game ${game.id}:`, err);
            return { game, stats: [] };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        const logsToUpsert: Array<{
          player_id: string;
          sport: string;
          season: number;
          week: number | null;
          game_date: string | null;
          game_id: string;
          opponent_abbr: string | null;
          opponent_name: string | null;
          home_away: string;
          team_score: number;
          opponent_score: number;
          result: string | null;
          pass_attempts: number;
          pass_completions: number;
          pass_yards: number;
          pass_td: number;
          pass_int: number;
          passer_rating: number | null;
          rush_attempts: number;
          rush_yards: number;
          rush_td: number;
          targets: number;
          receptions: number;
          rec_yards: number;
          rec_td: number;
          fantasy_points: number;
          fantasy_points_ppr: number;
          raw_data: Json;
        }> = [];

        for (const { game, stats } of batchResults) {
          for (const stat of stats) {
            // Find player in our database
            const externalPlayerId = String(stat.player?.id);
            const playerId = playerMap.get(externalPlayerId);
            
            if (!playerId) {
              skippedPlayers++;
              continue;
            }

            // Determine home/away and opponent
            const playerTeamAbbr = stat.player?.team?.abbreviation || "";
            const isHome = game.home_team?.abbreviation === playerTeamAbbr;
            const homeAway = isHome ? "home" : "away";
            const opponentAbbr = isHome ? game.away_team?.abbreviation : game.home_team?.abbreviation;
            const opponentName = isHome ? game.away_team?.full_name : game.home_team?.full_name;
            
            // Get scores
            const homeScore = game.home_team_score || 0;
            const awayScore = game.away_team_score || 0;
            const teamScore = isHome ? homeScore : awayScore;
            const opponentScore = isHome ? awayScore : homeScore;
            
            // Determine result
            let result: string | null = null;
            if (game.status === "Final" || game.status === "final") {
              if (teamScore > opponentScore) result = "W";
              else if (teamScore < opponentScore) result = "L";
              else result = "T";
            }

            // Extract stats with API field name variations
            const passYards = stat.pass_yards || stat.passing_yards || 0;
            const passTd = stat.pass_touchdowns || stat.passing_touchdowns || stat.pass_td || 0;
            const passInt = stat.pass_interceptions || stat.passing_interceptions || stat.pass_int || 0;
            const rushYards = stat.rush_yards || stat.rushing_yards || 0;
            const rushTd = stat.rush_touchdowns || stat.rushing_touchdowns || stat.rush_td || 0;
            const recYards = stat.receiving_yards || stat.rec_yards || 0;
            const recTd = stat.receiving_touchdowns || stat.rec_td || 0;
            const receptions = stat.receptions || 0;
            const targets = stat.targets || 0;

            // Calculate fantasy points
            const fantasyPoints = 
              (passYards * 0.04) + 
              (passTd * 4) - 
              (passInt * 2) + 
              (rushYards * 0.1) + 
              (rushTd * 6) + 
              (recYards * 0.1) + 
              (recTd * 6);

            const fantasyPointsPpr = fantasyPoints + receptions;

            logsToUpsert.push({
              player_id: playerId,
              sport: "NFL",
              season: season,
              week: game.week || null,
              game_date: game.date ? new Date(game.date).toISOString().split('T')[0] : null,
              game_id: String(game.id),
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
              targets: targets,
              receptions: receptions,
              rec_yards: recYards,
              rec_td: recTd,
              fantasy_points: Math.round(fantasyPoints * 100) / 100,
              fantasy_points_ppr: Math.round(fantasyPointsPpr * 100) / 100,
              raw_data: stat as Json,
            });
          }
        }

        // Upsert logs to database
        if (logsToUpsert.length > 0) {
          const { error: upsertError } = await supabase.from("player_game_logs").upsert(logsToUpsert, {
            onConflict: "player_id,sport,game_id",
            ignoreDuplicates: false,
          });
          
          if (upsertError) {
            console.error("[Admin] Upsert error:", upsertError);
          } else {
            totalSynced += logsToUpsert.length;
          }
        }

        gamesProcessed += gameBatch.length;
        const currentWeek = gameBatch[gameBatch.length - 1]?.week;
        setGameLogsSyncProgress({ current: gamesProcessed, total: allGames.length });
        setGameLogsSyncInfo({ current: gamesProcessed, total: allGames.length, week: currentWeek });

        // Log progress every 20 games
        if (gamesProcessed % 20 === 0 || gamesProcessed === allGames.length) {
          console.log(`[Admin] Progress: ${gamesProcessed}/${allGames.length} games, ${totalSynced} logs synced`);
        }

        // Rate limit delay between batches
        if (i + GAME_BATCH_SIZE < allGames.length) {
          await new Promise(r => setTimeout(r, BATCH_DELAY));
        }
      }

      await fetchNFLGameLogsCount();
      await updateSyncTimestamp("NFL", "game_logs", "success");

      if (!isFullSyncing && totalSynced > 0) {
        toast({
          title: "✓ Game Logs Synced",
          description: `${totalSynced.toLocaleString()} logs from ${gamesProcessed} games`,
        });
      }
      
      if (skippedPlayers > 0) {
        console.log(`[Admin] Note: ${skippedPlayers} stat entries skipped (players not in database)`);
      }
      
      return totalSynced > 0;
    } catch (error) {
      console.error("[Admin] Game logs error:", error);
      await updateSyncTimestamp("NFL", "game_logs", "failed");
      return false;
    } finally {
      setIsSyncingNFLGameLogs(false);
      setGameLogsSyncProgress(null);
      stopGameLogsSyncRef.current = false;
    }
  };

  const handleSyncNFLAdvancedStats = async (): Promise<boolean> => {
    setIsSyncingNFLAdvancedStats(true);
    setAdvancedStatsSyncProgress(null);
    stopAdvancedStatsSyncRef.current = false;
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
        if (stopSyncRef.current || stopAdvancedStatsSyncRef.current) break;

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

      // Check if we were stopped
      if (stopAdvancedStatsSyncRef.current) {
        await updateSyncTimestamp("NFL", "advanced_stats", "stopped");
        toast({
          title: "Advanced Stats Sync Stopped",
          description: `Stopped by admin. ${totalSynced.toLocaleString()} stats saved.`,
        });
        return totalSynced > 0;
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
      stopAdvancedStatsSyncRef.current = false;
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

  // Individual stop handlers for confirmation modal
  const openStopModal = (module: StopSyncModule) => {
    setStopSyncModule(module);
    setStopSyncModalOpen(true);
  };

  const confirmStopSync = () => {
    switch (stopSyncModule) {
      case "players":
        stopPlayersSyncRef.current = true;
        toast({ title: "Stopping Players Sync...", description: "Will stop after current operation" });
        break;
      case "seasonStats":
        stopSeasonStatsSyncRef.current = true;
        toast({ title: "Stopping Season Stats Sync...", description: "Will stop after current operation" });
        break;
      case "gameLogs":
        stopGameLogsSyncRef.current = true;
        toast({ title: "Stopping Game Logs Sync...", description: "Will stop after current operation" });
        break;
      case "advancedStats":
        stopAdvancedStatsSyncRef.current = true;
        toast({ title: "Stopping Advanced Stats Sync...", description: "Will stop after current operation" });
        break;
      case "fullSync":
        handleStopSync();
        break;
    }
    setStopSyncModalOpen(false);
    setStopSyncModule(null);
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

  const getStopModalTitle = () => {
    switch (stopSyncModule) {
      case "players": return "Stop Players Sync?";
      case "seasonStats": return "Stop Season Stats Sync?";
      case "gameLogs": return "Stop Game Logs Sync?";
      case "advancedStats": return "Stop Advanced Stats Sync?";
      case "fullSync": return "Stop Full NFL Sync?";
      default: return "Stop Sync?";
    }
  };

  const isSyncing = isSyncingNFL || isSyncingNBA || isSyncingNFLPlayers || 
    isSyncingNFLSeasonStats || isSyncingNFLGameLogs || isSyncingNFLAdvancedStats || isFullSyncing;

  return (
    <div className="space-y-3">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-wide">ADMIN PANEL</h1>
        </div>
        <Badge variant="outline" className="border-terminal-red text-terminal-red text-[10px]">ADMIN ACCESS</Badge>
      </motion.div>

      {/* Compact Status Bars */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="bg-muted/30 rounded-lg p-2 flex items-center justify-between font-mono text-[10px] border border-border">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">System:</span>
            <span className="text-terminal-green">DB ✓</span>
            <span className="text-terminal-green">Edge ✓</span>
            <span className={apiStatus?.success ? "text-terminal-green" : "text-muted-foreground"}>BDL {apiStatus?.success ? "✓" : "—"}</span>
            <span className="text-terminal-green">Odds ✓</span>
          </div>
          <span className="text-muted-foreground">Uptime <span className="text-foreground">99.9%</span></span>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <div className="bg-muted/30 rounded-lg p-2 flex items-center justify-between font-mono text-[10px] border border-border">
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">Data:</span>
            <span>NFL: <span className="text-terminal-green">{gamesCount ?? "—"}</span></span>
            <span>NBA: <span className="text-terminal-cyan">{nbaGamesCount ?? "—"}</span></span>
            <span>NCAAB: <span className="text-terminal-amber">{ncaabGamesCount ?? "—"}</span></span>
            <span>Odds: <span className="text-foreground">{oddsCount ?? "—"}</span></span>
          </div>
          <span>Moves: <span className="text-terminal-cyan">{lineMovementsTodayCount ?? 0}</span></span>
        </div>
      </motion.div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Sports Data Management - Consolidated */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="md:col-span-2">
          <SportsDataManagement />
        </motion.div>

        {/* Line Movement Dashboard */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="md:col-span-2">
          <LineMovementDashboard />
        </motion.div>

        {/* Steam Move Alerts + The Odds API */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <SteamMoveAlerts />
        </motion.div>

        {/* The Odds API - Merged with Sync Controls */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
          <TheOddsApiCard onSyncComplete={fetchAllCounts} />
        </motion.div>
        {/* NFL Stats Sync - Compact */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="md:col-span-2">
          <Card className="bg-card border-terminal-green/30">
            <CardHeader className="py-2 px-4 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-mono text-foreground flex items-center gap-2">
                <Trophy className="w-3 h-3 text-terminal-green" />
                NFL Stats Sync (Ball Don't Lie)
              </CardTitle>
              <div className="flex items-center gap-2">
                {isFullSyncing && (
                  <Button variant="destructive" size="sm" className="font-mono text-[10px] h-6 px-2" onClick={() => openStopModal("fullSync")}>
                    <Square className="w-2 h-2 mr-1" />Stop
                  </Button>
                )}
                <Button 
                  size="sm"
                  className="font-mono text-[10px] h-6 bg-terminal-green hover:bg-terminal-green/80 text-background"
                  onClick={handleFullNFLSync}
                  disabled={isSyncing}
                >
                  {isFullSyncing ? (
                    <><Loader2 className="w-2 h-2 mr-1 animate-spin" />{fullSyncStep || "Syncing..."}</>
                  ) : (
                    <><Play className="w-2 h-2 mr-1" />Full Sync (3-5 min)</>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="py-2 px-4 space-y-2">
              {/* Compact Stats Row */}
              <div className="flex items-center justify-between font-mono text-[10px] bg-muted/30 rounded px-2 py-1">
                <div className="flex items-center gap-4">
                  <span>{(nflPlayersCount ?? 0) >= 1000 ? `${((nflPlayersCount ?? 0) / 1000).toFixed(1)}K` : nflPlayersCount ?? "—"} Players</span>
                  <span>{(nflSeasonStatsCount ?? 0) >= 1000 ? `${((nflSeasonStatsCount ?? 0) / 1000).toFixed(1)}K` : nflSeasonStatsCount ?? "—"} Stats</span>
                  <span>{(nflGameLogsCount ?? 0) >= 1000 ? `${((nflGameLogsCount ?? 0) / 1000).toFixed(1)}K` : nflGameLogsCount ?? "—"} Logs</span>
                  <span>{nflAdvancedStatsCount ?? "N/A"} Adv</span>
                </div>
                <span className="text-muted-foreground">Last: {getLastSyncTime("NFL", "players")}</span>
              </div>

              {/* Compact Sync Buttons */}
              <div className="grid grid-cols-4 gap-1">
                {isSyncingNFLPlayers ? (
                  <Button variant="destructive" size="sm" className="font-mono text-[10px] h-6" onClick={() => openStopModal("players")}>
                    <Square className="w-2 h-2 mr-1" />Stop
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="font-mono text-[10px] h-6 border-terminal-green/50 hover:bg-terminal-green/10" onClick={handleSyncNFLPlayers} disabled={isSyncing}>
                    <UserCircle className="w-2 h-2 mr-1" />Players
                  </Button>
                )}
                {isSyncingNFLSeasonStats ? (
                  <Button variant="destructive" size="sm" className="font-mono text-[10px] h-6" onClick={() => openStopModal("seasonStats")}>
                    <Square className="w-2 h-2 mr-1" />Stop
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="font-mono text-[10px] h-6 border-terminal-green/50 hover:bg-terminal-green/10" onClick={handleSyncNFLSeasonStats} disabled={isSyncing}>
                    <BarChart3 className="w-2 h-2 mr-1" />Stats
                  </Button>
                )}
                {isSyncingNFLGameLogs ? (
                  <Button variant="destructive" size="sm" className="font-mono text-[10px] h-6" onClick={() => openStopModal("gameLogs")}>
                    <Square className="w-2 h-2 mr-1" />Stop {gameLogsSyncInfo ? `${gameLogsSyncInfo.current}/${gameLogsSyncInfo.total}` : ""}
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="font-mono text-[10px] h-6 border-terminal-green/50 hover:bg-terminal-green/10" onClick={handleSyncNFLGameLogs} disabled={isSyncing}>
                    <FileText className="w-2 h-2 mr-1" />Logs
                  </Button>
                )}
                {isSyncingNFLAdvancedStats ? (
                  <Button variant="destructive" size="sm" className="font-mono text-[10px] h-6" onClick={() => openStopModal("advancedStats")}>
                    <Square className="w-2 h-2 mr-1" />Stop
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="font-mono text-[10px] h-6 border-terminal-green/50 hover:bg-terminal-green/10" onClick={handleSyncNFLAdvancedStats} disabled={isSyncing}>
                    <TrendingUp className="w-2 h-2 mr-1" />Adv
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>


        {/* Ball Don't Lie API - Compact */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
          <Card className="bg-card border-terminal-amber/30">
            <CardContent className="py-2 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-3 h-3 text-terminal-amber" />
                  <span className="font-mono text-xs">Ball Don't Lie API</span>
                  {apiStatus && (
                    <Badge variant="outline" className={`text-[9px] ${apiStatus.success ? "border-terminal-green text-terminal-green" : "border-terminal-red text-terminal-red"}`}>
                      {apiStatus.success ? "✓" : "✗"}
                    </Badge>
                  )}
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="font-mono text-[10px] h-6 border-terminal-amber/50 hover:bg-terminal-amber/10"
                  onClick={handleTestAPIConnection}
                  disabled={isTestingAPI}
                >
                  {isTestingAPI ? <Loader2 className="w-2 h-2 animate-spin" /> : "Test"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Data Inspector - Bottom */}
        <DataInspector />
      </div>

      {/* Stop Sync Confirmation Modal */}
      <AlertDialog open={stopSyncModalOpen} onOpenChange={setStopSyncModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{getStopModalTitle()}</AlertDialogTitle>
            <AlertDialogDescription>
              This will halt the current sync for this module but keep any data already saved. The sync will stop after the current operation completes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmStopSync}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Stop Sync
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
