// CFB roster continuity intel from CollegeFootballData.com (free key, bearer
// auth): returning production, transfer portal moves, and NFL draft picks for
// one season per invocation. Body: { season: 2026 } (defaults to the current
// CFB season, labeled by start year - Jul-Dec = that year, Jan-Jun = prior).
// Idempotent - upserts on each table's natural key. ~3 API calls per run.
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

// CFBD reports returning-production percentages as 0-1 fractions; our tables
// store 0-100. Tolerate either in case the API changes.
function toPercent(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v <= 1.5 ? Math.round(v * 1000) / 10 : Math.round(v * 10) / 10;
}

async function cfbdFetch(path: string, apiKey: string): Promise<unknown[]> {
  const res = await fetch(`${CFBD_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`CFBD ${path} failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error(`CFBD ${path} returned non-array payload`);
  }
  return data;
}

async function upsertBatches(
  supabase: any,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
): Promise<number> {
  const batchSize = 500;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) {
      throw new Error(`${table} upsert failed at batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
    }
    upserted += batch.length;
  }
  return upserted;
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
      console.log(`[sync-cfbd-roster-intel] Authenticated via cron secret`);
    } else if (bearerToken === SUPABASE_SERVICE_ROLE_KEY) {
      console.log(`[sync-cfbd-roster-intel] Authenticated via service role key`);
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

      // Users can hold multiple roles (e.g. 'user' + 'admin') - .single()
      // would error on the second row, so check the set instead
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (roleError || !(roleRows ?? []).some((r: { role: string }) => r.role === "admin")) {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden - admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[sync-cfbd-roster-intel] Admin user ${user.id} authenticated`);
    }

    const triggerSource = detectTriggerSource(req);
    syncLogId = await startSyncLog(supabase, {
      sport: "NCAAF",
      data_type: "roster_intel",
      function_name: "sync-cfbd-roster-intel",
      trigger_source: triggerSource,
      api_source: "cfbd",
    });

    let season = currentCfbSeason();
    try {
      const body = await req.json();
      if (body.season) season = Number(body.season);
    } catch {
      // No body - current season
    }
    if (!Number.isInteger(season) || season < 2000 || season > 2100) {
      throw new Error(`Invalid season ${season} - expected e.g. {"season": 2026}`);
    }

    // 1) Returning production - the headline continuity metric
    const returning = await cfbdFetch(`/player/returning?year=${season}`, CFBD_API_KEY);
    const returningRows = returning
      .map((r: any) => ({
        season,
        school: r.team,
        conference: r.conference ?? null,
        total_ppa: typeof r.totalPPA === "number" ? r.totalPPA : null,
        percent_ppa: toPercent(r.percentPPA),
        percent_passing_ppa: toPercent(r.percentPassingPPA),
        percent_receiving_ppa: toPercent(r.percentReceivingPPA),
        percent_rushing_ppa: toPercent(r.percentRushingPPA),
        usage_returning: toPercent(r.usage),
      }))
      .filter((r) => !!r.school);

    // 2) Transfer portal cycle for this season. The endpoint moved from
    // /player/portal to /player/transfer in CFBD's API rewrite - try the
    // current name first and fall back so a rollout on their side can't
    // silently kill the sync.
    let portal: unknown[];
    try {
      portal = await cfbdFetch(`/player/portal?year=${season}`, CFBD_API_KEY);
    } catch {
      portal = await cfbdFetch(`/player/transfer?year=${season}`, CFBD_API_KEY);
    }
    const seenTransfers = new Set<string>();
    const transferRows: Record<string, unknown>[] = [];
    for (const t of portal as any[]) {
      const playerName = [t.firstName, t.lastName].filter(Boolean).join(" ").trim();
      if (!playerName) continue;
      const origin = t.origin ?? null;
      // Natural key mirrors the table's UNIQUE tuple; a player re-entering
      // the portal in the same cycle keeps their latest row.
      const key = `${playerName}|${origin ?? ""}`;
      if (seenTransfers.has(key)) continue;
      seenTransfers.add(key);
      transferRows.push({
        season,
        player_name: playerName,
        position: t.position ?? null,
        origin_school: origin,
        destination_school: t.destination ?? null,
        transfer_date: t.transferDate ? String(t.transferDate).slice(0, 10) : null,
        rating: typeof t.rating === "number" ? t.rating : null,
        stars: typeof t.stars === "number" ? t.stars : null,
        eligibility: t.eligibility ?? null,
      });
    }

    // 3) Draft picks - departures who left for the NFL ahead of this season
    const picks = await cfbdFetch(`/draft/picks?year=${season}`, CFBD_API_KEY);
    const pickRows = (picks as any[])
      .filter((p) => p.collegeTeam && p.name && typeof p.overall === "number")
      .map((p) => ({
        draft_year: season,
        round: typeof p.round === "number" ? p.round : null,
        overall_pick: p.overall,
        nfl_team: p.nflTeam ?? null,
        player_name: p.name,
        position: p.position ?? null,
        college_school: p.collegeTeam,
      }));

    const returningCount = await upsertBatches(
      supabase, "ncaaf_returning_production", returningRows, "season,school");
    const transferCount = await upsertBatches(
      supabase, "ncaaf_transfers", transferRows, "season,player_name,origin_school");
    const pickCount = await upsertBatches(
      supabase, "ncaaf_draft_picks", pickRows, "draft_year,overall_pick");

    const result = {
      success: true,
      season,
      returningProduction: returningCount,
      transfers: transferCount,
      draftPicks: pickCount,
      message: `Synced roster intel for ${season}: ${returningCount} returning-production rows, ${transferCount} transfers, ${pickCount} draft picks`,
    };
    console.log("[sync-cfbd-roster-intel] Complete:", result);

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: returningCount + transferCount + pickCount,
      api_requests_used: 3,
      details: { season },
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[sync-cfbd-roster-intel] Error:", {
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
