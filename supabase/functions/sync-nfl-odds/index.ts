import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OddsData {
  id: string;
  game_id: number;
  sportsbook: string;
  line: number;
  price: number;
  market_type: string;
}

interface BettingOdd {
  sportsbook: string;
  line: number;
  price: number;
  market_type: string;
}

interface BettingOddsResponse {
  data: {
    game_id: number;
    odds: BettingOdd[];
  }[];
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

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all NFL game IDs from our database
    console.log("Fetching NFL game IDs from database...");
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("id")
      .eq("league", "NFL");

    if (gamesError) {
      console.error("Error fetching games:", gamesError);
      throw new Error(`Database error: ${gamesError.message}`);
    }

    if (!games || games.length === 0) {
      console.log("No NFL games found in database");
      return new Response(
        JSON.stringify({ success: true, count: 0, message: "No NFL games to fetch odds for" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const gameIds = games.map((g) => g.id);
    console.log(`Found ${gameIds.length} NFL games, fetching odds...`);

    // Build URL with game_ids[] parameters
    const url = new URL("https://api.balldontlie.io/nfl/v1/betting_odds");
    gameIds.forEach((id) => {
      url.searchParams.append("game_ids[]", String(id));
    });

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

    const data: BettingOddsResponse = await response.json();
    console.log(`Received odds data for ${data.data.length} games`);

    // Flatten and map odds data
    const oddsToUpsert: OddsData[] = [];
    for (const gameOdds of data.data) {
      for (const odd of gameOdds.odds || []) {
        // Create a unique ID based on game_id, sportsbook, and market_type
        const uniqueId = `${gameOdds.game_id}-${odd.sportsbook}-${odd.market_type}`;
        oddsToUpsert.push({
          id: uniqueId,
          game_id: gameOdds.game_id,
          sportsbook: odd.sportsbook,
          line: odd.line,
          price: odd.price,
          market_type: odd.market_type,
        });
      }
    }

    console.log(`Upserting ${oddsToUpsert.length} odds records...`);

    if (oddsToUpsert.length > 0) {
      // Delete existing odds for these games to ensure freshness
      const { error: deleteError } = await supabase
        .from("odds")
        .delete()
        .in("game_id", gameIds);

      if (deleteError) {
        console.error("Error deleting old odds:", deleteError);
        throw new Error(`Delete error: ${deleteError.message}`);
      }

      // Insert fresh odds
      const { error: insertError } = await supabase
        .from("odds")
        .insert(oddsToUpsert);

      if (insertError) {
        console.error("Database insert error:", insertError);
        throw new Error(`Database error: ${insertError.message}`);
      }
    }

    console.log(`Successfully synced ${oddsToUpsert.length} NFL odds`);

    return new Response(
      JSON.stringify({ success: true, count: oddsToUpsert.length }),
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
