// Backfill NFL weekly fantasy scoring from nflverse (free, no API key).
// One season per invocation (edge-function timeout pattern, same as
// backfill-nba-games). Body: { season: 2021 }. Idempotent — upserts on
// (gsis_id, season, week, season_type).
//
// Source asset: stats_player release on nflverse-data. Note the old
// `player_stats` release tag was deprecated 2025-08-01; if the URL 404s,
// check https://github.com/nflverse/nflverse-data/releases for the new tag.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const NFLVERSE_URL = (season: number) =>
  `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;

const FANTASY_POS_GROUPS = new Set(["QB", "RB", "WR", "TE"]);

// Minimal RFC-4180 field splitter — handles quoted fields with embedded
// commas/quotes without materializing 190-column row objects for a ~15MB file.
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
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
      console.log(`[backfill-nfl-fantasy] Authenticated via cron secret`);
    } else if (bearerToken === SUPABASE_SERVICE_ROLE_KEY) {
      console.log(`[backfill-nfl-fantasy] Authenticated via service role key`);
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
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();

      if (roleError || roleData?.role !== "admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden - admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[backfill-nfl-fantasy] Admin user ${user.id} authenticated`);
    }

    const triggerSource = detectTriggerSource(req);
    syncLogId = await startSyncLog(supabase, {
      sport: "NFL",
      data_type: "fantasy_backfill",
      function_name: "backfill-nfl-fantasy",
      trigger_source: triggerSource,
      api_source: "nflverse",
    });

    let season: number | null = null;
    try {
      const body = await req.json();
      if (body.season) season = Number(body.season);
    } catch {
      // No body — require an explicit season below
    }

    if (!season || !Number.isInteger(season) || season < 1999 || season > 2100) {
      throw new Error("Body must include a season, e.g. {\"season\": 2021}");
    }

    const url = NFLVERSE_URL(season);
    console.log(`[backfill-nfl-fantasy] Fetching ${url}`);

    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`nflverse fetch failed: ${response.status} for ${url}`);
    }
    const csv = await response.text();

    const lines = csv.split("\n");
    if (lines.length < 2) {
      throw new Error(`nflverse CSV for ${season} is empty (${url})`);
    }

    // Resolve the column indices we need from the header row.
    const header = splitCsvLine(lines[0].replace(/\r$/, ""));
    const col = (name: string): number => {
      const idx = header.indexOf(name);
      if (idx === -1) throw new Error(`Column '${name}' missing from nflverse CSV header (${url})`);
      return idx;
    };
    const idx = {
      gsis_id: col("player_id"),
      player_name: col("player_display_name"),
      position: col("position"),
      pos_group: col("position_group"),
      season: col("season"),
      week: col("week"),
      season_type: col("season_type"),
      team: col("team"),
      fantasy_points: col("fantasy_points"),
      fantasy_points_ppr: col("fantasy_points_ppr"),
    };

    const num = (v: string): number | null => {
      if (v === "" || v === "NA") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    type WeeklyRow = {
      gsis_id: string;
      player_name: string;
      position: string;
      pos_group: string;
      season: number;
      week: number;
      season_type: string;
      team: string | null;
      fantasy_points: number | null;
      fantasy_points_ppr: number | null;
    };

    const rows: WeeklyRow[] = [];
    let skipped = 0;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].replace(/\r$/, "");
      if (!line) continue;
      const f = splitCsvLine(line);

      const posGroup = f[idx.pos_group];
      if (!FANTASY_POS_GROUPS.has(posGroup)) {
        skipped++;
        continue;
      }
      const seasonType = f[idx.season_type];
      if (seasonType !== "REG" && seasonType !== "POST") {
        skipped++;
        continue;
      }
      const gsisId = f[idx.gsis_id];
      const week = num(f[idx.week]);
      const rowSeason = num(f[idx.season]);
      if (!gsisId || week === null || rowSeason === null) {
        skipped++;
        continue;
      }

      rows.push({
        gsis_id: gsisId,
        player_name: f[idx.player_name],
        position: f[idx.position],
        pos_group: posGroup,
        season: rowSeason,
        week,
        season_type: seasonType,
        team: f[idx.team] || null,
        fantasy_points: num(f[idx.fantasy_points]),
        fantasy_points_ppr: num(f[idx.fantasy_points_ppr]),
      });
    }

    console.log(
      `[backfill-nfl-fantasy] Season ${season}: ${rows.length} skill-position weekly rows (${skipped} rows filtered)`
    );

    let upserted = 0;
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabase
        .from("nfl_fantasy_weekly")
        .upsert(batch, { onConflict: "gsis_id,season,week,season_type" });
      if (error) {
        throw new Error(`Upsert failed at batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      }
      upserted += batch.length;
    }

    const result = {
      success: true,
      season,
      rowsUpserted: upserted,
      rowsFiltered: skipped,
      message: `Backfilled ${upserted} weekly fantasy rows for ${season}`,
    };
    console.log("[backfill-nfl-fantasy] Complete:", result);

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: upserted,
      details: { season, rows_filtered: skipped, source_url: url },
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[backfill-nfl-fantasy] Error:", {
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
