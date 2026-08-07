// Ingest one season of NFL preseason win-total lines AND actual wins from
// SportsOddsHistory (hosted at covers.com — the old sportsoddshistory.com
// domain 301s there, hence redirect:"follow"). The archive table includes
// actual wins + the graded result, so a single scrape fills both
// nfl_preseason_lines (market='season_wins') and nfl_team_season_results.
// One season per invocation, body { "season": 2024 }. Idempotent upserts.
// Citation: SportsOddsHistory.com (required by source terms; shown in UI).
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";
import { mostRecentCompletedNflSeason } from "../_shared/nfl-season.ts";
import { parseWinTotalsPage } from "./parse.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const PAGE_URL = (season: number) =>
  `https://www.covers.com/sportsoddshistory/nfl-win/?y=${season}&sa=nfl&t=win`;

serve(async (req) => {
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
      console.log(`[sync-win-totals] Authenticated via cron secret`);
    } else if (bearerToken === SUPABASE_SERVICE_ROLE_KEY) {
      console.log(`[sync-win-totals] Authenticated via service role key`);
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

      console.log(`[sync-win-totals] Admin user ${user.id} authenticated`);
    }

    const triggerSource = detectTriggerSource(req);
    syncLogId = await startSyncLog(supabase, {
      sport: "NFL",
      data_type: "win_totals",
      function_name: "sync-win-totals",
      trigger_source: triggerSource,
      api_source: "sportsoddshistory",
    });

    let season: number | null = null;
    try {
      const body = await req.json();
      if (body.season) season = Number(body.season);
    } catch {
      // No body — require an explicit season below
    }

    if (season === null) {
      // Cron/dispatch runs come with no body: sync the current (upcoming or
      // in-progress) season so each year's preseason lines are captured, and
      // its actuals fill in once the page grades them.
      season = mostRecentCompletedNflSeason() + 1;
    }
    if (!Number.isInteger(season) || season < 1975 || season > 2100) {
      throw new Error('Season out of range, e.g. {"season": 2024}');
    }

    const url = PAGE_URL(season);
    console.log(`[sync-win-totals] Fetching ${url}`);
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MGPAnalytics backtester)" },
    });
    if (!response.ok) {
      throw new Error(`SportsOddsHistory fetch failed: ${response.status} for ${url}`);
    }
    const html = await response.text();
    const page = parseWinTotalsPage(html);

    if (page.rows.length === 0) {
      throw new Error(`No win-total rows parsed for ${season} — page layout may have changed`);
    }

    const unmatched = page.rows.filter((r) => !r.teamAbbr).map((r) => r.teamName);

    const lineRows = page.rows.map((r) => ({
      season,
      entity_type: "team",
      market: "season_wins",
      subject_name: r.teamName,
      team_abbr: r.teamAbbr,
      line: r.line,
      over_odds: r.overOdds,
      under_odds: r.underOdds,
      source: "sportsoddshistory",
      book: page.book,
      captured_at: page.asOf,
    }));

    const resultRows = page.rows
      .filter((r) => r.teamAbbr && r.actualWins !== null)
      .map((r) => ({
        season,
        team_abbr: r.teamAbbr,
        team_name: r.teamName,
        wins: r.actualWins,
        source: "sportsoddshistory",
      }));

    const { error: lineError } = await supabase
      .from("nfl_preseason_lines")
      .upsert(lineRows, { onConflict: "season,entity_type,market,subject_name,source" });
    if (lineError) throw new Error(`Lines upsert failed: ${lineError.message}`);

    let resultsUpserted = 0;
    if (resultRows.length > 0) {
      const { error: resultError } = await supabase
        .from("nfl_team_season_results")
        .upsert(resultRows, { onConflict: "season,team_abbr" });
      if (resultError) throw new Error(`Results upsert failed: ${resultError.message}`);
      resultsUpserted = resultRows.length;
    }

    const result = {
      success: true,
      season,
      linesUpserted: lineRows.length,
      resultsUpserted,
      book: page.book,
      capturedAt: page.asOf,
      unmatched,
      message: `Season ${season}: ${lineRows.length} win-total lines, ${resultsUpserted} actual records (${page.book ?? "book unstated"})`,
    };
    console.log("[sync-win-totals] Complete:", result);

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: lineRows.length + resultsUpserted,
      details: { season, book: page.book, captured_at: page.asOf, unmatched, source_url: url },
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[sync-win-totals] Error:", {
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
