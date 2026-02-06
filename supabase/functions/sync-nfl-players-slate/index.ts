import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const BDL_BASE_URL = "https://api.balldontlie.io/nfl/v1";

interface BDLPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_abbreviation: string;
  height: string;
  weight: string;
  jersey_number: string;
  college: string;
  experience: number;
  age: number;
  team: {
    id: number;
    conference: string;
    division: string;
    location: string;
    name: string;
    full_name: string;
    abbreviation: string;
  };
}

interface SeasonStats {
  player_id: number;
  season: number;
  games_played: number;
  passing_yards: number;
  passing_touchdowns: number;
  passing_interceptions: number;
  passing_attempts: number;
  rushing_yards: number;
  rushing_touchdowns: number;
  rushing_attempts: number;
  receiving_yards: number;
  receiving_touchdowns: number;
  receptions: number;
  targets: number;
}

async function bdlFetch(apiKey: string, endpoint: string): Promise<any> {
  const url = `${BDL_BASE_URL}${endpoint}`;
  console.log(`[sync-nfl-players-slate] Fetching: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      "Authorization": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[sync-nfl-players-slate] API error ${response.status}: ${errorText}`);
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  return response.json();
}

function getPositionType(position: string): string {
  const offense = ["QB", "RB", "WR", "TE", "OL", "OT", "OG", "C", "FB"];
  const defense = ["DL", "DE", "DT", "LB", "ILB", "OLB", "CB", "S", "FS", "SS", "DB"];
  if (offense.includes(position)) return "OFFENSE";
  if (defense.includes(position)) return "DEFENSE";
  return "SPECIAL";
}

function calculateUsageMetric(stats: SeasonStats | undefined, position: string): number {
  if (!stats) return 0;
  
  switch (position) {
    case "QB":
      return stats.passing_attempts || 0;
    case "RB":
    case "FB":
      return (stats.rushing_attempts || 0) + (stats.receptions || 0);
    case "WR":
    case "TE":
      return stats.targets || 0;
    default:
      return 0;
  }
}

function isFeaturedByPosition(position: string, rank: number): boolean {
  switch (position) {
    case "QB":
      return rank <= 1; // Top 1 QB
    case "RB":
    case "FB":
      return rank <= 2; // Top 2 RBs
    case "WR":
    case "TE":
      return rank <= 3; // Top 3 WR/TEs
    default:
      return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const BDL_API_KEY = Deno.env.get("BALLDONTLIE_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase configuration missing");
    }

    if (!BDL_API_KEY) {
      throw new Error("BALLDONTLIE_API_KEY not configured");
    }

    // Service client for database operations (used by both auth paths)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Cron auth bypass — allows dispatch-syncs to call without user JWT
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log(`[sync-nfl-players-slate] Authenticated via cron secret`);
    } else {
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

      console.log(`[sync-nfl-players-slate] Admin user ${userId} authenticated, starting NFL players slate sync...`);
    }

    // Step 1: Get NFL games in slate window (NOW → +7 days)
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    console.log(`[sync-nfl-players-slate] Fetching games from ${now.toISOString()} to ${in7Days.toISOString()}`);

    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("id, home_team_name, visitor_team_name, date")
      .eq("league", "NFL")
      .gte("date", now.toISOString())
      .lte("date", in7Days.toISOString());

    if (gamesError) {
      throw new Error(`Failed to fetch games: ${gamesError.message}`);
    }

    if (!games || games.length === 0) {
      console.log("[sync-nfl-players-slate] No games in slate window");
      return new Response(
        JSON.stringify({ success: true, message: "No games in slate window", playersAdded: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[sync-nfl-players-slate] Found ${games.length} games in slate window`);

    // Step 2: Extract unique team names
    const teamNames = new Set<string>();
    for (const game of games) {
      teamNames.add(game.home_team_name);
      teamNames.add(game.visitor_team_name);
    }

    console.log(`[sync-nfl-players-slate] Processing ${teamNames.size} teams`);

    let playersAdded = 0;
    const teamsProcessed: string[] = [];
    const slateStart = now;
    const slateEnd = in7Days;

    // Step 3: For each team, get players from existing players table
    // (Using existing players synced by sync-nfl-players)
    for (const teamName of Array.from(teamNames)) {
      try {
        // Find existing players for this team
        const { data: existingPlayers, error: playersError } = await supabase
          .from("players")
          .select("id, external_id, name, position, team_name")
          .eq("sport", "NFL")
          .ilike("team_name", `%${teamName.split(" ").pop()}%`);

        if (playersError || !existingPlayers || existingPlayers.length === 0) {
          console.log(`[sync-nfl-players-slate] No existing players for ${teamName}`);
          continue;
        }

        teamsProcessed.push(teamName);

        // Get season stats for these players
        const playerIds = existingPlayers.map(p => p.id);
        const { data: statsData } = await supabase
          .from("player_season_stats")
          .select("*")
          .in("player_id", playerIds)
          .eq("sport", "NFL")
          .eq("season", 2024);

        const statsMap = new Map();
        for (const stat of statsData || []) {
          statsMap.set(stat.player_id, stat);
        }

        // Group by position and rank
        const positionGroups: Record<string, typeof existingPlayers> = {};
        for (const player of existingPlayers) {
          const pos = player.position || "UNKNOWN";
          if (!positionGroups[pos]) positionGroups[pos] = [];
          positionGroups[pos].push(player);
        }

        // Sort each position by usage and update featured status
        for (const [position, posPlayers] of Object.entries(positionGroups)) {
          const sorted = posPlayers
            .map(p => ({
              ...p,
              stats: statsMap.get(p.id),
              usage: calculateUsageMetric(statsMap.get(p.id), position)
            }))
            .sort((a, b) => b.usage - a.usage);

          for (let i = 0; i < sorted.length; i++) {
            const player = sorted[i];
            const isFeatured = isFeaturedByPosition(position, i + 1);

            await supabase
              .from("players")
              .update({
                is_featured: isFeatured,
                featured_reason: isFeatured ? "high_usage" : null,
                slate_window_start: slateStart.toISOString(),
                slate_window_end: slateEnd.toISOString(),
                usage_rank: i + 1,
                usage_metric: player.usage,
                updated_at: new Date().toISOString(),
              })
              .eq("id", player.id);

            // Create game associations
            for (const game of games) {
              if (game.home_team_name.includes(teamName.split(" ").pop() || "") ||
                  game.visitor_team_name.includes(teamName.split(" ").pop() || "")) {
                await supabase
                  .from("player_game_associations")
                  .upsert({
                    player_id: player.id,
                    nfl_game_id: game.id,
                    sport: "NFL",
                    status: "active",
                    is_starter: isFeatured,
                  }, { onConflict: "player_id,nfl_game_id" });
              }
            }

            playersAdded++;
          }
        }

        console.log(`[sync-nfl-players-slate] Updated ${existingPlayers.length} players for ${teamName}`);

        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (teamError) {
        console.error(`[sync-nfl-players-slate] Error processing team ${teamName}:`, teamError);
      }
    }

    // Update sync schedule
    await supabase
      .from("sync_schedule")
      .upsert({
        sport: "NFL",
        data_type: "players_slate",
        last_sync_at: new Date().toISOString(),
        last_sync_status: "success",
        records_synced: playersAdded,
      }, { onConflict: "sport,data_type" });

    const response = {
      success: true,
      playersUpdated: playersAdded,
      teamsProcessed,
      message: `Updated ${playersAdded} NFL players from ${teamsProcessed.length} teams for slate`,
    };

    console.log("[sync-nfl-players-slate] Sync completed:", response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[sync-nfl-players-slate] Error:", error);
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
