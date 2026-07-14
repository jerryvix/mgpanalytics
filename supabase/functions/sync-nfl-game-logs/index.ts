import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const NFL_BASE_URL = "https://api.balldontlie.io/nfl/v1";
const RATE_LIMIT_DELAY = 100;
let lastCallTime = 0;

async function rateLimitedDelay(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastCallTime;
  if (timeSinceLastCall < RATE_LIMIT_DELAY) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastCall));
  }
  lastCallTime = Date.now();
}

async function bdlFetch(
  apiKey: string,
  endpoint: string,
  params?: Record<string, string | number>
): Promise<{ data: any[]; meta?: { next_cursor?: string } }> {
  await rateLimitedDelay();

  const url = new URL(`${NFL_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  console.log(`[sync-nfl-game-logs] Fetching: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[sync-nfl-game-logs] Error ${response.status}: ${errorText}`);
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  const json = await response.json();
  console.log(`[sync-nfl-game-logs] Got ${json.data?.length || 0} records`);
  return json;
}

async function fetchAllPages(
  apiKey: string,
  endpoint: string,
  params?: Record<string, string | number>
): Promise<any[]> {
  const allData: any[] = [];
  let cursor: string | undefined = undefined;
  let pageCount = 0;
  const maxPages = 100;

  do {
    pageCount++;
    const fetchParams: Record<string, string | number> = {
      ...params,
      per_page: 100,
    };
    if (cursor) {
      fetchParams.cursor = cursor;
    }

    const response = await bdlFetch(apiKey, endpoint, fetchParams);

    if (response.data && Array.isArray(response.data)) {
      allData.push(...response.data);
    }

    cursor = response.meta?.next_cursor;

    if (pageCount >= maxPages) {
      console.log(`[sync-nfl-game-logs] Reached max page limit (${maxPages})`);
      break;
    }
  } while (cursor);

  console.log(`[sync-nfl-game-logs] Total records: ${allData.length} across ${pageCount} pages`);
  return allData;
}

// Calculate fantasy points from game stats
function calculateFantasyPoints(stat: any): { fantasy_points: number; fantasy_points_ppr: number } {
  const passYards = stat.passing_yards || 0;
  const passTd = stat.passing_touchdowns || 0;
  const passInt = stat.passing_interceptions || 0;
  const rushYards = stat.rushing_yards || 0;
  const rushTd = stat.rushing_touchdowns || 0;
  const recYards = stat.receiving_yards || 0;
  const recTd = stat.receiving_touchdowns || 0;
  const receptions = stat.receptions || 0;

  const fantasy_points =
    passYards * 0.04 +
    passTd * 4 -
    passInt * 2 +
    rushYards * 0.1 +
    rushTd * 6 +
    recYards * 0.1 +
    recTd * 6;

  const fantasy_points_ppr = fantasy_points + receptions;

  return {
    fantasy_points: Math.round(fantasy_points * 100) / 100,
    fantasy_points_ppr: Math.round(fantasy_points_ppr * 100) / 100,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let syncLogId: string | null = null;
  let supabase: any;

  try {
    const apiKey = Deno.env.get("BALLDONTLIE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!apiKey) throw new Error("BALLDONTLIE_API_KEY not configured");
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error("Supabase configuration missing");
    }

    supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth: cron secret, service role key, or admin JWT
    const cronSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log(`[sync-nfl-game-logs] Authenticated via cron secret`);
    } else if (bearerToken === supabaseServiceKey) {
      console.log(`[sync-nfl-game-logs] Authenticated via service role key`);
    } else {
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized - no token provided" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user }, error: userError } = await authClient.auth.getUser();
      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized - invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (roleError || roleData?.role !== "admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden - admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const triggerSource = detectTriggerSource(req);
    syncLogId = await startSyncLog(supabase, {
      sport: "NFL",
      data_type: "game_logs",
      function_name: "sync-nfl-game-logs",
      trigger_source: triggerSource,
      api_source: "balldontlie",
    });

    // Parse request body. Season default: the current season once games begin
    // (Sep+), else the most recently completed one (BDL labels by start year)
    const nowDate = new Date();
    let season = nowDate.getMonth() >= 8 ? nowDate.getFullYear() : nowDate.getFullYear() - 1;
    let fullSeason = true; // Default to full season for NFL
    let weekFilter: number | null = null;
    try {
      const body = await req.json();
      if (body.season) season = parseInt(body.season, 10);
      if (body.fullSeason !== undefined) fullSeason = body.fullSeason;
      if (body.week) weekFilter = parseInt(body.week, 10);
    } catch {
      // Use defaults
    }

    console.log(`[sync-nfl-game-logs] Starting sync for season ${season}, fullSeason=${fullSeason}`);

    // Step 1: Get NFL players with BDL external_ids
    // Roster sync stores full position names; accept abbreviations too
    const SKILL_POSITIONS = [
      "QB", "RB", "WR", "TE", "FB",
      "Quarterback", "Running Back", "Wide Receiver", "Tight End", "Fullback",
    ];
    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id, external_id, name, team_abbr, position")
      .eq("sport", "NFL")
      .not("external_id", "is", null)
      .in("position", SKILL_POSITIONS);

    if (playersError) {
      throw new Error(`Failed to fetch players: ${playersError.message}`);
    }

    const playerMap = new Map<string, { id: string; name: string; teamAbbr: string }>();
    if (players) {
      players.forEach((p: any) => {
        playerMap.set(p.external_id, { id: p.id, name: p.name, teamAbbr: p.team_abbr || "" });
      });
    }
    console.log(`[sync-nfl-game-logs] Found ${playerMap.size} NFL players with BDL IDs`);

    if (playerMap.size === 0) {
      const response = {
        success: true,
        synced: 0,
        message: "No NFL players with external_ids found. Run sync-nfl-players first.",
      };
      await completeSyncLog(supabase, syncLogId, startTime, {
        status: "success",
        records_added: 0,
        details: { message: response.message },
      });
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Fetch games for the season to get game context (teams, scores, weeks)
    console.log(`[sync-nfl-game-logs] Fetching NFL games for season ${season}...`);
    const gamesParams: Record<string, string | number> = { "seasons[]": season };
    if (weekFilter) gamesParams["weeks[]"] = weekFilter;

    const allGames = await fetchAllPages(apiKey, "/games", gamesParams);
    console.log(`[sync-nfl-game-logs] Found ${allGames.length} NFL games`);

    // Build game lookup by BDL game ID
    const gameMap = new Map<number, any>();
    for (const game of allGames) {
      gameMap.set(game.id, game);
    }

    // Step 3: Fetch stats for each player
    const gameLogsToInsert: any[] = [];
    let processedPlayers = 0;

    for (const [externalId, playerInfo] of playerMap) {
      try {
        const bdlId = externalId;
        const statsParams: Record<string, string | number> = {
          "player_ids[]": bdlId,
          "seasons[]": season,
        };
        if (weekFilter) statsParams["weeks[]"] = weekFilter;

        const stats = await fetchAllPages(apiKey, "/stats", statsParams);

        for (const stat of stats) {
          const game = stat.game || gameMap.get(stat.game_id);
          if (!game) continue;

          // Determine home/away and opponent
          const playerTeamAbbr = playerInfo.teamAbbr.toUpperCase();
          const homeTeam = game.home_team || {};
          const visitorTeam = game.visitor_team || {};

          const isHome =
            homeTeam.abbreviation === playerTeamAbbr ||
            (homeTeam.full_name || "").toLowerCase().includes(playerTeamAbbr.toLowerCase());

          const opponentTeam = isHome ? visitorTeam : homeTeam;
          const teamScore = isHome ? game.home_team_score : game.visitor_team_score;
          const opponentScore = isHome ? game.visitor_team_score : game.home_team_score;
          const result = teamScore > opponentScore ? "W" : teamScore < opponentScore ? "L" : "T";

          const gameDate = game.date ? game.date.split("T")[0] : null;
          const fantasyPoints = calculateFantasyPoints(stat);

          gameLogsToInsert.push({
            player_id: playerInfo.id,
            sport: "NFL",
            season: season,
            week: game.week || stat.week || null,
            game_date: gameDate,
            game_id: `nfl_game_${game.id}`,
            opponent_abbr: opponentTeam.abbreviation || "UNK",
            opponent_name: opponentTeam.full_name || "Unknown",
            home_away: isHome ? "home" : "away",
            result: result,
            team_score: teamScore || 0,
            opponent_score: opponentScore || 0,
            pass_attempts: stat.passing_attempts || 0,
            pass_completions: stat.passing_completions || 0,
            pass_yards: stat.passing_yards || 0,
            pass_td: stat.passing_touchdowns || 0,
            pass_int: stat.passing_interceptions || 0,
            passer_rating: stat.qbr || null,
            rush_attempts: stat.rushing_attempts || 0,
            rush_yards: stat.rushing_yards || 0,
            rush_td: stat.rushing_touchdowns || 0,
            targets: stat.receiving_targets || 0,
            receptions: stat.receptions || 0,
            rec_yards: stat.receiving_yards || 0,
            rec_td: stat.receiving_touchdowns || 0,
            fantasy_points: fantasyPoints.fantasy_points,
            fantasy_points_ppr: fantasyPoints.fantasy_points_ppr,
            raw_data: stat,
          });
        }

        processedPlayers++;
        if (processedPlayers % 50 === 0) {
          console.log(`[sync-nfl-game-logs] Processed ${processedPlayers}/${playerMap.size} players, ${gameLogsToInsert.length} logs so far`);
        }
      } catch (err) {
        console.error(`[sync-nfl-game-logs] Error fetching stats for player ${externalId}:`, err);
      }
    }

    console.log(`[sync-nfl-game-logs] Prepared ${gameLogsToInsert.length} game logs for insertion`);

    // Step 4: Batch upsert
    let totalInserted = 0;
    const batchSize = 100;

    for (let i = 0; i < gameLogsToInsert.length; i += batchSize) {
      const batch = gameLogsToInsert.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from("player_game_logs")
        .upsert(batch, { onConflict: "player_id,game_id" });

      if (insertError) {
        console.error(`[sync-nfl-game-logs] Batch ${Math.floor(i / batchSize) + 1} error:`, insertError.message);
      } else {
        totalInserted += batch.length;
      }
    }

    // Update sync_schedule
    await supabase.from("sync_schedule").upsert(
      {
        sport: "NFL",
        data_type: "game_logs",
        last_sync_at: new Date().toISOString(),
        last_sync_status: "success",
        records_synced: totalInserted,
      },
      { onConflict: "sport,data_type" }
    );

    const duration = Math.round((Date.now() - startTime) / 1000);
    const response = {
      success: true,
      synced: totalInserted,
      playersProcessed: processedPlayers,
      season,
      duration: `${duration}s`,
      message: `Synced ${totalInserted} NFL game logs for ${processedPlayers} players`,
    };

    console.log("[sync-nfl-game-logs] Complete:", response);

    await completeSyncLog(supabase, syncLogId, startTime, {
      status: "success",
      records_added: totalInserted,
      details: { players_processed: processedPlayers, season },
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[sync-nfl-game-logs] Error:", errorMessage);

    await completeSyncLog(supabase, syncLogId, startTime, {
      status: "failed",
      error_message: errorMessage,
    });

    return new Response(
      JSON.stringify({ success: false, error: "An unexpected error occurred. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
