import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";

interface BallDontLieTeam {
  id: number;
  conference: string;
  division: string;
  city: string;
  name: string;
  full_name: string;
  abbreviation: string;
}

interface BallDontLieGame {
  id: number;
  date: string;
  season: number;
  status: string;
  period: number;
  time: string | null;
  postseason: boolean;
  home_team: BallDontLieTeam;
  visitor_team: BallDontLieTeam;
  home_team_score: number;
  visitor_team_score: number;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
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
    const BALLDONTLIE_API_KEY = Deno.env.get("BALLDONTLIE_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase configuration missing");
    }
    if (!BALLDONTLIE_API_KEY) {
      throw new Error("BALLDONTLIE_API_KEY not configured");
    }

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auth: cron secret, service role key, or admin JWT
    const cronSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log(`[backfill-nba-games] Authenticated via cron secret`);
    } else if (bearerToken === SUPABASE_SERVICE_ROLE_KEY) {
      console.log(`[backfill-nba-games] Authenticated via service role key`);
    } else {
      // Authenticate user - require admin role
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

      console.log(`[backfill-nba-games] Admin user ${user.id} authenticated`);
    }

    const triggerSource = detectTriggerSource(req);
    syncLogId = await startSyncLog(supabase, {
      sport: "NBA",
      data_type: "backfill",
      function_name: "backfill-nba-games",
      trigger_source: triggerSource,
      api_source: "balldontlie",
    });

    // Parse request body for options
    let startDate: string | null = null;
    let endDate: string | null = null;
    let season: number | null = null;
    try {
      const body = await req.json();
      if (body.start_date) startDate = body.start_date;
      if (body.end_date) endDate = body.end_date;
      if (body.season) season = body.season;
    } catch {
      // Use defaults
    }

    // Dynamic season calculation
    const now = new Date();
    const bdlSeason = season
      ? season - 1 // User provides DB season (e.g. 2026), BDL uses start year (2025)
      : (now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1);
    const dbSeason = bdlSeason + 1;

    // Default date range: season start through today
    if (!startDate) {
      startDate = `${bdlSeason}-10-22`; // NBA season start
    }
    if (!endDate) {
      endDate = now.toISOString().split("T")[0];
    }

    console.log(`[backfill-nba-games] Backfilling season ${dbSeason} (BDL ${bdlSeason}), ${startDate} to ${endDate}`);

    // Fetch all games from BallDontLie with pagination
    let allGames: BallDontLieGame[] = [];
    let cursor: string | null = null;
    let pageCount = 0;

    do {
      let url = `https://api.balldontlie.io/nba/v1/games?seasons[]=${bdlSeason}&start_date=${startDate}&end_date=${endDate}&per_page=100`;
      if (cursor) {
        url += `&cursor=${cursor}`;
      }

      console.log(`[backfill-nba-games] Fetching page ${pageCount + 1}: ${url}`);

      const response = await fetch(url, {
        headers: { Authorization: BALLDONTLIE_API_KEY },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`BallDontLie API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const games: BallDontLieGame[] = data.data || [];
      allGames = allGames.concat(games);

      cursor = data.meta?.next_cursor || null;
      pageCount++;

      console.log(`[backfill-nba-games] Page ${pageCount}: ${games.length} games (total: ${allGames.length})`);

      // Rate limiting: 200ms between requests
      if (cursor) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } while (cursor);

    console.log(`[backfill-nba-games] Fetched ${allGames.length} total games from BDL`);

    // Filter to completed games only (status "Final")
    const completedGames = allGames.filter(g => g.status === "Final");
    const upcomingGames = allGames.filter(g => g.status !== "Final");
    console.log(`[backfill-nba-games] ${completedGames.length} completed, ${upcomingGames.length} upcoming/in-progress`);

    // For each game, check if an ESPN row already exists for the same matchup on the same day
    // If so, update that row. Otherwise, insert with a BDL external_id.
    let upsertedCount = 0;
    let updatedExistingCount = 0;

    // Process in batches
    const batchSize = 50;
    for (let i = 0; i < allGames.length; i += batchSize) {
      const batch = allGames.slice(i, i + batchSize);

      for (const game of batch) {
        const gameDate = game.date.split("T")[0];
        const isCompleted = game.status === "Final";

        // Check for existing ESPN row matching this game
        const { data: existingGames } = await supabase
          .from("nba_games")
          .select("id, external_id")
          .eq("home_team_name", game.home_team.full_name)
          .eq("visitor_team_name", game.visitor_team.full_name)
          .gte("date", `${gameDate}T00:00:00Z`)
          .lte("date", `${gameDate}T23:59:59Z`)
          .limit(1);

        if (existingGames && existingGames.length > 0) {
          // Update existing ESPN row with scores
          const existing = existingGames[0];
          if (isCompleted) {
            await supabase
              .from("nba_games")
              .update({
                home_score: game.home_team_score,
                away_score: game.visitor_team_score,
                is_final: true,
                status: "Final",
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
            updatedExistingCount++;
          }
        } else {
          // Insert new row with BDL external_id
          const { error: insertError } = await supabase
            .from("nba_games")
            .upsert({
              external_id: `bdl_nba_game_${game.id}`,
              date: game.date,
              season: dbSeason,
              status: game.status,
              home_team_name: game.home_team.full_name,
              visitor_team_name: game.visitor_team.full_name,
              home_team_id: game.home_team.id,
              visitor_team_id: game.visitor_team.id,
              home_score: isCompleted ? game.home_team_score : null,
              away_score: isCompleted ? game.visitor_team_score : null,
              is_final: isCompleted,
              updated_at: new Date().toISOString(),
            }, { onConflict: "external_id" });

          if (insertError) {
            console.error(`[backfill-nba-games] Error inserting game ${game.id}:`, insertError.message);
          } else {
            upsertedCount++;
          }
        }
      }

      console.log(`[backfill-nba-games] Processed batch ${Math.floor(i / batchSize) + 1}: ${upsertedCount} new, ${updatedExistingCount} updated`);
    }

    const response = {
      success: true,
      totalFetched: allGames.length,
      completed: completedGames.length,
      newGamesInserted: upsertedCount,
      existingGamesUpdated: updatedExistingCount,
      season: dbSeason,
      dateRange: { start: startDate, end: endDate },
      message: `Backfilled ${upsertedCount} new games, updated ${updatedExistingCount} existing games for season ${dbSeason}`,
    };

    console.log("[backfill-nba-games] Complete:", response);

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: upsertedCount,
      records_updated: updatedExistingCount,
      details: {
        total_fetched: allGames.length,
        completed_games: completedGames.length,
        season: dbSeason,
        date_range: { start: startDate, end: endDate },
        pages_fetched: pageCount,
      },
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[backfill-nba-games] Error:", {
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
        error: "An unexpected error occurred. Please try again later.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
