import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Ball Don't Lie NBA API
const BDL_BASE_URL = "https://api.balldontlie.io/v1";
const RATE_LIMIT_DELAY = 100;
let lastCallTime = 0;

async function rateLimitedDelay(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastCallTime;
  if (timeSinceLastCall < RATE_LIMIT_DELAY) {
    await new Promise((resolve) =>
      setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastCall)
    );
  }
  lastCallTime = Date.now();
}

// Fetch from BDL API
async function bdlFetch(
  apiKey: string,
  endpoint: string,
  params?: Record<string, string | number | number[]>
): Promise<{ data: any; meta?: { next_cursor?: string } }> {
  await rateLimitedDelay();

  const url = new URL(`${BDL_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((v) => url.searchParams.append(`${key}[]`, String(v)));
      } else if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  console.log(`[sync-nba-props] Fetching: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[sync-nba-props] BDL Error ${response.status}: ${errorText}`);
    throw new Error(`BDL API Error ${response.status}: ${errorText}`);
  }

  return await response.json();
}

// Search for a player by name in BDL
async function findBdlPlayerId(
  apiKey: string,
  playerName: string
): Promise<number | null> {
  try {
    const result = await bdlFetch(apiKey, "/players", {
      search: playerName,
      per_page: 5,
    });

    if (!result.data || result.data.length === 0) {
      return null;
    }

    const normalizedSearch = playerName.toLowerCase().trim();
    for (const player of result.data) {
      const fullName = `${player.first_name} ${player.last_name}`.toLowerCase();
      if (fullName === normalizedSearch) {
        return player.id;
      }
    }

    return result.data[0].id;
  } catch (error) {
    console.error(`[sync-nba-props] Error finding player ${playerName}:`, error);
    return null;
  }
}

// Normalize prop type from BDL response
function normalizePropType(propType: string): string {
  const mapping: Record<string, string> = {
    "points": "points",
    "pts": "points",
    "rebounds": "rebounds",
    "reb": "rebounds",
    "assists": "assists",
    "ast": "assists",
    "threes": "threes",
    "three_pointers": "threes",
    "3pm": "threes",
    "blocks": "blocks",
    "blk": "blocks",
    "steals": "steals",
    "stl": "steals",
    "turnovers": "turnovers",
    "to": "turnovers",
    "pts_rebs_asts": "pts+reb+ast",
    "pts_rebs": "pts+reb",
    "pts_asts": "pts+ast",
    "rebs_asts": "reb+ast",
    "double_double": "double_double",
    "triple_double": "triple_double",
  };
  return mapping[propType.toLowerCase()] || propType.toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const BDL_API_KEY = Deno.env.get("BALLDONTLIE_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase configuration missing");
    }

    if (!BDL_API_KEY) {
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

    // Check admin role using service client
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

    console.log(`[sync-nba-props] Admin user ${userId} authenticated, starting NBA props sync...`);

    // Get today's date and tomorrow's date for props
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const dateStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    console.log(`[sync-nba-props] Fetching props for ${dateStr} and ${tomorrowStr}`);

    // Get NBA games in next 48 hours
    const now = new Date();
    const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const { data: games, error: gamesError } = await supabase
      .from("nba_games")
      .select("id, home_team_name, visitor_team_name, date, external_id")
      .gte("date", now.toISOString())
      .lte("date", in48Hours.toISOString());

    if (gamesError) {
      throw new Error(`Failed to fetch games: ${gamesError.message}`);
    }

    if (!games || games.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No NBA games in next 48 hours. Sync games first.",
          propsAdded: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[sync-nba-props] Found ${games.length} NBA games in slate window`);

    // Get featured players for these games
    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id, name, external_id, team_name, injury_status")
      .eq("sport", "NBA")
      .eq("is_featured", true)
      .neq("injury_status", "Out"); // Skip players ruled out

    if (playersError) {
      throw new Error(`Failed to fetch players: ${playersError.message}`);
    }

    console.log(`[sync-nba-props] Found ${players?.length || 0} eligible players (not ruled out)`);

    let propsAdded = 0;
    let playersProcessed = 0;
    const errors: string[] = [];

    // Build player name to ID mapping for BDL
    const playerBdlIds: Record<string, number> = {};

    // First, map players to BDL IDs
    for (const player of players || []) {
      const bdlId = await findBdlPlayerId(BDL_API_KEY, player.name);
      if (bdlId) {
        playerBdlIds[player.id] = bdlId;
        console.log(`[sync-nba-props] Mapped ${player.name} -> BDL ID ${bdlId}`);
      }
    }

    console.log(`[sync-nba-props] Mapped ${Object.keys(playerBdlIds).length}/${players?.length || 0} players to BDL IDs`);

    // Mark old props as inactive
    await supabase
      .from("player_props")
      .update({ is_active: false })
      .eq("sport", "NBA")
      .lt("game_date", dateStr);

    // Fetch props for each mapped player
    const BATCH_SIZE = 10;
    const playerEntries = Object.entries(playerBdlIds);

    for (let i = 0; i < playerEntries.length; i += BATCH_SIZE) {
      const batch = playerEntries.slice(i, i + BATCH_SIZE);
      
      console.log(`[sync-nba-props] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(playerEntries.length / BATCH_SIZE)}`);

      for (const [playerId, bdlId] of batch) {
        try {
          // Fetch props for this player
          const result = await bdlFetch(BDL_API_KEY, "/player_props", {
            player_ids: [bdlId],
            per_page: 100,
          });

          if (!result.data || result.data.length === 0) {
            console.log(`[sync-nba-props] No props found for player BDL ID ${bdlId}`);
            continue;
          }

          playersProcessed++;

          // Find the player info
          const playerInfo = players?.find(p => p.id === playerId);
          const playerTeam = playerInfo?.team_name || "";

          for (const prop of result.data) {
            // Find opponent team from game info
            const game = games.find(g => 
              g.home_team_name === playerTeam || g.visitor_team_name === playerTeam
            );
            
            const opponentTeam = game 
              ? (game.home_team_name === playerTeam ? game.visitor_team_name : game.home_team_name)
              : null;

            const gameDate = game ? new Date(game.date).toISOString().split('T')[0] : dateStr;

            const propRecord = {
              player_id: playerId,
              game_id: game?.id || null,
              sport: "NBA",
              external_game_id: prop.game?.id?.toString() || null,
              external_player_id: bdlId.toString(),
              sportsbook: prop.sportsbook || "unknown",
              prop_type: normalizePropType(prop.prop_type || prop.stat_type || "unknown"),
              line: prop.line || 0,
              over_odds: prop.over_odds || null,
              under_odds: prop.under_odds || null,
              game_date: gameDate,
              opponent_team: opponentTeam,
              is_active: true,
              updated_at: new Date().toISOString(),
            };

            const { error: upsertError } = await supabase
              .from("player_props")
              .upsert(propRecord, {
                onConflict: "player_id,sportsbook,prop_type,game_date",
              });

            if (upsertError) {
              console.error(`[sync-nba-props] Error upserting prop:`, upsertError);
              errors.push(`Failed prop for ${playerInfo?.name}: ${upsertError.message}`);
            } else {
              propsAdded++;
            }
          }
        } catch (error) {
          console.error(`[sync-nba-props] Error processing player ${playerId}:`, error);
          errors.push(`Player ${playerId}: ${error instanceof Error ? error.message : "Unknown"}`);
        }
      }

      // Delay between batches
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Update sync schedule
    await supabase
      .from("sync_schedule")
      .upsert(
        {
          sport: "NBA",
          data_type: "props",
          last_sync_at: new Date().toISOString(),
          last_sync_status: errors.length > 0 ? "partial" : "success",
          records_synced: propsAdded,
          error_message: errors.length > 0 ? errors.slice(0, 5).join("; ") : null,
        },
        { onConflict: "sport,data_type" }
      );

    console.log(`[sync-nba-props] Sync complete: ${propsAdded} props added for ${playersProcessed} players`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `NBA props synced successfully`,
        propsAdded,
        playersProcessed,
        playersTotal: players?.length || 0,
        errors: errors.slice(0, 10),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[sync-nba-props] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
