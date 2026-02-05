import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OddsSnapshot {
  game_id: string;
  sport: string;
  bookmaker: string;
  odds_type: string;
  team: string | null;
  current_line: number | null;
  previous_line: number | null;
  line_movement: string | null;
  opening_line: number | null;
  current_price: number | null;
  previous_price: number | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body for test mode
    let testOnly = false;
    try {
      const body = await req.json();
      testOnly = body?.testOnly === true;
    } catch {
      // No body or invalid JSON, continue with full sync
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const THE_ODDS_API_KEY = Deno.env.get("THE_ODDS_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase configuration missing");
    }

    if (!THE_ODDS_API_KEY) {
      throw new Error("THE_ODDS_API_KEY not configured - please add it in Lovable Cloud secrets");
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

    console.log(`[sync-odds-snapshot] Admin user ${userId} authenticated, starting odds snapshot sync... (testOnly: ${testOnly})`);

    // Test mode - just verify API connection
    if (testOnly) {
      const testUrl = `https://api.the-odds-api.com/v4/sports?apiKey=${THE_ODDS_API_KEY}`;
      const testResponse = await fetch(testUrl);
      
      if (!testResponse.ok) {
        throw new Error(`The Odds API returned ${testResponse.status}`);
      }

      // Get usage info from headers
      const requestsUsed = parseInt(testResponse.headers.get("x-requests-used") || "0");
      const requestsRemaining = parseInt(testResponse.headers.get("x-requests-remaining") || "0");

      return new Response(
        JSON.stringify({
          success: true,
          message: "The Odds API connection successful",
          usage: {
            requests_used: requestsUsed,
            requests_remaining: requestsRemaining,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sportsToSync = [
      { key: "americanfootball_nfl", name: "NFL" },
      { key: "basketball_nba", name: "NBA" },
      { key: "basketball_ncaab", name: "NCAAB" },
    ];

    const allowedBooks = ["draftkings", "fanduel", "caesars", "betrivers"];
    const allSnapshots: OddsSnapshot[] = [];
    let totalProcessed = 0;

    for (const sport of sportsToSync) {
      try {
        console.log(`Fetching odds for ${sport.name}...`);

        const oddsUrl = `https://api.the-odds-api.com/v4/sports/${sport.key}/odds?apiKey=${THE_ODDS_API_KEY}&markets=spreads,h2h,totals&regions=us&oddsFormat=american`;
        const response = await fetch(oddsUrl);

        if (!response.ok) {
          console.error(`Failed to fetch ${sport.name} odds: ${response.status}`);
          continue;
        }

        const oddsData = await response.json();
        console.log(`Got ${oddsData.length} games for ${sport.name}`);

        for (const game of oddsData) {
          const gameId = `${sport.key}_${game.id}`;

          for (const bookmaker of game.bookmakers || []) {
            if (!allowedBooks.includes(bookmaker.key.toLowerCase())) continue;

            for (const market of bookmaker.markets || []) {
              if (!["spreads", "h2h", "totals"].includes(market.key)) continue;

              for (const outcome of market.outcomes || []) {
                let oddsType = "";
                let team: string | null = null;
                let line: number | null = null;

                if (market.key === "spreads") {
                  oddsType = "spread";
                  team = outcome.name;
                  line = outcome.point || null;
                } else if (market.key === "h2h") {
                  oddsType = "moneyline";
                  team = outcome.name;
                  line = outcome.price;
                } else if (market.key === "totals") {
                  oddsType = "total";
                  team = outcome.name; // "Over" or "Under"
                  line = outcome.point || null;
                }

                allSnapshots.push({
                  game_id: gameId,
                  sport: sport.name,
                  bookmaker: bookmaker.key.toLowerCase(),
                  odds_type: oddsType,
                  team: team,
                  current_line: line,
                  previous_line: null, // Will be filled from DB
                  line_movement: null, // Will be calculated
                  opening_line: null, // Will be filled from DB
                  current_price: outcome.price,
                  previous_price: null,
                });
              }
            }
          }
        }

        totalProcessed += oddsData.length;
      } catch (err) {
        console.error(`Error processing ${sport.name}:`, err);
      }

      // Small delay between sports to avoid rate limiting
      await new Promise((r) => setTimeout(r, 200));
    }

    console.log(`Processing ${allSnapshots.length} total snapshot entries`);

    // For each snapshot, get previous values and calculate movement
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    for (const snapshot of allSnapshots) {
      try {
        // Get previous snapshot (most recent)
        const { data: prevSnapshot } = await supabase
          .from("odds_history")
          .select("current_line, current_price, timestamp")
          .eq("game_id", snapshot.game_id)
          .eq("bookmaker", snapshot.bookmaker)
          .eq("odds_type", snapshot.odds_type)
          .eq("team", snapshot.team)
          .order("timestamp", { ascending: false })
          .limit(1)
          .single();

        // Get opening line (oldest snapshot)
        const { data: openingSnapshot } = await supabase
          .from("odds_history")
          .select("current_line")
          .eq("game_id", snapshot.game_id)
          .eq("bookmaker", snapshot.bookmaker)
          .eq("odds_type", snapshot.odds_type)
          .eq("team", snapshot.team)
          .order("timestamp", { ascending: true })
          .limit(1)
          .single();

        if (prevSnapshot) {
          snapshot.previous_line = prevSnapshot.current_line;
          snapshot.previous_price = prevSnapshot.current_price;

          // Calculate movement
          if (snapshot.current_line !== null && prevSnapshot.current_line !== null) {
            const diff = snapshot.current_line - prevSnapshot.current_line;
            if (Math.abs(diff) >= 1.5) {
              // Check if it's a steam move (fast movement)
              const prevTime = new Date(prevSnapshot.timestamp);
              const isRecent = prevTime >= new Date(thirtyMinsAgo);
              snapshot.line_movement = isRecent ? "steam" : (diff > 0 ? "up" : "down");
            } else if (Math.abs(diff) >= 0.5) {
              snapshot.line_movement = diff > 0 ? "up" : "down";
            } else {
              snapshot.line_movement = "neutral";
            }
          }
        }

        if (openingSnapshot) {
          snapshot.opening_line = openingSnapshot.current_line;
        } else {
          // This is the opening line
          snapshot.opening_line = snapshot.current_line;
        }
      } catch (err) {
        // Ignore errors for individual snapshots
      }
    }

    // Insert all snapshots
    if (allSnapshots.length > 0) {
      // Batch insert in chunks of 100
      for (let i = 0; i < allSnapshots.length; i += 100) {
        const batch = allSnapshots.slice(i, i + 100);
        const { error: insertError } = await supabase.from("odds_history").insert(batch);

        if (insertError) {
          console.error(`Error inserting batch ${i / 100 + 1}:`, insertError);
        }
      }
    }

    console.log(`Inserted ${allSnapshots.length} odds history records`);

    const result = {
      success: true,
      snapshotsCreated: allSnapshots.length,
      gamesProcessed: totalProcessed,
      message: `Created ${allSnapshots.length} odds snapshots from ${totalProcessed} games`,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in sync-odds-snapshot:", error);
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
