// Ingest FantasyPros PPR redraft expert consensus ranks (ECR) from the
// DynastyProcess data repo (github.com/dynastyprocess/data, refreshed daily).
// gsis ids resolve through the repo's own fantasypros_id -> gsis_id
// crosswalk, so no name matching is involved. Body: { "season": 2026 };
// defaults to the upcoming season. Idempotent - upserts on
// (season, source, fp_id) and prunes players who fell off the board.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";
import { mostRecentCompletedNflSeason } from "../_shared/nfl-season.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const ECR_SOURCE = "fp_ppr_redraft";
const ECR_PAGE = "/nfl/rankings/ppr-cheatsheets.php";
const ECR_URL = "https://github.com/dynastyprocess/data/raw/master/files/db_fpecr_latest.csv";
const IDS_URL = "https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv";
const RANKED_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

// Minimal RFC-4180 field splitter (same approach as backfill-nfl-fantasy).
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

async function fetchCsv(url: string): Promise<{ header: string[]; lines: string[] }> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} for ${url}`);
  }
  const text = await response.text();
  const lines = text.split("\n");
  if (lines.length < 2) throw new Error(`Empty CSV at ${url}`);
  return { header: splitCsvLine(lines[0].replace(/\r$/, "")), lines };
}

const colIndex = (header: string[], name: string, url: string): number => {
  const i = header.indexOf(name);
  if (i === -1) throw new Error(`Column '${name}' missing from ${url}`);
  return i;
};

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
      console.log(`[sync-ecr] Authenticated via cron secret`);
    } else if (bearerToken === SUPABASE_SERVICE_ROLE_KEY) {
      console.log(`[sync-ecr] Authenticated via service role key`);
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

      console.log(`[sync-ecr] Admin user ${user.id} authenticated`);
    }

    const triggerSource = detectTriggerSource(req);
    syncLogId = await startSyncLog(supabase, {
      sport: "NFL",
      data_type: "ecr",
      function_name: "sync-ecr",
      trigger_source: triggerSource,
      api_source: "dynastyprocess",
    });

    let season: number | null = null;
    try {
      const body = await req.json();
      if (body.season) season = Number(body.season);
    } catch {
      // No body - default below
    }
    if (!season) season = mostRecentCompletedNflSeason() + 1;
    if (!Number.isInteger(season) || season < 2015 || season > 2100) {
      throw new Error(`Implausible season ${season}`);
    }

    // fantasypros_id -> gsis_id crosswalk
    const ids = await fetchCsv(IDS_URL);
    const fpCol = colIndex(ids.header, "fantasypros_id", IDS_URL);
    const gsisCol = colIndex(ids.header, "gsis_id", IDS_URL);
    const gsisByFp = new Map<string, string>();
    for (let i = 1; i < ids.lines.length; i++) {
      const line = ids.lines[i].replace(/\r$/, "");
      if (!line) continue;
      const f = splitCsvLine(line);
      const fp = f[fpCol];
      const gsis = f[gsisCol];
      if (fp && fp !== "NA" && gsis && gsis !== "NA") gsisByFp.set(fp, gsis);
    }

    // Latest ECR scrape, filtered to the PPR redraft overall page
    const ecr = await fetchCsv(ECR_URL);
    const c = {
      page: colIndex(ecr.header, "fp_page", ECR_URL),
      player: colIndex(ecr.header, "player", ECR_URL),
      id: colIndex(ecr.header, "id", ECR_URL),
      pos: colIndex(ecr.header, "pos", ECR_URL),
      team: colIndex(ecr.header, "team", ECR_URL),
      ecr: colIndex(ecr.header, "ecr", ECR_URL),
      sd: colIndex(ecr.header, "sd", ECR_URL),
      best: colIndex(ecr.header, "best", ECR_URL),
      worst: colIndex(ecr.header, "worst", ECR_URL),
      scrape: colIndex(ecr.header, "scrape_date", ECR_URL),
    };
    const num = (v: string): number | null => {
      if (!v || v === "NA") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const rows: Record<string, unknown>[] = [];
    let unmatched = 0;
    let scrapeDate: string | null = null;
    for (let i = 1; i < ecr.lines.length; i++) {
      const line = ecr.lines[i].replace(/\r$/, "");
      if (!line) continue;
      const f = splitCsvLine(line);
      if (f[c.page] !== ECR_PAGE) continue;
      const pos = f[c.pos];
      if (!RANKED_POSITIONS.has(pos)) continue;
      const ecrVal = num(f[c.ecr]);
      if (ecrVal == null || !f[c.id]) continue;
      const gsis = gsisByFp.get(f[c.id]) ?? null;
      if (!gsis) unmatched++;
      scrapeDate = f[c.scrape] && f[c.scrape] !== "NA" ? f[c.scrape] : scrapeDate;
      rows.push({
        season,
        source: ECR_SOURCE,
        fp_id: f[c.id],
        player_name: f[c.player],
        position: pos,
        team: f[c.team] === "NA" ? null : f[c.team],
        ecr: ecrVal,
        sd: num(f[c.sd]),
        best: num(f[c.best]),
        worst: num(f[c.worst]),
        gsis_id: gsis,
        scrape_date: scrapeDate,
      });
    }

    if (rows.length === 0) {
      throw new Error(`No rows found for page ${ECR_PAGE} - did the repo layout change?`);
    }

    let upserted = 0;
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabase
        .from("nfl_ecr_snapshots")
        .upsert(batch, { onConflict: "season,source,fp_id" });
      if (error) throw new Error(`Upsert failed: ${error.message}`);
      upserted += batch.length;
    }

    // Prune players who dropped off the latest board so stale ranks don't linger
    const keepIds = rows.map((r) => r.fp_id as string);
    const { error: pruneError } = await supabase
      .from("nfl_ecr_snapshots")
      .delete()
      .eq("season", season)
      .eq("source", ECR_SOURCE)
      .not("fp_id", "in", `(${keepIds.map((x) => `"${x}"`).join(",")})`);
    if (pruneError) console.error(`[sync-ecr] Prune failed (non-fatal): ${pruneError.message}`);

    const result = {
      success: true,
      season,
      rowsUpserted: upserted,
      unmatchedGsis: unmatched,
      scrapeDate,
      message: `Season ${season}: ${upserted} ECR rows (scrape ${scrapeDate}, ${unmatched} without gsis id)`,
    };
    console.log("[sync-ecr] Complete:", result);

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: upserted,
      details: { season, scrape_date: scrapeDate, unmatched_gsis: unmatched, source_url: ECR_URL },
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[sync-ecr] Error:", {
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
