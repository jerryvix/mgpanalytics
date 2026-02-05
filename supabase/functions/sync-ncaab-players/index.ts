import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// NCAAB uses ESPN for roster data since Ball Don't Lie doesn't have college
const ESPN_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";

interface ESPNAthlete {
  id: string;
  uid: string;
  guid: string;
  firstName: string;
  lastName: string;
  fullName: string;
  displayName: string;
  shortName: string;
  weight: number;
  displayWeight: string;
  height: number;
  displayHeight: string;
  age: number;
  position: {
    id: string;
    name: string;
    displayName: string;
    abbreviation: string;
  };
  jersey: string;
  experience?: {
    years: number;
    displayValue: string;
    abbreviation: string;
  };
  status?: {
    id: string;
    name: string;
    type: string;
    abbreviation: string;
  };
  injuries?: Array<{
    status: string;
    date: string;
  }>;
}

async function espnFetch(endpoint: string): Promise<any> {
  const url = `${ESPN_BASE_URL}${endpoint}`;
  console.log(`[sync-ncaab-players] Fetching: ${url}`);
  
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[sync-ncaab-players] ESPN API error ${response.status}: ${errorText}`);
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  return response.json();
}

function getPositionType(position: string): string {
  const guards = ["G", "PG", "SG"];
  const forwards = ["F", "SF", "PF"];
  if (guards.includes(position)) return "GUARD";
  if (forwards.includes(position)) return "FORWARD";
  if (position === "C") return "CENTER";
  return "GUARD";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

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

    console.log(`[sync-ncaab-players] Admin user ${userId} authenticated, starting NCAAB players sync...`);

    // Step 1: Get NCAAB games in slate window (NOW → +24h)
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    console.log(`[sync-ncaab-players] Fetching games from ${now.toISOString()} to ${in24Hours.toISOString()}`);

    const { data: games, error: gamesError } = await supabase
      .from("ncaab_games")
      .select("id, home_team_name, visitor_team_name, home_team_id, visitor_team_id, date, home_team_rank, visitor_team_rank")
      .gte("date", now.toISOString())
      .lte("date", in24Hours.toISOString());

    if (gamesError) {
      throw new Error(`Failed to fetch games: ${gamesError.message}`);
    }

    if (!games || games.length === 0) {
      console.log("[sync-ncaab-players] No games in slate window");
      return new Response(
        JSON.stringify({ success: true, message: "No games in slate window", playersAdded: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[sync-ncaab-players] Found ${games.length} games in slate window`);

    // Step 2: Extract unique team IDs
    const teamIds = new Set<string>();
    const teamIdToGames: Record<string, typeof games> = {};
    const teamIdToName: Record<string, string> = {};

    for (const game of games) {
      if (game.home_team_id) {
        teamIds.add(game.home_team_id);
        if (!teamIdToGames[game.home_team_id]) teamIdToGames[game.home_team_id] = [];
        teamIdToGames[game.home_team_id].push(game);
        teamIdToName[game.home_team_id] = game.home_team_name;
      }
      if (game.visitor_team_id) {
        teamIds.add(game.visitor_team_id);
        if (!teamIdToGames[game.visitor_team_id]) teamIdToGames[game.visitor_team_id] = [];
        teamIdToGames[game.visitor_team_id].push(game);
        teamIdToName[game.visitor_team_id] = game.visitor_team_name;
      }
    }

    console.log(`[sync-ncaab-players] Processing ${teamIds.size} teams`);

    let playersAdded = 0;
    const teamsProcessed: string[] = [];
    const slateStart = now;
    const slateEnd = in24Hours;

    // Step 3: For each team, fetch roster from ESPN
    for (const teamId of Array.from(teamIds)) {
      try {
        const teamName = teamIdToName[teamId] || `Team ${teamId}`;
        
        // ESPN team roster endpoint
        const rosterData = await espnFetch(`/teams/${teamId}/roster`);
        const athletes: ESPNAthlete[] = rosterData.athletes || [];

        if (athletes.length === 0) {
          console.log(`[sync-ncaab-players] No athletes found for ${teamName}`);
          continue;
        }

        teamsProcessed.push(teamName);

        // Sort by some basic criteria (jersey number as proxy for starters)
        const sortedAthletes = athletes.slice(0, 15); // Top 15 players max

        const teamGames = teamIdToGames[teamId] || [];

        for (let i = 0; i < sortedAthletes.length; i++) {
          const athlete = sortedAthletes[i];
          const isFeatured = i < 8; // Top 8
          const injuryStatus = athlete.injuries?.[0]?.status || "Healthy";
          const isFeaturedDueToInjury = injuryStatus !== "Healthy";

          const playerRecord = {
            external_id: `espn_ncaab_${athlete.id}`,
            sport: "NCAAB",
            name: athlete.fullName || `${athlete.firstName} ${athlete.lastName}`,
            first_name: athlete.firstName,
            last_name: athlete.lastName,
            position: athlete.position?.abbreviation || "G",
            position_type: getPositionType(athlete.position?.abbreviation || "G"),
            team_name: teamName,
            team_abbr: "",
            team_id: teamId,
            jersey_number: athlete.jersey || null,
            height: athlete.displayHeight || null,
            weight: athlete.weight || null,
            age: athlete.age || null,
            college: null,
            is_featured: isFeatured || isFeaturedDueToInjury,
            featured_reason: isFeaturedDueToInjury ? "injured" : (isFeatured ? "high_usage" : null),
            slate_window_start: slateStart.toISOString(),
            slate_window_end: slateEnd.toISOString(),
            injury_status: injuryStatus === "Healthy" ? "Healthy" : injuryStatus,
            usage_rank: i + 1,
            usage_metric: null,
            raw_data: athlete,
            updated_at: new Date().toISOString(),
          };

          const { data: upsertedPlayer, error: upsertError } = await supabase
            .from("players")
            .upsert(playerRecord, { onConflict: "external_id,sport" })
            .select("id")
            .single();

          if (upsertError) {
            console.error(`[sync-ncaab-players] Error upserting player ${athlete.id}:`, upsertError);
            continue;
          }

          playersAdded++;

          // Create game associations
          if (upsertedPlayer && teamGames.length > 0) {
            for (const game of teamGames) {
              const association = {
                player_id: upsertedPlayer.id,
                ncaab_game_id: game.id,
                sport: "NCAAB",
                status: "active",
                is_starter: i < 5,
              };

              await supabase
                .from("player_game_associations")
                .upsert(association, { onConflict: "player_id,ncaab_game_id" })
                .select();
            }
          }
        }

        console.log(`[sync-ncaab-players] Processed ${sortedAthletes.length} players for ${teamName}`);

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (teamError) {
        console.error(`[sync-ncaab-players] Error processing team ${teamId}:`, teamError);
      }
    }

    // Update sync schedule
    await supabase
      .from("sync_schedule")
      .upsert({
        sport: "NCAAB",
        data_type: "players",
        last_sync_at: new Date().toISOString(),
        last_sync_status: "success",
        records_synced: playersAdded,
      }, { onConflict: "sport,data_type" });

    const response = {
      success: true,
      playersAdded,
      teamsProcessed,
      message: `Synced ${playersAdded} NCAAB players from ${teamsProcessed.length} teams`,
    };

    console.log("[sync-ncaab-players] Sync completed:", response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[sync-ncaab-players] Error:", error);
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
