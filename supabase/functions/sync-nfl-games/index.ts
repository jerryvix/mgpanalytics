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

    // Step 1: Build the exact query parameters per BallDontLie spec
    const today = new Date("2026-01-14"); // Jan 14, 2026
    const startDate = today.toISOString().split("T")[0]; // '2026-01-14'
    const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0]; // '2026-01-21'

    const params = new URLSearchParams({
      "seasons[]": "2025", // NFL 2025 season (includes postseason)
      "start_date": startDate,
      "end_date": endDate,
    });

    const url = `https://api.balldontlie.io/nfl/v1/games?${params.toString()}`;

    console.log("Fetching from:", url);

    // Step 2: Fetch with proper authorization header
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
      throw new Error(`BallDontLie API error: ${response.status} ${response.statusText}`);
    }

    const data: BallDontLieResponse = await response.json();
    console.log(`Fetched ${data.data?.length || 0} games from BallDontLie`);

    if (!data.data || data.data.length === 0) {
      console.log("No games found in date range");
      return new Response(
        JSON.stringify({ success: true, count: 0, message: "No games in date range" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Log sample games for debugging
    console.log("Sample games from API:");
    data.data.slice(0, 5).forEach((g, i) => {
      console.log(`  Game ${i + 1}: ${g.date} - ${g.home_team.full_name} vs ${g.visitor_team.full_name}`);
    });

    // Step 3: Delete existing NFL games to avoid duplicates
    const { error: deleteError } = await supabase
      .from("games")
      .delete()
      .eq("league", "NFL");

    if (deleteError) {
      console.error("Delete error:", deleteError);
    } else {
      console.log("Cleared existing NFL games");
    }

    // Step 4: Transform and upsert games using exact field mapping
    const gamesToUpsert = data.data.map((game) => ({
      id: game.id,
      league: "NFL",
      date: game.date,
      status: game.status,
      home_team_name: game.home_team?.full_name || "Unknown",
      visitor_team_name: game.visitor_team?.full_name || "Unknown",
    }));

    console.log(`Upserting ${gamesToUpsert.length} games...`);

    // Step 5: Upsert (insert or update) games
    const { error: upsertError } = await supabase
      .from("games")
      .upsert(gamesToUpsert, { onConflict: "id" });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      throw new Error(`Database error: ${upsertError.message}`);
    }

    console.log(`Successfully upserted ${gamesToUpsert.length} games`);

    // Step 6: Fetch updated count for verification
    const { count, error: countError } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("league", "NFL");

    if (countError) {
      console.error("Count error:", countError);
    }

    const finalCount = count || gamesToUpsert.length;

    return new Response(
      JSON.stringify({
        success: true,
        count: finalCount,
        message: `Synced ${gamesToUpsert.length} NFL games`,
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
