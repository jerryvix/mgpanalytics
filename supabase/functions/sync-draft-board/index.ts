// Big-board refresh from DraftTek's NFL Draft Big Board (server-rendered
// HTML, no key), cut at the top 200 and checked daily. Parse lives in
// ./parse.ts and the board swap in ./replace.ts (both pure, vitest-covered).
// Each run replaces the board as one capture inside one SQL transaction
// (replace_draft_board, service_role only), so overlapping runs serialize
// and can never empty the board. A fetch, parse, or swap failure throws
// loudly and the last good board stays in place. Rows
// carry DraftTek's own revision date (source_as_of), which the client's
// 21-day staleness check uses, so a source that stops revising reads
// "insufficient" even though we keep re-scraping it.
//
// Source history: Tankathon's board (Aug 2026) stops near 120 prospects;
// DraftTek publishes 300+ in-season and revises weekly, so the board moved
// there when it expanded to a top 200 (Sep 2026).
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { assembleBoard, parseAsOfDate, parseDrafttekPage, type ParsedBoardPage } from "./parse.ts";
import { replaceBoard, type BoardRow } from "./replace.ts";

const SOURCE_NAME = "DraftTek";

// Ranks 1..BOARD_DEPTH must all parse (assembleBoard throws and names any
// missing rank), so a markup or paging change can't ship a board with holes
const BOARD_DEPTH = 200;
const PAGE_SIZE = 150; // DraftTek's paging

/** The draft class of the current CFB season (Jul-Dec = that year's season, Jan-Jun = prior). */
function upcomingDraftYear(now = new Date()): number {
  const season = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return season + 1;
}

const boardPageUrl = (year: number, page: number) =>
  `https://www.drafttek.com/${year}-NFL-Draft-Big-Board/Top-NFL-Draft-Prospects-${year}-Page-${page}.asp`;

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

      console.log(`[sync-draft-board] Admin user ${user.id} authenticated`);
    }

    const triggerSource = detectTriggerSource(req);
    syncLogId = await startSyncLog(supabase, {
      sport: "NCAAF",
      data_type: "draft_board",
      function_name: "sync-draft-board",
      trigger_source: triggerSource,
      api_source: "drafttek",
    });

    // One board, paged; fetch just enough pages to cover BOARD_DEPTH
    const draftYear = upcomingDraftYear();
    const pageCount = Math.ceil(BOARD_DEPTH / PAGE_SIZE);
    const pages: ParsedBoardPage[] = [];
    for (let page = 1; page <= pageCount; page++) {
      const res = await fetch(boardPageUrl(draftYear, page), {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MGPAnalytics/1.0)",
          Accept: "text/html",
        },
      });
      if (!res.ok) {
        throw new Error(`DraftTek page ${page} fetch failed: ${res.status} ${res.statusText}`);
      }
      const parsed = parseDrafttekPage(await res.text());
      if (parsed.draftYear !== draftYear) {
        throw new Error(
          `DraftTek page ${page} is not the ${draftYear} board (title says ${parsed.draftYear ?? "nothing"}) - markup changed?`
        );
      }
      pages.push(parsed);
    }

    // Throws, naming the missing ranks, unless 1..BOARD_DEPTH all parsed
    const { prospects, duplicates, skipped } = assembleBoard(pages, BOARD_DEPTH);
    if (duplicates.length) {
      console.warn(`[sync-draft-board] Skipped repeat names: ${duplicates.join(", ")}`);
    }
    if (skipped.length) {
      // Only rows past BOARD_DEPTH (or with no readable rank) can get here
      console.warn(
        `[sync-draft-board] ${skipped.length} unparseable row(s) outside the top ${BOARD_DEPTH}: ${skipped
          .slice(0, 10)
          .map((s) => `${s.rank ?? "?"} (${s.reason})`)
          .join(", ")}`
      );
    }
    const asOf = pages[0].asOf;
    const revision = pages[0].revision;
    // Staleness is judged by the source's own date, so a board without one
    // can't be trusted to go stale honestly - fail and keep the last good one
    const asOfDate = parseAsOfDate(asOf);
    if (!asOfDate) {
      throw new Error(
        `DraftTek page 1 has no readable revision date ("${asOf ?? "missing"}") - markup changed? Keeping last good board.`
      );
    }

    const capturedAt = new Date().toISOString();
    const rows: BoardRow[] = prospects.map((p) => ({
      rank: p.rank,
      player_name: p.player_name,
      position: p.position,
      school: p.school,
      height: p.height,
      weight: p.weight,
      source: SOURCE_NAME,
      source_as_of: asOfDate,
    }));

    // One transaction in SQL (replace_draft_board): refuses if a newer
    // capture is on the board, upserts this one, deletes strictly older rows,
    // raises unless exactly this capture remains. Any failure throws here, so
    // the sync is FAILED and the previous board is untouched.
    const { pruned } = await replaceBoard(supabase, draftYear, rows, capturedAt);

    const result = {
      success: true,
      draftYear,
      prospects: rows.length,
      pruned,
      asOf: asOfDate,
      revision,
      message: `Refreshed ${draftYear} DraftTek board (${asOf}, ${revision ?? "no revision label"}): ${rows.length} prospects (${pruned} dropped off)`,
    };
    console.log("[sync-draft-board] Complete:", result);

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: rows.length,
      api_requests_used: pageCount,
      details: {
        draft_year: draftYear,
        pruned,
        source: "DraftTek NFL Draft Big Board",
        source_url: boardPageUrl(draftYear, 1),
        as_of: asOfDate,
        revision,
        depth: BOARD_DEPTH,
        duplicates,
        skipped_rows: skipped,
      },
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
