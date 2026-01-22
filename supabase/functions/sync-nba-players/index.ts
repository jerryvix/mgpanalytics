import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BDL_BASE_URL = "https://api.balldontlie.io/v1";

interface BDLPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  height: string;
  weight: string;
  jersey_number: string;
  college: string;
  country: string;
  draft_year: number;
  draft_round: number;
  draft_number: number;
  team: {
    id: number;
    conference: string;
    division: string;
    city: string;
    name: string;
    full_name: string;
    abbreviation: string;
  };
}

interface SeasonAverage {
  player_id: number;
  season: number;
  games_played: number;
  pts: number;
  ast: number;
  reb: number;
  stl: number;
  blk: number;
  turnover: number;
  min: string;
  fg_pct: number;
  fg3_pct: number;
  ft_pct: number;
}

async function bdlFetch(apiKey: string, endpoint: string): Promise<any> {
  const url = `${BDL_BASE_URL}${endpoint}`;
  console.log(`[sync-nba-players] Fetching: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      "Authorization": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[sync-nba-players] API error ${response.status}: ${errorText}`);
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  return response.json();
}

function parseMinutes(minStr: string): number {
  if (!minStr) return 0;
  const parts = minStr.split(":");
  return parts.length === 2 ? parseInt(parts[0]) + parseInt(parts[1]) / 60 : parseFloat(minStr) || 0;
}

function getPositionType(position: string): string {
  const guards = ["G", "PG", "SG"];
  const forwards = ["F", "SF", "PF"];
  if (guards.includes(position)) return "GUARD";
  if (forwards.includes(position)) return "FORWARD";
  if (position === "C") return "CENTER";
  return "GUARD"; // Default for G-F type positions
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[sync-nba-players] Starting NBA players sync...");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BDL_API_KEY = Deno.env.get("BALLDONTLIE_API_KEY");

    if (!BDL_API_KEY) {
      throw new Error("BALLDONTLIE_API_KEY not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Step 1: Get NBA games in slate window (NOW → +48h)
    const now = new Date();
    const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    console.log(`[sync-nba-players] Fetching games from ${now.toISOString()} to ${in48Hours.toISOString()}`);

    const { data: games, error: gamesError } = await supabase
      .from("nba_games")
      .select("id, home_team_name, visitor_team_name, home_team_id, visitor_team_id, date")
      .gte("date", now.toISOString())
      .lte("date", in48Hours.toISOString());

    if (gamesError) {
      throw new Error(`Failed to fetch games: ${gamesError.message}`);
    }

    if (!games || games.length === 0) {
      console.log("[sync-nba-players] No games in slate window");
      return new Response(
        JSON.stringify({ success: true, message: "No games in slate window", playersAdded: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[sync-nba-players] Found ${games.length} games in slate window`);

    // Step 2: Extract unique team IDs
    const teamIds = new Set<number>();
    const teamIdToGames: Record<number, typeof games> = {};

    for (const game of games) {
      if (game.home_team_id) {
        teamIds.add(game.home_team_id);
        if (!teamIdToGames[game.home_team_id]) teamIdToGames[game.home_team_id] = [];
        teamIdToGames[game.home_team_id].push(game);
      }
      if (game.visitor_team_id) {
        teamIds.add(game.visitor_team_id);
        if (!teamIdToGames[game.visitor_team_id]) teamIdToGames[game.visitor_team_id] = [];
        teamIdToGames[game.visitor_team_id].push(game);
      }
    }

    console.log(`[sync-nba-players] Processing ${teamIds.size} teams`);

    let playersAdded = 0;
    let playersUpdated = 0;
    const teamsProcessed: string[] = [];

    // Step 3: For each team, fetch players and season averages
    for (const teamId of Array.from(teamIds)) {
      try {
        // Fetch players for team
        const playersResponse = await bdlFetch(BDL_API_KEY, `/players?team_ids[]=${teamId}&per_page=100`);
        const players: BDLPlayer[] = playersResponse.data || [];

        if (players.length === 0) {
          console.log(`[sync-nba-players] No players found for team ${teamId}`);
          continue;
        }

        const teamName = players[0]?.team?.full_name || `Team ${teamId}`;
        teamsProcessed.push(teamName);

        // Fetch season averages for all players (2025 = 2024-25 NBA season)
        const playerIds = players.map(p => p.id);
        const seasonAvgResponse = await bdlFetch(
          BDL_API_KEY, 
          `/season_averages?season=2025&player_ids[]=${playerIds.join("&player_ids[]=")}`
        );
        const seasonAverages: SeasonAverage[] = seasonAvgResponse.data || [];

        // Create a map for quick lookup
        const statsMap = new Map<number, SeasonAverage>();
        for (const avg of seasonAverages) {
          statsMap.set(avg.player_id, avg);
        }

        // Sort players by minutes per game
        const playersWithStats = players.map(p => ({
          player: p,
          stats: statsMap.get(p.id),
          mpg: statsMap.get(p.id) ? parseMinutes(statsMap.get(p.id)!.min) : 0
        })).sort((a, b) => b.mpg - a.mpg);

        // Get games for this team
        const teamGames = teamIdToGames[teamId] || [];
        const slateStart = now;
        const slateEnd = in48Hours;

        // Step 4: Upsert players
        for (let i = 0; i < playersWithStats.length; i++) {
          const { player, stats, mpg } = playersWithStats[i];
          const isFeatured = i < 8; // Top 8 by MPG
          const featuredReason = isFeatured ? "high_usage" : null;

          const playerRecord = {
            external_id: String(player.id),
            sport: "NBA",
            name: `${player.first_name} ${player.last_name}`,
            first_name: player.first_name,
            last_name: player.last_name,
            position: player.position || "G",
            position_type: getPositionType(player.position || "G"),
            team_name: player.team?.full_name || teamName,
            team_abbr: player.team?.abbreviation || "",
            team_id: String(player.team?.id || teamId),
            jersey_number: player.jersey_number || null,
            height: player.height || null,
            weight: player.weight ? parseInt(player.weight) : null,
            college: player.college || null,
            is_featured: isFeatured,
            featured_reason: featuredReason,
            slate_window_start: slateStart.toISOString(),
            slate_window_end: slateEnd.toISOString(),
            injury_status: "Healthy",
            usage_rank: i + 1,
            usage_metric: mpg,
            raw_data: player,
            updated_at: new Date().toISOString(),
          };

          const { data: upsertedPlayer, error: upsertError } = await supabase
            .from("players")
            .upsert(playerRecord, { onConflict: "external_id,sport" })
            .select("id")
            .single();

          if (upsertError) {
            console.error(`[sync-nba-players] Error upserting player ${player.id}:`, upsertError);
            continue;
          }

          playersAdded++;

          // Step 5: Insert season stats if available
          if (stats && upsertedPlayer) {
            const seasonStats = {
              player_id: upsertedPlayer.id,
              sport: "NBA",
              season: 2025,
              season_type: "regular",
              games_played: stats.games_played || 0,
              points_per_game: stats.pts || 0,
              rebounds_per_game: stats.reb || 0,
              assists_per_game: stats.ast || 0,
              steals_per_game: stats.stl || 0,
              blocks_per_game: stats.blk || 0,
              turnovers_per_game: stats.turnover || 0,
              minutes_per_game: mpg,
              field_goal_pct: stats.fg_pct || 0,
              three_point_pct: stats.fg3_pct || 0,
              free_throw_pct: stats.ft_pct || 0,
              source: "balldontlie",
              raw_data: stats,
              updated_at: new Date().toISOString(),
            };

            await supabase
              .from("player_season_stats")
              .upsert(seasonStats, { onConflict: "player_id,season,season_type" });
          }

          // Step 6: Create game associations
          if (upsertedPlayer && teamGames.length > 0) {
            for (const game of teamGames) {
              const association = {
                player_id: upsertedPlayer.id,
                nba_game_id: game.id,
                sport: "NBA",
                status: "active",
                is_starter: i < 5,
              };

              await supabase
                .from("player_game_associations")
                .upsert(association, { onConflict: "player_id,nba_game_id" })
                .select();
            }
          }
        }

        console.log(`[sync-nba-players] Processed ${playersWithStats.length} players for ${teamName}`);

        // Rate limiting - 100ms between teams
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (teamError) {
        console.error(`[sync-nba-players] Error processing team ${teamId}:`, teamError);
      }
    }

    // Update sync schedule
    await supabase
      .from("sync_schedule")
      .upsert({
        sport: "NBA",
        data_type: "players",
        last_sync_at: new Date().toISOString(),
        last_sync_status: "success",
        records_synced: playersAdded,
      }, { onConflict: "sport,data_type" });

    const response = {
      success: true,
      playersAdded,
      playersUpdated,
      teamsProcessed,
      message: `Synced ${playersAdded} NBA players from ${teamsProcessed.length} teams`,
    };

    console.log("[sync-nba-players] Sync completed:", response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[sync-nba-players] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
