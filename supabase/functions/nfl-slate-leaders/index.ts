import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BDL_NFL_BASE_URL = 'https://api.balldontlie.io/nfl/v1';
const CURRENT_SEASON = 2025;

async function bdlFetch(apiKey: string, endpoint: string, params?: Record<string, string | number | number[] | string[]>) {
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

  console.log(`[NFL-Slate] Fetching: ${url.toString().substring(0, 100)}...`);
  
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
  postseason: boolean;
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('BALLDONTLIE_API_KEY');
    
    if (!apiKey) {
      throw new Error('BALLDONTLIE_API_KEY not configured');
    }

    console.log(`[NFL-Slate] Starting fetch for ${CURRENT_SEASON} season...`);

    // Step 1: Fetch games - just one page since we need the latest postseason game
    const gamesResult = await bdlFetch(apiKey, '/games', {
      season: CURRENT_SEASON,
      postseason: 'true',
      per_page: 100
    });

    let allGames: NFLGame[] = gamesResult.data || [];
    console.log(`[NFL-Slate] Found ${allGames.length} postseason games`);

    // If no postseason games, try regular season
    if (allGames.length === 0) {
      const regularResult = await bdlFetch(apiKey, '/games', {
        season: CURRENT_SEASON,
        per_page: 100
      });
      allGames = regularResult.data || [];
      console.log(`[NFL-Slate] Found ${allGames.length} regular season games`);
    }

    // Find the Super Bowl or latest postseason game (highest week)
    let nextGame: NFLGame | null = null;
    let isSuperBowl = false;
    let isPlayoffs = false;

    if (allGames.length > 0) {
      // Sort by week descending to get the Super Bowl first
      allGames.sort((a: NFLGame, b: NFLGame) => (b.week || 0) - (a.week || 0));
      nextGame = allGames[0];
      isPlayoffs = nextGame.postseason === true || Boolean(nextGame.week && nextGame.week > 18);
      
      // Super Bowl detection: highest postseason week, or week >= 4 in postseason (wildcard=1, divisional=2, conf=3, super=4-5)
      const highestWeek = allGames.reduce((max, g) => Math.max(max, g.week || 0), 0);
      isSuperBowl = Boolean(
        nextGame.postseason && (
          nextGame.week === highestWeek ||  // It's the highest week game
          (nextGame.week && nextGame.week >= 4)  // Week 4+ in postseason is typically Super Bowl
        )
      );
      console.log(`[NFL-Slate] Selected: ${nextGame.visitor_team.abbreviation} @ ${nextGame.home_team.abbreviation}, Week ${nextGame.week}, Highest: ${highestWeek}, Super Bowl: ${isSuperBowl}`);
    }

    if (!nextGame) {
      return new Response(
        JSON.stringify({ 
          game: null, 
          leaders: { passing: [], rushing: [], receiving: [] },
          message: `No games found for the ${CURRENT_SEASON} NFL season.`,
          seasonComplete: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const homeTeamId = nextGame.home_team.id;
    const awayTeamId = nextGame.visitor_team.id;

    // Step 2: Get players for both teams in parallel
    console.log(`[NFL-Slate] Fetching players for ${nextGame.home_team.abbreviation} and ${nextGame.visitor_team.abbreviation}`);
    const [homePlayersResult, awayPlayersResult] = await Promise.all([
      bdlFetch(apiKey, '/players', { team_ids: [homeTeamId], per_page: 100 }),
      bdlFetch(apiKey, '/players', { team_ids: [awayTeamId], per_page: 100 })
    ]);

    const allPlayers: NFLPlayer[] = [
      ...(homePlayersResult.data || []),
      ...(awayPlayersResult.data || [])
    ];

    console.log(`[NFL-Slate] Found ${allPlayers.length} total players`);

    // Step 3: Filter to likely skill position players to reduce API calls
    const skillPositions = ['QB', 'RB', 'WR', 'TE', 'FB'];
    const skillPlayers = allPlayers.filter(p => 
      skillPositions.includes(p.position_abbreviation || p.position || '')
    );
    console.log(`[NFL-Slate] Filtered to ${skillPlayers.length} skill position players`);

    // Step 4: Fetch stats for skill players in parallel batches
    const playerIds = skillPlayers.map(p => p.id);
    const batchSize = 25;
    const playerMap = new Map<number, NFLPlayer>();
    skillPlayers.forEach(p => playerMap.set(p.id, p));

    const passLeaders: LeaderPlayer[] = [];
    const rushLeaders: LeaderPlayer[] = [];
    const recLeaders: LeaderPlayer[] = [];

    // Create batches
    const batches: number[][] = [];
    for (let i = 0; i < playerIds.length; i += batchSize) {
      batches.push(playerIds.slice(i, i + batchSize));
    }

    console.log(`[NFL-Slate] Fetching stats in ${batches.length} parallel batches`);

    // Fetch all batches in parallel
    const statsPromises = batches.map(batch => 
      bdlFetch(apiKey, '/season_stats', {
        season: CURRENT_SEASON,
        player_ids: batch
      }).catch(err => {
        console.error(`[NFL-Slate] Batch error: ${err}`);
        return { data: [] };
      })
    );

    const statsResults = await Promise.all(statsPromises);
    
    // Process all stats
    for (const statsResult of statsResults) {
      for (const stat of statsResult.data || []) {
        const playerId = stat.player?.id;
        const player = playerMap.get(playerId);
        if (!player) continue;

        if (stat.passing_yards && stat.passing_yards > 0) {
          passLeaders.push({
            ...player,
            stat_value: stat.passing_yards,
            stat_type: 'Passing Yards',
            rank: 0
          });
        }

        if (stat.rushing_yards && stat.rushing_yards > 0) {
          rushLeaders.push({
            ...player,
            stat_value: stat.rushing_yards,
            stat_type: 'Rushing Yards',
            rank: 0
          });
        }

        if (stat.receiving_yards && stat.receiving_yards > 0) {
          recLeaders.push({
            ...player,
            stat_value: stat.receiving_yards,
            stat_type: 'Receiving Yards',
            rank: 0
          });
        }
      }
    }

    console.log(`[NFL-Slate] Leaders found - Pass: ${passLeaders.length}, Rush: ${rushLeaders.length}, Rec: ${recLeaders.length}`);

    // Sort and take top 2
    passLeaders.sort((a, b) => b.stat_value - a.stat_value);
    rushLeaders.sort((a, b) => b.stat_value - a.stat_value);
    recLeaders.sort((a, b) => b.stat_value - a.stat_value);

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
        postseason: nextGame.postseason,
        status: nextGame.status,
        home_team: nextGame.home_team,
        visitor_team: nextGame.visitor_team
      },
      leaders: {
        passing: passLeaders.slice(0, 2),
        rushing: rushLeaders.slice(0, 2),
        receiving: recLeaders.slice(0, 2)
      },
      isSuperBowl,
      isPlayoffs,
      seasonComplete: false
    };

    console.log(`[NFL-Slate] Done - ${nextGame.visitor_team.abbreviation} @ ${nextGame.home_team.abbreviation}`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[NFL-Slate] Error:', error instanceof Error ? error.message : 'Unknown');
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to fetch NFL slate data.',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
