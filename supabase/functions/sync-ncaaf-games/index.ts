import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";
import { fetchEspnOddsBatch } from "../_shared/espn-odds.ts";
import { collectNcaaf } from "./collect.ts";
import { toGameRow } from "./ranks.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const DAY_MS = 24 * 60 * 60 * 1000;
// -7/+60 days: the lookahead loads the coming weeks (and the early slate in
// preseason); the lookback re-fetches recently played games so their finals
// get written.
const LOOKAHEAD_DAYS = 60;
const LOOKBACK_DAYS = 7;
// Self-heal: games still not final this long after kickoff mean an earlier run
// missed them (the Aug 19 2026 outage left four weeks of 0-0 "scheduled" rows),
// so the lookback stretches back to cover them, up to this far.
const SELF_HEAL_DAYS = 45;
// A backfill window ({ "startDate", "endDate" } in the POST body) is capped.
const MAX_WINDOW_DAYS = 200;
const UPSERT_CHUNK = 400;

function parseDay(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
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

    // Service client for database operations (used by every auth path)
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auth: cron secret (dispatch-syncs), service role key, or an admin JWT
    const cronSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log(`[sync-ncaaf-games] Authenticated via cron secret`);
    } else if (bearerToken && bearerToken === SUPABASE_SERVICE_ROLE_KEY) {
      console.log(`[sync-ncaaf-games] Authenticated via service role key`);
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

      console.log(`[sync-ncaaf-games] Admin user ${user.id} authenticated, starting NCAAF games sync via ESPN...`);
    }

    syncLogId = await startSyncLog(supabase, {
      sport: "NCAAF",
      data_type: "games",
      function_name: "sync-ncaaf-games",
      trigger_source: detectTriggerSource(req),
      api_source: "espn",
    });

    const now = new Date();
    let windowStart = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS);
    let windowEnd = new Date(now.getTime() + LOOKAHEAD_DAYS * DAY_MS);

    // Backfill: POST { "startDate": "2026-08-22", "endDate": "2026-10-10" }
    const body = await req.json().catch(() => null);
    const bodyStart = parseDay(body?.startDate);
    const bodyEnd = parseDay(body?.endDate);
    let mode = "scheduled";
    if (bodyStart || bodyEnd) {
      windowStart = bodyStart ?? windowStart;
      windowEnd = bodyEnd ? new Date(bodyEnd.getTime() + DAY_MS - 1) : windowEnd;
      if (windowEnd <= windowStart || windowEnd.getTime() - windowStart.getTime() > MAX_WINDOW_DAYS * DAY_MS) {
        throw new Error(`Invalid backfill window ${body?.startDate} to ${body?.endDate}`);
      }
      mode = "backfill";
    } else {
      const { data: stale } = await supabase
        .from("ncaaf_games")
        .select("date")
        .eq("is_final", false)
        .not("status", "in", "(STATUS_CANCELED,STATUS_POSTPONED)")
        .lt("date", new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString())
        .gte("date", new Date(now.getTime() - SELF_HEAL_DAYS * DAY_MS).toISOString())
        .order("date", { ascending: true })
        .limit(1);
      const oldestStale = stale?.[0]?.date ? new Date(stale[0].date) : null;
      if (oldestStale && oldestStale < windowStart) {
        windowStart = new Date(oldestStale.getTime() - DAY_MS);
        mode = "self-heal";
      }
    }
    console.log(`[sync-ncaaf-games] ${mode} window ${windowStart.toISOString()} to ${windowEnd.toISOString()}`);

    const { events, polls, diagnostics } = await collectNcaaf(windowStart, windowEnd);
    console.log(
      `[sync-ncaaf-games] ${events.length} games across weeks ${diagnostics.weeks.join(", ")}; ` +
        `latest AP poll ${JSON.stringify(diagnostics.latestPoll)} (${diagnostics.latestRanked} ranked); ` +
        `week polls ${diagnostics.weekPolls.join(", ") || "none"}; ` +
        `curatedRank fallback for ${diagnostics.weekPollsMissing.join(", ") || "none"}`,
    );

    const updatedAt = now.toISOString();
    const gamesToSync = events.map((ev) => toGameRow(ev, polls, updatedAt));
    const rankedGames = gamesToSync.filter((g) => g.is_featured);
    console.log(`Syncing ${gamesToSync.length} games (${rankedGames.length} with an AP Top 25 team)`);

    // Historical data preserved: old games are never deleted
    let insertedCount = 0;
    const insertedData: Array<{ id: string; external_id: string; date: string; is_final: boolean | null }> = [];
    // time_tbd arrives with migration 20260924120000. Until that runs, PostgREST
    // rejects the whole upsert over the unknown column, so drop just that field
    // rather than stop syncing games, and say so in the response and sync log.
    let timeTbdColumn = true;
    const upsertGames = (rows: Record<string, unknown>[]) =>
      supabase
        .from("ncaaf_games")
        .upsert(rows, { onConflict: "external_id" })
        .select("id, external_id, date, is_final");
    for (let i = 0; i < gamesToSync.length; i += UPSERT_CHUNK) {
      const chunk = gamesToSync.slice(i, i + UPSERT_CHUNK);
      const withoutTbd = () => chunk.map(({ time_tbd: _tbd, ...row }) => row);
      let { data, error: insertError } = await upsertGames(timeTbdColumn ? chunk : withoutTbd());
      if (insertError && timeTbdColumn && /time_tbd/.test(insertError.message ?? "")) {
        console.warn("[sync-ncaaf-games] ncaaf_games.time_tbd missing (migration 20260924120000 not applied); syncing without it");
        timeTbdColumn = false;
        ({ data, error: insertError } = await upsertGames(withoutTbd()));
      }

      if (insertError) {
        console.error("Error inserting games:", insertError);
        throw new Error(`Failed to insert games: ${insertError.message}`);
      }
      insertedData.push(...(data ?? []));
    }
    insertedCount = insertedData.length;
    console.log(`Upserted ${insertedCount} NCAAF games`);

    // Fetch DraftKings lines from ESPN (free, keyless) for upcoming games.
    // ESPN event ids come straight from external_id, so no fuzzy matching.
    // Games without posted lines simply return nothing (normal for FCS
    // mismatches and far-out dates).
    if (insertedData.length > 0) {
      try {
        const oddsTargets = insertedData
          .filter((g) => {
            if (g.is_final || !g.external_id?.startsWith("espn_ncaaf_")) return false;
            const d = new Date(g.date);
            return d >= now && d <= windowEnd;
          })
          // Cap per run so a dense in-season window stays fast; nearest first
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(0, 250);

        const idFor = (g: { external_id: string }) => g.external_id.replace("espn_ncaaf_", "");
        const oddsMap = await fetchEspnOddsBatch(
          "college-football",
          oddsTargets.map(idFor),
        );

        const oddsToUpsert = oddsTargets.flatMap((g) => {
          const o = oddsMap.get(idFor(g));
          if (!o) return [];
          return [{
            game_id: g.id,
            sportsbook: o.sportsbook,
            spread_value: o.spreadHome,
            spread_odds: o.spreadHomeOdds,
            moneyline_home: o.moneylineHome,
            moneyline_away: o.moneylineAway,
            total_value: o.totalValue,
            total_over_odds: o.totalOverOdds,
            total_under_odds: o.totalUnderOdds,
          }];
        });

        if (oddsToUpsert.length > 0) {
          const { error: oddsError } = await supabase
            .from("ncaaf_odds")
            .upsert(oddsToUpsert, { onConflict: "game_id,sportsbook" });

          if (oddsError) {
            console.error("Error inserting odds:", oddsError);
          } else {
            console.log(`Upserted ${oddsToUpsert.length} NCAAF odds records via ESPN`);
          }
        } else {
          console.log("No NCAAF odds posted yet for the window");
        }
      } catch (oddsErr) {
        console.error("Error fetching odds:", oddsErr);
      }
    }

    const response = {
      success: true,
      mode,
      gamesCount: insertedCount,
      rankedGamesCount: rankedGames.length,
      finals: gamesToSync.filter((g) => g.is_final).length,
      timeTbd: gamesToSync.filter((g) => g.time_tbd).length,
      timeTbdColumn,
      window: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
      diagnostics,
      message: `Synced ${insertedCount} NCAAF games (${rankedGames.length} Top 25)`,
    };

    console.log("NCAAF sync completed:", JSON.stringify(response));

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: insertedCount,
      details: {
        mode,
        espn_games: events.length,
        ranked_games: rankedGames.length,
        finals: response.finals,
        time_tbd: response.timeTbd,
        time_tbd_column: timeTbdColumn,
        ...diagnostics,
      },
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in sync-ncaaf-games:", error);
    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "failed",
      error_message: error instanceof Error ? error.message : String(error),
    });
    return new Response(
      JSON.stringify({
        success: false,
        error: "An unexpected error occurred. Please try again later.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
