// Ingest season-long prop lines (and the Matchbetwin team win totals that
// ship in the same capture) into nfl_preseason_lines. Two data vintages:
//   { "season": 2025 } -> hand-curated seed (data/seed-2025.ts, source
//                         'manual_seed', per-line sourcing)
//   { "season": 2026 } -> the static preseason futures capture
//                         (data/futures-2026.ts, verbatim copy of
//                         src/data/propFutures.ts, source 'matchbetwin')
// Player names resolve to GSIS ids (nfl_player_ids) AND to players.id (BDL)
// so the grading view can join player_season_stats. Raw names always stored;
// misses surface in nfl_backtest_unmatched. Idempotent upserts.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";
import { buildPlayerResolver, normalizePlayerName, type CrosswalkRow } from "../_shared/resolve-player.ts";
import { NFL_TEAM_ABBR } from "../_shared/nfl-teams.ts";
import { SEED_PROPS_2025, SEED_SEASON } from "./data/seed-2025.ts";
import { NFL_FUTURES, FUTURES_CAPTURED_AT, FUTURES_BOOK } from "./data/futures-2026.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// The season the futures capture belongs to: first NFL season after the
// capture date (captures happen in the July preseason window).
const FUTURES_SEASON = Number(FUTURES_CAPTURED_AT.slice(0, 4));

// Matchbetwin market label -> normalized market code
const FUTURES_MARKET: Record<string, string> = {
  "Regular Season Wins": "season_wins",
  "Regular Season - Total Passing Yards": "pass_yards",
  "Regular Season - Total Passing Touchdowns": "pass_td",
  "Regular Season - Total Rushing Yards": "rush_yards",
  "Regular Season - Total Rushing Touchdowns": "rush_td",
  "Regular Season - Total Receiving Yards": "rec_yards",
  "Regular Season - Total Receiving Touchdowns": "rec_td",
  "Regular Season - Total Sacks": "sacks",
};

// Positions a prop market can belong to: disambiguates duplicate names
// (the Bills QB Josh Allen vs the Jaguars edge rusher). sacks is left open:
// it belongs to defenders, whose positions vary (DE/OLB/DT/LB).
const MARKET_POSITIONS: Record<string, string[]> = {
  pass_yards: ["QB"],
  pass_td: ["QB"],
  rush_yards: ["QB", "RB", "FB", "WR", "TE"],
  rush_td: ["QB", "RB", "FB", "WR", "TE"],
  rec_yards: ["RB", "FB", "WR", "TE"],
  rec_td: ["RB", "FB", "WR", "TE"],
  receptions: ["RB", "FB", "WR", "TE"],
};

function parseAmerican(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/\s+/g, ""));
  if (!Number.isFinite(n) || Math.abs(n) < 100) return null;
  return n;
}

interface LineInput {
  market: string;
  entityType: "player" | "team";
  subject: string;
  line: number;
  overOdds: number | null;
  underOdds: number | null;
  book: string | null;
  capturedAt: string | null;
  source: string;
}

function seedLines(): LineInput[] {
  return SEED_PROPS_2025.map((p) => ({
    market: p.market,
    entityType: "player" as const,
    subject: p.player,
    line: p.line,
    overOdds: p.overOdds,
    underOdds: p.underOdds,
    book: p.book,
    capturedAt: null,
    source: "manual_seed",
  }));
}

function futuresLines(): LineInput[] {
  const out: LineInput[] = [];
  for (const f of NFL_FUTURES) {
    const market = FUTURES_MARKET[f.market];
    if (!market) continue; // unmapped market, not part of the backtest
    out.push({
      market,
      entityType: market === "season_wins" ? "team" : "player",
      subject: f.subject,
      line: f.line,
      overOdds: parseAmerican(f.over),
      underOdds: parseAmerican(f.under),
      book: FUTURES_BOOK,
      capturedAt: FUTURES_CAPTURED_AT,
      source: "matchbetwin",
    });
  }
  return out;
}

async function loadCrosswalk(supabase: any): Promise<CrosswalkRow[]> {
  // All positions: season sack props belong to defenders.
  const rows: CrosswalkRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("nfl_player_ids")
      .select("gsis_id, name_normalized, position, latest_team")
      // Modern archive window, INCLUDING rookies (no games yet -> NULL last_season)
      .or("last_season.gte.2016,last_season.is.null")
      .order("gsis_id") // stable ordering: unordered .range() pages can skip rows
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Crosswalk load failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function loadBdlPlayers(supabase: any): Promise<Map<string, string[]>> {
  // normalized name -> players.id[] (BDL) for the player_season_stats join
  const byName = new Map<string, string[]>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("players")
      .select("id, name")
      .eq("sport", "NFL")
      .order("id") // stable ordering: unordered .range() pages can skip rows
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`players load failed: ${error.message}`);
    for (const p of data ?? []) {
      const key = normalizePlayerName(p.name);
      const list = byName.get(key);
      if (list) list.push(p.id);
      else byName.set(key, [p.id]);
    }
    if (!data || data.length < pageSize) break;
  }
  return byName;
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
      console.log(`[sync-preseason-props] Authenticated via cron secret`);
    } else if (bearerToken === SUPABASE_SERVICE_ROLE_KEY) {
      console.log(`[sync-preseason-props] Authenticated via service role key`);
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

      console.log(`[sync-preseason-props] Admin user ${user.id} authenticated`);
    }

    const triggerSource = detectTriggerSource(req);
    syncLogId = await startSyncLog(supabase, {
      sport: "NFL",
      data_type: "preseason_props",
      function_name: "sync-preseason-props",
      trigger_source: triggerSource,
      api_source: "static_capture",
    });

    let season: number | null = null;
    try {
      const body = await req.json();
      if (body.season) season = Number(body.season);
    } catch {
      // No body: require an explicit season below
    }

    // Cron/dispatch runs come with no body: ingest the latest capture.
    if (season === null) season = FUTURES_SEASON;

    let inputs: LineInput[];
    if (season === SEED_SEASON) {
      inputs = seedLines();
      if (inputs.length === 0) {
        throw new Error(`Seed for ${SEED_SEASON} is empty: data/seed-2025.ts not yet curated`);
      }
    } else if (season === FUTURES_SEASON) {
      inputs = futuresLines();
    } else {
      throw new Error(
        `Body must include a season with a stored capture: {"season": ${SEED_SEASON}} (curated seed) or {"season": ${FUTURES_SEASON}} (futures capture)`
      );
    }

    const overridesRes = await supabase
      .from("nfl_name_overrides")
      .select("source_name, gsis_id")
      .eq("source", season === SEED_SEASON ? "manual_seed" : "matchbetwin");
    const overrides: Record<string, string> = {};
    for (const row of overridesRes.data ?? []) overrides[row.source_name] = row.gsis_id;

    const [crosswalk, bdlByName] = await Promise.all([
      loadCrosswalk(supabase),
      loadBdlPlayers(supabase),
    ]);
    const resolver = buildPlayerResolver(crosswalk, overrides);
    console.log(
      `[sync-preseason-props] Season ${season}: ${inputs.length} lines; crosswalk ${crosswalk.length}, BDL names ${bdlByName.size}`
    );

    const unmatched: string[] = [];
    const rows = inputs.map((l) => {
      let gsisId: string | null = null;
      let playerUuid: string | null = null;
      let teamAbbr: string | null = null;

      if (l.entityType === "team") {
        teamAbbr = NFL_TEAM_ABBR[l.subject] ?? null;
        if (!teamAbbr) unmatched.push(`team: ${l.subject}`);
      } else {
        gsisId = resolver.resolve(l.subject, MARKET_POSITIONS[l.market] ?? null);
        const bdlIds = bdlByName.get(normalizePlayerName(l.subject));
        playerUuid = bdlIds && bdlIds.length === 1 ? bdlIds[0] : null;
        if (!gsisId || !playerUuid) {
          unmatched.push(`${l.subject} [${l.market}]${gsisId ? "" : " no-gsis"}${playerUuid ? "" : " no-bdl"}`);
        }
      }

      return {
        season,
        entity_type: l.entityType,
        market: l.market,
        subject_name: l.subject,
        gsis_id: gsisId,
        player_uuid: playerUuid,
        team_abbr: teamAbbr,
        line: l.line,
        over_odds: l.overOdds,
        under_odds: l.underOdds,
        source: l.source,
        book: l.book,
        captured_at: l.capturedAt,
      };
    });

    let upserted = 0;
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabase
        .from("nfl_preseason_lines")
        .upsert(batch, { onConflict: "season,entity_type,market,subject_name,source" });
      if (error) {
        throw new Error(`Upsert failed at batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      }
      upserted += batch.length;
    }

    const result = {
      success: true,
      season,
      rowsUpserted: upserted,
      unmatchedCount: unmatched.length,
      unmatched: unmatched.slice(0, 25),
      message: `Season ${season}: ${upserted} preseason lines (${unmatched.length} unresolved subjects)`,
    };
    console.log("[sync-preseason-props] Complete:", result);

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: upserted,
      details: { season, unmatched },
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[sync-preseason-props] Error:", {
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
