import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

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

interface OddsOutcome {
  name: string;
  price: number;
  point?: number;
}

interface OddsMarket {
  key: string;
  last_update: string;
  outcomes: OddsOutcome[];
}

interface OddsBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsMarket[];
}

interface OddsAPIGame {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_SPORTSBOOKS = ["draftkings", "fanduel", "caesars", "betrivers"];

// Normalize team names for matching
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Try to match odds game to our database game
function findMatchingGame(
  oddsGame: OddsAPIGame,
  games: { id: number; home_team_name: string; visitor_team_name: string }[]
): { id: number; home_team_name: string; visitor_team_name: string } | null {
  const oddsHome = normalizeTeamName(oddsGame.home_team);
  const oddsAway = normalizeTeamName(oddsGame.away_team);

  for (const game of games) {
    const dbHome = normalizeTeamName(game.home_team_name);
    const dbAway = normalizeTeamName(game.visitor_team_name);

    // Check if team names match (either partial or full match)
    const homeMatch = oddsHome.includes(dbHome) || dbHome.includes(oddsHome) ||
                      oddsHome.split(" ").some((part: string) => dbHome.includes(part) && part.length > 3);
    const awayMatch = oddsAway.includes(dbAway) || dbAway.includes(oddsAway) ||
                      oddsAway.split(" ").some((part: string) => dbAway.includes(part) && part.length > 3);

    if (homeMatch && awayMatch) {
      return game;
    }
  }

  return null;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting NBA games and odds sync...");

    const BALLDONTLIE_API_KEY = Deno.env.get("BALLDONTLIE_API_KEY");
    const THE_ODDS_API_KEY = Deno.env.get("THE_ODDS_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!BALLDONTLIE_API_KEY) {
      throw new Error("BALLDONTLIE_API_KEY not configured");
    }
    if (!THE_ODDS_API_KEY) {
      throw new Error("THE_ODDS_API_KEY not configured");
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase configuration missing");
    }

    // Authenticate user - require admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized - no token provided" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.substring(7);
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claims, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized - invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claims.claims.sub;
    
    // Check admin role using service client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
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

    console.log(`Admin user ${userId} authenticated, proceeding with sync...`);

    // =========================
    // STEP 1: Prune old NBA games (older than 48 hours)
    // =========================
    console.log("Pruning NBA games older than 48 hours...");
    const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    
    const { error: pruneError } = await supabase
      .from("games")
      .delete()
      .eq("league", "NBA")
      .lt("date", cutoffDate);

    if (pruneError) {
      console.error("Error pruning old NBA games:", pruneError);
    } else {
      console.log("Pruned old NBA games successfully");
    }

    // =========================
    // STEP 2: Fetch NBA games from BallDontLie /nba/v1/games
    // =========================
    console.log("Fetching NBA games from BallDontLie...");
    
    // Use exact dates as specified
    const startDate = "2026-01-14";
    const endDate = "2026-01-21";
    
    const gamesUrl = `https://api.balldontlie.io/nba/v1/games?seasons[]=2025&start_date=${startDate}&end_date=${endDate}&per_page=100`;
    
    console.log("Fetching from URL:", gamesUrl);
    
    const gamesResponse = await fetch(gamesUrl, {
      headers: {
        "Authorization": BALLDONTLIE_API_KEY,
      },
    });

    if (!gamesResponse.ok) {
      const errorText = await gamesResponse.text();
      console.error("BallDontLie API error:", errorText);
      throw new Error(`Failed to fetch NBA games: ${gamesResponse.status} - ${errorText}`);
    }

    const gamesData = await gamesResponse.json();
    const apiGames: BallDontLieGame[] = gamesData.data || [];
    console.log(`Fetched ${apiGames.length} NBA games from BallDontLie`);

    // =========================
    // STEP 3: Delete existing NBA games in this date range
    // =========================
    console.log("Deleting existing NBA games in date range...");
    const { error: deleteGamesError } = await supabase
      .from("games")
      .delete()
      .eq("league", "NBA")
      .gte("date", startDate)
      .lte("date", endDate + "T23:59:59Z");

    if (deleteGamesError) {
      console.error("Error deleting existing games:", deleteGamesError);
    }

    // =========================
    // STEP 4: Insert new games into games table with league='NBA'
    // =========================
    const gamesToInsert = apiGames.map((game) => ({
      league: "NBA",
      season: 2025,
      date: game.date,
      status: game.status,
      home_team_name: game.home_team.full_name,
      visitor_team_name: game.visitor_team.full_name,
      postseason: game.postseason || false,
      external_id: `nba_${game.id}`,
    }));

    let insertedGames: { id: number; home_team_name: string; visitor_team_name: string }[] = [];

    if (gamesToInsert.length > 0) {
      const { data: insertedData, error: insertGamesError } = await supabase
        .from("games")
        .upsert(gamesToInsert, { onConflict: "external_id" })
        .select("id, home_team_name, visitor_team_name");

      if (insertGamesError) {
        console.error("Error inserting games:", insertGamesError);
        throw new Error(`Failed to insert games: ${insertGamesError.message}`);
      }

      insertedGames = insertedData || [];
      console.log(`Inserted/updated ${insertedGames.length} NBA games`);
    }

    // =========================
    // STEP 5: Fetch NBA odds from The Odds API
    // =========================
    console.log("Fetching NBA odds from The Odds API...");
    const oddsUrl = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=${THE_ODDS_API_KEY}&markets=spreads,h2h,totals&regions=us&oddsFormat=american`;

    let oddsGames: OddsAPIGame[] = [];
    let oddsError = null;

    try {
      const oddsResponse = await fetch(oddsUrl);
      
      if (!oddsResponse.ok) {
        const errorText = await oddsResponse.text();
        console.error("The Odds API error:", errorText);
        oddsError = `Failed to fetch odds: ${oddsResponse.status}`;
      } else {
        oddsGames = await oddsResponse.json();
        console.log(`Fetched odds for ${oddsGames.length} NBA games`);
      }
    } catch (err: unknown) {
      console.error("Error fetching odds:", err);
      oddsError = err instanceof Error ? err.message : String(err);
    }

    // =========================
    // STEP 6: Delete existing odds for synced games
    // =========================
    if (insertedGames.length > 0 && !oddsError) {
      const gameIds = insertedGames.map((g) => g.id);
      const { error: deleteOddsError } = await supabase
        .from("odds")
        .delete()
        .in("game_id", gameIds);

      if (deleteOddsError) {
        console.error("Error deleting existing odds:", deleteOddsError);
      }
    }

    // =========================
    // STEP 7: Process and insert odds
    // =========================
    let oddsInsertedCount = 0;
    const oddsToInsert: {
      game_id: number;
      sportsbook: string;
      spread_value: number | null;
      spread_odds: number | null;
      moneyline_home: number | null;
      moneyline_away: number | null;
      total_value: number | null;
      total_over_odds: number | null;
      total_under_odds: number | null;
    }[] = [];

    for (const oddsGame of oddsGames) {
      const matchedGame = findMatchingGame(oddsGame, insertedGames);
      
      if (!matchedGame) {
        console.log(`No match found for: ${oddsGame.home_team} vs ${oddsGame.away_team}`);
        continue;
      }

      // Process each bookmaker
      for (const bookmaker of oddsGame.bookmakers) {
        const bookmakerKey = bookmaker.key.toLowerCase();
        
        if (!ALLOWED_SPORTSBOOKS.includes(bookmakerKey)) {
          continue;
        }

        let spreadValue: number | null = null;
        let spreadOdds: number | null = null;
        let moneylineHome: number | null = null;
        let moneylineAway: number | null = null;
        let totalValue: number | null = null;
        let totalOverOdds: number | null = null;
        let totalUnderOdds: number | null = null;

        for (const market of bookmaker.markets) {
          switch (market.key) {
            case "spreads":
              for (const outcome of market.outcomes) {
                if (normalizeTeamName(outcome.name).includes(normalizeTeamName(matchedGame.home_team_name).split(" ").pop() || "")) {
                  spreadValue = outcome.point || null;
                  spreadOdds = outcome.price;
                }
              }
              break;

            case "h2h":
              for (const outcome of market.outcomes) {
                const outcomeName = normalizeTeamName(outcome.name);
                const homeName = normalizeTeamName(matchedGame.home_team_name);
                const awayName = normalizeTeamName(matchedGame.visitor_team_name);
                
                if (outcomeName.includes(homeName.split(" ").pop() || "") || homeName.includes(outcomeName)) {
                  moneylineHome = outcome.price;
                } else if (outcomeName.includes(awayName.split(" ").pop() || "") || awayName.includes(outcomeName)) {
                  moneylineAway = outcome.price;
                }
              }
              break;

            case "totals":
              for (const outcome of market.outcomes) {
                if (outcome.name === "Over") {
                  totalValue = outcome.point || null;
                  totalOverOdds = outcome.price;
                } else if (outcome.name === "Under") {
                  totalUnderOdds = outcome.price;
                }
              }
              break;
          }
        }

        oddsToInsert.push({
          game_id: matchedGame.id,
          sportsbook: bookmakerKey,
          spread_value: spreadValue,
          spread_odds: spreadOdds,
          moneyline_home: moneylineHome,
          moneyline_away: moneylineAway,
          total_value: totalValue,
          total_over_odds: totalOverOdds,
          total_under_odds: totalUnderOdds,
        });
      }
    }

    if (oddsToInsert.length > 0) {
      const { error: insertOddsError } = await supabase
        .from("odds")
        .upsert(oddsToInsert, { onConflict: "game_id,sportsbook" });

      if (insertOddsError) {
        console.error("Error inserting odds:", insertOddsError);
      } else {
        oddsInsertedCount = oddsToInsert.length;
        console.log(`Inserted ${oddsInsertedCount} NBA odds records`);
      }
    }

    // =========================
    // STEP 8: Return success response
    // =========================
    const response = {
      success: true,
      gamesCount: insertedGames.length,
      oddsCount: oddsInsertedCount,
      message: `Synced ${insertedGames.length} NBA games with ${oddsInsertedCount} odds from DraftKings, FanDuel, Caesars, BetRivers`,
      oddsError: oddsError,
    };

    console.log("NBA sync completed:", response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    // Log detailed error server-side only
    console.error("[sync-nba-odds] Error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    
    // Return generic error to client
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
