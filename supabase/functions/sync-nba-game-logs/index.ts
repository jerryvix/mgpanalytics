import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const BDL_BASE_URL = "https://api.balldontlie.io/v1";
const RATE_LIMIT_DELAY = 100;
let lastCallTime = 0;

async function rateLimitedDelay(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastCallTime;
  if (timeSinceLastCall < RATE_LIMIT_DELAY) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastCall));
  }
  lastCallTime = Date.now();
}

async function bdlFetch(
  apiKey: string,
  endpoint: string,
  params?: Record<string, string | number | number[]>
): Promise<{ data: any[]; meta?: { next_cursor?: string } }> {
  await rateLimitedDelay();

  const url = new URL(`${BDL_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((v) => url.searchParams.append(`${key}[]`, String(v)));
      } else if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  console.log(`[sync-nba-game-logs] Fetching: ${url.toString().substring(0, 200)}...`);

  const response = await fetch(url.toString(), {
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[sync-nba-game-logs] API ${response.status}: ${errorText.substring(0, 200)}`);
    throw new Error(`BDL API ${response.status}: ${errorText.substring(0, 100)}`);
  }

  const json = await response.json();
  return json;
}

// Load all active BDL players for name → ID mapping (cached per invocation)
let activePlayersCache: Map<string, number> | null = null;

async function loadActivePlayersCache(apiKey: string): Promise<Map<string, number>> {
  if (activePlayersCache) return activePlayersCache;

  const playerMap = new Map<string, number>();
  let cursor: string | undefined;
  let pageCount = 0;
  const MAX_PAGES = 10;

  console.log(`[sync-nba-game-logs] Loading all active players from BDL...`);

  do {
    const params: Record<string, string | number> = { per_page: 100 };
    if (cursor) params.cursor = cursor;

    const result = await bdlFetch(apiKey, "/players/active", params);

    if (result.data && Array.isArray(result.data)) {
      for (const player of result.data) {
        const fullName = `${player.first_name} ${player.last_name}`.toLowerCase().trim();
        playerMap.set(fullName, player.id);
        playerMap.set(`lastname:${player.last_name.toLowerCase()}`, player.id);
      }
    }

    cursor = result.meta?.next_cursor;
    pageCount++;
  } while (cursor && pageCount < MAX_PAGES);

  console.log(`[sync-nba-game-logs] Active players cache: ${Math.floor(playerMap.size / 2)} players`);
  activePlayersCache = playerMap;
  return playerMap;
}

function findBdlPlayerId(cache: Map<string, number>, playerName: string): number | null {
  const normalized = playerName.toLowerCase().trim();

  // Exact match
  if (cache.has(normalized)) return cache.get(normalized)!;

  // Last name partial match
  const parts = normalized.split(" ");
  if (parts.length >= 2) {
    const lastNameKey = `lastname:${parts[parts.length - 1]}`;
    if (cache.has(lastNameKey)) return cache.get(lastNameKey)!;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let syncLogId: string | null = null;
  const syncStartTime = Date.now();
  let supabase: any;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const BDL_API_KEY = Deno.env.get("BALLDONTLIE_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase configuration missing");
    }
    if (!BDL_API_KEY) {
      throw new Error("BALLDONTLIE_API_KEY not configured");
    }

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auth: cron secret, service role key, or admin JWT
    const cronSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log(`[sync-nba-game-logs] Authenticated via cron secret`);
    } else if (bearerToken === SUPABASE_SERVICE_ROLE_KEY) {
      console.log(`[sync-nba-game-logs] Authenticated via service role key`);
    } else {
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

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (roleData?.role !== "admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden - admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const triggerSource = detectTriggerSource(req);
    syncLogId = await startSyncLog(supabase, {
      sport: "NBA",
      data_type: "game_logs",
      function_name: "sync-nba-game-logs",
      trigger_source: triggerSource,
      api_source: "balldontlie",
    });

    // Dynamic season calculation
    const now = new Date();
    const bdlSeason = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
    const dbSeason = bdlSeason + 1;
    console.log(`[sync-nba-game-logs] Season: BDL=${bdlSeason}, DB=${dbSeason}`);

    // Step 1: Get all NBA players from our DB
    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id, name, team_abbr")
      .eq("sport", "NBA")
      .not("name", "is", null);

    if (playersError) throw new Error(`Failed to fetch players: ${playersError.message}`);
    if (!players || players.length === 0) {
      const msg = "No NBA players found. Sync players first.";
      await completeSyncLog(supabase, syncLogId, syncStartTime, {
        status: "success", records_added: 0, details: { message: msg },
      });
      return new Response(JSON.stringify({ success: true, synced: 0, message: msg }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[sync-nba-game-logs] Found ${players.length} NBA players in DB`);

    // Step 2: Load BDL active players cache and map DB players to BDL IDs
    const bdlCache = await loadActivePlayersCache(BDL_API_KEY);

    const playerBdlMap: Array<{ dbId: string; bdlId: number; name: string; teamAbbr: string }> = [];
    for (const player of players) {
      const bdlId = findBdlPlayerId(bdlCache, player.name);
      if (bdlId) {
        playerBdlMap.push({
          dbId: player.id,
          bdlId,
          name: player.name,
          teamAbbr: player.team_abbr || "",
        });
      }
    }

    console.log(`[sync-nba-game-logs] Mapped ${playerBdlMap.length}/${players.length} players to BDL IDs`);

    if (playerBdlMap.length === 0) {
      const msg = "Could not map any players to BDL IDs.";
      await completeSyncLog(supabase, syncLogId, syncStartTime, {
        status: "success", records_added: 0, details: { message: msg },
      });
      return new Response(JSON.stringify({ success: true, synced: 0, message: msg }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Fetch per-game stats from BDL in batches of player IDs
    // BDL /v1/stats accepts seasons[] and player_ids[] params
    const BATCH_SIZE = 25;
    const allBdlIds = playerBdlMap.map((p) => p.bdlId);
    const batches: number[][] = [];

    for (let i = 0; i < allBdlIds.length; i += BATCH_SIZE) {
      batches.push(allBdlIds.slice(i, i + BATCH_SIZE));
    }

    // Build reverse map: BDL ID → { dbId, teamAbbr }
    const bdlToDb = new Map<number, { dbId: string; teamAbbr: string }>();
    for (const p of playerBdlMap) {
      bdlToDb.set(p.bdlId, { dbId: p.dbId, teamAbbr: p.teamAbbr });
    }

    const gameLogsToInsert: any[] = [];

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batchIds = batches[batchIdx];
      console.log(`[sync-nba-game-logs] Batch ${batchIdx + 1}/${batches.length} (${batchIds.length} players)`);

      // Paginate through all stats for this batch
      let cursor: string | undefined;
      let pages = 0;
      const MAX_PAGES = 50;

      do {
        const params: Record<string, string | number | number[]> = {
          seasons: bdlSeason,
          player_ids: batchIds,
          per_page: 100,
        };
        if (cursor) (params as any).cursor = cursor;

        try {
          const result = await bdlFetch(BDL_API_KEY, "/stats", params);

          for (const stat of result.data || []) {
            const bdlPlayerId = stat.player?.id;
            const dbInfo = bdlToDb.get(bdlPlayerId);
            if (!dbInfo) continue;

            // Parse minutes
            let minutes = 0;
            if (stat.min) {
              if (String(stat.min).includes(":")) {
                const [mins, secs] = String(stat.min).split(":");
                minutes = parseInt(mins) + (parseInt(secs) || 0) / 60;
              } else {
                minutes = parseInt(stat.min) || 0;
              }
            }

            // Determine home/away
            const game = stat.game;
            if (!game) continue;

            const gameDate = game.date?.split("T")[0];
            const homeAbbr = game.home_team?.abbreviation || "";
            const visitorAbbr = game.visitor_team?.abbreviation || "";
            const playerTeam = dbInfo.teamAbbr.toUpperCase();

            const isHome = homeAbbr === playerTeam ||
              (game.home_team?.full_name || "").toLowerCase().includes(playerTeam.toLowerCase());

            const opponentAbbr = isHome ? visitorAbbr : homeAbbr;
            const opponentName = isHome
              ? game.visitor_team?.full_name || ""
              : game.home_team?.full_name || "";

            const teamScore = isHome ? game.home_team_score : game.visitor_team_score;
            const opponentScore = isHome ? game.visitor_team_score : game.home_team_score;
            const result2 = teamScore > opponentScore ? "W" : teamScore < opponentScore ? "L" : "T";

            gameLogsToInsert.push({
              player_id: dbInfo.dbId,
              sport: "NBA",
              season: dbSeason,
              game_id: `bdl_nba_game_${game.id}`,
              game_date: gameDate,
              opponent_abbr: opponentAbbr,
              opponent_name: opponentName,
              home_away: isHome ? "home" : "away",
              result: result2,
              team_score: teamScore || 0,
              opponent_score: opponentScore || 0,
              minutes: Math.round(minutes),
              points: stat.pts || 0,
              rebounds: (stat.oreb || 0) + (stat.dreb || 0),
              assists: stat.ast || 0,
              steals: stat.stl || 0,
              blocks: stat.blk || 0,
              turnovers: stat.turnover || 0,
              fg_made: stat.fgm || 0,
              fg_attempted: stat.fga || 0,
              three_made: stat.fg3m || 0,
              three_attempted: stat.fg3a || 0,
              raw_data: stat,
            });
          }

          cursor = result.meta?.next_cursor;
          pages++;
        } catch (err) {
          console.error(`[sync-nba-game-logs] Batch ${batchIdx + 1} page ${pages + 1} error:`, err);
          break;
        }
      } while (cursor && pages < MAX_PAGES);
    }

    console.log(`[sync-nba-game-logs] Prepared ${gameLogsToInsert.length} game logs for insertion`);

    // Step 4: Batch upsert to database
    let totalInserted = 0;
    for (let i = 0; i < gameLogsToInsert.length; i += 100) {
      const batch = gameLogsToInsert.slice(i, i + 100);
      const { error: insertError } = await supabase
        .from("player_game_logs")
        .upsert(batch, { onConflict: "player_id,sport,game_id" });

      if (insertError) {
        console.error(`[sync-nba-game-logs] Upsert batch ${Math.floor(i / 100) + 1} error:`, insertError.message);
      } else {
        totalInserted += batch.length;
      }
    }

    // Update sync schedule
    await supabase.from("sync_schedule").upsert({
      sport: "NBA",
      data_type: "game_logs",
      last_sync_at: new Date().toISOString(),
      last_sync_status: "success",
      records_synced: totalInserted,
    }, { onConflict: "sport,data_type" });

    const response = {
      success: true,
      synced: totalInserted,
      playersProcessed: playerBdlMap.length,
      season: { bdl: bdlSeason, db: dbSeason },
      message: `Synced ${totalInserted} game logs for ${playerBdlMap.length} players`,
    };

    console.log("[sync-nba-game-logs] Complete:", response);

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: totalInserted,
      details: { players_mapped: playerBdlMap.length, total_players: players.length },
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[sync-nba-game-logs] Error:", error instanceof Error ? error.message : error);

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "failed",
      error_message: error instanceof Error ? error.message : "Unknown error",
    });

    return new Response(
      JSON.stringify({ success: false, error: "An unexpected error occurred. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
