import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface NFLTeam {
  id: number;
  full_name: string;
}

interface NFLGame {
  id: number;
  home_team: NFLTeam;
  visitor_team: NFLTeam;
  status: string;
  date: string;
  week?: number;
  postseason: boolean;
  season: number;
}

interface BallDontLieResponse {
  data: NFLGame[];
}

// The Odds API types
interface OddsOutcome {
  name: string;
  price: number;
  point?: number;
}

interface OddsMarket {
  key: string;
  outcomes: OddsOutcome[];
}

interface OddsBookmaker {
  key: string;
  title: string;
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

// Team name normalization for matching between APIs
const normalizeTeamName = (name: string): string => {
  return name.toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

// Find matching game by team names
const findMatchingGame = (
  oddsGame: OddsAPIGame,
  games: { id: number; home_team_name: string; visitor_team_name: string }[]
): { id: number; home_team_name: string; visitor_team_name: string } | null => {
  const oddsHome = normalizeTeamName(oddsGame.home_team);
  const oddsAway = normalizeTeamName(oddsGame.away_team);
  
  for (const game of games) {
    const gameHome = normalizeTeamName(game.home_team_name);
    const gameAway = normalizeTeamName(game.visitor_team_name);
    
    // Check if team names match (allowing for partial matches)
    const homeMatch = gameHome.includes(oddsHome) || oddsHome.includes(gameHome);
    const awayMatch = gameAway.includes(oddsAway) || oddsAway.includes(gameAway);
    
    if (homeMatch && awayMatch) {
      return game;
    }
  }
  return null;
};

const ALLOWED_SPORTSBOOKS = ['draftkings', 'fanduel', 'caesars', 'betrivers'];

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ballDontLieApiKey = Deno.env.get("BALLDONTLIE_API_KEY");
    const oddsApiKey = Deno.env.get("THE_ODDS_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    if (!ballDontLieApiKey) {
      throw new Error("BALLDONTLIE_API_KEY not configured");
    }
    if (!oddsApiKey) {
      throw new Error("THE_ODDS_API_KEY not configured");
    }
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error("Supabase configuration missing");
    }

    // Service client for database operations (used by both auth paths)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Cron auth bypass — allows dispatch-syncs to call without user JWT
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log(`[sync-nfl-games] Authenticated via cron secret`);
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
        .single();

      if (roleError || roleData?.role !== "admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden - admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Admin user ${userId} authenticated, proceeding with sync...`);
    }

    // Dynamic season: NFL BDL uses end-year (2025 = 2024-25 season)
    const now = new Date();
    const nflDbSeason = now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();
    console.log(`[sync-nfl-games] Season: ${nflDbSeason}`);

    // ===== STEP 1: Fetch games from BallDontLie =====
    const gamesParams = new URLSearchParams({
      "seasons[]": String(nflDbSeason),
      "postseason": "true",
    });

    const gamesUrl = `https://api.balldontlie.io/nfl/v1/games?${gamesParams.toString()}`;
    console.log("Fetching postseason games from:", gamesUrl);

    const gamesResponse = await fetch(gamesUrl, {
      method: "GET",
      headers: {
        "Authorization": ballDontLieApiKey,
        "Content-Type": "application/json",
      },
    });

    if (!gamesResponse.ok) {
      const errorText = await gamesResponse.text();
      console.error("BallDontLie API error:", gamesResponse.status, errorText);
      
      if (gamesResponse.status === 401) {
        throw new Error("Authorization failed - check API key");
      }
      throw new Error(`Failed to fetch games: ${gamesResponse.status} ${gamesResponse.statusText}`);
    }

    const gamesData: BallDontLieResponse = await gamesResponse.json();
    console.log(`Fetched ${gamesData.data?.length || 0} postseason games from BallDontLie`);

    if (!gamesData.data || gamesData.data.length === 0) {
      console.log("No postseason games found");
      return new Response(
        JSON.stringify({ success: true, gamesCount: 0, oddsCount: 0, message: "No postseason games found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Transform and upsert games (UPSERT handles duplicates via onConflict)
    const gamesToUpsert = gamesData.data.map((game) => ({
      id: game.id,
      league: "NFL",
      season: nflDbSeason,
      week: game.week || null,
      date: game.date,
      status: game.status,
      postseason: true,
      home_team_name: game.home_team?.full_name || "Unknown",
      visitor_team_name: game.visitor_team?.full_name || "Unknown",
      external_id: `nfl_${game.id}`,
    }));

    console.log(`Upserting ${gamesToUpsert.length} postseason games...`);

    const { error: upsertGamesError } = await supabase
      .from("games")
      .upsert(gamesToUpsert, { onConflict: "id" });

    if (upsertGamesError) {
      console.error("Upsert games error:", upsertGamesError);
      throw new Error(`Database error: ${upsertGamesError.message}`);
    }

    console.log(`Successfully upserted ${gamesToUpsert.length} postseason games`);

    // ===== STEP 2: Fetch odds from The Odds API =====
    let oddsCount = 0;
    let oddsError: string | null = null;

    try {
      const oddsUrl = new URL("https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds");
      oddsUrl.searchParams.set("apiKey", oddsApiKey);
      oddsUrl.searchParams.set("markets", "spreads,h2h,totals");
      oddsUrl.searchParams.set("regions", "us");
      oddsUrl.searchParams.set("oddsFormat", "american");

      console.log("Fetching odds from The Odds API...");

      const oddsResponse = await fetch(oddsUrl.toString());

      if (!oddsResponse.ok) {
        const errorText = await oddsResponse.text();
        console.error("The Odds API error:", oddsResponse.status, errorText);
        throw new Error(`Failed to fetch odds: ${oddsResponse.status}`);
      }

      const oddsGames: OddsAPIGame[] = await oddsResponse.json();
      console.log(`Fetched odds for ${oddsGames.length} games from The Odds API`);

      // Prepare games lookup with normalized names
      const gamesLookup = gamesToUpsert.map(g => ({
        id: g.id,
        home_team_name: g.home_team_name,
        visitor_team_name: g.visitor_team_name,
      }));

      // Get game IDs to delete odds for
      const gameIds = gamesToUpsert.map(g => g.id);
      
      // Process and upsert odds (onConflict handles updates, preserves history)
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
        const matchedGame = findMatchingGame(oddsGame, gamesLookup);
        
        if (!matchedGame) {
          console.log(`No match found for: ${oddsGame.home_team} vs ${oddsGame.away_team}`);
          continue;
        }

        console.log(`Matched: ${oddsGame.home_team} vs ${oddsGame.away_team} -> Game ID ${matchedGame.id}`);

        for (const bookmaker of oddsGame.bookmakers) {
          // Only process allowed sportsbooks
          if (!ALLOWED_SPORTSBOOKS.includes(bookmaker.key.toLowerCase())) {
            continue;
          }

          const oddRow: {
            game_id: number;
            sportsbook: string;
            spread_value: number | null;
            spread_odds: number | null;
            moneyline_home: number | null;
            moneyline_away: number | null;
            total_value: number | null;
            total_over_odds: number | null;
            total_under_odds: number | null;
          } = {
            game_id: matchedGame.id,
            sportsbook: bookmaker.key.toLowerCase(),
            spread_value: null,
            spread_odds: null,
            moneyline_home: null,
            moneyline_away: null,
            total_value: null,
            total_over_odds: null,
            total_under_odds: null,
          };

          for (const market of bookmaker.markets) {
            if (market.key === "spreads") {
              // Find home team spread
              const homeSpread = market.outcomes.find(
                o => normalizeTeamName(o.name).includes(normalizeTeamName(oddsGame.home_team).split(' ').pop() || '')
              );
              if (homeSpread) {
                oddRow.spread_value = homeSpread.point || null;
                oddRow.spread_odds = homeSpread.price;
              }
            } else if (market.key === "h2h") {
              // Moneyline
              for (const outcome of market.outcomes) {
                if (normalizeTeamName(outcome.name).includes(normalizeTeamName(oddsGame.home_team).split(' ').pop() || '')) {
                  oddRow.moneyline_home = outcome.price;
                } else {
                  oddRow.moneyline_away = outcome.price;
                }
              }
            } else if (market.key === "totals") {
              // Totals (over/under)
              for (const outcome of market.outcomes) {
                if (outcome.name === "Over") {
                  oddRow.total_value = outcome.point || null;
                  oddRow.total_over_odds = outcome.price;
                } else if (outcome.name === "Under") {
                  oddRow.total_under_odds = outcome.price;
                }
              }
            }
          }

          oddsToInsert.push(oddRow);
        }
      }

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
    const { count: finalGamesCount } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("league", "NFL")
      .eq("postseason", true);

    const { count: finalOddsCount } = await supabase
      .from("odds")
      .select("*", { count: "exact", head: true });

    const sportsbooksMessage = oddsCount > 0 
      ? "DraftKings, FanDuel, Caesars, BetRivers" 
      : "no sportsbooks";

    const message = oddsError
      ? `Synced ${gamesToUpsert.length} games. Odds error: ${oddsError}`
      : `Synced ${gamesToUpsert.length} games with live odds from ${sportsbooksMessage}`;

    return new Response(
      JSON.stringify({
        success: true,
        gamesCount: finalGamesCount || gamesToUpsert.length,
        oddsCount: finalOddsCount || oddsCount,
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
