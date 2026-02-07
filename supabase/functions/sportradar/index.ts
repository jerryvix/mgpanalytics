import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { getCorsHeaders } from "../_shared/cors.ts";

// ============================================================
// LEAGUE CONFIGURATION
// ============================================================
interface LeagueConfig {
  sport: string;
  apiBase: string;
  seasonYear: string;
  seasonType: string;
  enabled: boolean;
}

const LEAGUES: Record<string, LeagueConfig> = {
  NFL: {
    sport: "nfl",
    apiBase: "https://api.sportradar.com/nfl/official/trial/v7/en",
    seasonYear: "2024",
    seasonType: "REG", // REG, PST (playoffs)
    enabled: true,
  },
  NBA: {
    sport: "nba",
    apiBase: "https://api.sportradar.com/nba/trial/v8/en",
    seasonYear: "2024",
    seasonType: "REG",
    enabled: true,
  },
  NCAAMB: {
    sport: "ncaamb",
    apiBase: "https://api.sportradar.com/ncaamb/trial/v8/en",
    seasonYear: "2024",
    seasonType: "REG",
    enabled: true,
  },
  NCAAWB: {
    sport: "ncaawb",
    apiBase: "https://api.sportradar.com/ncaawb/trial/v8/en",
    seasonYear: "2024",
    seasonType: "REG",
    enabled: true,
  },
  GLOBAL_BASKETBALL: {
    sport: "basketball",
    apiBase: "https://api.sportradar.com/basketball/trial/v2/en",
    seasonYear: "2024",
    seasonType: "REG",
    enabled: true,
  },
};

// Cache TTLs in seconds
const CACHE_TTL = {
  games_list: 120,        // 2 minutes
  game_detail: 60,        // 1 minute (more frequent for live)
  game_detail_live: 15,   // 15 seconds for live games
  teams: 21600,           // 6 hours
  roster: 21600,          // 6 hours
};

// Rate limiting: requests per minute per user
const RATE_LIMIT_PER_MINUTE = 60;

// ============================================================
// NORMALIZED TYPES
// ============================================================
interface Team {
  id: string;
  name: string;
  abbr: string;
  market?: string;
}

interface Venue {
  name: string;
  city?: string;
  state?: string;
}

interface GameSummary {
  game_id: string;
  league: string;
  start_time: string;
  status: string;
  home_team: Team;
  away_team: Team;
  venue?: Venue;
  broadcast?: string;
}

interface GameDetails extends GameSummary {
  score?: {
    home: number;
    away: number;
  };
  period?: string;
  clock?: string;
}

interface Player {
  player_id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  team_id: string;
  position?: string;
  jersey?: string;
  status?: string;
  height?: string;
  weight?: number;
}

interface SourceRef {
  provider: string;
  endpoint: string;
  fetched_at: string;
  ids: Record<string, string>;
  note?: string;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================
async function checkRateLimit(
  supabase: any,
  userId: string
): Promise<boolean> {
  const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
  
  const { count } = await supabase
    .from("api_request_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("provider", "sportradar")
    .gte("created_at", oneMinuteAgo);

  return (count || 0) < RATE_LIMIT_PER_MINUTE;
}

async function logRequest(
  supabase: any,
  userId: string,
  endpoint: string,
  statusCode: number,
  durationMs: number,
  errorMessage?: string
): Promise<void> {
  try {
    await supabase.from("api_request_log").insert({
      user_id: userId,
      provider: "sportradar",
      endpoint,
      status_code: statusCode,
      duration_ms: durationMs,
      error_message: errorMessage,
    });
  } catch (e) {
    console.error("Failed to log request:", e);
  }
}

async function getFromCache(
  supabase: any,
  cacheKey: string
): Promise<unknown | null> {
  const { data } = await supabase
    .from("api_cache")
    .select("response_json, expires_at")
    .eq("cache_key", cacheKey)
    .single();

  if (data && new Date(data.expires_at) > new Date()) {
    return data.response_json;
  }
  return null;
}

async function setCache(
  supabase: any,
  cacheKey: string,
  data: unknown,
  ttlSeconds: number
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  
  try {
    await supabase.from("api_cache").upsert({
      cache_key: cacheKey,
      response_json: data,
      expires_at: expiresAt,
    });
  } catch (e) {
    console.error("Failed to set cache:", e);
  }
}

async function fetchSportradar(
  endpoint: string,
  apiKey: string
): Promise<{ data: unknown; status: number }> {
  const url = `${endpoint}${endpoint.includes("?") ? "&" : "?"}api_key=${apiKey}`;
  
  const response = await fetch(url, {
    headers: { "Accept": "application/json" },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Sportradar API error: ${response.status}`, text);
    return { data: null, status: response.status };
  }

  return { data: await response.json(), status: response.status };
}

// ============================================================
// NORMALIZERS
// ============================================================
function normalizeNFLGame(game: any, league: string): GameSummary {
  return {
    game_id: game.id,
    league,
    start_time: game.scheduled || game.start_time,
    status: game.status || "scheduled",
    home_team: {
      id: game.home?.id || game.home_team?.id || "",
      name: game.home?.name || game.home_team?.name || "",
      abbr: game.home?.alias || game.home_team?.alias || "",
      market: game.home?.market,
    },
    away_team: {
      id: game.away?.id || game.away_team?.id || "",
      name: game.away?.name || game.away_team?.name || "",
      abbr: game.away?.alias || game.away_team?.alias || "",
      market: game.away?.market,
    },
    venue: game.venue ? {
      name: game.venue.name,
      city: game.venue.city,
      state: game.venue.state,
    } : undefined,
    broadcast: game.broadcast?.network,
  };
}

function normalizeNBAGame(game: any, league: string): GameSummary {
  return {
    game_id: game.id,
    league,
    start_time: game.scheduled,
    status: game.status || "scheduled",
    home_team: {
      id: game.home?.id || "",
      name: game.home?.name || "",
      abbr: game.home?.alias || "",
      market: game.home?.market,
    },
    away_team: {
      id: game.away?.id || "",
      name: game.away?.name || "",
      abbr: game.away?.alias || "",
      market: game.away?.market,
    },
    venue: game.venue ? {
      name: game.venue.name,
      city: game.venue.city,
      state: game.venue.state,
    } : undefined,
    broadcast: game.broadcasts?.[0]?.network,
  };
}

function normalizePlayer(player: any, teamId: string): Player {
  return {
    player_id: player.id,
    name: player.full_name || `${player.first_name} ${player.last_name}`,
    first_name: player.first_name,
    last_name: player.last_name,
    team_id: teamId,
    position: player.position || player.primary_position,
    jersey: player.jersey_number || player.jersey,
    status: player.status,
    height: player.height ? `${Math.floor(player.height / 12)}'${player.height % 12}"` : undefined,
    weight: player.weight,
  };
}

function normalizeTeam(team: any): Team {
  return {
    id: team.id,
    name: team.name || team.full_name,
    abbr: team.alias || team.abbreviation,
    market: team.market,
  };
}

// ============================================================
// ENDPOINT HANDLERS
// ============================================================
async function handleGames(
  supabase: any,
  league: string,
  startDate: string,
  endDate: string,
  apiKey: string,
  userId: string
): Promise<{ games: GameSummary[]; source: SourceRef }> {
  const config = LEAGUES[league];
  if (!config?.enabled) {
    throw new Error(`League ${league} not supported`);
  }

  const cacheKey = `sportradar:${league}:games:${startDate}:${endDate}`;
  const cached = await getFromCache(supabase, cacheKey);
  
  if (cached) {
    return {
      games: cached as GameSummary[],
      source: {
        provider: "sportradar",
        endpoint: `${league}/games`,
        fetched_at: new Date().toISOString(),
        ids: {},
        note: "cached",
      },
    };
  }

  const startTs = Date.now();
  let endpoint: string;
  
  // Build endpoint based on league
  if (league === "NFL") {
    // NFL uses weekly schedule - fetch current week
    endpoint = `${config.apiBase}/games/${config.seasonYear}/${config.seasonType}/schedule.json`;
  } else if (league === "NBA" || league === "NCAAMB" || league === "NCAAWB") {
    // Use daily schedule
    const dateStr = startDate.replace(/-/g, "/");
    endpoint = `${config.apiBase}/games/${dateStr}/schedule.json`;
  } else if (league === "GLOBAL_BASKETBALL") {
    endpoint = `${config.apiBase}/schedules/${startDate}/summaries.json`;
  } else {
    throw new Error(`Unknown league: ${league}`);
  }

  const { data, status } = await fetchSportradar(endpoint, apiKey);
  const durationMs = Date.now() - startTs;
  
  await logRequest(supabase, userId, `${league}/games`, status, durationMs);

  if (!data) {
    return {
      games: [],
      source: {
        provider: "sportradar",
        endpoint: `${league}/games`,
        fetched_at: new Date().toISOString(),
        ids: {},
        note: "no data returned",
      },
    };
  }

  // Normalize games
  let games: GameSummary[] = [];
  const rawGames = (data as any).games || (data as any).summaries?.map((s: any) => s.sport_event) || [];
  
  for (const game of rawGames) {
    const scheduled = game.scheduled || game.start_time;
    if (scheduled) {
      const gameDate = new Date(scheduled);
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (gameDate >= start && gameDate <= end) {
        if (league === "NFL") {
          games.push(normalizeNFLGame(game, league));
        } else {
          games.push(normalizeNBAGame(game, league));
        }
      }
    }
  }

  // Sort by start time
  games.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  await setCache(supabase, cacheKey, games, CACHE_TTL.games_list);

  return {
    games,
    source: {
      provider: "sportradar",
      endpoint: `${league}/games`,
      fetched_at: new Date().toISOString(),
      ids: { start: startDate, end: endDate },
    },
  };
}

async function handleGameDetail(
  supabase: any,
  league: string,
  gameId: string,
  apiKey: string,
  userId: string
): Promise<{ game: GameDetails | null; source: SourceRef }> {
  const config = LEAGUES[league];
  if (!config?.enabled) {
    throw new Error(`League ${league} not supported`);
  }

  const cacheKey = `sportradar:${league}:game:${gameId}`;
  const cached = await getFromCache(supabase, cacheKey);
  
  if (cached) {
    return {
      game: cached as GameDetails,
      source: {
        provider: "sportradar",
        endpoint: `${league}/games/${gameId}`,
        fetched_at: new Date().toISOString(),
        ids: { game_id: gameId },
        note: "cached",
      },
    };
  }

  const startTs = Date.now();
  let endpoint: string;
  
  if (league === "NFL") {
    endpoint = `${config.apiBase}/games/${gameId}/boxscore.json`;
  } else if (league === "NBA" || league === "NCAAMB" || league === "NCAAWB") {
    endpoint = `${config.apiBase}/games/${gameId}/summary.json`;
  } else {
    endpoint = `${config.apiBase}/sport_events/${gameId}/summary.json`;
  }

  const { data, status } = await fetchSportradar(endpoint, apiKey);
  const durationMs = Date.now() - startTs;
  
  await logRequest(supabase, userId, `${league}/games/${gameId}`, status, durationMs);

  if (!data) {
    return {
      game: null,
      source: {
        provider: "sportradar",
        endpoint: `${league}/games/${gameId}`,
        fetched_at: new Date().toISOString(),
        ids: { game_id: gameId },
        note: "not found",
      },
    };
  }

  const raw = data as any;
  const gameData = raw.game || raw;
  
  const game: GameDetails = {
    game_id: gameId,
    league,
    start_time: gameData.scheduled,
    status: gameData.status || "scheduled",
    home_team: {
      id: gameData.home?.id || "",
      name: gameData.home?.name || gameData.home?.market || "",
      abbr: gameData.home?.alias || "",
    },
    away_team: {
      id: gameData.away?.id || "",
      name: gameData.away?.name || gameData.away?.market || "",
      abbr: gameData.away?.alias || "",
    },
    venue: gameData.venue ? {
      name: gameData.venue.name,
      city: gameData.venue.city,
    } : undefined,
  };

  // Add score if available
  if (gameData.home?.points !== undefined && gameData.away?.points !== undefined) {
    game.score = {
      home: gameData.home.points,
      away: gameData.away.points,
    };
  }

  if (gameData.quarter || gameData.period) {
    game.period = `Q${gameData.quarter || gameData.period}`;
  }
  if (gameData.clock) {
    game.clock = gameData.clock;
  }

  // Shorter TTL for live games
  const ttl = game.status === "inprogress" ? CACHE_TTL.game_detail_live : CACHE_TTL.game_detail;
  await setCache(supabase, cacheKey, game, ttl);

  return {
    game,
    source: {
      provider: "sportradar",
      endpoint: `${league}/games/${gameId}`,
      fetched_at: new Date().toISOString(),
      ids: { game_id: gameId },
    },
  };
}

async function handleTeams(
  supabase: any,
  league: string,
  apiKey: string,
  userId: string
): Promise<{ teams: Team[]; source: SourceRef }> {
  const config = LEAGUES[league];
  if (!config?.enabled) {
    throw new Error(`League ${league} not supported`);
  }

  const cacheKey = `sportradar:${league}:teams`;
  const cached = await getFromCache(supabase, cacheKey);
  
  if (cached) {
    return {
      teams: cached as Team[],
      source: {
        provider: "sportradar",
        endpoint: `${league}/teams`,
        fetched_at: new Date().toISOString(),
        ids: {},
        note: "cached",
      },
    };
  }

  const startTs = Date.now();
  let endpoint: string;
  
  if (league === "NFL") {
    endpoint = `${config.apiBase}/league/teams.json`;
  } else if (league === "NBA") {
    endpoint = `${config.apiBase}/league/teams.json`;
  } else {
    endpoint = `${config.apiBase}/league/teams.json`;
  }

  const { data, status } = await fetchSportradar(endpoint, apiKey);
  const durationMs = Date.now() - startTs;
  
  await logRequest(supabase, userId, `${league}/teams`, status, durationMs);

  if (!data) {
    return {
      teams: [],
      source: {
        provider: "sportradar",
        endpoint: `${league}/teams`,
        fetched_at: new Date().toISOString(),
        ids: {},
        note: "no data",
      },
    };
  }

  const raw = data as any;
  const rawTeams = raw.teams || raw.conferences?.flatMap((c: any) => c.divisions?.flatMap((d: any) => d.teams || []) || c.teams || []) || [];
  
  const teams = rawTeams.map(normalizeTeam);

  await setCache(supabase, cacheKey, teams, CACHE_TTL.teams);

  return {
    teams,
    source: {
      provider: "sportradar",
      endpoint: `${league}/teams`,
      fetched_at: new Date().toISOString(),
      ids: {},
    },
  };
}

async function handleRoster(
  supabase: any,
  league: string,
  teamId: string,
  apiKey: string,
  userId: string
): Promise<{ players: Player[]; source: SourceRef }> {
  const config = LEAGUES[league];
  if (!config?.enabled) {
    throw new Error(`League ${league} not supported`);
  }

  const cacheKey = `sportradar:${league}:roster:${teamId}`;
  const cached = await getFromCache(supabase, cacheKey);
  
  if (cached) {
    return {
      players: cached as Player[],
      source: {
        provider: "sportradar",
        endpoint: `${league}/teams/${teamId}/roster`,
        fetched_at: new Date().toISOString(),
        ids: { team_id: teamId },
        note: "cached",
      },
    };
  }

  const startTs = Date.now();
  const endpoint = `${config.apiBase}/teams/${teamId}/profile.json`;

  const { data, status } = await fetchSportradar(endpoint, apiKey);
  const durationMs = Date.now() - startTs;
  
  await logRequest(supabase, userId, `${league}/teams/${teamId}/roster`, status, durationMs);

  if (!data) {
    return {
      players: [],
      source: {
        provider: "sportradar",
        endpoint: `${league}/teams/${teamId}/roster`,
        fetched_at: new Date().toISOString(),
        ids: { team_id: teamId },
        note: "no data",
      },
    };
  }

  const raw = data as any;
  const rawPlayers = raw.players || raw.roster || [];
  
  const players = rawPlayers.map((p: any) => normalizePlayer(p, teamId));

  await setCache(supabase, cacheKey, players, CACHE_TTL.roster);

  return {
    players,
    source: {
      provider: "sportradar",
      endpoint: `${league}/teams/${teamId}/roster`,
      fetched_at: new Date().toISOString(),
      ids: { team_id: teamId },
    },
  };
}

// ============================================================
// MAIN HANDLER
// ============================================================
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sportradarKey = Deno.env.get("SPORTRADAR_API_KEY");

    if (!sportradarKey) {
      console.error("SPORTRADAR_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Service configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user auth for validation
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create service role client for cache/logging (bypasses RLS)
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check rate limit
    const allowed = await checkRateLimit(serviceClient, user.id);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    
    // Expected path: /sportradar/{league}/{action}[/{id}]
    // e.g., /sportradar/NFL/games
    // e.g., /sportradar/NBA/games/abc123
    // e.g., /sportradar/NFL/teams
    // e.g., /sportradar/NFL/teams/xyz/roster
    
    const league = pathParts[1]?.toUpperCase();
    const action = pathParts[2];
    const resourceId = pathParts[3];
    const subAction = pathParts[4];

    if (!league || !LEAGUES[league]) {
      return new Response(
        JSON.stringify({ 
          error: "Invalid league", 
          supported: Object.keys(LEAGUES).filter(l => LEAGUES[l].enabled) 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: { games?: GameSummary[]; game?: GameDetails | null; teams?: Team[]; players?: Player[]; source: SourceRef };

    switch (action) {
      case "games":
        if (resourceId) {
          // GET /sportradar/{league}/games/{game_id}
          result = await handleGameDetail(serviceClient, league, resourceId, sportradarKey, user.id);
        } else {
          // GET /sportradar/{league}/games?start=YYYY-MM-DD&end=YYYY-MM-DD
          const start = url.searchParams.get("start") || new Date().toISOString().split("T")[0];
          const end = url.searchParams.get("end") || new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split("T")[0];
          result = await handleGames(serviceClient, league, start, end, sportradarKey, user.id);
        }
        break;

      case "teams":
        if (resourceId && subAction === "roster") {
          // GET /sportradar/{league}/teams/{team_id}/roster
          result = await handleRoster(serviceClient, league, resourceId, sportradarKey, user.id);
        } else if (resourceId) {
          // GET /sportradar/{league}/teams/{team_id} - just return from team list
          const teamsResult = await handleTeams(serviceClient, league, sportradarKey, user.id);
          const team = teamsResult.teams.find(t => t.id === resourceId);
          result = { 
            teams: team ? [team] : [], 
            source: { ...teamsResult.source, ids: { team_id: resourceId } } 
          };
        } else {
          // GET /sportradar/{league}/teams
          result = await handleTeams(serviceClient, league, sportradarKey, user.id);
        }
        break;

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action", supported: ["games", "teams"] }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[sportradar] Error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
