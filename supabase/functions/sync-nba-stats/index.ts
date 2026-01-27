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

// Fetch from BDL API - handles both array and scalar params
async function bdlFetch(
  apiKey: string,
  endpoint: string,
  params?: Record<string, string | number | string[] | number[]>
): Promise<{ data: any; meta?: { next_cursor?: string } }> {
  await rateLimitedDelay();

  const url = new URL(`${BDL_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        // Handle arrays with bracket notation (player_ids[]=1&player_ids[]=2)
        value.forEach((v) => url.searchParams.append(`${key}[]`, String(v)));
      } else if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  console.log(`[sync-nba-stats] Fetching: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[sync-nba-stats] BDL Error ${response.status}: ${errorText}`);
    throw new Error(`BDL API Error ${response.status}: ${errorText}`);
  }

  return await response.json();
}

// Cache for active players to avoid repeated API calls
let activePlayersCache: Map<string, number> | null = null;

// Get all active players from BDL (GOAT tier endpoint)
async function loadActivePlayersCache(apiKey: string): Promise<Map<string, number>> {
  if (activePlayersCache) return activePlayersCache;
  
  const playerMap = new Map<string, number>();
  let cursor: string | undefined;
  let pageCount = 0;
  const MAX_PAGES = 10; // Safety limit
  
  console.log(`[sync-nba-stats] Loading all active players from BDL...`);
  
  do {
    const params: Record<string, string | number> = { per_page: 100 };
    if (cursor) params.cursor = cursor;
    
    const result = await bdlFetch(apiKey, "/players/active", params);
    
    if (result.data && Array.isArray(result.data)) {
      for (const player of result.data) {
        const fullName = `${player.first_name} ${player.last_name}`.toLowerCase().trim();
        playerMap.set(fullName, player.id);
        // Also store by last name for partial matching
        playerMap.set(`lastname:${player.last_name.toLowerCase()}`, player.id);
      }
    }
    
    cursor = result.meta?.next_cursor;
    pageCount++;
    console.log(`[sync-nba-stats] Loaded page ${pageCount}, total players: ${playerMap.size / 2}`);
  } while (cursor && pageCount < MAX_PAGES);
  
  console.log(`[sync-nba-stats] Active players cache loaded: ${playerMap.size / 2} players`);
  activePlayersCache = playerMap;
  return playerMap;
}

// Search for a player by name in the active players cache
async function findBdlPlayerId(
  apiKey: string,
  playerName: string
): Promise<number | null> {
  try {
    const cache = await loadActivePlayersCache(apiKey);
    const normalizedName = playerName.toLowerCase().trim();
    
    // Try exact match first
    if (cache.has(normalizedName)) {
      return cache.get(normalizedName)!;
    }
    
    // Try partial match by last name
    const nameParts = normalizedName.split(" ");
    if (nameParts.length >= 2) {
      const lastName = nameParts[nameParts.length - 1];
      const lastNameKey = `lastname:${lastName}`;
      if (cache.has(lastNameKey)) {
        return cache.get(lastNameKey)!;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`[sync-nba-stats] Error finding player ${playerName}:`, error);
    return null;
  }
}

// New GOAT-tier response structure with nested stats
interface NBASeasonAveragesResponse {
  player: {
    id: number;
    first_name: string;
    last_name: string;
  };
  season: number;
  season_type: string;
  stats: {
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    min: number;
    gp: number;
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
    tov: number;
    pf: number;
  };
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

    console.log(`[sync-nba-stats] Admin user ${userId} authenticated, starting NBA stats sync via Ball Don't Lie...`);

    // Get all featured NBA players
    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id, name, external_id, team_name")
      .eq("sport", "NBA")
      .eq("is_featured", true)
      .order("usage_rank", { ascending: true });

    if (playersError) {
      throw new Error(`Failed to fetch players: ${playersError.message}`);
    }

    if (!players || players.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No NBA players to sync stats for. Sync players first.",
          synced: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[sync-nba-stats] Found ${players.length} NBA players to sync stats for`);

    let synced = 0;
    let noData = 0;
    let errors: string[] = [];
    const playerIdMapping: Record<string, number> = {}; // Map our player UUID to BDL ID

    // Step 1: First, search for each player in BDL and get their ID
    console.log(`[sync-nba-stats] Step 1: Mapping players to Ball Don't Lie IDs...`);
    
    for (const player of players) {
      const bdlId = await findBdlPlayerId(BDL_API_KEY, player.name);
      if (bdlId) {
        playerIdMapping[player.id] = bdlId;
        console.log(`[sync-nba-stats] Mapped ${player.name} -> BDL ID ${bdlId}`);
      } else {
        console.log(`[sync-nba-stats] Could not find BDL ID for ${player.name}`);
      }
    }

    const bdlPlayerIds = Object.values(playerIdMapping);
    console.log(`[sync-nba-stats] Mapped ${bdlPlayerIds.length}/${players.length} players to BDL IDs`);

    if (bdlPlayerIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Could not map any players to Ball Don't Lie. Try different player names.",
          synced: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Fetch season averages in batches of 25 (to stay under URL length limits)
    console.log(`[sync-nba-stats] Step 2: Fetching season averages using GOAT-tier endpoint...`);
    
    const BATCH_SIZE = 25; // Smaller batches for URL length limits
    const batches: number[][] = [];
    
    for (let i = 0; i < bdlPlayerIds.length; i += BATCH_SIZE) {
      batches.push(bdlPlayerIds.slice(i, i + BATCH_SIZE));
    }

    const allSeasonAverages: NBASeasonAveragesResponse[] = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`[sync-nba-stats] Fetching batch ${batchIndex + 1}/${batches.length} (${batch.length} players)`);

      try {
        // GOAT-tier endpoint structure:
        // /season_averages/{category}?season=2024&season_type=regular&type=base&player_ids[]=...
        const result = await bdlFetch(BDL_API_KEY, "/season_averages/general", {
          season: 2024,
          season_type: "regular",
          type: "base",
          player_ids: batch,
        });

        if (result.data && Array.isArray(result.data)) {
          allSeasonAverages.push(...result.data);
          console.log(`[sync-nba-stats] Batch ${batchIndex + 1}: Received ${result.data.length} season averages`);
        }
      } catch (error) {
        console.error(`[sync-nba-stats] Batch ${batchIndex + 1} failed:`, error);
        errors.push(`Batch ${batchIndex + 1} failed: ${error instanceof Error ? error.message : "Unknown"}`);
      }

      // Rate limiting: wait 100ms between batches (600 req/min limit)
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`[sync-nba-stats] Got ${allSeasonAverages.length} season average records`);

    // Create a map of BDL player_id -> stats response
    const statsMap: Record<number, NBASeasonAveragesResponse> = {};
    for (const avg of allSeasonAverages) {
      // New structure: player.id instead of player_id at root
      if (avg.player?.id) {
        statsMap[avg.player.id] = avg;
      }
    }

    // Step 3: Upsert stats into player_season_stats
    console.log(`[sync-nba-stats] Step 3: Upserting stats to database...`);

    for (const player of players) {
      const bdlId = playerIdMapping[player.id];
      if (!bdlId) {
        noData++;
        continue;
      }

      const bdlResponse = statsMap[bdlId];
      if (!bdlResponse || !bdlResponse.stats) {
        console.log(`[sync-nba-stats] No season averages for ${player.name} (BDL ID: ${bdlId})`);
        noData++;
        continue;
      }

      // New structure: stats are nested in .stats object
      const stats = bdlResponse.stats;

      const seasonStats = {
        player_id: player.id,
        sport: "NBA",
        season: 2025, // Store as 2025 (2024-25 season)
        season_type: "regular",
        source: "balldontlie",
        games_played: stats.gp || 0,
        points_per_game: stats.pts || 0,
        rebounds_per_game: stats.reb || 0,
        assists_per_game: stats.ast || 0,
        steals_per_game: stats.stl || 0,
        blocks_per_game: stats.blk || 0,
        turnovers_per_game: stats.tov || 0,
        minutes_per_game: stats.min || 0,
        field_goal_pct: stats.fg_pct ? stats.fg_pct * 100 : null,
        three_point_pct: stats.fg3_pct ? stats.fg3_pct * 100 : null,
        free_throw_pct: stats.ft_pct ? stats.ft_pct * 100 : null,
        raw_data: bdlResponse,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from("player_season_stats")
        .upsert(seasonStats, {
          onConflict: "player_id,sport,season,season_type",
        });

      if (upsertError) {
        console.error(`[sync-nba-stats] Error upserting stats for ${player.name}:`, upsertError);
        errors.push(`Failed: ${player.name}`);
      } else {
        synced++;
        console.log(`[sync-nba-stats] Updated stats for ${player.name}: ${stats.pts} PPG, ${stats.reb} RPG, ${stats.ast} APG`);
      }
    }

    // Update sync schedule
    await supabase
      .from("sync_schedule")
      .upsert(
        {
          sport: "NBA",
          data_type: "stats",
          last_sync_at: new Date().toISOString(),
          last_sync_status: errors.length > 0 ? "partial" : "success",
          records_synced: synced,
          error_message: errors.length > 0 ? errors.slice(0, 5).join("; ") : null,
        },
        { onConflict: "sport,data_type" }
      );

    console.log(`[sync-nba-stats] Sync complete: ${synced} synced, ${noData} no data, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `NBA stats synced successfully`,
        synced,
        noData,
        total: players.length,
        mapped: bdlPlayerIds.length,
        errors: errors.slice(0, 10),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    // Log detailed error server-side only
    console.error("[sync-nba-stats] Error:", {
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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
