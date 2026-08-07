// Refresh the NFL player identity crosswalk (nfl_player_ids) from nflverse
// players.csv (players_components release — free, no API key). One file
// carries everything the backtester needs: GSIS id, display name, position,
// draft capital (draft_round/draft_pick, blank = UDFA), and rookie_season
// (entry year). Idempotent — upserts on gsis_id. No season parameter; the
// file is the full player universe.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";
import { normalizePlayerName } from "../_shared/resolve-player.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const PLAYERS_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/players_components/players.csv";

// Same minimal RFC-4180 splitter as backfill-nfl-fantasy.
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
      console.log(`[sync-nfl-player-ids] Authenticated via cron secret`);
    } else if (bearerToken === SUPABASE_SERVICE_ROLE_KEY) {
      console.log(`[sync-nfl-player-ids] Authenticated via service role key`);
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

      console.log(`[sync-nfl-player-ids] Admin user ${user.id} authenticated`);
    }

    const triggerSource = detectTriggerSource(req);
    syncLogId = await startSyncLog(supabase, {
      sport: "NFL",
      data_type: "player_ids",
      function_name: "sync-nfl-player-ids",
      trigger_source: triggerSource,
      api_source: "nflverse",
    });

    console.log(`[sync-nfl-player-ids] Fetching ${PLAYERS_URL}`);
    const response = await fetch(PLAYERS_URL, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`nflverse fetch failed: ${response.status} for ${PLAYERS_URL}`);
    }
    const csv = await response.text();

    const lines = csv.split("\n");
    if (lines.length < 2) {
      throw new Error(`nflverse players.csv is empty (${PLAYERS_URL})`);
    }

    const header = splitCsvLine(lines[0].replace(/\r$/, ""));
    const col = (name: string): number => {
      const idx = header.indexOf(name);
      if (idx === -1) throw new Error(`Column '${name}' missing from players.csv header`);
      return idx;
    };
    const idx = {
      gsis_id: col("gsis_id"),
      display_name: col("display_name"),
      position: col("position"),
      position_group: col("position_group"),
      latest_team: col("latest_team"),
      rookie_season: col("rookie_season"),
      last_season: col("last_season"),
      draft_year: col("draft_year"),
      draft_round: col("draft_round"),
      draft_pick: col("draft_pick"),
      draft_team: col("draft_team"),
      espn_id: col("espn_id"),
      pfr_id: col("pfr_id"),
    };

    const num = (v: string): number | null => {
      if (!v || v === "NA") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const str = (v: string): string | null => (v && v !== "NA" ? v : null);

    const rows: Record<string, unknown>[] = [];
    let skipped = 0;
    const seen = new Set<string>();
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].replace(/\r$/, "");
      if (!line) continue;
      const f = splitCsvLine(line);
      const gsisId = f[idx.gsis_id];
      const displayName = f[idx.display_name];
      if (!gsisId || !displayName || seen.has(gsisId)) {
        skipped++;
        continue;
      }
      seen.add(gsisId);
      rows.push({
        gsis_id: gsisId,
        display_name: displayName,
        name_normalized: normalizePlayerName(displayName),
        position: str(f[idx.position]),
        position_group: str(f[idx.position_group]),
        latest_team: str(f[idx.latest_team]),
        rookie_season: num(f[idx.rookie_season]),
        last_season: num(f[idx.last_season]),
        draft_year: num(f[idx.draft_year]),
        draft_round: num(f[idx.draft_round]),
        draft_pick: num(f[idx.draft_pick]),
        draft_team: str(f[idx.draft_team]),
        espn_id: str(f[idx.espn_id]),
        pfr_id: str(f[idx.pfr_id]),
        updated_at: new Date().toISOString(),
      });
    }

    console.log(`[sync-nfl-player-ids] ${rows.length} players parsed (${skipped} rows skipped)`);

    let upserted = 0;
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabase
        .from("nfl_player_ids")
        .upsert(batch, { onConflict: "gsis_id" });
      if (error) {
        throw new Error(`Upsert failed at batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      }
      upserted += batch.length;
    }

    const result = {
      success: true,
      rowsUpserted: upserted,
      rowsSkipped: skipped,
      message: `Refreshed ${upserted} crosswalk rows from nflverse players.csv`,
    };
    console.log("[sync-nfl-player-ids] Complete:", result);

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: upserted,
      details: { rows_skipped: skipped, source_url: PLAYERS_URL },
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[sync-nfl-player-ids] Error:", {
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
