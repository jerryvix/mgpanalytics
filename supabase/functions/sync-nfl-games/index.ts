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

// Helper to format date as YYYY-MM-DD
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

    // Calculate dynamic date window
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    
    // Calculate 48 hours ago for cleanup
    const cutoffDate = new Date(today);
    cutoffDate.setHours(cutoffDate.getHours() - 48);

    const startDate = formatDate(today);
    const endDate = formatDate(nextWeek);
    const cutoffDateStr = cutoffDate.toISOString();

    console.log(`Dynamic date window: ${startDate} to ${endDate}`);
    console.log(`Cleanup cutoff: ${cutoffDateStr}`);

    // Cleanup: Delete NFL games older than 48 hours to keep feed fresh
    console.log("Cleaning up stale NFL games (older than 48 hours)...");
    const { error: deleteError, count: deletedCount } = await supabase
      .from("games")
      .delete()
      .eq("league", "NFL")
      .lt("date", cutoffDateStr);

    if (deleteError) {
      console.error("Error deleting old games:", deleteError);
    } else {
      console.log(`Cleanup completed, removed ${deletedCount || 0} stale games`);
    }

    console.log("Fetching NFL games from BallDontLie API...");

    // Fetch games using dynamic rolling date window
    const url = new URL("https://api.balldontlie.io/nfl/v1/games");
    url.searchParams.append("seasons[]", "2025");
    url.searchParams.append("start_date", startDate);
    url.searchParams.append("end_date", endDate);

    console.log(`API URL: ${url.toString()}`);

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

    // Map games with spec-accurate field mapping
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

      // Upsert: update existing games (scores/status) or insert new ones
      const { error } = await supabase
        .from("games")
        .upsert(games, { onConflict: "id" });

      if (error) {
        console.error("Database upsert error:", error);
        throw new Error(`Database error: ${error.message}`);
      }
    }

    console.log(`Successfully synced ${games.length} NFL games for ${startDate} to ${endDate}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: games.length,
        dateRange: { start: startDate, end: endDate }
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
