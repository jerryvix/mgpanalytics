import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Base URL for NFL API
const NFL_BASE_URL = "https://api.balldontlie.io/nfl/v1";

// Rate limiting delay (100ms between calls)
const RATE_LIMIT_DELAY = 100;
let lastCallTime = 0;

async function rateLimitedDelay(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastCallTime;
  if (timeSinceLastCall < RATE_LIMIT_DELAY) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastCall));
  }
  lastCallTime = Date.now();
}

// Generic fetch function for Ball Don't Lie API
async function bdlFetch(
  apiKey: string,
  endpoint: string,
  params?: Record<string, string | number>
): Promise<{ data: any[]; meta?: { next_cursor?: string } }> {
  await rateLimitedDelay();
  
  const url = new URL(`${NFL_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  console.log(`[Sync NFL Season Stats] Fetching: ${url.toString()}`);
  
  const response = await fetch(url.toString(), {
    headers: {
      "Authorization": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Sync NFL Season Stats] Error ${response.status}: ${errorText}`);
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  const json = await response.json();
  console.log(`[Sync NFL Season Stats] Got ${json.data?.length || 0} records`);
  return json;
}

// Fetch all pages using cursor pagination
async function fetchAllPages(
  apiKey: string,
  endpoint: string,
  params?: Record<string, string | number>
): Promise<any[]> {
  const allData: any[] = [];
  let cursor: string | undefined = undefined;
  let pageCount = 0;
  const maxPages = 100; // Safety limit

  do {
    pageCount++;
    console.log(`[Sync NFL Season Stats] Fetching page ${pageCount}...`);
    
    const fetchParams: Record<string, string | number> = { 
      ...params,
      per_page: 100, // Max per page
    };
    if (cursor) {
      fetchParams.cursor = cursor;
    }

    const response = await bdlFetch(apiKey, endpoint, fetchParams);
    
    if (response.data && Array.isArray(response.data)) {
      allData.push(...response.data);
    }

    cursor = response.meta?.next_cursor;
    
    if (pageCount >= maxPages) {
      console.log(`[Sync NFL Season Stats] Reached max page limit (${maxPages})`);
      break;
    }
  } while (cursor);

  console.log(`[Sync NFL Season Stats] Total records fetched: ${allData.length} across ${pageCount} pages`);
  return allData;
}

// Calculate fantasy points - using correct API field names (passing_yards, rushing_yards, etc.)
function calculateFantasyPoints(stat: any): { fantasy_points: number; fantasy_points_ppr: number } {
  // API uses "passing_yards", "rushing_yards", etc. - not "pass_yards", "rush_yards"
  const passYards = stat.passing_yards || stat.pass_yards || 0;
  const passTd = stat.passing_touchdowns || stat.pass_touchdowns || 0;
  const passInt =
    stat.passing_interceptions ??
    stat.pass_interceptions ??
    stat?.passing?.interceptions ??
    stat.interceptions ??
    0;
  const rushYards = stat.rushing_yards || stat.rush_yards || 0;
  const rushTd = stat.rushing_touchdowns || stat.rush_touchdowns || 0;
  const recYards = stat.receiving_yards || stat.rec_yards || 0;
  const recTd = stat.receiving_touchdowns || stat.rec_touchdowns || 0;
  const receptions = stat.receptions || 0;

  // Standard fantasy scoring
  const fantasy_points = 
    (passYards * 0.04) + 
    (passTd * 4) - 
    (passInt * 2) + 
    (rushYards * 0.1) + 
    (rushTd * 6) + 
    (recYards * 0.1) + 
    (recTd * 6);

  // PPR scoring (add 1 point per reception)
  const fantasy_points_ppr = fantasy_points + receptions;

  return {
    fantasy_points: Math.round(fantasy_points * 100) / 100,
    fantasy_points_ppr: Math.round(fantasy_points_ppr * 100) / 100,
  };
}

// API response uses "passing_yards", "rushing_yards", etc.
interface NFLSeasonStat {
  id: number;
  player: {
    id: number;
    first_name: string;
    last_name: string;
    position: string;
  };
  season: number;
  games_played?: number;
  // Passing stats (API uses "passing_" prefix)
  passing_attempts?: number;
  passing_completions?: number;
  passing_yards?: number;
  passing_touchdowns?: number;
  passing_interceptions?: number;
  qbr?: number;
  // Rushing stats (API uses "rushing_" prefix)
  rushing_attempts?: number;
  rushing_yards?: number;
  rushing_touchdowns?: number;
  // Receiving stats (API uses "receiving_" prefix)
  receptions?: number;
  receiving_yards?: number;
  receiving_touchdowns?: number;
  receiving_targets?: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const apiKey = Deno.env.get("BALLDONTLIE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!apiKey) {
      throw new Error("BALLDONTLIE_API_KEY not configured");
    }
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error("Supabase configuration missing");
    }

    // Authenticate user - require admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized - no token provided" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized - invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;

    // Check admin role using service client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    // Parse request body for season parameter
    let season = 2024;
    try {
      const body = await req.json();
      if (body.season) {
        season = parseInt(body.season, 10);
      }
    } catch {
      // No body or invalid JSON, use default season
    }

    console.log(`[Sync NFL Season Stats] Admin user ${userId} authenticated, starting sync for season ${season}...`);

    // Step 1: Update sync_schedule to 'in_progress'
    console.log("[Sync NFL Season Stats] Updating sync_schedule to in_progress...");
    await supabase
      .from("sync_schedule")
      .upsert({
        sport: "NFL",
        data_type: "season_stats",
        last_sync_at: new Date().toISOString(),
        last_sync_status: "in_progress",
        error_message: null,
      }, { onConflict: "sport,data_type" });

    // Step 2: Fetch all season stats from Ball Don't Lie
    console.log(`[Sync NFL Season Stats] Fetching season stats for ${season}...`);
    let seasonStats: NFLSeasonStat[];
    try {
      seasonStats = await fetchAllPages(apiKey, "/season_stats", { season });
    } catch (error) {
      // Update sync status to failed
      await supabase
        .from("sync_schedule")
        .update({
          last_sync_status: "failed",
          error_message: error instanceof Error ? error.message : "Failed to fetch season stats",
        })
        .eq("sport", "NFL")
        .eq("data_type", "season_stats");

      throw error;
    }

    console.log(`[Sync NFL Season Stats] Fetched ${seasonStats.length} season stat records from API`);

    // Step 3: Get all NFL players from our database to map external_id to internal id
    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id, external_id")
      .eq("sport", "NFL");

    if (playersError) {
      throw new Error(`Failed to fetch players: ${playersError.message}`);
    }

    // Create a map of external_id -> internal id
    const playerMap = new Map<string, string>();
    if (players) {
      players.forEach(p => {
        playerMap.set(p.external_id, p.id);
      });
    }
    console.log(`[Sync NFL Season Stats] Found ${playerMap.size} NFL players in database`);

    // Step 4: Transform and upsert season stats
    const statsToUpsert: any[] = [];
    let skippedCount = 0;

    for (const stat of seasonStats) {
      const playerId = playerMap.get(String(stat.player.id));
      
      if (!playerId) {
        skippedCount++;
        continue; // Player not in database yet
      }

      const fantasyPoints = calculateFantasyPoints(stat);

       // Interceptions mapping: prefer the official API field, but allow fallbacks without breaking types.
       // IMPORTANT: do not coerce missing values to 0; keep null so downstream logic can override.
       const passIntRaw: number | null =
         (stat.passing_interceptions ?? null) ??
         ((stat as unknown as any)?.passing?.interceptions ?? null) ??
         ((stat as unknown as any)?.interceptions ?? null);

      // Map API fields (passing_yards, rushing_yards) to our DB columns (pass_yards, rush_yards)
      statsToUpsert.push({
        player_id: playerId,
        sport: "NFL",
        season: stat.season,
        season_type: "regular",
        games_played: stat.games_played || 0,
        pass_attempts: stat.passing_attempts || 0,
        pass_completions: stat.passing_completions || 0,
        pass_yards: stat.passing_yards || 0,
        pass_td: stat.passing_touchdowns || 0,
        // IMPORTANT: don't silently coerce missing INTs to 0; preserve null.
        pass_int: passIntRaw,
        passer_rating: stat.qbr || null,
        rush_attempts: stat.rushing_attempts || 0,
        rush_yards: stat.rushing_yards || 0,
        rush_td: stat.rushing_touchdowns || 0,
        receptions: stat.receptions || 0,
        rec_yards: stat.receiving_yards || 0,
        rec_td: stat.receiving_touchdowns || 0,
        targets: stat.receiving_targets || 0,
        fantasy_points: fantasyPoints.fantasy_points,
        fantasy_points_ppr: fantasyPoints.fantasy_points_ppr,
        raw_data: stat,
        updated_at: new Date().toISOString(),
      });
    }

    console.log(`[Sync NFL Season Stats] Upserting ${statsToUpsert.length} stats (skipped ${skippedCount} - players not found)...`);

    // Upsert in batches to avoid timeouts
    const batchSize = 500;
    let successCount = 0;
    let errorMessages: string[] = [];

    for (let i = 0; i < statsToUpsert.length; i += batchSize) {
      const batch = statsToUpsert.slice(i, i + batchSize);
      console.log(`[Sync NFL Season Stats] Upserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(statsToUpsert.length / batchSize)}...`);
      
      const { error: upsertError } = await supabase
        .from("player_season_stats")
        .upsert(batch, { 
          onConflict: "player_id,sport,season,season_type",
          ignoreDuplicates: false 
        });

      if (upsertError) {
        console.error(`[Sync NFL Season Stats] Batch upsert error:`, upsertError);
        errorMessages.push(upsertError.message);
      } else {
        successCount += batch.length;
      }
    }

    // Step 5: Update sync_schedule with results
    const duration = Math.round((Date.now() - startTime) / 1000);
    const finalStatus = errorMessages.length === 0 ? "success" : 
                       successCount > 0 ? "partial" : "failed";

    await supabase
      .from("sync_schedule")
      .update({
        last_sync_status: finalStatus,
        records_synced: successCount,
        error_message: errorMessages.length > 0 ? errorMessages.join("; ") : null,
      })
      .eq("sport", "NFL")
      .eq("data_type", "season_stats");

    console.log(`[Sync NFL Season Stats] Sync completed: ${successCount} stats in ${duration}s`);

    // Step 6: Return summary
    return new Response(
      JSON.stringify({
        success: finalStatus !== "failed",
        statsSync: successCount,
        skipped: skippedCount,
        duration: `${duration}s`,
        season,
        status: finalStatus,
        message: `Synced ${successCount.toLocaleString()} NFL season stats for ${season}`,
        errors: errorMessages.length > 0 ? errorMessages : undefined,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Sync NFL Season Stats] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: "An unexpected error occurred. Please try again later." }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
