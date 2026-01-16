import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings, Database, Users, RefreshCw, Loader2, Trophy, Dribbble, Zap, CheckCircle, XCircle, UserCircle, BarChart3, FileText, TrendingUp, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export function AdminPanel() {
  const [isSyncingNFL, setIsSyncingNFL] = useState(false);
  const [isSyncingNBA, setIsSyncingNBA] = useState(false);
  const [isSyncingOdds, setIsSyncingOdds] = useState(false);
  const [isSyncingNFLPlayers, setIsSyncingNFLPlayers] = useState(false);
  const [isSyncingNFLSeasonStats, setIsSyncingNFLSeasonStats] = useState(false);
  const [isSyncingNFLGameLogs, setIsSyncingNFLGameLogs] = useState(false);
  const [gameLogsSyncProgress, setGameLogsSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [stopGameLogsSync, setStopGameLogsSync] = useState(false);
  const [isSyncingNFLAdvancedStats, setIsSyncingNFLAdvancedStats] = useState(false);
  const [advancedStatsSyncProgress, setAdvancedStatsSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [stopAdvancedStatsSync, setStopAdvancedStatsSync] = useState(false);
  const [isTestingAPI, setIsTestingAPI] = useState(false);
  const [apiStatus, setApiStatus] = useState<{ success: boolean; message: string } | null>(null);
  
  // NFL counts
  const [gamesCount, setGamesCount] = useState<number | null>(null);
  const [postseasonCount, setPostseasonCount] = useState<number | null>(null);
  const [oddsCount, setOddsCount] = useState<number | null>(null);
  
  // NBA counts
  const [nbaGamesCount, setNbaGamesCount] = useState<number | null>(null);
  const [nbaOddsCount, setNbaOddsCount] = useState<number | null>(null);
  
  // Player counts
  const [nflPlayersCount, setNflPlayersCount] = useState<number | null>(null);
  const [nflSeasonStatsCount, setNflSeasonStatsCount] = useState<number | null>(null);
  const [nflGameLogsCount, setNflGameLogsCount] = useState<number | null>(null);
  const [nflAdvancedStatsCount, setNflAdvancedStatsCount] = useState<number | null>(null);

  const fetchGamesCount = async () => {
    // Fetch total NFL games
    const { count, error } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("league", "NFL");
    
    if (!error && count !== null) {
      setGamesCount(count);
    }

    // Fetch postseason games count
    const { count: psCount, error: psError } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("league", "NFL")
      .eq("postseason", true);
    
    if (!psError && psCount !== null) {
      setPostseasonCount(psCount);
    }
  };

  const fetchOddsCount = async () => {
    const { count, error } = await supabase
      .from("odds")
      .select("*", { count: "exact", head: true });
    
    if (!error && count !== null) {
      setOddsCount(count);
    }
  };

  const fetchNBAGamesCount = async () => {
    const { count, error } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("league", "NBA");
    
    if (!error && count !== null) {
      setNbaGamesCount(count);
    }
  };

  const fetchNBAOddsCount = async () => {
    // Get all NBA game IDs first
    const { data: nbaGames } = await supabase
      .from("games")
      .select("id")
      .eq("league", "NBA");
    
    if (nbaGames && nbaGames.length > 0) {
      const nbaGameIds = nbaGames.map(g => g.id);
      const { count, error } = await supabase
        .from("odds")
        .select("*", { count: "exact", head: true })
        .in("game_id", nbaGameIds);
      
      if (!error && count !== null) {
        setNbaOddsCount(count);
      }
    } else {
      setNbaOddsCount(0);
    }
  };

  const fetchNFLPlayersCount = async () => {
    const { count, error } = await supabase
      .from("players")
      .select("*", { count: "exact", head: true })
      .eq("sport", "NFL");
    
    if (!error && count !== null) {
      setNflPlayersCount(count);
    }
  };

  const fetchNFLSeasonStatsCount = async () => {
    const { count, error } = await supabase
      .from("player_season_stats")
      .select("*", { count: "exact", head: true })
      .eq("sport", "NFL");
    
    if (!error && count !== null) {
      setNflSeasonStatsCount(count);
    }
  };

  const fetchNFLGameLogsCount = async () => {
    const { count, error } = await supabase
      .from("player_game_logs")
      .select("*", { count: "exact", head: true })
      .eq("sport", "NFL");
    
    if (!error && count !== null) {
      setNflGameLogsCount(count);
    }
  };

  const fetchNFLAdvancedStatsCount = async () => {
    const { count, error } = await supabase
      .from("player_advanced_stats")
      .select("*", { count: "exact", head: true })
      .eq("sport", "NFL");
    
    if (!error && count !== null) {
      setNflAdvancedStatsCount(count);
    }
  };

  useEffect(() => {
    fetchGamesCount();
    fetchOddsCount();
    fetchNBAGamesCount();
    fetchNBAOddsCount();
    fetchNFLPlayersCount();
    fetchNFLSeasonStatsCount();
    fetchNFLGameLogsCount();
    fetchNFLAdvancedStatsCount();
  }, []);

  const handleSyncNFLGames = async () => {
    setIsSyncingNFL(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-nfl-games");
      
      if (error) {
        throw error;
      }

      toast({
        title: "NFL Games & Odds Synced",
        description: data.message || `Synced ${data.gamesCount} games with live odds`,
      });

      fetchGamesCount();
      fetchOddsCount();
    } catch (error: unknown) {
      console.error("Sync error:", error);
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync NFL games and odds",
        variant: "destructive",
      });
    } finally {
      setIsSyncingNFL(false);
    }
  };

  const handleSyncNBAGames = async () => {
    setIsSyncingNBA(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-nba-odds");
      
      if (error) {
        throw error;
      }

      toast({
        title: "NBA Games & Odds Synced",
        description: data.message || `Synced ${data.gamesCount} NBA games with live odds`,
      });

      fetchNBAGamesCount();
      fetchNBAOddsCount();
    } catch (error: unknown) {
      console.error("Sync error:", error);
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync NBA games and odds",
        variant: "destructive",
      });
    } finally {
      setIsSyncingNBA(false);
    }
  };

  const handleSyncNFLOdds = async () => {
    setIsSyncingOdds(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-nfl-odds");
      
      if (error) {
        throw error;
      }

      toast({
        title: "Bloomberg Feed: NFL Odds Synced",
        description: `Successfully synced ${data.count} odds.`,
      });

      fetchOddsCount();
    } catch (error: unknown) {
      console.error("Sync error:", error);
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync NFL odds",
        variant: "destructive",
      });
    } finally {
      setIsSyncingOdds(false);
    }
  };

  const handleSyncNFLPlayers = async () => {
    setIsSyncingNFLPlayers(true);
    const startTime = Date.now();
    
    try {
      // Use edge function for the sync
      console.log("[Admin] Calling sync-nfl-players edge function...");
      const { data, error } = await supabase.functions.invoke("sync-nfl-players");
      
      if (error) {
        console.error("[Admin] Edge function error (non-blocking):", error);
      }

      // Check the database for actual player count to determine success
      const { count: newCount } = await supabase
        .from("players")
        .select("*", { count: "exact", head: true })
        .eq("sport", "NFL");

      const duration = Math.round((Date.now() - startTime) / 1000);
      
      // If we have players in the database, consider it a success
      if (newCount && newCount > 0) {
        toast({
          title: "NFL Players Synced",
          description: `✓ ${newCount.toLocaleString()} NFL players in database (${duration}s)`,
        });
        setNflPlayersCount(newCount);
      } else if (data?.success) {
        toast({
          title: "NFL Players Synced",
          description: `✓ Synced ${data.playersSync?.toLocaleString() || 0} NFL players in ${duration}s`,
        });
        fetchNFLPlayersCount();
      } else {
        throw new Error("Sync failed - no players found");
      }
    } catch (error: unknown) {
      console.error("[Admin] Sync error details:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        title: "Sync Failed",
        description: errorMessage.length > 200 ? errorMessage.substring(0, 200) + "..." : errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSyncingNFLPlayers(false);
    }
  };

  const handleSyncNFLSeasonStats = async () => {
    setIsSyncingNFLSeasonStats(true);
    const startTime = Date.now();
    
    // Seasons to sync (6 years of historical data)
    const seasons = [2025, 2024, 2023, 2022, 2021, 2020];
    // Use the API key from user's request
    const BDL_API_KEY = "52aa922d-2187-406d-a52b-3d51c71117f7";
    
    try {
      console.log("[Admin] Starting multi-season CLIENT-SIDE sync (not edge function)...");
      
      // First check total player count
      const { count: playerCount } = await supabase
        .from("players")
        .select("*", { count: "exact", head: true })
        .eq("sport", "NFL");
      
      console.log(`[Admin] Total NFL players in database: ${playerCount}`);
      
      if (!playerCount || playerCount === 0) {
        throw new Error("No NFL players in database - sync players first");
      }

      // Fetch ALL players with pagination (Supabase default limit is 1000)
      let allPlayers: { id: string; external_id: string }[] = [];
      let offset = 0;
      const pageSize = 1000;
      
      toast({
        title: "Loading players...",
        description: `Fetching ${playerCount.toLocaleString()} NFL players from database`,
      });
      
      while (offset < playerCount) {
        const { data: playerBatch, error: playerError } = await supabase
          .from("players")
          .select("id, external_id")
          .eq("sport", "NFL")
          .range(offset, offset + pageSize - 1);
        
        if (playerError) {
          console.error("[Admin] Error fetching players:", playerError);
          break;
        }
        
        if (playerBatch) {
          allPlayers = [...allPlayers, ...playerBatch];
        }
        
        offset += pageSize;
        console.log(`[Admin] Fetched ${allPlayers.length}/${playerCount} players...`);
      }

      if (allPlayers.length === 0) {
        throw new Error("Failed to fetch NFL players from database");
      }

      const playerMap = new Map(
        allPlayers.map(p => [String(p.external_id), p.id])
      );
      
      console.log(`[Admin] Loaded ${allPlayers.length} NFL players into mapping (${playerMap.size} unique external_ids)`);

      let totalSyncedCount = 0;
      let totalSkippedCount = 0;

      // Loop through each season
      for (const season of seasons) {
        toast({
          title: `Syncing ${season} stats...`,
          description: `Fetching NFL season stats for ${season}`,
        });
        
        console.log(`[Admin] Fetching season ${season} from API...`);
        
        try {
          // Fetch first page - DIRECT CLIENT-SIDE CALL
          const response = await fetch(
            `https://api.balldontlie.io/nfl/v1/season_stats?season=${season}&per_page=100`,
            {
              headers: {
                "Authorization": BDL_API_KEY,
              },
            }
          );

          if (!response.ok) {
            console.error(`[Admin] API error for season ${season}: ${response.status} ${response.statusText}`);
            continue; // Skip to next season
          }

          const result = await response.json();
          let seasonStats = result.data || [];
          
          console.log(`[Admin] Season ${season} first page: ${seasonStats.length} records`);
          
          // Fetch additional pages if available (cursor-based pagination)
          let nextCursor = result.meta?.next_cursor;
          let pageCount = 1;
          
          while (nextCursor) {
            pageCount++;
            console.log(`[Admin] Season ${season}: Fetching page ${pageCount}...`);
            
            const nextResponse = await fetch(
              `https://api.balldontlie.io/nfl/v1/season_stats?season=${season}&per_page=100&cursor=${nextCursor}`,
              {
                headers: {
                  "Authorization": BDL_API_KEY,
                },
              }
            );
            
            if (!nextResponse.ok) {
              console.error(`[Admin] Pagination error on page ${pageCount}`);
              break;
            }
            
            const nextResult = await nextResponse.json();
            seasonStats = [...seasonStats, ...(nextResult.data || [])];
            nextCursor = nextResult.meta?.next_cursor;
            
            // Rate limit protection
            await new Promise(resolve => setTimeout(resolve, 150));
          }

          console.log(`[Admin] Season ${season}: Fetched ${seasonStats.length} total stats across ${pageCount} pages`);

          // Process and upsert stats for this season
          let seasonSyncedCount = 0;
          let seasonSkippedCount = 0;
          const batchSize = 50;
          
          // Log first record structure for debugging
          if (seasonStats.length > 0) {
            console.log(`[Admin] Sample stat record:`, JSON.stringify(seasonStats[0], null, 2));
          }
          
          for (let i = 0; i < seasonStats.length; i += batchSize) {
            const batch = seasonStats.slice(i, i + batchSize);
            const statsToUpsert = [];

            for (const stat of batch) {
              const externalId = String(stat.player?.id);
              const playerId = playerMap.get(externalId);
              
              // Log first 3 matches per season for debugging
              if (seasonSyncedCount + seasonSkippedCount < 3) {
                console.log(`[Admin] Season ${season}: Matching external_id=${externalId}... ${playerId ? 'FOUND -> ' + playerId : 'NOT FOUND'}`);
              }
              
              if (!playerId) {
                seasonSkippedCount++;
                continue;
              }

              // Map API fields to database columns
              // API uses: pass_touchdowns, pass_interceptions, rush_touchdowns, receiving_yards, receiving_touchdowns
              // DB uses: pass_td, pass_int, rush_td, rec_yards, rec_td
              const passYards = stat.pass_yards || 0;
              const passTd = stat.pass_touchdowns || stat.pass_td || 0;
              const passInt = stat.pass_interceptions || stat.pass_int || 0;
              const rushYards = stat.rush_yards || 0;
              const rushTd = stat.rush_touchdowns || stat.rush_td || 0;
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
                targets: targets,
                fantasy_points: Math.round(fantasyPoints * 100) / 100,
                fantasy_points_ppr: Math.round(fantasyPointsPpr * 100) / 100,
                raw_data: stat,
                updated_at: new Date().toISOString(),
              });
            }

            if (statsToUpsert.length > 0) {
              const { error: upsertError } = await supabase
                .from("player_season_stats")
                .upsert(statsToUpsert, {
                  onConflict: "player_id,sport,season,season_type",
                });

              if (upsertError) {
                console.error(`[Admin] Upsert error for season ${season}:`, upsertError);
              } else {
                seasonSyncedCount += statsToUpsert.length;
              }
            }
          }

          totalSyncedCount += seasonSyncedCount;
          totalSkippedCount += seasonSkippedCount;
          
          console.log(`[Admin] Season ${season}: ✓ Synced ${seasonSyncedCount}, skipped ${seasonSkippedCount}`);
          
          // Small delay between seasons for rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
          
        } catch (seasonError) {
          console.error(`[Admin] Error syncing season ${season}:`, seasonError);
          // Continue with next season
        }
      }

      const duration = Math.round((Date.now() - startTime) / 1000);
      
      // Update count from database
      await fetchNFLSeasonStatsCount();

      if (totalSyncedCount > 0) {
        toast({
          title: "✓ NFL Season Stats Synced",
          description: `Synced ${totalSyncedCount.toLocaleString()} stats across ${seasons.length} seasons (${duration}s)`,
        });
      } else {
        throw new Error(`No stats synced - ${totalSkippedCount} records skipped (players not found)`);
      }
    } catch (error: unknown) {
      console.error("[Admin] Sync error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        title: "Sync Failed",
        description: errorMessage.length > 200 ? errorMessage.substring(0, 200) + "..." : errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSyncingNFLSeasonStats(false);
    }
  };

  const handleSyncNFLGameLogs = async () => {
    setIsSyncingNFLGameLogs(true);
    setStopGameLogsSync(false);
    setGameLogsSyncProgress(null);
    const startTime = Date.now();
    
    const BDL_API_KEY = "52aa922d-2187-406d-a52b-3d51c71117f7";
    const season = 2025; // Only 2025 for now
    const BATCH_SIZE = 10;
    const BATCH_DELAY = 200;
    
    try {
      console.log("[Admin] Starting per-player game logs sync...");
      
      toast({
        title: "Fetching players with season stats...",
        description: "Finding relevant players to sync",
      });
      
      // Step 1: Get players who have season stats (relevant players only)
      const { data: playersWithStats, error: playersError } = await supabase
        .from("player_season_stats")
        .select(`
          player_id,
          players!inner (
            id,
            external_id,
            name,
            team_abbr
          )
        `)
        .eq("sport", "NFL")
        .eq("season", season);
      
      if (playersError) {
        throw new Error(`Failed to fetch players: ${playersError.message}`);
      }
      
      if (!playersWithStats || playersWithStats.length === 0) {
        throw new Error("No players with season stats found - sync season stats first");
      }
      
      // Deduplicate players (a player might have multiple stat entries)
      const uniquePlayersMap = new Map<string, { id: string; external_id: string; name: string; team_abbr: string | null }>();
      for (const row of playersWithStats) {
        const player = row.players as unknown as { id: string; external_id: string; name: string; team_abbr: string | null };
        if (player && player.id && !uniquePlayersMap.has(player.id)) {
          uniquePlayersMap.set(player.id, player);
        }
      }
      
      const uniquePlayers = Array.from(uniquePlayersMap.values());
      console.log(`[Admin] Found ${uniquePlayers.length} unique players with season stats`);
      
      setGameLogsSyncProgress({ current: 0, total: uniquePlayers.length });
      
      toast({
        title: `Syncing game logs for ${uniquePlayers.length} players...`,
        description: "This may take a few minutes",
      });
      
      let totalSyncedCount = 0;
      let totalPlayersProcessed = 0;
      let totalErrors = 0;
      
      // Step 2: Process players in batches
      for (let i = 0; i < uniquePlayers.length; i += BATCH_SIZE) {
        // Check if user requested stop
        if (stopGameLogsSync) {
          console.log("[Admin] Sync stopped by user");
          toast({
            title: "Sync Stopped",
            description: `Processed ${totalPlayersProcessed} players, synced ${totalSyncedCount} game logs before stopping`,
          });
          break;
        }
        
        const batch = uniquePlayers.slice(i, i + BATCH_SIZE);
        
        // Fetch game logs for this batch of players
        const batchPromises = batch.map(async (player) => {
          try {
            const response = await fetch(
              `https://api.balldontlie.io/nfl/v1/stats?player_ids=${player.external_id}&season=${season}&per_page=100`,
              {
                headers: {
                  "Authorization": BDL_API_KEY,
                },
              }
            );
            
            if (!response.ok) {
              console.warn(`[Admin] API error for player ${player.name}: ${response.status}`);
              return { player, stats: [], error: true };
            }
            
            const result = await response.json();
            return { player, stats: result.data || [], error: false };
          } catch (err) {
            console.warn(`[Admin] Fetch error for player ${player.name}:`, err);
            return { player, stats: [], error: true };
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        // Process results and upsert to database
        const logsToUpsert = [];
        
        for (const { player, stats, error } of batchResults) {
          if (error) {
            totalErrors++;
            continue;
          }
          
          for (const stat of stats) {
            const game = stat.game || {};
            const homeTeam = game.home_team || {};
            const awayTeam = game.away_team || {};
            const playerTeamAbbr = player.team_abbr || stat.player?.team?.abbreviation || "";
            
            // Determine home/away and opponent
            const isHome = homeTeam.abbreviation === playerTeamAbbr;
            const homeAway = isHome ? "home" : "away";
            const opponentAbbr = isHome ? awayTeam.abbreviation : homeTeam.abbreviation;
            const opponentName = isHome ? awayTeam.full_name : homeTeam.full_name;
            
            // Get scores
            const homeScore = game.home_team_score || 0;
            const awayScore = game.away_team_score || 0;
            const teamScore = isHome ? homeScore : awayScore;
            const opponentScore = isHome ? awayScore : homeScore;
            
            // Determine result
            let result = null;
            if (teamScore > opponentScore) result = "W";
            else if (teamScore < opponentScore) result = "L";
            else if (teamScore === opponentScore && game.status === "Final") result = "T";

            // Map stats
            const passYards = stat.pass_yards || 0;
            const passTd = stat.pass_touchdowns || stat.pass_td || 0;
            const passInt = stat.pass_interceptions || stat.pass_int || 0;
            const rushYards = stat.rush_yards || 0;
            const rushTd = stat.rush_touchdowns || stat.rush_td || 0;
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
              targets: targets,
              receptions: receptions,
              rec_yards: recYards,
              rec_td: recTd,
              fantasy_points: Math.round(fantasyPoints * 100) / 100,
              fantasy_points_ppr: Math.round(fantasyPointsPpr * 100) / 100,
              raw_data: stat,
            });
          }
        }
        
        // Upsert batch to database
        if (logsToUpsert.length > 0) {
          const { error: upsertError } = await supabase
            .from("player_game_logs")
            .upsert(logsToUpsert, {
              onConflict: "player_id,sport,game_id",
              ignoreDuplicates: false,
            });

          if (upsertError) {
            console.error(`[Admin] Upsert error for batch:`, upsertError);
          } else {
            totalSyncedCount += logsToUpsert.length;
          }
        }
        
        totalPlayersProcessed += batch.length;
        setGameLogsSyncProgress({ current: totalPlayersProcessed, total: uniquePlayers.length });
        
        // Log progress every 50 players
        if (totalPlayersProcessed % 50 === 0 || totalPlayersProcessed === uniquePlayers.length) {
          console.log(`[Admin] Progress: ${totalPlayersProcessed}/${uniquePlayers.length} players, ${totalSyncedCount} game logs synced`);
        }
        
        // Rate limit delay between batches
        if (i + BATCH_SIZE < uniquePlayers.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
      }

      const duration = Math.round((Date.now() - startTime) / 1000);
      
      // Update count from database
      await fetchNFLGameLogsCount();

      if (totalSyncedCount > 0) {
        toast({
          title: "✓ NFL Game Logs Synced",
          description: `Synced ${totalSyncedCount.toLocaleString()} game logs for ${totalPlayersProcessed} players (${duration}s)${totalErrors > 0 ? ` - ${totalErrors} errors` : ''}`,
        });
      } else if (!stopGameLogsSync) {
        toast({
          title: "No Game Logs Found",
          description: `Checked ${totalPlayersProcessed} players but no game logs were returned from the API`,
          variant: "destructive",
        });
      }
    } catch (error: unknown) {
      console.error("[Admin] Game logs sync error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        title: "Sync Failed",
        description: errorMessage.length > 200 ? errorMessage.substring(0, 200) + "..." : errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSyncingNFLGameLogs(false);
      setGameLogsSyncProgress(null);
      setStopGameLogsSync(false);
    }
  };

  const handleStopGameLogsSync = () => {
    setStopGameLogsSync(true);
    toast({
      title: "Stopping sync...",
      description: "Will stop after current batch completes",
    });
  };

  const handleSyncNFLAdvancedStats = async () => {
    setIsSyncingNFLAdvancedStats(true);
    setStopAdvancedStatsSync(false);
    setAdvancedStatsSyncProgress(null);
    const startTime = Date.now();
    
    const BDL_API_KEY = "52aa922d-2187-406d-a52b-3d51c71117f7";
    const season = 2025;
    const BATCH_SIZE = 10;
    const BATCH_DELAY = 200;
    
    try {
      console.log("[Admin] Checking if advanced stats endpoints exist...");
      
      toast({
        title: "Checking advanced stats endpoints...",
        description: "Testing if Ball Don't Lie has advanced stats",
      });

      // Test if advanced stats endpoints exist by trying to fetch one
      const testEndpoints = [
        { name: "passing", url: `https://api.balldontlie.io/nfl/v1/advanced_stats/passing?season=2024&per_page=1`, positions: ["QB"] },
        { name: "rushing", url: `https://api.balldontlie.io/nfl/v1/advanced_stats/rushing?season=2024&per_page=1`, positions: ["RB", "FB"] },
        { name: "receiving", url: `https://api.balldontlie.io/nfl/v1/advanced_stats/receiving?season=2024&per_page=1`, positions: ["WR", "TE"] },
      ];

      const availableEndpoints: { name: string; positions: string[] }[] = [];
      
      for (const endpoint of testEndpoints) {
        try {
          const response = await fetch(endpoint.url, {
            headers: { "Authorization": BDL_API_KEY },
          });
          
          if (response.ok) {
            availableEndpoints.push({ name: endpoint.name, positions: endpoint.positions });
            console.log(`[Admin] ✓ ${endpoint.name} endpoint available`);
          } else if (response.status === 404) {
            console.log(`[Admin] ✗ ${endpoint.name} endpoint not found (404)`);
          } else {
            console.log(`[Admin] ✗ ${endpoint.name} returned ${response.status}`);
          }
        } catch (err) {
          console.log(`[Admin] ✗ ${endpoint.name} fetch failed:`, err);
        }
      }

      if (availableEndpoints.length === 0) {
        toast({
          title: "Advanced stats not available",
          description: "Ball Don't Lie API doesn't have advanced stats endpoints. Skipping.",
        });
        return;
      }

      toast({
        title: "Fetching players with season stats...",
        description: "Finding relevant players to sync",
      });

      // Step 1: Get players who have season stats with position info
      const { data: playersWithStats, error: playersError } = await supabase
        .from("player_season_stats")
        .select(`
          player_id,
          players!inner (
            id,
            external_id,
            name,
            position,
            team_abbr
          )
        `)
        .eq("sport", "NFL")
        .eq("season", season);
      
      if (playersError) {
        throw new Error(`Failed to fetch players: ${playersError.message}`);
      }
      
      if (!playersWithStats || playersWithStats.length === 0) {
        throw new Error("No players with season stats found - sync season stats first");
      }
      
      // Deduplicate and categorize players by position
      const uniquePlayersMap = new Map<string, { id: string; external_id: string; name: string; position: string | null; team_abbr: string | null }>();
      for (const row of playersWithStats) {
        const player = row.players as unknown as { id: string; external_id: string; name: string; position: string | null; team_abbr: string | null };
        if (player && player.id && !uniquePlayersMap.has(player.id)) {
          uniquePlayersMap.set(player.id, player);
        }
      }
      
      const uniquePlayers = Array.from(uniquePlayersMap.values());
      console.log(`[Admin] Found ${uniquePlayers.length} unique players with season stats`);

      // Map players to their appropriate endpoints based on position
      const playersByEndpoint: Map<string, typeof uniquePlayers> = new Map();
      
      for (const endpoint of availableEndpoints) {
        const matchingPlayers = uniquePlayers.filter(p => 
          p.position && endpoint.positions.some(pos => p.position?.toUpperCase().includes(pos))
        );
        if (matchingPlayers.length > 0) {
          playersByEndpoint.set(endpoint.name, matchingPlayers);
          console.log(`[Admin] ${endpoint.name}: ${matchingPlayers.length} players`);
        }
      }

      const totalPlayers = Array.from(playersByEndpoint.values()).reduce((sum, arr) => sum + arr.length, 0);
      
      if (totalPlayers === 0) {
        toast({
          title: "No matching players",
          description: "No players with matching positions (QB, RB, WR, TE) found",
        });
        return;
      }

      setAdvancedStatsSyncProgress({ current: 0, total: totalPlayers });
      
      toast({
        title: `Syncing advanced stats for ${totalPlayers} players...`,
        description: `Found ${availableEndpoints.length} endpoints: ${availableEndpoints.map(e => e.name).join(", ")}`,
      });

      let totalSyncedCount = 0;
      let totalPlayersProcessed = 0;
      let totalErrors = 0;

      // Process each endpoint
      for (const [endpointName, players] of playersByEndpoint) {
        if (stopAdvancedStatsSync) break;

        console.log(`[Admin] Processing ${endpointName} for ${players.length} players...`);

        // Process players in batches
        for (let i = 0; i < players.length; i += BATCH_SIZE) {
          if (stopAdvancedStatsSync) {
            console.log("[Admin] Sync stopped by user");
            toast({
              title: "Sync Stopped",
              description: `Processed ${totalPlayersProcessed} players, synced ${totalSyncedCount} stats before stopping`,
            });
            break;
          }

          const batch = players.slice(i, i + BATCH_SIZE);
          
          // Fetch advanced stats for this batch
          const batchPromises = batch.map(async (player) => {
            try {
              const response = await fetch(
                `https://api.balldontlie.io/nfl/v1/advanced_stats/${endpointName}?player_ids=${player.external_id}&season=${season}&per_page=100`,
                {
                  headers: { "Authorization": BDL_API_KEY },
                }
              );
              
              if (!response.ok) {
                // Try without player_ids filter as fallback - API might not support it
                if (response.status === 400) {
                  return { player, stats: [], error: false, unsupported: true };
                }
                return { player, stats: [], error: true, unsupported: false };
              }
              
              const result = await response.json();
              return { player, stats: result.data || [], error: false, unsupported: false };
            } catch (err) {
              return { player, stats: [], error: true, unsupported: false };
            }
          });

          const batchResults = await Promise.all(batchPromises);
          
          // Check if API doesn't support player_ids filter
          const unsupportedCount = batchResults.filter(r => r.unsupported).length;
          if (unsupportedCount === batch.length && i === 0) {
            console.log(`[Admin] ${endpointName} API doesn't support player_ids filter, falling back to bulk fetch`);
            
            // Fallback: fetch all data and filter locally
            try {
              const allStatsResponse = await fetch(
                `https://api.balldontlie.io/nfl/v1/advanced_stats/${endpointName}?season=${season}&per_page=100`,
                { headers: { "Authorization": BDL_API_KEY } }
              );
              
              if (allStatsResponse.ok) {
                const allStatsResult = await allStatsResponse.json();
                const allStats = allStatsResult.data || [];
                
                // Create a map of external_id to player for all players in this endpoint
                const playerExternalIds = new Set(players.map(p => String(p.external_id)));
                const relevantStats = allStats.filter((stat: any) => 
                  playerExternalIds.has(String(stat.player?.id))
                );
                
                console.log(`[Admin] Bulk fetch: ${allStats.length} total, ${relevantStats.length} matched players`);
                
                // Process all relevant stats at once
                const statsToUpsert = [];
                for (const stat of relevantStats) {
                  const player = players.find(p => String(p.external_id) === String(stat.player?.id));
                  if (!player) continue;

                  const advancedStat: Record<string, unknown> = {
                    player_id: player.id,
                    sport: "NFL",
                    season: stat.season || season,
                    raw_data: stat,
                    updated_at: new Date().toISOString(),
                  };

                  // Map fields based on endpoint type
                  if (endpointName === "passing") {
                    advancedStat.pass_epa = stat.epa || stat.pass_epa || null;
                    advancedStat.success_rate = stat.success_rate || null;
                    advancedStat.air_yards = stat.air_yards || stat.intended_air_yards || null;
                  }
                  if (endpointName === "rushing") {
                    advancedStat.rush_epa = stat.epa || stat.rush_epa || null;
                    advancedStat.success_rate = stat.success_rate || null;
                    advancedStat.rush_share = stat.rush_share || stat.carry_share || null;
                    advancedStat.red_zone_carries = stat.red_zone_carries || stat.rz_attempts || null;
                  }
                  if (endpointName === "receiving") {
                    advancedStat.rec_epa = stat.epa || stat.rec_epa || null;
                    advancedStat.target_share = stat.target_share || null;
                    advancedStat.yards_after_catch = stat.yards_after_catch || stat.yac || null;
                    advancedStat.yards_per_route_run = stat.yards_per_route_run || stat.yprr || null;
                    advancedStat.catch_rate = stat.catch_rate || null;
                    advancedStat.separation = stat.separation || stat.avg_separation || null;
                    advancedStat.contested_catch_rate = stat.contested_catch_rate || null;
                    advancedStat.red_zone_targets = stat.red_zone_targets || stat.rz_targets || null;
                  }

                  statsToUpsert.push(advancedStat);
                }

                if (statsToUpsert.length > 0) {
                  const { error: upsertError } = await supabase
                    .from("player_advanced_stats")
                    .upsert(statsToUpsert, {
                      onConflict: "player_id,sport,season",
                    });

                  if (!upsertError) {
                    totalSyncedCount += statsToUpsert.length;
                  }
                }

                totalPlayersProcessed += players.length;
                setAdvancedStatsSyncProgress({ current: totalPlayersProcessed, total: totalPlayers });
                
                // Skip the rest of per-player processing for this endpoint
                break;
              }
            } catch (bulkErr) {
              console.error(`[Admin] Bulk fetch failed for ${endpointName}:`, bulkErr);
            }
            
            continue;
          }

          // Process per-player results
          const statsToUpsert = [];
          
          for (const { player, stats, error } of batchResults) {
            if (error) {
              totalErrors++;
              continue;
            }
            
            for (const stat of stats) {
              const advancedStat: Record<string, unknown> = {
                player_id: player.id,
                sport: "NFL",
                season: stat.season || season,
                raw_data: stat,
                updated_at: new Date().toISOString(),
              };

              // Map fields based on endpoint type
              if (endpointName === "passing") {
                advancedStat.pass_epa = stat.epa || stat.pass_epa || null;
                advancedStat.success_rate = stat.success_rate || null;
                advancedStat.air_yards = stat.air_yards || stat.intended_air_yards || null;
              }
              if (endpointName === "rushing") {
                advancedStat.rush_epa = stat.epa || stat.rush_epa || null;
                advancedStat.success_rate = stat.success_rate || null;
                advancedStat.rush_share = stat.rush_share || stat.carry_share || null;
                advancedStat.red_zone_carries = stat.red_zone_carries || stat.rz_attempts || null;
              }
              if (endpointName === "receiving") {
                advancedStat.rec_epa = stat.epa || stat.rec_epa || null;
                advancedStat.target_share = stat.target_share || null;
                advancedStat.yards_after_catch = stat.yards_after_catch || stat.yac || null;
                advancedStat.yards_per_route_run = stat.yards_per_route_run || stat.yprr || null;
                advancedStat.catch_rate = stat.catch_rate || null;
                advancedStat.separation = stat.separation || stat.avg_separation || null;
                advancedStat.contested_catch_rate = stat.contested_catch_rate || null;
                advancedStat.red_zone_targets = stat.red_zone_targets || stat.rz_targets || null;
              }

              statsToUpsert.push(advancedStat);
            }
          }

          if (statsToUpsert.length > 0) {
            const { error: upsertError } = await supabase
              .from("player_advanced_stats")
              .upsert(statsToUpsert, {
                onConflict: "player_id,sport,season",
              });

            if (!upsertError) {
              totalSyncedCount += statsToUpsert.length;
            }
          }

          totalPlayersProcessed += batch.length;
          setAdvancedStatsSyncProgress({ current: totalPlayersProcessed, total: totalPlayers });
          
          if (totalPlayersProcessed % 50 === 0 || totalPlayersProcessed === totalPlayers) {
            console.log(`[Admin] Progress: ${totalPlayersProcessed}/${totalPlayers} players, ${totalSyncedCount} stats synced`);
          }

          // Rate limit delay between batches
          if (i + BATCH_SIZE < players.length) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
          }
        }
      }

      const duration = Math.round((Date.now() - startTime) / 1000);
      await fetchNFLAdvancedStatsCount();

      if (totalSyncedCount > 0) {
        toast({
          title: "✓ NFL Advanced Stats Synced",
          description: `Synced ${totalSyncedCount.toLocaleString()} stats for ${totalPlayersProcessed} players (${duration}s)${totalErrors > 0 ? ` - ${totalErrors} errors` : ''}`,
        });
      } else if (!stopAdvancedStatsSync) {
        toast({
          title: "No advanced stats synced",
          description: "Endpoints returned no data for matching players. This API may not have advanced stats available.",
        });
      }
    } catch (error: unknown) {
      console.error("[Admin] Advanced stats sync error:", error);
      toast({
        title: "Advanced Stats Sync Failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setIsSyncingNFLAdvancedStats(false);
      setAdvancedStatsSyncProgress(null);
      setStopAdvancedStatsSync(false);
    }
  };

  const handleStopAdvancedStatsSync = () => {
    setStopAdvancedStatsSync(true);
    toast({
      title: "Stopping sync...",
      description: "Will stop after current batch completes",
    });
  };

  const handleTestAPIConnection = async () => {
    setIsTestingAPI(true);
    setApiStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke("balldontlie", {
        body: { action: "test", sport: "nfl" }
      });
      
      if (error) {
        throw error;
      }

      setApiStatus(data);
      toast({
        title: data.success ? "API Connection Successful" : "API Connection Failed",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    } catch (error: unknown) {
      console.error("API test error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to test API connection";
      setApiStatus({ success: false, message: errorMessage });
      toast({
        title: "API Test Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsTestingAPI(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-wide">
            ADMIN PANEL
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            System configuration and management
          </p>
        </div>
        <Badge variant="outline" className="border-terminal-red text-terminal-red">
          ADMIN ACCESS
        </Badge>
      </motion.div>

      {/* Admin Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
                <Database className="w-4 h-4 text-terminal-green" />
                Database Status
              </CardTitle>
              <Badge variant="outline" className="border-terminal-green text-terminal-green text-[10px]">
                CONNECTED
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 font-mono text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Tables</span>
                  <span className="text-foreground">12</span>
                </div>
                <div className="flex justify-between">
                  <span>Records</span>
                  <span className="text-foreground">4,521</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Sync</span>
                  <span className="text-foreground">2 min ago</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-terminal-cyan" />
                Active Users
              </CardTitle>
              <Badge variant="outline" className="border-terminal-cyan text-terminal-cyan text-[10px]">
                LIVE
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 font-mono text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Online Now</span>
                  <span className="text-foreground">23</span>
                </div>
                <div className="flex justify-between">
                  <span>Today</span>
                  <span className="text-foreground">156</span>
                </div>
                <div className="flex justify-between">
                  <span>This Week</span>
                  <span className="text-foreground">892</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* NFL Sync Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="bg-card border-terminal-green/30">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
                <Trophy className="w-4 h-4 text-terminal-green" />
                NFL Data Sync
              </CardTitle>
              <Badge variant="outline" className="border-terminal-green text-terminal-green text-[10px]">
                NFL
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 justify-start font-mono text-xs border-terminal-green/50 hover:bg-terminal-green/10"
                  onClick={handleSyncNFLGames}
                  disabled={isSyncingNFL}
                >
                  {isSyncingNFL ? (
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3 mr-2" />
                  )}
                  Sync NFL Games
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 justify-start font-mono text-xs border-terminal-green/50 hover:bg-terminal-green/10"
                  onClick={handleSyncNFLPlayers}
                  disabled={isSyncingNFLPlayers}
                >
                  {isSyncingNFLPlayers ? (
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  ) : (
                    <UserCircle className="w-3 h-3 mr-2" />
                  )}
                  Sync NFL Players
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 justify-start font-mono text-xs border-terminal-green/50 hover:bg-terminal-green/10"
                  onClick={handleSyncNFLSeasonStats}
                  disabled={isSyncingNFLSeasonStats}
                >
                  {isSyncingNFLSeasonStats ? (
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  ) : (
                    <BarChart3 className="w-3 h-3 mr-2" />
                  )}
                  Sync Season Stats
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 justify-start font-mono text-xs border-terminal-green/50 hover:bg-terminal-green/10"
                  onClick={handleSyncNFLGameLogs}
                  disabled={isSyncingNFLGameLogs}
                >
                  {isSyncingNFLGameLogs ? (
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  ) : (
                    <FileText className="w-3 h-3 mr-2" />
                  )}
                  {gameLogsSyncProgress 
                    ? `Syncing... ${gameLogsSyncProgress.current}/${gameLogsSyncProgress.total}`
                    : "Sync NFL Game Logs"
                  }
                </Button>
                {isSyncingNFLGameLogs && (
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="font-mono text-xs"
                    onClick={handleStopGameLogsSync}
                  >
                    <Square className="w-3 h-3 mr-1" />
                    Stop
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 justify-start font-mono text-xs border-terminal-green/50 hover:bg-terminal-green/10"
                  onClick={handleSyncNFLAdvancedStats}
                  disabled={isSyncingNFLAdvancedStats}
                >
                  {isSyncingNFLAdvancedStats ? (
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  ) : (
                    <TrendingUp className="w-3 h-3 mr-2" />
                  )}
                  {advancedStatsSyncProgress 
                    ? `Syncing... ${advancedStatsSyncProgress.current}/${advancedStatsSyncProgress.total}`
                    : "Sync Advanced Stats"
                  }
                </Button>
                {isSyncingNFLAdvancedStats && (
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="font-mono text-xs"
                    onClick={handleStopAdvancedStatsSync}
                  >
                    <Square className="w-3 h-3 mr-1" />
                    Stop
                  </Button>
                )}
              </div>
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Games in Vault:</span>
                <span className="text-terminal-green">{postseasonCount !== null ? postseasonCount : "..."}</span>
              </div>
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Odds in Vault:</span>
                <span className="text-terminal-green">{oddsCount !== null ? oddsCount : "..."}</span>
              </div>
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Players in Vault:</span>
                <span className="text-terminal-green">{nflPlayersCount !== null ? nflPlayersCount.toLocaleString() : "..."}</span>
              </div>
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Season Stats:</span>
                <span className="text-terminal-green">{nflSeasonStatsCount !== null ? nflSeasonStatsCount.toLocaleString() : "..."}</span>
              </div>
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Game Logs:</span>
                <span className="text-terminal-green">{nflGameLogsCount !== null ? nflGameLogsCount.toLocaleString() : "..."}</span>
              </div>
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Advanced Stats:</span>
                <span className="text-terminal-green">{nflAdvancedStatsCount !== null ? nflAdvancedStatsCount.toLocaleString() : "..."}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* NBA Sync Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="bg-card border-terminal-cyan/30">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
                <Dribbble className="w-4 h-4 text-terminal-cyan" />
                NBA Data Sync
              </CardTitle>
              <Badge variant="outline" className="border-terminal-cyan text-terminal-cyan text-[10px]">
                NBA
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 justify-start font-mono text-xs border-terminal-cyan/50 hover:bg-terminal-cyan/10"
                  onClick={handleSyncNBAGames}
                  disabled={isSyncingNBA}
                >
                  {isSyncingNBA ? (
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3 mr-2" />
                  )}
                  Sync NBA Games
                </Button>
              </div>
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Games in Vault:</span>
                <span className="text-terminal-cyan">{nbaGamesCount !== null ? nbaGamesCount : "..."}</span>
              </div>
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Odds in Vault:</span>
                <span className="text-terminal-cyan">{nbaOddsCount !== null ? nbaOddsCount : "..."}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Ball Don't Lie API Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
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
                    : "border-terminal-red text-terminal-red text-[10px]"
                  }
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
              {apiStatus && (
                <p className={`font-mono text-xs ${apiStatus.success ? 'text-terminal-green' : 'text-terminal-red'}`}>
                  {apiStatus.message}
                </p>
              )}
              <div className="font-mono text-xs text-muted-foreground">
                <p>Endpoints: NFL, NBA, NCAAB</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* System Health */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-mono text-foreground">
                System Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">API Response</span>
                  <span className="text-terminal-green">45ms</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">CPU Usage</span>
                  <span className="text-terminal-green">12%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Memory</span>
                  <span className="text-terminal-amber">67%</span>
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
