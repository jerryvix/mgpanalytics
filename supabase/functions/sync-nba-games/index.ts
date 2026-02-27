import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Normalize team names for matching (same approach as NCAAB sync)
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findMatchingGame(
  oddsHome: string,
  oddsAway: string,
  games: { id: string; home_team_name: string; visitor_team_name: string }[]
): { id: string; home_team_name: string; visitor_team_name: string } | null {
  const normOddsHome = normalizeTeamName(oddsHome);
  const normOddsAway = normalizeTeamName(oddsAway);

  for (const game of games) {
    const dbHome = normalizeTeamName(game.home_team_name);
    const dbAway = normalizeTeamName(game.visitor_team_name);

    const homeMatch = normOddsHome.includes(dbHome) || dbHome.includes(normOddsHome) ||
      normOddsHome.split(" ").some((part: string) => dbHome.includes(part) && part.length > 3);
    const awayMatch = normOddsAway.includes(dbAway) || dbAway.includes(normOddsAway) ||
      normOddsAway.split(" ").some((part: string) => dbAway.includes(part) && part.length > 3);

    if (homeMatch && awayMatch) return game;
  }

  return null;
}

interface ESPNGame {
  id: string;
  date: string;
  status: {
    type: {
      name: string;
      state: string;
      completed: boolean;
    };
  };
  competitions: Array<{
    id: string;
    date: string;
    competitors: Array<{
      id: string;
      homeAway: string;
      team: {
        id: string;
        name: string;
        displayName: string;
        abbreviation: string;
      };
      score?: string;
    }>;
  }>;
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
    const BALLDONTLIE_API_KEY = Deno.env.get("BALLDONTLIE_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase configuration missing");
    }

    // Service client for database operations (used by both auth paths)
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Cron auth bypass — allows dispatch-syncs to call without user JWT
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log(`[sync-nba-games] Authenticated via cron secret`);
    } else {
      // Authenticate user - require admin role
      const authHeader = req.headers.get("Authorization");
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

      const userId = user.id;

      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .single();

      if (roleError || roleData?.role !== "admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden - admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[sync-nba-games] Admin user ${userId} authenticated, starting NBA games sync via ESPN...`);
    }

    // Dynamic season calculation
    const now = new Date();
    const bdlSeason = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
    const dbSeason = bdlSeason + 1;
    console.log(`[sync-nba-games] Season: BDL=${bdlSeason}, DB=${dbSeason}`);

    // Start sync log
    const triggerSource = detectTriggerSource(req);
    syncLogId = await startSyncLog(supabase, {
      sport: "NBA",
      data_type: "games",
      function_name: "sync-nba-games",
      trigger_source: triggerSource,
      api_source: "espn",
    });

    // Calculate date range: yesterday (for score updates) to +48 hours
    const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // Fetch NBA schedule from ESPN API (free, no key needed)
    // Include yesterday (-1) for completed game score updates, today, and next 2 days
    const dates: string[] = [];
    for (let i = -1; i < 3; i++) {
      const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      dates.push(date.toISOString().split("T")[0].replace(/-/g, ""));
    }

    console.log(`Fetching NBA games for dates: ${dates.join(", ")}`);

    const allGames: ESPNGame[] = [];

    for (const date of dates) {
      try {
        const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${date}`;
        const response = await fetch(espnUrl);

        if (!response.ok) {
          console.error(`ESPN API error for ${date}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const games = data.events || [];
        console.log(`Found ${games.length} NBA games for ${date}`);
        allGames.push(...games);
      } catch (err) {
        console.error(`Error fetching date ${date}:`, err);
      }
    }

    // Include: yesterday's games (for score updates) + upcoming games within 48h window
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    yesterday.setHours(0, 0, 0, 0);
    const upcomingGames = allGames.filter((game) => {
      const gameDate = new Date(game.date);
      return gameDate >= yesterday && gameDate <= in48Hours;
    });

    console.log(`Filtered to ${upcomingGames.length} games (yesterday + next 48h)`);

    // Transform and upsert games
    const gamesToUpsert = upcomingGames.map((game) => {
      const competition = game.competitions?.[0];
      const homeTeam = competition?.competitors?.find((c) => c.homeAway === "home");
      const awayTeam = competition?.competitors?.find((c) => c.homeAway === "away");

      const isCompleted = game.status?.type?.completed === true;
      const homeScore = homeTeam?.score ? parseInt(homeTeam.score) : null;
      const awayScore = awayTeam?.score ? parseInt(awayTeam.score) : null;

      return {
        external_id: `espn_nba_${game.id}`,
        date: game.date,
        season: dbSeason,
        status: game.status?.type?.name || "scheduled",
        home_team_name: homeTeam?.team?.displayName || homeTeam?.team?.name || "TBD",
        visitor_team_name: awayTeam?.team?.displayName || awayTeam?.team?.name || "TBD",
        home_team_id: homeTeam?.team?.id ? parseInt(homeTeam.team.id) : null,
        visitor_team_id: awayTeam?.team?.id ? parseInt(awayTeam.team.id) : null,
        home_score: homeScore,
        away_score: awayScore,
        is_final: isCompleted,
        updated_at: new Date().toISOString(),
      };
    });

    let insertedCount = 0;
    let oddsInsertedCount = 0;

    if (gamesToUpsert.length > 0) {
      const { data: insertedData, error: insertError } = await supabase
        .from("nba_games")
        .upsert(gamesToUpsert, { onConflict: "external_id" })
        .select("id, home_team_name, visitor_team_name");

      if (insertError) {
        console.error("Error inserting games:", insertError);
        throw new Error(`Failed to insert games: ${insertError.message}`);
      }

      insertedCount = insertedData?.length || 0;
      console.log(`Upserted ${insertedCount} NBA games`);
    }

    // Fetch odds from BDL (GOAT tier) — no quota limits, 600 req/min
    if (BALLDONTLIE_API_KEY) {
      const { data: gamesForOdds } = await supabase
        .from("nba_games")
        .select("id, home_team_name, visitor_team_name")
        .gte("date", yesterday.toISOString())
        .lte("date", in48Hours.toISOString());

      if (gamesForOdds && gamesForOdds.length > 0) {
        try {
          const todayStr = now.toISOString().split("T")[0];
          const tomorrowStr = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];
          const bdlOddsUrl = `https://api.balldontlie.io/v2/odds?dates[]=${todayStr}&dates[]=${tomorrowStr}`;
          const oddsResponse = await fetch(bdlOddsUrl, {
            headers: { Authorization: BALLDONTLIE_API_KEY },
          });

          if (oddsResponse.ok) {
            const bdlData = await oddsResponse.json();
            const bdlOdds = bdlData.data || [];
            console.log(`Fetched ${bdlOdds.length} BDL odds entries for NBA`);

            const allowedVendors = ["draftkings", "fanduel", "caesars", "betrivers"];
            // Group BDL odds by game_id to find home/away team names for matching
            const oddsByBdlGame = new Map<number, typeof bdlOdds>();
            for (const odd of bdlOdds) {
              if (!allowedVendors.includes(odd.vendor?.toLowerCase())) continue;
              const group = oddsByBdlGame.get(odd.game_id) || [];
              group.push(odd);
              oddsByBdlGame.set(odd.game_id, group);
            }

            // BDL odds don't include team names directly — we need to match via the
            // BDL games endpoint or infer from spread signs. Fetch BDL games for mapping.
            const bdlGamesUrl = `https://api.balldontlie.io/v2/games?dates[]=${todayStr}&dates[]=${tomorrowStr}`;
            const bdlGamesResp = await fetch(bdlGamesUrl, {
              headers: { Authorization: BALLDONTLIE_API_KEY },
            });
            const bdlGamesData = bdlGamesResp.ok ? await bdlGamesResp.json() : { data: [] };
            const bdlGames = bdlGamesData.data || [];

            // Build BDL game_id → { home_team, visitor_team } map
            const bdlGameMap = new Map<number, { home: string; away: string }>();
            for (const g of bdlGames) {
              bdlGameMap.set(g.id, {
                home: g.home_team?.full_name || g.home_team?.name || "",
                away: g.visitor_team?.full_name || g.visitor_team?.name || "",
              });
            }

            const oddsToUpsert: Array<{
              game_id: string;
              sportsbook: string;
              spread_value: number | null;
              spread_odds: number | null;
              moneyline_home: number | null;
              moneyline_away: number | null;
              total_value: number | null;
              total_over_odds: number | null;
              total_under_odds: number | null;
            }> = [];

            for (const [bdlGameId, gameOdds] of oddsByBdlGame) {
              const bdlGame = bdlGameMap.get(bdlGameId);
              if (!bdlGame) {
                console.log(`[sync-nba-games] No BDL game found for game_id ${bdlGameId}`);
                continue;
              }

              const matchedGame = findMatchingGame(bdlGame.home, bdlGame.away, gamesForOdds);
              if (!matchedGame) {
                console.log(`[sync-nba-games] No DB match for BDL: ${bdlGame.away} @ ${bdlGame.home}`);
                continue;
              }

              for (const odd of gameOdds) {
                oddsToUpsert.push({
                  game_id: matchedGame.id,
                  sportsbook: odd.vendor.toLowerCase(),
                  spread_value: odd.spread_home_value != null ? parseFloat(odd.spread_home_value) : null,
                  spread_odds: odd.spread_home_odds ?? null,
                  moneyline_home: odd.moneyline_home_odds ?? null,
                  moneyline_away: odd.moneyline_away_odds ?? null,
                  total_value: odd.total_value != null ? parseFloat(odd.total_value) : null,
                  total_over_odds: odd.total_over_odds ?? null,
                  total_under_odds: odd.total_under_odds ?? null,
                });
              }
            }

            if (oddsToUpsert.length > 0) {
              const { error: oddsError } = await supabase
                .from("nba_odds")
                .upsert(oddsToUpsert, { onConflict: "game_id,sportsbook" });

              if (oddsError) {
                console.error("Error inserting odds:", oddsError);
              } else {
                oddsInsertedCount = oddsToUpsert.length;
                console.log(`Upserted ${oddsInsertedCount} NBA odds records via BDL`);
              }
            }
          } else {
            console.error(`BDL odds API returned ${oddsResponse.status}`);
          }
        } catch (oddsErr) {
          console.error("Error fetching BDL odds:", oddsErr);
        }
      } else {
        console.log("No NBA games in window for odds matching");
      }
    } else {
      console.log("[sync-nba-games] BALLDONTLIE_API_KEY not set, skipping odds");
    }

    const response = {
      success: true,
      gamesCount: insertedCount,
      oddsCount: oddsInsertedCount,
      message: `Synced ${insertedCount} NBA games, ${oddsInsertedCount} odds records for next 48 hours`,
    };

    console.log("NBA sync completed:", response);

    // Complete sync log — success
    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: insertedCount,
      details: {
        dates_fetched: dates,
        total_espn_games: allGames.length,
        filtered_48h: upcomingGames.length,
        season: { bdl: bdlSeason, db: dbSeason },
        odds_synced: oddsInsertedCount,
        odds_source: "bdl",
      },
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in sync-nba-games:", error);

    // Complete sync log — failure
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
