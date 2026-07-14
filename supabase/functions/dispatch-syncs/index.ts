import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";
import { getCorsHeaders, legacyCorsHeaders } from "../_shared/cors.ts";

// Map sync_schedule rows to edge function names
const SYNC_FUNCTION_MAP: Record<string, string> = {
  "NFL:games": "sync-nfl-games",
  "NFL:players": "sync-nfl-players",
  "NFL:season_stats": "sync-nfl-season-stats",
  "NFL:players_slate": "sync-nfl-players-slate",
  "NFL:game_logs": "sync-nfl-game-logs",
  // NFL:advanced_stats — no dedicated function yet; skip
  // NFL:props — handled by ALL:player_props
  "NBA:games": "sync-nba-games",
  "NBA:odds": "sync-nba-games",  // odds fetched inline by sync-nba-games
  "NBA:players": "sync-nba-players",
  "NBA:stats": "sync-nba-stats",
  "NBA:game_logs": "sync-nba-game-logs",
  "NBA:backfill": "backfill-nba-games",
  // NBA:season_stats — same as NBA:stats; skip duplicate
  // NBA:props — handled by ALL:player_props
  "NCAAB:games": "sync-ncaab-games",
  "NCAAB:odds": "sync-ncaab-games",
  "NCAAB:players": "sync-ncaab-players",
  "NCAAF:games": "sync-ncaaf-games",
  "MLB:games": "sync-mlb-games",
  "ALL:player_props": "sync-player-props",
  "ALL:odds_snapshot": "sync-odds-snapshot",
  "ALL:grade_props": "grade-player-props",
};

// Which external API each function primarily calls.
// Functions hitting the same API are staggered to avoid rate-limit cascades.
const FUNCTION_API_GROUP: Record<string, string> = {
  "sync-nfl-games": "espn",
  "sync-nba-games": "espn+bdl",         // ESPN (free) + BDL (GOAT tier)
  "sync-ncaab-games": "espn+bdl",
  "sync-ncaaf-games": "espn",
  "sync-mlb-games": "espn",
  "sync-odds-snapshot": "odds_api+bdl",
  "sync-player-props": "odds_api",
  "sync-nfl-players": "bdl",
  "sync-nfl-season-stats": "bdl",
  "sync-nfl-players-slate": "bdl",
  "sync-nfl-game-logs": "bdl",
  "sync-nba-players": "bdl",
  "sync-nba-stats": "bdl",
  "sync-nba-game-logs": "bdl",
  "backfill-nba-games": "bdl",
  "sync-ncaab-players": "bdl",
  "grade-player-props": "none",
};

// Delay in ms between dispatching functions that share an API group
const STAGGER_DELAY_MS = 3000;

// Approximate season windows (month ranges, 0-indexed)
// Returns true if the sport has active games/data worth syncing right now
function isSportInSeason(sport: string): boolean {
  const month = new Date().getMonth(); // 0=Jan, 11=Dec
  switch (sport) {
    case "NFL":   return month >= 7 || month <= 1;   // Aug–Feb (preseason prep through Super Bowl)
    case "NBA":   return month >= 9 || month <= 5;    // Oct–Jun
    case "NCAAB": return month >= 10 || month <= 3;   // Nov–Apr (March Madness)
    case "NCAAF": return month >= 6 || month <= 0;    // Jul–Jan (preseason schedule prep through bowls)
    case "MLB":   return month >= 2 && month <= 10;   // Mar–Nov (spring training thru WS)
    case "ALL":   return true;                        // Cross-sport syncs always run
    default:      return true;
  }
}

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
    const CRON_SECRET = Deno.env.get("CRON_SECRET");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration missing");
    }
    if (!CRON_SECRET) {
      throw new Error("CRON_SECRET not configured");
    }

    // Auth: accept cron secret OR admin user JWT (service role key no longer accepted as bearer)
    const cronSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("Authorization");

    let isAuthed = cronSecret === CRON_SECRET;

    // If not authed via secret/key, check if caller is an admin user
    if (!isAuthed && authHeader) {
      const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
      const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await authClient.auth.getUser();
      if (user) {
        const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: roleData } = await serviceClient
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .single();
        if (roleData?.role === "admin") {
          isAuthed = true;
        }
      }
    }

    if (!isAuthed) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[dispatch-syncs] Authenticated, checking schedules...");

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date();

    syncLogId = await startSyncLog(supabase, {
      sport: "ALL",
      data_type: "dispatch",
      function_name: "dispatch-syncs",
      trigger_source: detectTriggerSource(req),
      api_source: "supabase",
    });

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
      await completeSyncLog(supabase, syncLogId, syncStartTime, {
        status: "success",
        records_added: 0,
        details: { syncs: [] },
      });
      return new Response(
        JSON.stringify({ success: true, dispatched: 0, message: "No enabled schedules" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine which syncs are due
    const dueSchedules = schedules.filter((s: any) => {
      const key = `${s.sport}:${s.data_type}`;

      // If force-sync specified, only run those
      if (forceSync.length > 0) {
        return forceSync.includes(key) || forceSync.includes(s.data_type);
      }

      // Skip out-of-season sports (saves API quota, especially Odds API)
      if (!isSportInSeason(s.sport)) {
        console.log(`[dispatch-syncs] ${key} skipped — ${s.sport} is out of season`);
        return false;
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
      await completeSyncLog(supabase, syncLogId, syncStartTime, {
        status: "success",
        records_added: 0,
        details: { syncs: [] },
      });
      return new Response(
        JSON.stringify({ success: true, dispatched: 0, message: "No syncs due" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Stagger dispatches: group by API provider to prevent rate-limit cascades.
    // Functions that hit the same external API get a delay between them.
    // Dedup: if the same function is mapped by multiple schedule keys, only fire it once.
    const dispatched: string[] = [];
    const firedFunctions = new Set<string>();
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || SUPABASE_SERVICE_ROLE_KEY;

    // Track last fire time per API group to stagger
    const lastFireByGroup = new Map<string, number>();

    for (const schedule of dueSchedules) {
      const key = `${schedule.sport}:${schedule.data_type}`;
      const functionName = SYNC_FUNCTION_MAP[key];
      if (!functionName) continue;

      // Skip if we already fired this exact function (e.g., NBA:games and NBA:odds both map to sync-nba-games)
      if (firedFunctions.has(functionName)) {
        console.log(`[dispatch-syncs] ${key} → ${functionName} already dispatched, skipping duplicate`);
        dispatched.push(key);
        continue;
      }

      // Stagger: wait if another function using the same API was recently fired
      const apiGroup = FUNCTION_API_GROUP[functionName] || "unknown";
      const apiGroups = apiGroup.split("+"); // e.g., "odds_api+espn" → ["odds_api", "espn"]
      for (const group of apiGroups) {
        if (group === "none" || group === "espn") continue; // ESPN is free/unlimited, no stagger needed
        const lastFire = lastFireByGroup.get(group) || 0;
        const elapsed = Date.now() - lastFire;
        if (elapsed < STAGGER_DELAY_MS) {
          const waitMs = STAGGER_DELAY_MS - elapsed;
          console.log(`[dispatch-syncs] Staggering ${functionName} by ${waitMs}ms (${group} rate limit)`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      }

      const functionUrl = `${SUPABASE_URL}/functions/v1/${functionName}`;
      console.log(`[dispatch-syncs] Firing ${functionName} for ${key} [api: ${apiGroup}]`);

      // Fire the fetch without awaiting — the sync function runs independently
      fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": CRON_SECRET,
          "apikey": ANON_KEY,
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
            records_synced: schedule.data_type === "odds"
              ? (responseData.oddsCount || responseData.count || 0)
              : (responseData.gamesCount || responseData.oddsCount || responseData.count || 0),
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

      firedFunctions.add(functionName);
      for (const group of apiGroups) {
        lastFireByGroup.set(group, Date.now());
      }
      dispatched.push(key);
    }

    const response = {
      success: true,
      dispatched: dispatched.length,
      syncs: dispatched,
      message: `Dispatched ${dispatched.length} syncs (fire-and-forget). Check sync_schedule for results.`,
    };

    console.log("[dispatch-syncs] Complete:", response.message);

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: dispatched.length,
      details: { syncs: dispatched },
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[dispatch-syncs] Error:", error);
    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "failed",
      error_message: error instanceof Error ? error.message : String(error),
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
