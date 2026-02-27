import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Normalize team names for matching (ported from sync-nba-odds)
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Try to match odds game to our database game
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

// High-profile conferences for featured games
const TOP_CONFERENCES = ["ACC", "Big Ten", "Big 12", "SEC", "Big East", "Pac-12", "American"];

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
      curatedRank?: {
        current: number;
      };
      team: {
        id: string;
        name: string;
        displayName: string;
        abbreviation: string;
        conferenceId?: string;
      };
      score?: string;
    }>;
  }>;
}

interface RankedTeam {
  team: {
    id: string;
    name: string;
    displayName: string;
  };
  current: number; // rank
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
      console.log(`[sync-ncaab-games] Authenticated via cron secret`);
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

      console.log(`[sync-ncaab-games] Admin user ${userId} authenticated, starting NCAAB games sync via ESPN...`);
    }

    syncLogId = await startSyncLog(supabase, {
      sport: "NCAAB",
      data_type: "games",
      function_name: "sync-ncaab-games",
      trigger_source: detectTriggerSource(req),
      api_source: "espn",
    });

    // Calculate date range: now to +24 hours
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Fetch AP Top 25 rankings
    let rankedTeams: Map<string, number> = new Map();
    try {
      const rankingsUrl = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/rankings";
      const rankingsResponse = await fetch(rankingsUrl);
      if (rankingsResponse.ok) {
        const rankingsData = await rankingsResponse.json();
        // Find AP Poll
        const apPoll = rankingsData.rankings?.find(
          (r: { name: string }) => r.name === "AP Top 25" || r.name.includes("AP")
        );
        if (apPoll?.ranks) {
          for (const rank of apPoll.ranks) {
            if (rank.team?.id) {
              rankedTeams.set(rank.team.id, rank.current);
            }
          }
        }
        console.log(`Loaded ${rankedTeams.size} AP Top 25 teams`);
      }
    } catch (err) {
      console.error("Error fetching rankings:", err);
    }

    // Get today and tomorrow for 24-hour window
    const dates: string[] = [];
    for (let i = 0; i < 2; i++) {
      const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      dates.push(date.toISOString().split("T")[0].replace(/-/g, ""));
    }

    console.log(`Fetching NCAAB games for dates: ${dates.join(", ")}`);

    const allGames: ESPNGame[] = [];

    for (const date of dates) {
      try {
        const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${date}&limit=100`;
        const response = await fetch(espnUrl);

        if (!response.ok) {
          console.error(`ESPN API error for ${date}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const games = data.events || [];
        console.log(`Found ${games.length} NCAAB games for ${date}`);
        allGames.push(...games);
      } catch (err) {
        console.error(`Error fetching date ${date}:`, err);
      }
    }

    // Filter games within 24-hour window
    const upcomingGames = allGames.filter((game) => {
      const gameDate = new Date(game.date);
      return gameDate >= now && gameDate <= in24Hours;
    });

    console.log(`Filtered to ${upcomingGames.length} games in 24-hour window`);

    // Process games - categorize as ranked or featured
    const processedGames: Array<{
      external_id: string;
      date: string;
      season: number;
      status: string;
      home_team_name: string;
      visitor_team_name: string;
      home_team_id: string | null;
      visitor_team_id: string | null;
      home_team_rank: number | null;
      visitor_team_rank: number | null;
      home_team_conference: string | null;
      visitor_team_conference: string | null;
      is_featured: boolean;
    }> = [];

    for (const game of upcomingGames) {
      const competition = game.competitions?.[0];
      const homeTeam = competition?.competitors?.find((c) => c.homeAway === "home");
      const awayTeam = competition?.competitors?.find((c) => c.homeAway === "away");

      if (!homeTeam || !awayTeam) continue;

      const homeRank = homeTeam.curatedRank?.current || rankedTeams.get(homeTeam.team.id) || null;
      const awayRank = awayTeam.curatedRank?.current || rankedTeams.get(awayTeam.team.id) || null;

      // Only include ranked games (at least one team in top 25)
      const isRanked = (homeRank !== null && homeRank <= 25) || (awayRank !== null && awayRank <= 25);

      const isCompleted = game.status?.type?.completed === true;
      const homeScore = homeTeam.score ? parseInt(homeTeam.score) : null;
      const awayScore = awayTeam.score ? parseInt(awayTeam.score) : null;

      processedGames.push({
        external_id: `espn_ncaab_${game.id}`,
        date: game.date,
        season: now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear(),
        status: game.status?.type?.name || "scheduled",
        home_team_name: homeTeam.team.displayName || homeTeam.team.name,
        visitor_team_name: awayTeam.team.displayName || awayTeam.team.name,
        home_team_id: homeTeam.team.id || null,
        visitor_team_id: awayTeam.team.id || null,
        home_team_rank: homeRank && homeRank <= 25 ? homeRank : null,
        visitor_team_rank: awayRank && awayRank <= 25 ? awayRank : null,
        home_team_conference: null, // ESPN doesn't always provide this in scoreboard
        visitor_team_conference: null,
        is_featured: !isRanked, // If not ranked, mark as featured
        home_score: homeScore,
        away_score: awayScore,
        is_final: isCompleted,
      });
    }

    // Separate ranked and featured games
    const rankedGames = processedGames.filter(
      (g) => g.home_team_rank !== null || g.visitor_team_rank !== null
    );
    const featuredCandidates = processedGames.filter(
      (g) => g.home_team_rank === null && g.visitor_team_rank === null
    );

    console.log(`Found ${rankedGames.length} ranked games, ${featuredCandidates.length} unranked games`);

    // If no ranked games, select ~5 featured games
    let gamesToInsert = rankedGames;
    if (rankedGames.length === 0 && featuredCandidates.length > 0) {
      // Take first 5 games as featured (they're already sorted by ESPN priority)
      gamesToInsert = featuredCandidates.slice(0, 5);
      console.log(`No ranked games found, using ${gamesToInsert.length} featured games`);
    }

    // Historical data preserved — no longer deleting old games

    let insertedCount = 0;
    let oddsInsertedCount = 0;

    if (gamesToInsert.length > 0) {
      const { data: insertedData, error: insertError } = await supabase
        .from("ncaab_games")
        .upsert(gamesToInsert, { onConflict: "external_id" })
        .select("id, home_team_name, visitor_team_name");

      if (insertError) {
        console.error("Error inserting games:", insertError);
        throw new Error(`Failed to insert games: ${insertError.message}`);
      }

      insertedCount = insertedData?.length || 0;
      console.log(`Upserted ${insertedCount} NCAAB games`);
    }

    // Fetch odds from BDL (GOAT tier) — no quota limits, 600 req/min
    if (BALLDONTLIE_API_KEY) {
      const { data: gamesForOdds } = await supabase
        .from("ncaab_games")
        .select("id, home_team_name, visitor_team_name")
        .gte("date", now.toISOString())
        .lte("date", in24Hours.toISOString());

      if (gamesForOdds && gamesForOdds.length > 0) {
        try {
          const todayStr = now.toISOString().split("T")[0];
          const tomorrowStr = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];
          const bdlOddsUrl = `https://api.balldontlie.io/ncaab/v1/odds?dates[]=${todayStr}&dates[]=${tomorrowStr}`;
          const oddsResponse = await fetch(bdlOddsUrl, {
            headers: { Authorization: BALLDONTLIE_API_KEY },
          });

          if (oddsResponse.ok) {
            const bdlData = await oddsResponse.json();
            const bdlOdds = bdlData.data || [];
            console.log(`Fetched ${bdlOdds.length} BDL odds entries for NCAAB`);

            const allowedVendors = ["draftkings", "fanduel", "caesars", "betrivers"];
            // Group BDL odds by game_id for team matching
            const oddsByBdlGame = new Map<number, typeof bdlOdds>();
            for (const odd of bdlOdds) {
              if (!allowedVendors.includes(odd.vendor?.toLowerCase())) continue;
              const group = oddsByBdlGame.get(odd.game_id) || [];
              group.push(odd);
              oddsByBdlGame.set(odd.game_id, group);
            }

            // Fetch BDL NCAAB games for team name mapping
            const bdlGamesUrl = `https://api.balldontlie.io/ncaab/v1/games?dates[]=${todayStr}&dates[]=${tomorrowStr}`;
            const bdlGamesResp = await fetch(bdlGamesUrl, {
              headers: { Authorization: BALLDONTLIE_API_KEY },
            });
            const bdlGamesData = bdlGamesResp.ok ? await bdlGamesResp.json() : { data: [] };
            const bdlGames = bdlGamesData.data || [];

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

            let matchedCount = 0;
            let unmatchedCount = 0;

            for (const [bdlGameId, gameOdds] of oddsByBdlGame) {
              const bdlGame = bdlGameMap.get(bdlGameId);
              if (!bdlGame) {
                console.log(`[sync-ncaab-games] No BDL game found for game_id ${bdlGameId}`);
                unmatchedCount++;
                continue;
              }

              const matchedGame = findMatchingGame(bdlGame.home, bdlGame.away, gamesForOdds);
              if (!matchedGame) {
                unmatchedCount++;
                console.log(`[sync-ncaab-games] No DB match for BDL: ${bdlGame.away} @ ${bdlGame.home}`);
                continue;
              }
              matchedCount++;

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

            console.log(`NCAAB BDL odds matching: ${matchedCount} matched, ${unmatchedCount} unmatched`);

            if (oddsToUpsert.length > 0) {
              const { error: oddsError } = await supabase
                .from("ncaab_odds")
                .upsert(oddsToUpsert, { onConflict: "game_id,sportsbook" });

              if (oddsError) {
                console.error("Error inserting odds:", oddsError);
              } else {
                oddsInsertedCount = oddsToUpsert.length;
                console.log(`Upserted ${oddsInsertedCount} NCAAB odds records via BDL`);
              }
            }
          } else {
            console.error(`BDL NCAAB odds API returned ${oddsResponse.status}`);
          }
        } catch (oddsErr) {
          console.error("Error fetching BDL odds:", oddsErr);
        }
      } else {
        console.log("No NCAAB games in 24h window for odds matching");
      }
    } else {
      console.log("[sync-ncaab-games] BALLDONTLIE_API_KEY not set, skipping odds");
    }

    const response = {
      success: true,
      gamesCount: insertedCount,
      oddsCount: oddsInsertedCount,
      rankedGamesCount: rankedGames.length,
      featuredGamesCount: gamesToInsert.length - rankedGames.length,
      message: `Synced ${insertedCount} NCAAB games (${rankedGames.length} ranked), ${oddsInsertedCount} odds records for next 24 hours`,
    };

    console.log("NCAAB sync completed:", response);

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: insertedCount,
      details: { total_espn_games: allGames.length, filtered_24h: upcomingGames.length, ranked_games: rankedGames.length, odds_synced: oddsInsertedCount, odds_source: "bdl" },
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in sync-ncaab-games:", error);
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
