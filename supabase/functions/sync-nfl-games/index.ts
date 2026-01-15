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

    // Cleanup: Delete all existing NFL games to start fresh
    console.log("Cleaning up all existing NFL games...");
    const { error: deleteError } = await supabase
      .from("games")
      .delete()
      .eq("league", "NFL");

    if (deleteError) {
      console.error("Error deleting old games:", deleteError);
    } else {
      console.log("Old games cleanup completed");
    }

    console.log("Fetching NFL Divisional Round games from BallDontLie API...");

    // Fetch Divisional Round games (Week 19, Postseason)
    const url = new URL("https://api.balldontlie.io/nfl/v1/games");
    url.searchParams.append("seasons[]", "2025");
    url.searchParams.append("postseason", "true");
    url.searchParams.append("weeks[]", "19");
    
    // Date fallback for Divisional Round (Jan 17-18, 2026)
    url.searchParams.append("start_date", "2026-01-14");
    url.searchParams.append("end_date", "2026-01-20");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("BallDontLie API error:", response.status, errorText);
      throw new Error(`BallDontLie API error: ${response.status}`);
    }

    const data: BallDontLieResponse = await response.json();
    console.log(`Fetched ${data.data.length} games from API`);

    // Map and upsert games
    const games = data.data.map((game) => ({
      id: game.id,
      league: "NFL",
      home_team_name: game.home_team.full_name,
      visitor_team_name: game.visitor_team.full_name,
      status: game.status,
      date: game.date,
    }));

    if (games.length > 0) {
      console.log("Upserting games to database...");

      const { error } = await supabase
        .from("games")
        .upsert(games, { onConflict: "id" });

      if (error) {
        console.error("Database upsert error:", error);
        throw new Error(`Database error: ${error.message}`);
      }
    }

    console.log(`Successfully synced ${games.length} NFL Divisional Round games`);

    return new Response(
      JSON.stringify({ success: true, count: games.length }),
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
