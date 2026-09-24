import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";
import { rebuildNflSeasonStats, type SeasonRebuildResult } from "../_shared/nfl-season-rebuild.ts";
import { currentNflSeason } from "../_shared/nfl-sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let syncLogId: string | null = null;
  // deno-lint-ignore no-explicit-any
  let supabase: any;

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

    // Service client for database operations (used by both auth paths)
    supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth: cron secret (dispatch-syncs), service role key, or admin JWT
    const cronSecret = req.headers.get("x-cron-secret");
    const bearer = req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? null;
    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log(`[sync-nfl-season-stats] Authenticated via cron secret`);
    } else if (bearer && bearer === supabaseServiceKey) {
      console.log(`[sync-nfl-season-stats] Authenticated via service role key`);
    } else {
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

      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();

      if (roleError || roleData?.role !== "admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden - admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Start sync log
    const triggerSource = detectTriggerSource(req);
    syncLogId = await startSyncLog(supabase, {
      sport: "NFL",
      data_type: "season_stats",
      function_name: "sync-nfl-season-stats",
      trigger_source: triggerSource,
      api_source: "balldontlie",
    });

    // Season default: the current season once games begin (Sep+), else the
    // most recently completed one (BDL NFL seasons are labeled by start year).
    // { prune: false } skips the stale-row cleanup below.
    const nowDate = new Date();
    let season = nowDate.getMonth() >= 8 ? nowDate.getFullYear() : nowDate.getFullYear() - 1;
    let prune = true;
    let explicitSeason = false;
    let allowPastSeason = false;
    try {
      const body = await req.json();
      if (body.season) {
        season = parseInt(body.season, 10);
        explicitSeason = true;
      }
      if (body.prune === false) prune = false;
      if (body.allowPastSeason === true) allowPastSeason = true;
    } catch {
      // No body or invalid JSON, use defaults
    }

    // Past seasons are final: 2020-2025 were checked line by line against
    // ESPN (Sep 24 2026) and change only through reviewed repairs. The Admin
    // panel builds before that wrote seasons 2020-2025 on every click, so an
    // explicit past season now needs { allowPastSeason: true }.
    if (explicitSeason && season < currentNflSeason() && !allowPastSeason) {
      const message = `Season ${season} is final and was left untouched (send allowPastSeason: true to rebuild it)`;
      console.log(`[sync-nfl-season-stats] ${message}`);
      await completeSyncLog(supabase, syncLogId, startTime, {
        status: "success",
        records_added: 0,
        details: { season, skipped: message },
      });
      return new Response(
        JSON.stringify({ success: true, skipped: true, season, statsSync: 0, count: 0, message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    console.log(`[sync-nfl-season-stats] Starting sync for season ${season} (prune=${prune})`);

    await supabase
      .from("sync_schedule")
      .upsert({
        sport: "NFL",
        data_type: "season_stats",
        last_sync_at: new Date().toISOString(),
        last_sync_status: "in_progress",
        error_message: null,
      }, { onConflict: "sport,data_type" });

    // Totals are summed from our stored game logs (BDL box scores after the
    // ESPN phantom guard), with BDL's season line supplying only official
    // games played. See _shared/nfl-season-rebuild.ts. Seasons with no stored
    // logs are left untouched.
    let rebuild: SeasonRebuildResult;
    try {
      rebuild = await rebuildNflSeasonStats(supabase, apiKey, season, { prune });
    } catch (error) {
      await supabase
        .from("sync_schedule")
        .update({
          last_sync_status: "failed",
          error_message: error instanceof Error ? error.message : "Failed to rebuild season stats",
        })
        .eq("sport", "NFL")
        .eq("data_type", "season_stats");
      throw error;
    }
    const successCount = rebuild.upserted;
    const errorMessages = rebuild.errors;

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

    console.log(`[sync-nfl-season-stats] Sync completed: ${successCount} stats in ${duration}s`);

    await completeSyncLog(supabase, syncLogId, startTime, {
      status: finalStatus === "failed" ? "failed" : finalStatus === "partial" ? "partial" : "success",
      records_added: successCount,
      details: { ...rebuild, errors: errorMessages.length > 0 ? errorMessages : undefined },
    });

    return new Response(
      JSON.stringify({
        success: finalStatus !== "failed",
        statsSync: successCount,
        count: successCount,
        regular: rebuild.regular,
        postseason: rebuild.postseason,
        pruned: rebuild.pruned,
        duration: `${duration}s`,
        season,
        status: finalStatus,
        message: `Synced ${successCount.toLocaleString()} NFL season stats for ${season}`,
        errors: errorMessages.length > 0 ? errorMessages : undefined,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: finalStatus === "failed" ? 500 : 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[sync-nfl-season-stats] Error:", errorMessage);

    await completeSyncLog(supabase, syncLogId, startTime, {
      status: "failed",
      error_message: errorMessage,
    });

    return new Response(
      JSON.stringify({ success: false, error: "An unexpected error occurred. Please try again later." }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
