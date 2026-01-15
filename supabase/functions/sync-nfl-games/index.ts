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
  week?: number;
  postseason: boolean;
  season: number;
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

    // KEY CHANGE: Use postseason=true instead of date range
    const params = new URLSearchParams({
      "seasons[]": "2025",
      "postseason": "true",
    });

    const url = `https://api.balldontlie.io/nfl/v1/games?${params.toString()}`;

    console.log("Fetching postseason games from:", url);

    // Fetch with proper authorization header
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("BallDontLie API error:", response.status, errorText);
      
      if (response.status === 401) {
        throw new Error("Authorization failed - check API key");
      }
      throw new Error(`BallDontLie API error: ${response.status} ${response.statusText}`);
    }

    const data: BallDontLieResponse = await response.json();
    console.log(`Fetched ${data.data?.length || 0} postseason games from BallDontLie`);

    if (!data.data || data.data.length === 0) {
      console.log("No postseason games found");
      return new Response(
        JSON.stringify({ success: true, count: 0, message: "No postseason games found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Log sample games for debugging
    console.log(`Found ${data.data.length} postseason games`);
    console.log("First game:", JSON.stringify(data.data[0], null, 2));

    // Delete existing 2025 postseason games to avoid duplicates
    const { error: deleteError } = await supabase
      .from("games")
      .delete()
      .eq("league", "NFL")
      .eq("season", 2025)
      .eq("postseason", true);

    if (deleteError) {
      console.error("Delete error:", deleteError);
    } else {
      console.log("Cleared existing NFL postseason games");
    }

    // Transform and upsert games using exact field mapping
    const gamesToUpsert = data.data.map((game) => ({
      id: game.id,
      league: "NFL",
      season: 2025,
      week: game.week || null,
      date: game.date,
      status: game.status,
      postseason: true,
      home_team_name: game.home_team?.full_name || "Unknown",
      visitor_team_name: game.visitor_team?.full_name || "Unknown",
      external_id: `nfl_${game.id}`,
    }));

    console.log(`Upserting ${gamesToUpsert.length} postseason games...`);

    // Upsert (insert or update) games
    const { error: upsertError } = await supabase
      .from("games")
      .upsert(gamesToUpsert, { onConflict: "id" });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      throw new Error(`Database error: ${upsertError.message}`);
    }

    console.log(`Successfully upserted ${gamesToUpsert.length} postseason games`);

    // Fetch updated count for verification (postseason games only)
    const { count, error: countError } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("league", "NFL")
      .eq("postseason", true);

    if (countError) {
      console.error("Count error:", countError);
    }

    const finalCount = count || gamesToUpsert.length;

    return new Response(
      JSON.stringify({
        success: true,
        count: finalCount,
        message: `Successfully synced ${gamesToUpsert.length} postseason games`,
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
