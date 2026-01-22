import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ESPN Team ID mapping
const ESPN_TEAM_IDS: Record<string, number> = {
  "Atlanta Hawks": 1,
  "Boston Celtics": 2,
  "New Orleans Pelicans": 3,
  "Chicago Bulls": 4,
  "Cleveland Cavaliers": 5,
  "Dallas Mavericks": 6,
  "Denver Nuggets": 7,
  "Detroit Pistons": 8,
  "Golden State Warriors": 9,
  "Houston Rockets": 10,
  "Indiana Pacers": 11,
  "LA Clippers": 12,
  "Los Angeles Clippers": 12,
  "Los Angeles Lakers": 13,
  "LA Lakers": 13,
  "Miami Heat": 14,
  "Milwaukee Bucks": 15,
  "Minnesota Timberwolves": 16,
  "Brooklyn Nets": 17,
  "New York Knicks": 18,
  "Orlando Magic": 19,
  "Philadelphia 76ers": 20,
  "Phoenix Suns": 21,
  "Portland Trail Blazers": 22,
  "Sacramento Kings": 23,
  "San Antonio Spurs": 24,
  "Oklahoma City Thunder": 25,
  "Utah Jazz": 26,
  "Washington Wizards": 27,
  "Toronto Raptors": 28,
  "Memphis Grizzlies": 29,
  "Charlotte Hornets": 30,
};

interface ESPNAthlete {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  position: { abbreviation: string; name: string };
  jersey?: string;
  age?: number;
  height?: number;
  weight?: number;
  experience?: { years: number };
  college?: { name: string };
  injuries?: Array<{ status: string; details?: { type: string } }>;
}

interface ESPNStatCategory {
  name: string;
  displayName: string;
  stats: Array<{
    name: string;
    displayName: string;
    value: number;
    displayValue: string;
  }>;
}

function getEspnTeamId(teamName: string): number | null {
  // Try exact match first
  if (ESPN_TEAM_IDS[teamName]) {
    return ESPN_TEAM_IDS[teamName];
  }
  
  // Try partial match
  const lowerName = teamName.toLowerCase();
  for (const [key, id] of Object.entries(ESPN_TEAM_IDS)) {
    if (key.toLowerCase().includes(lowerName) || lowerName.includes(key.toLowerCase().split(' ').pop()!)) {
      return id;
    }
  }
  
  return null;
}

function getPositionType(position: string): string {
  const guards = ["G", "PG", "SG"];
  const forwards = ["F", "SF", "PF"];
  if (guards.includes(position)) return "GUARD";
  if (forwards.includes(position)) return "FORWARD";
  if (position === "C") return "CENTER";
  return "GUARD"; // Default
}

async function fetchEspnRoster(teamId: number): Promise<ESPNAthlete[]> {
  const url = `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/roster`;
  console.log(`[sync-nba-players] Fetching ESPN roster: ${url}`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[sync-nba-players] ESPN roster API error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    return data.athletes || [];
  } catch (error) {
    console.error(`[sync-nba-players] ESPN roster fetch error:`, error);
    return [];
  }
}

async function fetchEspnPlayerStats(athleteId: string): Promise<Record<string, number>> {
  const url = `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/athletes/${athleteId}/statistics`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`[sync-nba-players] No stats for athlete ${athleteId}: ${response.status}`);
      return {};
    }
    
    const data = await response.json();
    const stats: Record<string, number> = {};
    
    // Parse statistics from ESPN response
    if (data.statistics && Array.isArray(data.statistics)) {
      for (const category of data.statistics as ESPNStatCategory[]) {
        if (category.stats) {
          for (const stat of category.stats) {
            stats[stat.name] = stat.value;
          }
        }
      }
    }
    
    // Also check splits format
    if (data.splits && data.splits.categories) {
      for (const category of data.splits.categories) {
        if (category.stats) {
          for (const stat of category.stats) {
            stats[stat.name] = stat.value;
          }
        }
      }
    }
    
    return stats;
  } catch (error) {
    console.log(`[sync-nba-players] Stats fetch error for ${athleteId}:`, error);
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[sync-nba-players] Starting NBA players sync using ESPN API...");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Step 1: Get NBA games in slate window (NOW → +48h)
    const now = new Date();
    const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    console.log(`[sync-nba-players] Step 1: Querying games from ${now.toISOString()} to ${in48Hours.toISOString()}`);

    const { data: games, error: gamesError } = await supabase
      .from("nba_games")
      .select("id, home_team_name, visitor_team_name, date")
      .gte("date", now.toISOString())
      .lte("date", in48Hours.toISOString());

    if (gamesError) {
      throw new Error(`Failed to fetch games: ${gamesError.message}`);
    }

    if (!games || games.length === 0) {
      console.log("[sync-nba-players] No games in slate window");
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No NBA games in next 48 hours. Sync games first.", 
          playersAdded: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[sync-nba-players] Found ${games.length} NBA games in slate window`);

    // Step 2: Extract unique teams and map to ESPN IDs
    const teamToGames: Record<string, typeof games> = {};
    const teamNames = new Set<string>();

    for (const game of games) {
      teamNames.add(game.home_team_name);
      teamNames.add(game.visitor_team_name);
      
      if (!teamToGames[game.home_team_name]) teamToGames[game.home_team_name] = [];
      if (!teamToGames[game.visitor_team_name]) teamToGames[game.visitor_team_name] = [];
      teamToGames[game.home_team_name].push(game);
      teamToGames[game.visitor_team_name].push(game);
    }

    console.log(`[sync-nba-players] Processing ${teamNames.size} teams: ${Array.from(teamNames).join(', ')}`);

    let playersAdded = 0;
    let featuredCount = 0;
    const teamsProcessed: string[] = [];
    const errors: string[] = [];

    // Step 3: For each team, fetch roster and stats from ESPN
    for (const teamName of Array.from(teamNames)) {
      const espnTeamId = getEspnTeamId(teamName);
      
      if (!espnTeamId) {
        console.error(`[sync-nba-players] Could not map team "${teamName}" to ESPN ID`);
        errors.push(`Unknown team: ${teamName}`);
        continue;
      }

      console.log(`[sync-nba-players] Step 2: Fetching roster for ${teamName} (ESPN ID: ${espnTeamId})`);

      const athletes = await fetchEspnRoster(espnTeamId);
      
      if (athletes.length === 0) {
        console.log(`[sync-nba-players] No players found for ${teamName}`);
        continue;
      }

      console.log(`[sync-nba-players] Found ${athletes.length} players on ${teamName} roster`);
      teamsProcessed.push(teamName);

      // Fetch stats for each player and collect for ranking
      const playersWithStats: Array<{
        athlete: ESPNAthlete;
        stats: Record<string, number>;
        mpg: number;
      }> = [];

      for (const athlete of athletes) {
        console.log(`[sync-nba-players] Step 3: Fetching stats for ${athlete.displayName} (${athlete.id})`);
        const stats = await fetchEspnPlayerStats(athlete.id);
        const mpg = stats['MIN'] || stats['MPG'] || stats['minutes'] || 0;
        playersWithStats.push({ athlete, stats, mpg });
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Sort by MPG for featured calculation
      playersWithStats.sort((a, b) => b.mpg - a.mpg);

      console.log(`[sync-nba-players] Step 4: Calculating featured players for ${teamName}`);

      const slateStart = now;
      const slateEnd = in48Hours;
      const teamGames = teamToGames[teamName] || [];

      // Step 4: Upsert players
      for (let i = 0; i < playersWithStats.length; i++) {
        const { athlete, stats, mpg } = playersWithStats[i];
        
        // Check injury status from ESPN
        const injuryStatus = athlete.injuries && athlete.injuries.length > 0 
          ? athlete.injuries[0].status || "Questionable"
          : "Healthy";
        
        const isInjured = injuryStatus !== "Healthy";
        const isTopUsage = i < 8;
        const isFeatured = isTopUsage || isInjured;
        
        let featuredReason: string | null = null;
        if (isInjured) featuredReason = "injured";
        else if (isTopUsage) featuredReason = "high_usage";

        if (isFeatured) featuredCount++;

        const playerRecord = {
          external_id: athlete.id,
          sport: "NBA",
          name: athlete.displayName,
          first_name: athlete.firstName,
          last_name: athlete.lastName,
          position: athlete.position?.abbreviation || "G",
          position_type: getPositionType(athlete.position?.abbreviation || "G"),
          team_name: teamName,
          team_abbr: teamName.split(' ').pop() || "",
          team_id: String(espnTeamId),
          jersey_number: athlete.jersey || null,
          height: athlete.height ? `${Math.floor(athlete.height / 12)}'${athlete.height % 12}"` : null,
          weight: athlete.weight || null,
          age: athlete.age || null,
          college: athlete.college?.name || null,
          experience: athlete.experience?.years || null,
          is_featured: isFeatured,
          featured_reason: featuredReason,
          slate_window_start: slateStart.toISOString(),
          slate_window_end: slateEnd.toISOString(),
          injury_status: injuryStatus,
          usage_rank: i + 1,
          usage_metric: mpg,
          raw_data: athlete,
          updated_at: new Date().toISOString(),
        };

        console.log(`[sync-nba-players] Step 5: Upserting player ${athlete.displayName}`);

        const { data: upsertedPlayer, error: upsertError } = await supabase
          .from("players")
          .upsert(playerRecord, { onConflict: "external_id,sport" })
          .select("id")
          .single();

        if (upsertError) {
          console.error(`[sync-nba-players] Error upserting player ${athlete.displayName}:`, upsertError);
          errors.push(`Failed to insert ${athlete.displayName}: ${upsertError.message}`);
          continue;
        }

        playersAdded++;

        // Step 5: Insert season stats if available
        if (upsertedPlayer && Object.keys(stats).length > 0) {
          const gamesPlayed = stats['GP'] || stats['gamesPlayed'] || 0;
          
          const seasonStats = {
            player_id: upsertedPlayer.id,
            sport: "NBA",
            season: 2025,
            season_type: "regular",
            games_played: gamesPlayed,
            points_per_game: stats['PTS'] || stats['avgPoints'] || 0,
            rebounds_per_game: stats['REB'] || stats['avgRebounds'] || 0,
            assists_per_game: stats['AST'] || stats['avgAssists'] || 0,
            steals_per_game: stats['STL'] || stats['avgSteals'] || 0,
            blocks_per_game: stats['BLK'] || stats['avgBlocks'] || 0,
            turnovers_per_game: stats['TO'] || stats['avgTurnovers'] || 0,
            minutes_per_game: mpg,
            field_goal_pct: stats['FG%'] || stats['fieldGoalPct'] || 0,
            three_point_pct: stats['3P%'] || stats['threePointPct'] || 0,
            free_throw_pct: stats['FT%'] || stats['freeThrowPct'] || 0,
            source: "espn",
            raw_data: stats,
            updated_at: new Date().toISOString(),
          };

          await supabase
            .from("player_season_stats")
            .upsert(seasonStats, { onConflict: "player_id,season,season_type" });
        }

        // Step 6: Create game associations
        if (upsertedPlayer && teamGames.length > 0) {
          for (const game of teamGames) {
            const association = {
              player_id: upsertedPlayer.id,
              nba_game_id: game.id,
              sport: "NBA",
              status: "active",
              is_starter: i < 5,
            };

            await supabase
              .from("player_game_associations")
              .upsert(association, { onConflict: "player_id,nba_game_id" })
              .select();
          }
        }
      }

      console.log(`[sync-nba-players] Processed ${playersWithStats.length} players for ${teamName}`);

      // Rate limiting between teams
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Update sync schedule
    await supabase
      .from("sync_schedule")
      .upsert({
        sport: "NBA",
        data_type: "players",
        last_sync_at: new Date().toISOString(),
        last_sync_status: "success",
        records_synced: playersAdded,
      }, { onConflict: "sport,data_type" });

    const response = {
      success: true,
      playersAdded,
      featuredPlayers: featuredCount,
      teamsProcessed,
      gamesInSlate: games.length,
      slateWindow: {
        start: now.toISOString(),
        end: in48Hours.toISOString(),
      },
      errors: errors.length > 0 ? errors : undefined,
      message: `Synced ${playersAdded} NBA players from ${teamsProcessed.length} teams using ESPN API`,
    };

    console.log("[sync-nba-players] Sync completed:", response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[sync-nba-players] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
