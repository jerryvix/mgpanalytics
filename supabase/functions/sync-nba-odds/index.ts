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
  games: { id: string; home_team_name: string; visitor_team_name: string }[]
): { id: string; home_team_name: string; visitor_team_name: string } | null {
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

    if (!BALLDONTLIE_API_KEY) {
      throw new Error("BALLDONTLIE_API_KEY not configured");
    }
    if (!THE_ODDS_API_KEY) {
      throw new Error("THE_ODDS_API_KEY not configured");
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration missing");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // =========================
    // STEP 1: Fetch NBA games from BallDontLie
    // =========================
    console.log("Fetching NBA games from BallDontLie...");
    const gamesUrl = "https://api.balldontlie.io/v1/games?seasons[]=2024&per_page=100";
    
    const gamesResponse = await fetch(gamesUrl, {
      headers: {
        Authorization: BALLDONTLIE_API_KEY,
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
    // STEP 2: Delete existing NBA games for this season
    // =========================
    console.log("Deleting existing 2025 NBA games...");
    const { error: deleteGamesError } = await supabase
      .from("nba_games")
      .delete()
      .eq("season", 2025);

    if (deleteGamesError) {
      console.error("Error deleting existing games:", deleteGamesError);
    }

    // =========================
    // STEP 3: Insert new games into nba_games table
    // =========================
    const gamesToInsert = apiGames.map((game) => ({
      season: 2025,
      date: game.date,
      status: game.status,
      home_team_name: game.home_team.full_name,
      visitor_team_name: game.visitor_team.full_name,
      home_team_id: game.home_team.id,
      visitor_team_id: game.visitor_team.id,
      external_id: `nba_${game.id}`,
    }));

    let insertedGames: { id: string; home_team_name: string; visitor_team_name: string }[] = [];

    if (gamesToInsert.length > 0) {
      const { data: insertedData, error: insertGamesError } = await supabase
        .from("nba_games")
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
    // STEP 4: Fetch NBA odds from The Odds API
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
    // STEP 5: Delete existing odds for synced games
    // =========================
    if (insertedGames.length > 0 && !oddsError) {
      const gameIds = insertedGames.map((g) => g.id);
      const { error: deleteOddsError } = await supabase
        .from("nba_odds")
        .delete()
        .in("game_id", gameIds);

      if (deleteOddsError) {
        console.error("Error deleting existing odds:", deleteOddsError);
      }
    }

    // =========================
    // STEP 6: Process and insert odds
    // =========================
    let oddsInsertedCount = 0;
    const oddsToInsert: any[] = [];

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
        .from("nba_odds")
        .upsert(oddsToInsert, { onConflict: "game_id,sportsbook" });

      if (insertOddsError) {
        console.error("Error inserting odds:", insertOddsError);
      } else {
        oddsInsertedCount = oddsToInsert.length;
        console.log(`Inserted ${oddsInsertedCount} NBA odds records`);
      }
    }

    // =========================
    // STEP 7: Return success response
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
    console.error("Error in sync-nba-odds function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
