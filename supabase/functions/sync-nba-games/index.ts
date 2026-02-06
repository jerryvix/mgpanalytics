import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const THE_ODDS_API_KEY = Deno.env.get("THE_ODDS_API_KEY");

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

    console.log(`[sync-nba-games] Admin user ${userId} authenticated, starting NBA games sync via ESPN...`);

    // Calculate date range: now to +48 hours
    const now = new Date();
    const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // Fetch NBA schedule from ESPN API (free, no key needed)
    // Get today and next 2 days to cover 48-hour window
    const dates: string[] = [];
    for (let i = 0; i < 3; i++) {
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

    // Filter games within 48-hour window
    const upcomingGames = allGames.filter((game) => {
      const gameDate = new Date(game.date);
      return gameDate >= now && gameDate <= in48Hours;
    });

    console.log(`Filtered to ${upcomingGames.length} games in 48-hour window`);

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
        season: 2025,
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

      // Fetch odds from The Odds API if available
      if (THE_ODDS_API_KEY && insertedData && insertedData.length > 0) {
        try {
          const oddsUrl = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=${THE_ODDS_API_KEY}&markets=spreads,h2h,totals&regions=us&oddsFormat=american`;
          const oddsResponse = await fetch(oddsUrl);

          if (oddsResponse.ok) {
            const oddsData = await oddsResponse.json();
            console.log(`Fetched odds for ${oddsData.length} NBA games`);

            // Process odds and match to games
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

            for (const oddsGame of oddsData) {
              // Try to match by team names
              const matchedGame = insertedData.find((g) => {
                const homeMatch =
                  g.home_team_name.toLowerCase().includes(oddsGame.home_team.toLowerCase().split(" ").pop()) ||
                  oddsGame.home_team.toLowerCase().includes(g.home_team_name.toLowerCase().split(" ").pop());
                const awayMatch =
                  g.visitor_team_name.toLowerCase().includes(oddsGame.away_team.toLowerCase().split(" ").pop()) ||
                  oddsGame.away_team.toLowerCase().includes(g.visitor_team_name.toLowerCase().split(" ").pop());
                return homeMatch && awayMatch;
              });

              if (!matchedGame) continue;

              // Process each bookmaker
              const allowedBooks = ["draftkings", "fanduel", "caesars", "betrivers"];
              for (const bookmaker of oddsGame.bookmakers || []) {
                if (!allowedBooks.includes(bookmaker.key.toLowerCase())) continue;

                let spreadValue: number | null = null;
                let spreadOdds: number | null = null;
                let moneylineHome: number | null = null;
                let moneylineAway: number | null = null;
                let totalValue: number | null = null;
                let totalOverOdds: number | null = null;
                let totalUnderOdds: number | null = null;

                for (const market of bookmaker.markets || []) {
                  if (market.key === "spreads") {
                    const homeOutcome = market.outcomes.find((o: { name: string }) =>
                      oddsGame.home_team.toLowerCase().includes(o.name.toLowerCase().split(" ").pop())
                    );
                    if (homeOutcome) {
                      spreadValue = homeOutcome.point || null;
                      spreadOdds = homeOutcome.price;
                    }
                  }
                  if (market.key === "h2h") {
                    for (const outcome of market.outcomes) {
                      if (oddsGame.home_team.toLowerCase().includes(outcome.name.toLowerCase().split(" ").pop())) {
                        moneylineHome = outcome.price;
                      } else {
                        moneylineAway = outcome.price;
                      }
                    }
                  }
                  if (market.key === "totals") {
                    for (const outcome of market.outcomes) {
                      if (outcome.name === "Over") {
                        totalValue = outcome.point || null;
                        totalOverOdds = outcome.price;
                      } else if (outcome.name === "Under") {
                        totalUnderOdds = outcome.price;
                      }
                    }
                  }
                }

                oddsToUpsert.push({
                  game_id: matchedGame.id,
                  sportsbook: bookmaker.key.toLowerCase(),
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

            if (oddsToUpsert.length > 0) {
              const { error: oddsError } = await supabase
                .from("nba_odds")
                .upsert(oddsToUpsert, { onConflict: "game_id,sportsbook" });

              if (oddsError) {
                console.error("Error inserting odds:", oddsError);
              } else {
                console.log(`Upserted ${oddsToUpsert.length} NBA odds records`);
              }
            }
          }
        } catch (oddsErr) {
          console.error("Error fetching odds:", oddsErr);
        }
      }
    }

    const response = {
      success: true,
      gamesCount: insertedCount,
      message: `Synced ${insertedCount} NBA games for next 48 hours`,
    };

    console.log("NBA sync completed:", response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in sync-nba-games:", error);
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
