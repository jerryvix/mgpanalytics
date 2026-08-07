// CFB game results history from CollegeFootballData.com — one season per
// invocation (edge-function timeout pattern, same as backfill-nfl-fantasy).
// Body: { season: 2024 }; defaults to the current CFB season for the daily
// in-season run. Completed games only, upserted on cfbd_game_id. Backfill =
// one manual invocation per season, 2021-2026.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const CFBD_BASE = "https://api.collegefootballdata.com";

function currentCfbSeason(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

// CFBD's API rewrite moved field names from snake_case to camelCase; accept
// either so a rollout on their side doesn't silently null out the sync.
function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return null;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let syncLogId: string | null = null;
  const syncStartTime = Date.now();
  let supabase: any;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const CFBD_API_KEY = Deno.env.get("CFBD_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase configuration missing");
    }
    if (!CFBD_API_KEY) {
      throw new Error("CFBD_API_KEY secret not set");
    }

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auth: cron secret, service role key, or admin JWT
    const cronSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log(`[sync-cfbd-games] Authenticated via cron secret`);
    } else if (bearerToken === SUPABASE_SERVICE_ROLE_KEY) {
      console.log(`[sync-cfbd-games] Authenticated via service role key`);
    } else {
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized - no token provided" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user }, error: userError } = await authClient.auth.getUser();
      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized - invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (roleError || roleData?.role !== "admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden - admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[sync-cfbd-games] Admin user ${user.id} authenticated`);
    }

    const triggerSource = detectTriggerSource(req);
    syncLogId = await startSyncLog(supabase, {
      sport: "NCAAF",
      data_type: "results",
      function_name: "sync-cfbd-games",
      trigger_source: triggerSource,
      api_source: "cfbd",
    });

    let season = currentCfbSeason();
    try {
      const body = await req.json();
      if (body.season) season = Number(body.season);
    } catch {
      // No body — current season
    }
    if (!Number.isInteger(season) || season < 2000 || season > 2100) {
      throw new Error(`Invalid season ${season} — expected e.g. {"season": 2024}`);
    }

    const url = `${CFBD_BASE}/games?year=${season}&seasonType=both&division=fbs`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${CFBD_API_KEY}`, Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`CFBD /games failed: ${res.status} ${res.statusText}`);
    }
    const games = await res.json();
    if (!Array.isArray(games)) {
      throw new Error("CFBD /games returned non-array payload");
    }

    const rows: Record<string, unknown>[] = [];
    let skipped = 0;
    for (const g of games as Record<string, unknown>[]) {
      const completed = pick(g, "completed") === true;
      const cfbdId = pick(g, "id");
      const homeSchool = pick(g, "homeTeam", "home_team");
      const awaySchool = pick(g, "awayTeam", "away_team");
      const homePoints = pick(g, "homePoints", "home_points");
      const awayPoints = pick(g, "awayPoints", "away_points");
      if (
        !completed ||
        typeof cfbdId !== "number" ||
        typeof homeSchool !== "string" ||
        typeof awaySchool !== "string" ||
        typeof homePoints !== "number" ||
        typeof awayPoints !== "number"
      ) {
        skipped++;
        continue;
      }
      const seasonTypeRaw = pick(g, "seasonType", "season_type");
      const startDate = pick(g, "startDate", "start_date");
      rows.push({
        cfbd_game_id: cfbdId,
        season,
        week: typeof pick(g, "week") === "number" ? pick(g, "week") : null,
        season_type: seasonTypeRaw === "postseason" ? "postseason" : "regular",
        date: typeof startDate === "string" ? startDate : null,
        home_school: homeSchool,
        away_school: awaySchool,
        home_conference: (pick(g, "homeConference", "home_conference") as string | null) ?? null,
        away_conference: (pick(g, "awayConference", "away_conference") as string | null) ?? null,
        home_points: homePoints,
        away_points: awayPoints,
        neutral_site: pick(g, "neutralSite", "neutral_site") === true,
      });
    }

    let upserted = 0;
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabase
        .from("ncaaf_game_results")
        .upsert(batch, { onConflict: "cfbd_game_id" });
      if (error) {
        throw new Error(`Upsert failed at batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      }
      upserted += batch.length;
    }

    const result = {
      success: true,
      season,
      gamesUpserted: upserted,
      gamesSkipped: skipped,
      message: `Synced ${upserted} completed CFB results for ${season} (${skipped} incomplete/invalid skipped)`,
    };
    console.log("[sync-cfbd-games] Complete:", result);

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: upserted,
      api_requests_used: 1,
      details: { season, skipped },
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[sync-cfbd-games] Error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "failed",
      error_message: error instanceof Error ? error.message : "Unknown error",
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
