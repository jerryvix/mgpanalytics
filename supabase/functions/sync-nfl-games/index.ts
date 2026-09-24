import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";
import { fetchEspnOddsBatch } from "../_shared/espn-odds.ts";
import { espnFetch } from "../_shared/espn-fetch.ts";
import { bdlNflFetchAll } from "../_shared/bdl-nfl.ts";
import { currentNflSeason, nflGameRow, type BdlGame } from "../_shared/nfl-sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Team name normalization for matching between APIs
const normalizeTeamName = (name: string): string => {
  return name.toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let syncLogId: string | null = null;
  const syncStartTime = Date.now();
  let supabase: any;

  try {
    const ballDontLieApiKey = Deno.env.get("BALLDONTLIE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!ballDontLieApiKey) {
      throw new Error("BALLDONTLIE_API_KEY not configured");
    }
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error("Supabase configuration missing");
    }

    // Service client for database operations (used by both auth paths)
    supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth: cron secret (dispatch-syncs), service role key, or admin JWT
    const cronSecret = req.headers.get("x-cron-secret");
    const bearer = req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? null;
    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log(`[sync-nfl-games] Authenticated via cron secret`);
    } else if (bearer && bearer === supabaseServiceKey) {
      console.log(`[sync-nfl-games] Authenticated via service role key`);
    } else {
      // Authenticate user - require admin role
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized - no token provided" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user }, error: userError } = await authClient.auth.getUser();
      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized - invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const userId = user.id;

      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();

      if (roleError || roleData?.role !== "admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden - admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Admin user ${userId} authenticated, proceeding with sync...`);
    }

    // Start sync log
    const triggerSource = detectTriggerSource(req);
    syncLogId = await startSyncLog(supabase, {
      sport: "NFL",
      data_type: "games",
      function_name: "sync-nfl-games",
      trigger_source: triggerSource,
      api_source: "mixed",
    });

    // NFL seasons are labeled by START year everywhere (BDL convention and
    // ours): the 2026 season runs Sep 2026 – Feb 2027. Jan/Feb belong to the
    // prior season; from March we target the upcoming season's schedule.
    // An explicit { season } body re-syncs another season (e.g. to backfill
    // final scores for a finished year).
    let nflDbSeason = currentNflSeason();
    try {
      const body = await req.json();
      if (body?.season) nflDbSeason = parseInt(String(body.season), 10);
    } catch {
      // No body: current season
    }
    console.log(`[sync-nfl-games] Season: ${nflDbSeason}`);

    // ===== STEP 1: Fetch games from BallDontLie =====
    // Full season (regular + postseason), paginated via cursor, with 429/5xx
    // retry. BDL /games carries final scores (home_team_score /
    // visitor_team_score) and status_state; both are stored now so results,
    // H2H and records have something to read (is_final was never set before).
    const allSeasonGames: BdlGame[] = await bdlNflFetchAll(
      ballDontLieApiKey,
      "/games",
      [["seasons[]", nflDbSeason]],
    );

    console.log(`Fetched ${allSeasonGames.length} season ${nflDbSeason} games from BallDontLie`);

    if (allSeasonGames.length === 0) {
      console.log(`No games found for season ${nflDbSeason}`);
      await completeSyncLog(supabase, syncLogId, syncStartTime, {
        status: "success",
        records_added: 0,
        details: { season: nflDbSeason, message: "No games on the BDL schedule" },
      });
      return new Response(
        JSON.stringify({ success: true, gamesCount: 0, oddsCount: 0, message: `No games found for season ${nflDbSeason}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Transform and upsert games (UPSERT handles duplicates via onConflict)
    const gamesToUpsert = allSeasonGames.map((game) => nflGameRow(game, nflDbSeason));
    const finalCount = gamesToUpsert.filter((g) => g.is_final).length;

    console.log(`Upserting ${gamesToUpsert.length} games (${finalCount} final with scores)...`);

    const { error: upsertGamesError } = await supabase
      .from("games")
      .upsert(gamesToUpsert, { onConflict: "id" });

    if (upsertGamesError) {
      console.error("Upsert games error:", upsertGamesError);
      throw new Error(`Database error: ${upsertGamesError.message}`);
    }

    console.log(`Successfully upserted ${gamesToUpsert.length} games`);

    // ===== STEP 2: Fetch DraftKings lines from ESPN (free, keyless) =====
    let oddsCount = 0;
    let oddsError: string | null = null;

    try {
      // NFL games come from BDL (numeric ids, no ESPN id stored), so
      // enumerate ESPN's scoreboard for the next 14 days and match events to
      // BDL games by team names + date. ESPN displayName equals BDL
      // full_name for NFL teams, and the date guard keeps a team pair from
      // matching the wrong leg of a season series.
      const nowMs = Date.now();
      const scoreboardDates: string[] = [];
      for (let i = 0; i <= 14; i++) {
        const d = new Date(nowMs + i * 24 * 60 * 60 * 1000);
        scoreboardDates.push(d.toISOString().split("T")[0].replace(/-/g, ""));
      }

      interface EspnEventLite { id: string; date: string; home: string; away: string }
      const espnEvents: EspnEventLite[] = [];
      // site.api 403s edge functions, so these calls are usually served by the
      // cdn.espn.com mirror, which is WEEK-scoped for football: every date in
      // the same week returns that whole week. Without this dedupe each game
      // appeared up to 7 times, and the odds upsert then tried to write the
      // same (game_id, sportsbook) row twice in one statement and failed.
      const seenEventIds = new Set<string>();
      for (const date of scoreboardDates) {
        try {
          const res = await espnFetch(
            `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${date}&limit=100`
          );
          if (!res.ok) continue;
          const data = await res.json();
          for (const ev of data.events || []) {
            if (!ev.id || seenEventIds.has(String(ev.id))) continue;
            const comp = ev.competitions?.[0];
            const home = comp?.competitors?.find((c: { homeAway: string }) => c.homeAway === "home")?.team?.displayName;
            const away = comp?.competitors?.find((c: { homeAway: string }) => c.homeAway === "away")?.team?.displayName;
            const completed = ev.status?.type?.completed === true;
            if (home && away && !completed) {
              seenEventIds.add(String(ev.id));
              espnEvents.push({ id: String(ev.id), date: ev.date, home, away });
            }
          }
        } catch (err) {
          console.error(`ESPN scoreboard error for ${date}:`, err);
        }
      }
      console.log(`ESPN NFL events with possible odds in window: ${espnEvents.length}`);

      const oddsMap = await fetchEspnOddsBatch("nfl", espnEvents.map((e) => e.id));

      // Keyed on the upsert conflict target so one statement never touches
      // the same row twice
      const oddsByKey = new Map<string, {
        game_id: number;
        sportsbook: string;
        spread_value: number;
        spread_odds: number;
        moneyline_home: number | null;
        moneyline_away: number | null;
        total_value: number | null;
        total_over_odds: number | null;
        total_under_odds: number | null;
      }>();

      const MATCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
      for (const ev of espnEvents) {
        const odds = oddsMap.get(ev.id);
        if (!odds) continue;

        const evTime = new Date(ev.date).getTime();
        const evHome = normalizeTeamName(ev.home);
        const evAway = normalizeTeamName(ev.away);
        const matchedGame = gamesToUpsert.find((g) => {
          if (Math.abs(new Date(g.date).getTime() - evTime) > MATCH_WINDOW_MS) return false;
          const gameHome = normalizeTeamName(g.home_team_name);
          const gameAway = normalizeTeamName(g.visitor_team_name);
          const homeMatch = gameHome.includes(evHome) || evHome.includes(gameHome);
          const awayMatch = gameAway.includes(evAway) || evAway.includes(gameAway);
          return homeMatch && awayMatch;
        });

        if (!matchedGame) {
          console.log(`No BDL match for: ${ev.away} @ ${ev.home} (${ev.date})`);
          continue;
        }

        // odds.spread_value / spread_odds are NOT NULL; a row without them
        // would fail the whole batch
        if (odds.spreadHome === null || odds.spreadHomeOdds === null) {
          console.log(`Skipping ${ev.away} @ ${ev.home}: no spread posted yet`);
          continue;
        }

        oddsByKey.set(`${matchedGame.id}|${odds.sportsbook}`, {
          game_id: matchedGame.id,
          sportsbook: odds.sportsbook,
          spread_value: odds.spreadHome,
          spread_odds: odds.spreadHomeOdds,
          moneyline_home: odds.moneylineHome,
          moneyline_away: odds.moneylineAway,
          total_value: odds.totalValue,
          total_over_odds: odds.totalOverOdds,
          total_under_odds: odds.totalUnderOdds,
        });
      }
      const oddsToInsert = [...oddsByKey.values()];

      console.log(`Inserting ${oddsToInsert.length} odds rows...`);

      if (oddsToInsert.length > 0) {
        const { error: insertOddsError } = await supabase
          .from("odds")
          .upsert(oddsToInsert, { onConflict: "game_id,sportsbook" });

        if (insertOddsError) {
          console.error("Insert odds error:", insertOddsError);
          throw new Error(`Odds database error: ${insertOddsError.message}`);
        }
        
        oddsCount = oddsToInsert.length;
        console.log(`Successfully inserted ${oddsCount} odds rows`);
      }

    } catch (err) {
      oddsError = err instanceof Error ? err.message : "Unknown odds error";
      console.error("Odds sync error:", oddsError);
    }

    // ===== STEP 3: Build response =====
    // Counts describe THIS run (the old response reported the number of
    // postseason games in the table, which is why sync_schedule showed 13).
    const sportsbooksMessage = oddsCount > 0
      ? "DraftKings (via ESPN)"
      : "no sportsbooks";

    const message = oddsError
      ? `Synced ${gamesToUpsert.length} games (${finalCount} final). Odds error: ${oddsError}`
      : `Synced ${gamesToUpsert.length} games (${finalCount} final) with ${oddsCount} lines from ${sportsbooksMessage}`;

    // Complete sync log: success
    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: oddsError ? "partial" : "success",
      records_added: gamesToUpsert.length,
      details: { season: nflDbSeason, games_upserted: gamesToUpsert.length, final_games: finalCount, odds_count: oddsCount, odds_error: oddsError },
    });

    // Record the run here too (the dispatcher only records runs it fired, so
    // admin-triggered syncs left the schedule row looking stale)
    await supabase.from("sync_schedule").upsert({
      sport: "NFL",
      data_type: "games",
      last_sync_at: new Date().toISOString(),
      last_sync_status: oddsError ? "partial" : "success",
      records_synced: gamesToUpsert.length,
      error_message: oddsError,
    }, { onConflict: "sport,data_type" });

    return new Response(
      JSON.stringify({
        success: true,
        season: nflDbSeason,
        gamesCount: gamesToUpsert.length,
        finalGames: finalCount,
        oddsCount,
        message,
        oddsError,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    // Log detailed error server-side only
    console.error("[sync-nfl-games] Error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });

    // Complete sync log: failure
    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "failed",
      error_message: error instanceof Error ? error.message : "Unknown error",
    });

    // Return generic error to client
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "An unexpected error occurred. Please try again later." 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
