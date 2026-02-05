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

  console.log(`[Sync NFL Players] Fetching: ${url.toString()}`);
  
  const response = await fetch(url.toString(), {
    headers: {
      "Authorization": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Sync NFL Players] Error ${response.status}: ${errorText}`);
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  const json = await response.json();
  console.log(`[Sync NFL Players] Got ${json.data?.length || 0} records`);
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
    console.log(`[Sync NFL Players] Fetching page ${pageCount}...`);
    
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
      console.log(`[Sync NFL Players] Reached max page limit (${maxPages})`);
      break;
    }
  } while (cursor);

  console.log(`[Sync NFL Players] Total records fetched: ${allData.length} across ${pageCount} pages`);
  return allData;
}

interface NFLPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  team?: {
    id: number;
    full_name: string;
    abbreviation: string;
  };
  jersey_number?: string;
  height?: string;
  weight?: string | number; // API returns strings like "305 lbs"
  college?: string;
  years_exp?: number;
}

// Helper to parse weight from string like "305 lbs" to integer
function parseWeight(weight: string | number | undefined | null): number | null {
  if (weight === undefined || weight === null) return null;
  if (typeof weight === 'number') return weight;
  const match = String(weight).match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : null;
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

    console.log(`[Sync NFL Players] Admin user ${userId} authenticated, starting sync...`);

    // Step 1: Update sync_schedule to 'in_progress'
    console.log("[Sync NFL Players] Updating sync_schedule to in_progress...");
    await supabase
      .from("sync_schedule")
      .upsert({
        sport: "NFL",
        data_type: "players",
        last_sync_at: new Date().toISOString(),
        last_sync_status: "in_progress",
        error_message: null,
      }, { onConflict: "sport,data_type" });

    // Step 2: Fetch active NFL players from Ball Don't Lie
    // Using /players/active to exclude retired players (requires GOAT tier)
    console.log("[Sync NFL Players] Fetching active NFL players...");
    let players: NFLPlayer[];
    try {
      players = await fetchAllPages(apiKey, "/players/active", {});
    } catch (error) {
      // Update sync status to failed
      await supabase
        .from("sync_schedule")
        .update({
          last_sync_status: "failed",
          error_message: error instanceof Error ? error.message : "Failed to fetch players",
        })
        .eq("sport", "NFL")
        .eq("data_type", "players");

      throw error;
    }

    console.log(`[Sync NFL Players] Fetched ${players.length} players from API`);

    // Step 3: Transform and upsert players into database
    const playersToUpsert = players.map((player: NFLPlayer) => ({
      external_id: String(player.id),
      sport: "NFL",
      name: `${player.first_name || ""} ${player.last_name || ""}`.trim(),
      first_name: player.first_name || null,
      last_name: player.last_name || null,
      position: player.position || null,
      team_id: player.team?.id ? String(player.team.id) : null,
      team_name: player.team?.full_name || null,
      team_abbr: player.team?.abbreviation || null,
      jersey_number: player.jersey_number || null,
      height: player.height || null,
      weight: parseWeight(player.weight), // Parse "305 lbs" to 305
      college: player.college || null,
      experience: player.years_exp || null,
      status: "active",
      updated_at: new Date().toISOString(),
    }));

    console.log(`[Sync NFL Players] Upserting ${playersToUpsert.length} players...`);

    // Upsert in batches to avoid timeouts
    const batchSize = 500;
    let successCount = 0;
    let errorMessages: string[] = [];

    for (let i = 0; i < playersToUpsert.length; i += batchSize) {
      const batch = playersToUpsert.slice(i, i + batchSize);
      console.log(`[Sync NFL Players] Upserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(playersToUpsert.length / batchSize)}...`);
      
      const { error: upsertError } = await supabase
        .from("players")
        .upsert(batch, { 
          onConflict: "external_id,sport",
          ignoreDuplicates: false 
        });

      if (upsertError) {
        console.error(`[Sync NFL Players] Batch upsert error:`, upsertError);
        errorMessages.push(upsertError.message);
      } else {
        successCount += batch.length;
      }
    }

    // Step 4: Update sync_schedule with results
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
      .eq("data_type", "players");

    console.log(`[Sync NFL Players] Sync completed: ${successCount} players in ${duration}s`);

    // Step 5: Return summary
    return new Response(
      JSON.stringify({
        success: finalStatus !== "failed",
        playersSync: successCount,
        duration: `${duration}s`,
        status: finalStatus,
        message: `Synced ${successCount.toLocaleString()} NFL players`,
        errors: errorMessages.length > 0 ? errorMessages : undefined,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Sync NFL Players] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: "An unexpected error occurred. Please try again later." }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
