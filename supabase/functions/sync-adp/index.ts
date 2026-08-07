// Ingest one season of fantasy ADP from the Fantasy Football Calculator
// public API (free for third-party apps, years 2007+). PPR 12-team is the
// canonical snapshot; the API returns a late-August capture window in meta.
// Names are resolved to GSIS ids through nfl_player_ids at ingest — raw
// names are always stored, misses grade as unmatched and surface in
// nfl_backtest_unmatched. One season per invocation, body { "season": 2024 }.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";
import { buildPlayerResolver, type CrosswalkRow } from "../_shared/resolve-player.ts";
import { mostRecentCompletedNflSeason } from "../_shared/nfl-season.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const ADP_SOURCE = "ffc_ppr_12";
const ADP_URL = (season: number) =>
  `https://fantasyfootballcalculator.com/api/v1/adp/ppr?teams=12&year=${season}&position=all`;

// Fantasy-relevant positions we resolve + grade. PK/DEF rows are stored raw
// but never graded (no positional finish rank exists for them).
const GRADED_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

async function loadCrosswalk(supabase: any): Promise<CrosswalkRow[]> {
  const rows: CrosswalkRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("nfl_player_ids")
      .select("gsis_id, name_normalized, position, latest_team")
      .in("position", [...GRADED_POSITIONS])
      .order("gsis_id") // stable ordering — unordered .range() pages can skip rows
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Crosswalk load failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function loadOverrides(supabase: any, source: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("nfl_name_overrides")
    .select("source_name, gsis_id")
    .eq("source", source);
  if (error) throw new Error(`Overrides load failed: ${error.message}`);
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.source_name] = row.gsis_id;
  return map;
}

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
      console.log(`[sync-adp] Authenticated via cron secret`);
    } else if (bearerToken === SUPABASE_SERVICE_ROLE_KEY) {
      console.log(`[sync-adp] Authenticated via service role key`);
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

      console.log(`[sync-adp] Admin user ${user.id} authenticated`);
    }

    const triggerSource = detectTriggerSource(req);
    syncLogId = await startSyncLog(supabase, {
      sport: "NFL",
      data_type: "adp",
      function_name: "sync-adp",
      trigger_source: triggerSource,
      api_source: "fantasyfootballcalculator",
    });

    let season: number | null = null;
    try {
      const body = await req.json();
      if (body.season) season = Number(body.season);
    } catch {
      // No body — require an explicit season below
    }

    if (season === null) {
      // Cron/dispatch runs come with no body: capture the current season's
      // ADP snapshot (FFC serves live drafts through the preseason).
      season = mostRecentCompletedNflSeason() + 1;
    }
    if (!Number.isInteger(season) || season < 2007 || season > 2100) {
      throw new Error('Season must be >= 2007 (FFC coverage), e.g. {"season": 2024}');
    }

    const url = ADP_URL(season);
    console.log(`[sync-adp] Fetching ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`FFC ADP fetch failed: ${response.status} for ${url}`);
    }
    const payload = await response.json();
    const players: any[] = payload?.players ?? [];
    if (players.length === 0) {
      throw new Error(`FFC returned no ADP players for ${season}`);
    }

    const [crosswalk, overrides] = await Promise.all([
      loadCrosswalk(supabase),
      loadOverrides(supabase, ADP_SOURCE),
    ]);
    const resolver = buildPlayerResolver(crosswalk, overrides);
    console.log(`[sync-adp] Crosswalk loaded: ${crosswalk.length} players`);

    const unmatched: string[] = [];
    const rows = players.map((p) => {
      const position = typeof p.position === "string" ? p.position.toUpperCase() : null;
      const gsisId = GRADED_POSITIONS.has(position ?? "")
        ? resolver.resolve(p.name, position, p.team)
        : null;
      if (GRADED_POSITIONS.has(position ?? "") && !gsisId) {
        unmatched.push(`${p.name} (${position})`);
      }
      return {
        season,
        source: ADP_SOURCE,
        player_name: p.name,
        position,
        team: p.team ?? null,
        adp: p.adp,
        high: p.high ?? null,
        low: p.low ?? null,
        stdev: p.stdev ?? null,
        times_drafted: p.times_drafted ?? null,
        gsis_id: gsisId,
      };
    }).filter((r) => r.player_name && Number.isFinite(Number(r.adp)));

    let upserted = 0;
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabase
        .from("nfl_adp_snapshots")
        .upsert(batch, { onConflict: "season,source,player_name,position" });
      if (error) {
        throw new Error(`Upsert failed at batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      }
      upserted += batch.length;
    }

    const result = {
      success: true,
      season,
      rowsUpserted: upserted,
      totalDrafts: payload?.meta?.total_drafts ?? null,
      unmatchedCount: unmatched.length,
      unmatched: unmatched.slice(0, 25),
      message: `Season ${season}: ${upserted} ADP rows (${unmatched.length} unresolved names)`,
    };
    console.log("[sync-adp] Complete:", result);

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: upserted,
      details: {
        season,
        total_drafts: payload?.meta?.total_drafts ?? null,
        capture_window: payload?.meta ? `${payload.meta.start_date}..${payload.meta.end_date}` : null,
        unmatched,
        source_url: url,
      },
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[sync-adp] Error:", {
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
