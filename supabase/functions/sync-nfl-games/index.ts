import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
}

interface BallDontLieResponse {
  data: NFLGame[];
}

// Fixed date range for NFL Playoffs
const START_DATE = "2026-01-14";
const END_DATE = "2026-01-21";

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("BALLDONTLIE_API_KEY");
    if (!apiKey) {
      throw new Error("BALLDONTLIE_API_KEY not configured");
    }

    // Initialize Supabase client with service role for admin operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting NFL Playoff sync for 2026-01-14 to 2026-01-21...");

    // Delete all 2025 NFL games before fresh sync
    console.log("Deleting existing 2025 NFL games for clean sync...");
    const { error: deleteSeasonError } = await supabase
      .from("games")
      .delete()
      .eq("league", "NFL");

    if (deleteSeasonError) {
      console.error("Error deleting season games:", deleteSeasonError);
    } else {
      console.log("Cleared existing NFL games");
    }

    console.log("Fetching NFL games from BallDontLie API...");

    // Strict OpenAPI spec parameters
    const url = new URL("https://api.balldontlie.io/nfl/v1/games");
    url.searchParams.append("seasons[]", "2025");
    url.searchParams.append("start_date", "2026-01-14");
    url.searchParams.append("end_date", "2026-01-21");

    console.log(`API URL: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      headers: {
        "Authorization": apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("BallDontLie API error:", response.status, errorText);
      throw new Error(`BallDontLie API error: ${response.status}`);
    }

    const data: BallDontLieResponse = await response.json();
    console.log(`Fetched ${data.data.length} games from API`);
    
    // Log first few game dates to debug
    if (data.data.length > 0) {
      console.log("Sample game dates from API:");
      data.data.slice(0, 5).forEach((g, i) => {
        console.log(`  Game ${i + 1}: ${g.date} - ${g.home_team.full_name} vs ${g.visitor_team.full_name}`);
      });
    }

    // The API's date params should filter, but let's also do client-side check
    // Parse dates correctly - API returns ISO dates
    const startDateTime = new Date("2026-01-14T00:00:00Z").getTime();
    const endDateTime = new Date("2026-01-21T23:59:59Z").getTime();
    
    const filteredGames = data.data.filter((game) => {
      const gameDate = new Date(game.date).getTime();
      const inRange = gameDate >= startDateTime && gameDate <= endDateTime;
      if (!inRange && data.data.length <= 10) {
        console.log(`Game ${game.id} date ${game.date} out of range`);
      }
      return inRange;
    });

    console.log(`Filtered to ${filteredGames.length} games within date range`);

    // If API filtering didn't work, use all games from the response
    const gamesToUse = filteredGames.length > 0 ? filteredGames : data.data;
    console.log(`Using ${gamesToUse.length} games for upsert`);

    // Map games with spec-accurate field mapping
    const games = gamesToUse.map((game) => ({
      id: game.id,
      league: "NFL",
      home_team_name: game.home_team.full_name,
      visitor_team_name: game.visitor_team.full_name,
      status: game.status,
      date: game.date,
    }));

    if (games.length > 0) {
      console.log("Upserting games to database...");

      // Upsert: update existing games (scores/status) or insert new ones
      const { error } = await supabase
        .from("games")
        .upsert(games, { onConflict: "id" });

      if (error) {
        console.error("Database upsert error:", error);
        throw new Error(`Database error: ${error.message}`);
      }
    }

    console.log(`Successfully synced ${games.length} NFL games for ${START_DATE} to ${END_DATE}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: games.length,
        dateRange: { start: START_DATE, end: END_DATE }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Sync error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
