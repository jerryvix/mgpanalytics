import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Map sync_schedule rows to edge function names
const SYNC_FUNCTION_MAP: Record<string, string> = {
  "NFL:games": "sync-nfl-games",
  "NFL:players": "sync-nfl-players",
  "NFL:season_stats": "sync-nfl-season-stats",
  "NFL:game_logs": "sync-nba-game-logs", // Uses BDL game-by-game approach
  "NBA:games": "sync-nba-games",
  "NBA:odds": "sync-nba-odds",
  "NBA:players": "sync-nba-players",
  "NBA:stats": "sync-nba-stats",
  "NBA:game_logs": "sync-nba-game-logs",
  "NCAAB:games": "sync-ncaab-games",
  "NCAAF:games": "sync-ncaaf-games",
  "MLB:games": "sync-mlb-games",
  "ALL:player_props": "sync-player-props",
  "ALL:odds_snapshot": "sync-odds-snapshot",
  "ALL:grade_props": "grade-player-props",
};

// Parse interval string to milliseconds
function intervalToMs(interval: string): number {
  const match = interval.match(/^(\d+)(h|m|d)$/);
  if (!match) return 24 * 60 * 60 * 1000; // default 24h
  const value = parseInt(match[1]);
  switch (match[2]) {
    case "m": return value * 60 * 1000;
    case "h": return value * 60 * 60 * 1000;
    case "d": return value * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const CRON_SECRET = Deno.env.get("CRON_SECRET");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration missing");
    }
    if (!CRON_SECRET) {
      throw new Error("CRON_SECRET not configured");
    }

    // Auth: accept cron secret, service role key (Bearer or apikey header)
    const cronSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const apikeyHeader = req.headers.get("apikey");

    const isAuthed =
      cronSecret === CRON_SECRET ||
      bearerToken === CRON_SECRET ||
      bearerToken === SUPABASE_SERVICE_ROLE_KEY ||
      apikeyHeader === SUPABASE_SERVICE_ROLE_KEY;

    if (!isAuthed) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[dispatch-syncs] Authenticated, checking schedules...");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date();

    // Check for force-sync parameter (run specific functions regardless of schedule)
    let forceSync: string[] = [];
    try {
      const body = await req.json().catch(() => ({}));
      forceSync = body.force || [];
    } catch {
      // No body or not JSON — that's fine
    }

    // Fetch all enabled schedules
    const { data: schedules, error: schedError } = await supabase
      .from("sync_schedule")
      .select("*")
      .eq("is_enabled", true);

    if (schedError) {
      throw new Error(`Failed to read sync_schedule: ${schedError.message}`);
    }

    if (!schedules || schedules.length === 0) {
      return new Response(
        JSON.stringify({ success: true, dispatched: 0, message: "No enabled schedules" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine which syncs are due
    const dueSchedules = schedules.filter((s) => {
      const key = `${s.sport}:${s.data_type}`;

      // If force-sync specified, only run those
      if (forceSync.length > 0) {
        return forceSync.includes(key) || forceSync.includes(s.data_type);
      }

      // Check if function exists in our map
      if (!SYNC_FUNCTION_MAP[key]) {
        console.log(`[dispatch-syncs] No function mapped for ${key}, skipping`);
        return false;
      }

      // Check if due based on interval
      if (!s.last_sync_at) return true; // Never synced
      const lastSync = new Date(s.last_sync_at);
      const interval = intervalToMs(s.cron_interval || "24h");
      return now.getTime() - lastSync.getTime() >= interval;
    });

    console.log(`[dispatch-syncs] ${dueSchedules.length} syncs due out of ${schedules.length} enabled`);

    if (dueSchedules.length === 0) {
      return new Response(
        JSON.stringify({ success: true, dispatched: 0, message: "No syncs due" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark all due syncs as "running" in sync_schedule, then fire-and-forget
    // Each sync function will take 10-60s; awaiting all would exceed edge function timeout
    const dispatched: string[] = [];
    for (const schedule of dueSchedules) {
      const key = `${schedule.sport}:${schedule.data_type}`;
      const functionName = SYNC_FUNCTION_MAP[key];
      if (!functionName) continue;

      const functionUrl = `${SUPABASE_URL}/functions/v1/${functionName}`;
      console.log(`[dispatch-syncs] Firing ${functionName} for ${key}`);

      // Fire the fetch without awaiting — the sync function runs independently
      fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": CRON_SECRET,
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
        },
      }).then(async (response) => {
        const responseData = await response.json().catch(() => ({}));
        const success = response.ok && responseData.success !== false;
        await supabase
          .from("sync_schedule")
          .upsert({
            sport: schedule.sport,
            data_type: schedule.data_type,
            last_sync_at: new Date().toISOString(),
            last_sync_status: success ? "success" : "failed",
            records_synced: responseData.gamesCount || responseData.oddsCount || responseData.count || 0,
            error_message: success ? null : (responseData.error || `HTTP ${response.status}`),
          }, { onConflict: "sport,data_type" });
        console.log(`[dispatch-syncs] ${key}: ${success ? "success" : "failed"}`);
      }).catch(async (err) => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[dispatch-syncs] ${key} error:`, errorMsg);
        await supabase
          .from("sync_schedule")
          .upsert({
            sport: schedule.sport,
            data_type: schedule.data_type,
            last_sync_at: new Date().toISOString(),
            last_sync_status: "failed",
            error_message: errorMsg,
          }, { onConflict: "sport,data_type" });
      });

      // Mark as running
      await supabase
        .from("sync_schedule")
        .upsert({
          sport: schedule.sport,
          data_type: schedule.data_type,
          last_sync_status: "running",
          error_message: null,
        }, { onConflict: "sport,data_type" });

      dispatched.push(key);
    }

    const response = {
      success: true,
      dispatched: dispatched.length,
      syncs: dispatched,
      message: `Dispatched ${dispatched.length} syncs (fire-and-forget). Check sync_schedule for results.`,
    };

    console.log("[dispatch-syncs] Complete:", response.message);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[dispatch-syncs] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
