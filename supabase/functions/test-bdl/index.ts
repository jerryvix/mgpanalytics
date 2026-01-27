const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BDL_API_KEY = Deno.env.get("BALLDONTLIE_API_KEY");
    
    if (!BDL_API_KEY) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "BALLDONTLIE_API_KEY not configured",
          hint: "Add the API key in Supabase Edge Function secrets"
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[test-bdl] API Key starts with: ${BDL_API_KEY.substring(0, 10)}...`);
    console.log(`[test-bdl] API Key length: ${BDL_API_KEY.length}`);

    // Test 1: Get all teams (doesn't require player search)
    const teamsUrl = "https://api.balldontlie.io/v1/teams";
    console.log(`[test-bdl] Testing teams endpoint: ${teamsUrl}`);
    
    const teamsResponse = await fetch(teamsUrl, {
      headers: {
        "Authorization": BDL_API_KEY,
        "Content-Type": "application/json",
      },
    });

    console.log(`[test-bdl] Teams response status: ${teamsResponse.status}`);
    const teamsText = await teamsResponse.text();
    console.log(`[test-bdl] Teams response: ${teamsText.substring(0, 500)}`);

    if (!teamsResponse.ok) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Teams API failed: ${teamsResponse.status}`,
          response: teamsText,
          apiKeyPrefix: BDL_API_KEY.substring(0, 10) + "...",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const teamsData = JSON.parse(teamsText);

    // Test 1.5: GOAT tier test - Active Players endpoint
    const activeUrl = "https://api.balldontlie.io/v1/players/active?per_page=5";
    console.log(`[test-bdl] Testing GOAT-tier active players: ${activeUrl}`);
    
    const activeResponse = await fetch(activeUrl, {
      headers: {
        "Authorization": BDL_API_KEY,
        "Content-Type": "application/json",
      },
    });

    console.log(`[test-bdl] Active players response status: ${activeResponse.status}`);
    const activeText = await activeResponse.text();
    console.log(`[test-bdl] Active players response: ${activeText}`);
    
    const activeData = activeResponse.ok ? JSON.parse(activeText) : null;

    // Test 2: Search for a well-known player
    const searchUrl = "https://api.balldontlie.io/v1/players?search=LeBron%20James&per_page=5";
    console.log(`[test-bdl] Testing player search: ${searchUrl}`);
    
    const searchResponse = await fetch(searchUrl, {
      headers: {
        "Authorization": BDL_API_KEY,
        "Content-Type": "application/json",
      },
    });

    console.log(`[test-bdl] Search response status: ${searchResponse.status}`);
    const searchText = await searchResponse.text();
    console.log(`[test-bdl] Search response: ${searchText}`);

    if (!searchResponse.ok) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Search API failed: ${searchResponse.status}`,
          response: searchText,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const searchData = JSON.parse(searchText);

    // Test 3: Get season averages for LeBron (ID 237)
    const statsUrl = "https://api.balldontlie.io/v1/season_averages?season=2024&player_ids[]=237";
    console.log(`[test-bdl] Testing season averages: ${statsUrl}`);
    
    const statsResponse = await fetch(statsUrl, {
      headers: {
        "Authorization": BDL_API_KEY,
        "Content-Type": "application/json",
      },
    });

    console.log(`[test-bdl] Stats response status: ${statsResponse.status}`);
    const statsText = await statsResponse.text();
    console.log(`[test-bdl] Stats response: ${statsText}`);

    const statsData = statsResponse.ok ? JSON.parse(statsText) : null;

    return new Response(
      JSON.stringify({
        success: true,
        tests: {
          teamsEndpoint: {
            status: teamsResponse.status,
            teamsCount: teamsData?.data?.length || 0,
            firstTeam: teamsData?.data?.[0]?.full_name || null,
          },
          activePlayersEndpoint: {
            status: activeResponse.status,
            isGoatTier: activeResponse.ok,
            playersCount: activeData?.data?.length || 0,
            samplePlayers: activeData?.data?.map((p: any) => `${p.first_name} ${p.last_name} (ID: ${p.id}, Team: ${p.team?.abbreviation})`) || [],
          },
          playerSearch: {
            status: searchResponse.status,
            resultsCount: searchData?.data?.length || 0,
            lebronFound: searchData?.data?.some((p: any) => p.last_name === "James") || false,
            results: searchData?.data?.map((p: any) => `${p.first_name} ${p.last_name} (ID: ${p.id})`) || [],
          },
          seasonAverages: {
            status: statsResponse.status,
            hasData: statsData?.data?.length > 0,
            lebronStats: statsData?.data?.[0] ? {
              pts: statsData.data[0].pts,
              reb: statsData.data[0].reb,
              ast: statsData.data[0].ast,
              gamesPlayed: statsData.data[0].games_played,
            } : null,
          },
        },
        apiKeyInfo: {
          configured: true,
          prefix: BDL_API_KEY.substring(0, 10) + "...",
          length: BDL_API_KEY.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[test-bdl] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
