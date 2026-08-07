// Weekly consensus big-board refresh from Tankathon's NFL Top 101 (server-
// rendered HTML, no key). Parse lives in ./parse.ts (pure, vitest-covered
// against a checked-in fixture). The board is replaced per run: upsert on
// (draft_year, player_name), then prune rows that fell off. A parse failure
// throws loudly — the last good board stays in place and goes stale-aware
// client-side (>21 days → talent signal reads "insufficient").
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { parseBigBoard } from "./parse.ts";

const BOARD_URL = "https://www.tankathon.com/nfl/big_board";
// A real board has ~101 rows; far fewer means the markup changed under us
const MIN_EXPECTED_PROSPECTS = 50;

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

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase configuration missing");
    }

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auth: cron secret, service role key, or admin JWT
    const cronSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log(`[sync-draft-board] Authenticated via cron secret`);
    } else if (bearerToken === SUPABASE_SERVICE_ROLE_KEY) {
      console.log(`[sync-draft-board] Authenticated via service role key`);
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

      console.log(`[sync-draft-board] Admin user ${user.id} authenticated`);
    }

    const triggerSource = detectTriggerSource(req);
    syncLogId = await startSyncLog(supabase, {
      sport: "NCAAF",
      data_type: "draft_board",
      function_name: "sync-draft-board",
      trigger_source: triggerSource,
      api_source: "tankathon",
    });

    const res = await fetch(BOARD_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MGPAnalytics/1.0)",
        Accept: "text/html",
      },
    });
    if (!res.ok) {
      throw new Error(`Tankathon fetch failed: ${res.status} ${res.statusText}`);
    }
    const html = await res.text();

    const { draftYear, prospects } = parseBigBoard(html);
    if (!draftYear) {
      throw new Error("Could not determine draft year from page title — markup changed?");
    }
    if (prospects.length < MIN_EXPECTED_PROSPECTS) {
      throw new Error(
        `Parsed only ${prospects.length} prospects (expected ~101) — markup changed? Keeping last good board.`
      );
    }

    const capturedAt = new Date().toISOString();
    const rows = prospects.map((p) => ({
      draft_year: draftYear,
      rank: p.rank,
      player_name: p.player_name,
      position: p.position,
      school: p.school,
      height: p.height,
      weight: p.weight,
      captured_at: capturedAt,
    }));

    const { error: upsertError } = await supabase
      .from("ncaaf_draft_prospects")
      .upsert(rows, { onConflict: "draft_year,player_name" });
    if (upsertError) {
      throw new Error(`Upsert failed: ${upsertError.message}`);
    }

    // Prune players who fell off the board this week
    const { error: pruneError, count: pruned } = await supabase
      .from("ncaaf_draft_prospects")
      .delete({ count: "exact" })
      .eq("draft_year", draftYear)
      .lt("captured_at", capturedAt);
    if (pruneError) {
      console.error(`[sync-draft-board] Prune failed (board still valid): ${pruneError.message}`);
    }

    const result = {
      success: true,
      draftYear,
      prospects: rows.length,
      pruned: pruned ?? 0,
      message: `Refreshed ${draftYear} big board: ${rows.length} prospects (${pruned ?? 0} dropped off)`,
    };
    console.log("[sync-draft-board] Complete:", result);

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: rows.length,
      api_requests_used: 1,
      details: { draft_year: draftYear, pruned: pruned ?? 0 },
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[sync-draft-board] Error:", {
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
