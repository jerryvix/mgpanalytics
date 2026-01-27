import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BDLStats {
  id: number;
  min: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fgm: number;
  fga: number;
  fg_pct: number;
  fg3m: number;
  fg3a: number;
  fg3_pct: number;
  ftm: number;
  fta: number;
  ft_pct: number;
  oreb: number;
  dreb: number;
  turnover: number;
  pf: number;
  player: {
    id: number;
    first_name: string;
    last_name: string;
  };
  game: {
    id: number;
    date: string;
    season: number;
    home_team: { abbreviation: string; full_name: string };
    visitor_team: { abbreviation: string; full_name: string };
    home_team_score: number;
    visitor_team_score: number;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const BALLDONTLIE_API_KEY = Deno.env.get("BALLDONTLIE_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase configuration missing");
    }

    if (!BALLDONTLIE_API_KEY) {
      throw new Error("BALLDONTLIE_API_KEY not configured");
    }

    // Authenticate user - require admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized - no token provided" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.substring(7);
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claims, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized - invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claims.claims.sub;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (roleError || roleData?.role !== "admin") {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden - admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[sync-nba-game-logs] Admin user ${userId} authenticated, starting sync...`);

    // Parse request body for options
    let syncDays = 7; // Default: last 7 days
    let fullSeason = false;
    try {
      const body = await req.json();
      if (body.fullSeason) fullSeason = true;
      if (body.days) syncDays = Math.min(body.days, 30); // Max 30 days
    } catch {
      // Use defaults
    }

    // Get NBA players from our database to map BDL IDs
    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id, name, external_id, team_abbr")
      .eq("sport", "NBA")
      .eq("is_featured", true);

    if (playersError) {
      throw new Error(`Failed to fetch players: ${playersError.message}`);
    }

    console.log(`Found ${players?.length || 0} NBA players to sync game logs for`);

    // Build date range
    const endDate = new Date();
    const startDate = fullSeason 
      ? new Date("2024-10-22") // 2024-25 NBA season start
      : new Date(endDate.getTime() - syncDays * 24 * 60 * 60 * 1000);
    
    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    console.log(`Fetching game logs from ${startDateStr} to ${endDateStr}`);

    // First, try to find BDL player IDs by searching
    const bdlPlayerMap = new Map<string, number>();
    
    // Search for each player to get their BDL ID
    for (const player of players || []) {
      try {
        // Use external_id if it looks like a BDL ID
        if (player.external_id && /^\d+$/.test(player.external_id.replace("bdl_nba_", ""))) {
          const bdlId = parseInt(player.external_id.replace("bdl_nba_", ""));
          bdlPlayerMap.set(player.id, bdlId);
          continue;
        }

        // Otherwise search by name
        const nameParts = player.name.split(" ");
        const searchName = nameParts.length > 1 ? `${nameParts[0]} ${nameParts[nameParts.length - 1]}` : player.name;
        
        const searchUrl = `https://api.balldontlie.io/v1/players?search=${encodeURIComponent(searchName)}`;
        const searchResp = await fetch(searchUrl, {
          headers: { Authorization: BALLDONTLIE_API_KEY },
        });

        if (searchResp.ok) {
          const searchData = await searchResp.json();
          if (searchData.data && searchData.data.length > 0) {
            // Find best match by full name
            const match = searchData.data.find((p: any) => 
              `${p.first_name} ${p.last_name}`.toLowerCase() === player.name.toLowerCase()
            ) || searchData.data[0];
            
            bdlPlayerMap.set(player.id, match.id);
            
            // Update external_id in database for future syncs
            await supabase
              .from("players")
              .update({ external_id: `bdl_nba_${match.id}` })
              .eq("id", player.id);
          }
        }
        
        // Rate limiting - BDL allows 30 req/min on GOAT tier
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        console.error(`Error searching for player ${player.name}:`, err);
      }
    }

    console.log(`Mapped ${bdlPlayerMap.size} players to BDL IDs`);

    // Fetch game stats for each player
    let totalLogsInserted = 0;
    const gameLogsToInsert: any[] = [];

    for (const [playerId, bdlId] of bdlPlayerMap) {
      try {
        // Fetch stats for this player
        const statsUrl = `https://api.balldontlie.io/v1/stats?player_ids[]=${bdlId}&start_date=${startDateStr}&end_date=${endDateStr}&per_page=100`;
        const statsResp = await fetch(statsUrl, {
          headers: { Authorization: BALLDONTLIE_API_KEY },
        });

        if (!statsResp.ok) {
          console.error(`Failed to fetch stats for BDL player ${bdlId}: ${statsResp.status}`);
          continue;
        }

        const statsData = await statsResp.json();
        const stats: BDLStats[] = statsData.data || [];

        for (const stat of stats) {
          // Parse minutes - format can be "32:45" or "32"
          let minutes = 0;
          if (stat.min) {
            if (stat.min.includes(":")) {
              const [mins, secs] = stat.min.split(":");
              minutes = parseInt(mins) + (parseInt(secs) || 0) / 60;
            } else {
              minutes = parseInt(stat.min);
            }
          }

          // Determine if home game and opponent
          const gameDate = stat.game.date.split("T")[0];
          const homeTeam = stat.game.home_team.abbreviation;
          const visitorTeam = stat.game.visitor_team.abbreviation;
          
          // Try to match player's team
          const player = players?.find(p => p.id === playerId);
          const playerTeam = player?.team_abbr?.toUpperCase() || "";
          
          const isHome = homeTeam === playerTeam || 
                        stat.game.home_team.full_name.toLowerCase().includes(playerTeam.toLowerCase());
          const opponentAbbr = isHome ? visitorTeam : homeTeam;
          const opponentName = isHome ? stat.game.visitor_team.full_name : stat.game.home_team.full_name;
          
          const teamScore = isHome ? stat.game.home_team_score : stat.game.visitor_team_score;
          const opponentScore = isHome ? stat.game.visitor_team_score : stat.game.home_team_score;
          const result = teamScore > opponentScore ? "W" : teamScore < opponentScore ? "L" : "T";

          gameLogsToInsert.push({
            player_id: playerId,
            sport: "NBA",
            season: 2025, // 2024-25 season stored as 2025
            game_id: `bdl_nba_game_${stat.game.id}`,
            game_date: gameDate,
            opponent_abbr: opponentAbbr,
            opponent_name: opponentName,
            home_away: isHome ? "home" : "away",
            result: result,
            team_score: teamScore,
            opponent_score: opponentScore,
            minutes: Math.round(minutes),
            points: stat.pts || 0,
            rebounds: (stat.oreb || 0) + (stat.dreb || 0),
            assists: stat.ast || 0,
            steals: stat.stl || 0,
            blocks: stat.blk || 0,
            turnovers: stat.turnover || 0,
            fg_made: stat.fgm || 0,
            fg_attempted: stat.fga || 0,
            three_made: stat.fg3m || 0,
            three_attempted: stat.fg3a || 0,
            raw_data: stat,
          });
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        console.error(`Error fetching stats for player ${playerId}:`, err);
      }
    }

    console.log(`Prepared ${gameLogsToInsert.length} game logs for insertion`);

    // Batch insert with upsert
    if (gameLogsToInsert.length > 0) {
      // Process in batches of 100
      for (let i = 0; i < gameLogsToInsert.length; i += 100) {
        const batch = gameLogsToInsert.slice(i, i + 100);
        const { error: insertError } = await supabase
          .from("player_game_logs")
          .upsert(batch, { onConflict: "player_id,sport,game_id" });

        if (insertError) {
          console.error(`Error inserting batch ${i / 100}:`, insertError);
        } else {
          totalLogsInserted += batch.length;
        }
      }
    }

    // Update sync schedule
    await supabase
      .from("sync_schedule")
      .upsert({
        sport: "NBA",
        data_type: "game_logs",
        last_sync_at: new Date().toISOString(),
        last_sync_status: "success",
        records_synced: totalLogsInserted,
      }, { onConflict: "sport,data_type" });

    const response = {
      success: true,
      synced: totalLogsInserted,
      playersProcessed: bdlPlayerMap.size,
      dateRange: { start: startDateStr, end: endDateStr },
      message: `Synced ${totalLogsInserted} game logs for ${bdlPlayerMap.size} players`,
    };

    console.log("NBA game logs sync completed:", response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    // Log detailed error server-side only
    console.error("[sync-nba-game-logs] Error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    
    // Return generic error to client
    return new Response(
      JSON.stringify({
        success: false,
        error: "An unexpected error occurred. Please try again later.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
