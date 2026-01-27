import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BDL_NFL_BASE_URL = 'https://api.balldontlie.io/nfl/v1';

// Rate limiting
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

async function bdlFetch(apiKey: string, endpoint: string, params?: Record<string, string | number | number[] | string[]>) {
  await rateLimitedDelay();
  
  const url = new URL(`${BDL_NFL_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          value.forEach(v => url.searchParams.append(`${key}[]`, String(v)));
        } else {
          url.searchParams.append(key, String(value));
        }
      }
    });
  }

  console.log(`[NFL-Slate] Fetching: ${url.toString()}`);
  
  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[NFL-Slate] Error ${response.status}: ${errorText}`);
    throw new Error(`API Error ${response.status}`);
  }

  return await response.json();
}

interface NFLGame {
  id: number;
  date: string;
  time: string;
  datetime: string;
  season: number;
  week: number;
  status: string;
  home_team: {
    id: number;
    abbreviation: string;
    full_name: string;
    name: string;
  };
  visitor_team: {
    id: number;
    abbreviation: string;
    full_name: string;
    name: string;
  };
}

interface NFLPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_abbreviation: string;
  team: {
    id: number;
    abbreviation: string;
    full_name: string;
    name: string;
  } | null;
  jersey_number: string | null;
}

interface LeaderPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_abbreviation: string;
  team: {
    id: number;
    abbreviation: string;
    full_name: string;
    name: string;
  } | null;
  jersey_number: string | null;
  stat_value: number;
  stat_type: string;
  rank: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('BALLDONTLIE_API_KEY');
    
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    console.log('[NFL-Slate] Starting to fetch next game and leaders...');

    // Step 1: Get upcoming games
    const gamesResult = await bdlFetch(apiKey, '/games', {
      season: 2024,
      per_page: 50
    });

    console.log(`[NFL-Slate] Found ${gamesResult.data?.length || 0} games`);

    // Find the next upcoming game (earliest future game)
    const now = new Date();
    const upcomingGames = (gamesResult.data || [])
      .filter((game: NFLGame) => {
        // Parse the game datetime
        const gameDate = new Date(game.datetime || `${game.date}T${game.time || '00:00:00'}`);
        // Check if game is in the future and not finished
        return gameDate > now && game.status !== 'Final' && game.status !== 'final';
      })
      .sort((a: NFLGame, b: NFLGame) => {
        const dateA = new Date(a.datetime || `${a.date}T${a.time || '00:00:00'}`);
        const dateB = new Date(b.datetime || `${b.date}T${b.time || '00:00:00'}`);
        return dateA.getTime() - dateB.getTime();
      });

    if (upcomingGames.length === 0) {
      console.log('[NFL-Slate] No upcoming games found');
      return new Response(
        JSON.stringify({ 
          game: null, 
          leaders: { passing: [], rushing: [], receiving: [] },
          message: 'No upcoming games found'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const nextGame: NFLGame = upcomingGames[0];
    console.log(`[NFL-Slate] Next game: ${nextGame.visitor_team.abbreviation} @ ${nextGame.home_team.abbreviation} on ${nextGame.date}`);

    const homeTeamId = nextGame.home_team.id;
    const awayTeamId = nextGame.visitor_team.id;

    // Step 2: Get players for both teams
    const [homePlayersResult, awayPlayersResult] = await Promise.all([
      bdlFetch(apiKey, '/players', { team_ids: [homeTeamId], per_page: 100 }),
      bdlFetch(apiKey, '/players', { team_ids: [awayTeamId], per_page: 100 })
    ]);

    const allPlayers: NFLPlayer[] = [
      ...(homePlayersResult.data || []),
      ...(awayPlayersResult.data || [])
    ];

    console.log(`[NFL-Slate] Found ${allPlayers.length} players from both teams`);

    // Step 3: Get season stats for all players
    // We need to fetch advanced stats for passing, rushing, and receiving
    const playerIds = allPlayers.map(p => p.id);
    
    // Fetch season stats using the season_stats endpoint
    const statsResult = await bdlFetch(apiKey, '/season_stats', {
      season: 2024,
      player_ids: playerIds.slice(0, 25) // Limit to avoid URL too long
    });

    console.log(`[NFL-Slate] Fetched stats for ${statsResult.data?.length || 0} players`);

    // Create a map of player ID to their stats
    const statsMap = new Map<number, any>();
    for (const stat of statsResult.data || []) {
      if (stat.player?.id) {
        statsMap.set(stat.player.id, stat);
      }
    }

    // Step 4: Calculate leaders
    const passLeaders: LeaderPlayer[] = [];
    const rushLeaders: LeaderPlayer[] = [];
    const recLeaders: LeaderPlayer[] = [];

    for (const player of allPlayers) {
      const stats = statsMap.get(player.id);
      if (!stats) continue;

      // Passing yards
      if (stats.passing_yards && stats.passing_yards > 0) {
        passLeaders.push({
          ...player,
          stat_value: stats.passing_yards,
          stat_type: 'Passing Yards',
          rank: 0
        });
      }

      // Rushing yards
      if (stats.rushing_yards && stats.rushing_yards > 0) {
        rushLeaders.push({
          ...player,
          stat_value: stats.rushing_yards,
          stat_type: 'Rushing Yards',
          rank: 0
        });
      }

      // Receiving yards
      if (stats.receiving_yards && stats.receiving_yards > 0) {
        recLeaders.push({
          ...player,
          stat_value: stats.receiving_yards,
          stat_type: 'Receiving Yards',
          rank: 0
        });
      }
    }

    // Sort and take top 2 for each category
    passLeaders.sort((a, b) => b.stat_value - a.stat_value);
    rushLeaders.sort((a, b) => b.stat_value - a.stat_value);
    recLeaders.sort((a, b) => b.stat_value - a.stat_value);

    // Assign ranks
    passLeaders.slice(0, 2).forEach((p, i) => p.rank = i + 1);
    rushLeaders.slice(0, 2).forEach((p, i) => p.rank = i + 1);
    recLeaders.slice(0, 2).forEach((p, i) => p.rank = i + 1);

    const response = {
      game: {
        id: nextGame.id,
        date: nextGame.date,
        time: nextGame.time,
        datetime: nextGame.datetime,
        week: nextGame.week,
        status: nextGame.status,
        home_team: nextGame.home_team,
        visitor_team: nextGame.visitor_team
      },
      leaders: {
        passing: passLeaders.slice(0, 2),
        rushing: rushLeaders.slice(0, 2),
        receiving: recLeaders.slice(0, 2)
      }
    };

    console.log(`[NFL-Slate] Response ready: Pass ${passLeaders.length >= 2 ? 2 : passLeaders.length}, Rush ${rushLeaders.length >= 2 ? 2 : rushLeaders.length}, Rec ${recLeaders.length >= 2 ? 2 : recLeaders.length}`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[NFL-Slate] Error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    
    return new Response(
      JSON.stringify({ error: 'Failed to fetch NFL slate data. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
