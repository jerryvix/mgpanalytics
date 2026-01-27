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

  console.log(`[NFL-Slate] Fetching: ${url.toString().substring(0, 120)}...`);
  
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

interface PlayerSeasonStats {
  player_id: number;
  games_played: number;
  // Passing
  passing_yards: number;
  passing_touchdowns: number;
  interceptions_thrown: number;
  passing_attempts: number;
  completions: number;
  rushing_yards: number;
  rushing_touchdowns: number;
  rushing_attempts: number;
  // Receiving
  receiving_yards: number;
  receiving_touchdowns: number;
  receptions: number;
  targets: number;
}

// Calculate QBR (0-100 scale)
function calculateQBR(stats: PlayerSeasonStats): number {
  const { 
    passing_yards = 0, 
    passing_touchdowns = 0, 
    interceptions_thrown = 0,
    passing_attempts = 0,
    completions = 0,
    rushing_yards = 0,
    rushing_touchdowns = 0,
    games_played = 1
  } = stats;

  if (passing_attempts === 0) return 0;

  // Completion percentage component (max ~25 points)
  const compPct = (completions / passing_attempts) * 100;
  const compComponent = Math.min((compPct - 30) * 0.5, 25);

  // Yards per attempt component (max ~25 points)
  const ypa = passing_yards / passing_attempts;
  const ypaComponent = Math.min((ypa - 3) * 3, 25);

  // TD rate component (max ~25 points)
  const tdRate = (passing_touchdowns / passing_attempts) * 100;
  const tdComponent = Math.min(tdRate * 5, 25);

  // INT penalty (reduces score)
  const intRate = (interceptions_thrown / passing_attempts) * 100;
  const intPenalty = Math.min(intRate * 5, 20);

  // Rushing bonus (max ~15 points for dual-threat)
  const rushYardsPerGame = rushing_yards / games_played;
  const rushBonus = Math.min(rushYardsPerGame * 0.3 + (rushing_touchdowns * 2), 15);

  // Calculate total and normalize to 0-100
  const rawQBR = compComponent + ypaComponent + tdComponent - intPenalty + rushBonus;
  const normalizedQBR = Math.max(0, Math.min(100, rawQBR + 30)); // Shift baseline

  return Math.round(normalizedQBR * 10) / 10;
}

interface EnhancedLeaderPlayer {
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
  position_rank?: number;
  detailed_stats: {
    qbr?: number;
    passing_yards?: number;
    passing_yards_per_game?: number;
    passing_touchdowns?: number;
    interceptions?: number;
    rushing_yards?: number;
    rushing_yards_per_game?: number;
    rushing_touchdowns?: number;
    receiving_yards?: number;
    receiving_yards_per_game?: number;
    receptions?: number;
    receiving_touchdowns?: number;
    games_played?: number;
  };
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

    console.log(`[NFL-Slate] Starting scalable engine for ${CURRENT_SEASON} season...`);

    // Step 1: Dynamic Game Detection - find next scheduled game
    // First try postseason, then regular season
    let allGames: NFLGame[] = [];
    let nextGame: NFLGame | null = null;
    
    // Fetch postseason games first (Super Bowl priority)
    const postseasonResult = await bdlFetch(apiKey, '/games', {
      season: CURRENT_SEASON,
      postseason: 'true',
      per_page: 50
    });
    allGames = postseasonResult.data || [];
    console.log(`[NFL-Slate] Found ${allGames.length} postseason games`);

    // Find scheduled games first, then fall back to final games if none scheduled
    const scheduledGames = allGames.filter((g: NFLGame) => 
      g.status?.toLowerCase() === 'scheduled' || 
      g.status?.toLowerCase() === 'pre-game'
    );

    if (scheduledGames.length > 0) {
      // Sort by date to get the next upcoming
      scheduledGames.sort((a: NFLGame, b: NFLGame) => 
        new Date(a.datetime || a.date).getTime() - new Date(b.datetime || b.date).getTime()
      );
      nextGame = scheduledGames[0];
    } else if (allGames.length > 0) {
      // No scheduled games - take the highest week (Super Bowl)
      allGames.sort((a: NFLGame, b: NFLGame) => (b.week || 0) - (a.week || 0));
      nextGame = allGames[0];
    }

    // If no postseason games, try regular season
    if (!nextGame) {
      const regularResult = await bdlFetch(apiKey, '/games', {
        season: CURRENT_SEASON,
        per_page: 100
      });
      allGames = regularResult.data || [];
      console.log(`[NFL-Slate] Found ${allGames.length} regular season games`);
      
      const scheduledRegular = allGames.filter((g: NFLGame) => 
        g.status?.toLowerCase() === 'scheduled'
      );
      
      if (scheduledRegular.length > 0) {
        scheduledRegular.sort((a: NFLGame, b: NFLGame) => 
          new Date(a.datetime || a.date).getTime() - new Date(b.datetime || b.date).getTime()
        );
        nextGame = scheduledRegular[0];
      }
    }

    const isSuperBowl = Boolean(
      nextGame?.postseason && nextGame.week && nextGame.week >= 4
    );
    const isPlayoffs = Boolean(nextGame?.postseason);

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

    console.log(`[NFL-Slate] Next game: ${nextGame.visitor_team.abbreviation} @ ${nextGame.home_team.abbreviation} (Week ${nextGame.week}, ${nextGame.status})`);

    const homeTeamId = nextGame.home_team.id;
    const awayTeamId = nextGame.visitor_team.id;

    // Step 2: Fetch full rosters for both teams
    console.log(`[NFL-Slate] Fetching rosters for team IDs: ${homeTeamId}, ${awayTeamId}`);
    const [homePlayersResult, awayPlayersResult] = await Promise.all([
      bdlFetch(apiKey, '/players', { team_ids: [homeTeamId], per_page: 100 }),
      bdlFetch(apiKey, '/players', { team_ids: [awayTeamId], per_page: 100 })
    ]);

    const allPlayers: NFLPlayer[] = [
      ...(homePlayersResult.data || []),
      ...(awayPlayersResult.data || [])
    ];
    console.log(`[NFL-Slate] Found ${allPlayers.length} total players on rosters`);

    // Step 3: Filter to skill positions
    const qbPlayers = allPlayers.filter(p => p.position_abbreviation === 'QB' || p.position === 'Quarterback');
    const rbPlayers = allPlayers.filter(p => p.position_abbreviation === 'RB' || p.position_abbreviation === 'FB' || p.position === 'Running Back');
    const recPlayers = allPlayers.filter(p => ['WR', 'TE'].includes(p.position_abbreviation || '') || ['Wide Receiver', 'Tight End'].includes(p.position || ''));
    
    console.log(`[NFL-Slate] Skill players - QBs: ${qbPlayers.length}, RBs: ${rbPlayers.length}, WR/TEs: ${recPlayers.length}`);

    const skillPlayers = [...qbPlayers, ...rbPlayers, ...recPlayers];
    const playerIds = skillPlayers.map(p => p.id);
    const playerMap = new Map<number, NFLPlayer>();
    skillPlayers.forEach(p => playerMap.set(p.id, p));

    // Step 4: Fetch 2025 season stats in parallel batches
    const batchSize = 25;
    const batches: number[][] = [];
    for (let i = 0; i < playerIds.length; i += batchSize) {
      batches.push(playerIds.slice(i, i + batchSize));
    }

    console.log(`[NFL-Slate] Fetching ${CURRENT_SEASON} season stats in ${batches.length} batches`);

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
    
    // Aggregate stats by player
    const playerStats = new Map<number, PlayerSeasonStats>();
    
    for (const statsResult of statsResults) {
      for (const stat of statsResult.data || []) {
        const playerId = stat.player?.id;
        if (!playerId || !playerMap.has(playerId)) continue;

        playerStats.set(playerId, {
          player_id: playerId,
          games_played: stat.games_played || 1,
          passing_yards: stat.passing_yards || 0,
          passing_touchdowns: stat.passing_touchdowns || 0,
          interceptions_thrown: stat.interceptions_thrown || 0,
          passing_attempts: stat.passing_attempts || 0,
          completions: stat.completions || 0,
          rushing_yards: stat.rushing_yards || 0,
          rushing_touchdowns: stat.rushing_touchdowns || 0,
          rushing_attempts: stat.rushing_attempts || 0,
          receiving_yards: stat.receiving_yards || 0,
          receiving_touchdowns: stat.receiving_touchdowns || 0,
          receptions: stat.receptions || 0,
          targets: stat.targets || 0
        });
      }
    }

    console.log(`[NFL-Slate] Collected stats for ${playerStats.size} players`);

    // Step 5: Build leader arrays with detailed stats
    const passLeaders: EnhancedLeaderPlayer[] = [];
    const rushLeaders: EnhancedLeaderPlayer[] = [];
    const recLeaders: EnhancedLeaderPlayer[] = [];

    for (const [playerId, stats] of playerStats.entries()) {
      const player = playerMap.get(playerId);
      if (!player) continue;

      const posAbbr = player.position_abbreviation || player.position || '';
      const gamesPlayed = stats.games_played || 1;

      // QBs - Passing Leaders
      if ((posAbbr === 'QB' || player.position === 'Quarterback') && stats.passing_yards > 0) {
        const qbr = calculateQBR(stats);
        passLeaders.push({
          ...player,
          stat_value: stats.passing_yards,
          stat_type: 'Passing Yards',
          rank: 0,
          detailed_stats: {
            qbr,
            passing_yards: stats.passing_yards,
            passing_yards_per_game: Math.round((stats.passing_yards / gamesPlayed) * 10) / 10,
            passing_touchdowns: stats.passing_touchdowns,
            interceptions: stats.interceptions_thrown,
            rushing_yards: stats.rushing_yards,
            games_played: gamesPlayed
          }
        });
      }

      // RBs - Rushing Leaders
      if ((posAbbr === 'RB' || posAbbr === 'FB' || player.position === 'Running Back') && stats.rushing_yards > 0) {
        rushLeaders.push({
          ...player,
          stat_value: stats.rushing_yards,
          stat_type: 'Rushing Yards',
          rank: 0,
          detailed_stats: {
            rushing_yards: stats.rushing_yards,
            rushing_yards_per_game: Math.round((stats.rushing_yards / gamesPlayed) * 10) / 10,
            rushing_touchdowns: stats.rushing_touchdowns,
            receptions: stats.receptions,
            receiving_yards: stats.receiving_yards,
            games_played: gamesPlayed
          }
        });
      }

      // WRs/TEs - Receiving Leaders
      if (['WR', 'TE'].includes(posAbbr) || ['Wide Receiver', 'Tight End'].includes(player.position || '')) {
        if (stats.receiving_yards > 0) {
          recLeaders.push({
            ...player,
            stat_value: stats.receiving_yards,
            stat_type: 'Receiving Yards',
            rank: 0,
            detailed_stats: {
              receiving_yards: stats.receiving_yards,
              receiving_yards_per_game: Math.round((stats.receiving_yards / gamesPlayed) * 10) / 10,
              receptions: stats.receptions,
              receiving_touchdowns: stats.receiving_touchdowns,
              games_played: gamesPlayed
            }
          });
        }
      }
    }

    // Sort and assign ranks
    passLeaders.sort((a, b) => b.stat_value - a.stat_value);
    rushLeaders.sort((a, b) => b.stat_value - a.stat_value);
    recLeaders.sort((a, b) => b.stat_value - a.stat_value);

    // Assign position-specific rank (this would ideally compare against league)
    // For now, rank within the game's players
    passLeaders.forEach((p, i) => { p.rank = i + 1; p.position_rank = i + 1; });
    rushLeaders.forEach((p, i) => { p.rank = i + 1; p.position_rank = i + 1; });
    recLeaders.forEach((p, i) => { p.rank = i + 1; p.position_rank = i + 1; });

    console.log(`[NFL-Slate] Leaders - Pass: ${passLeaders.length}, Rush: ${rushLeaders.length}, Rec: ${recLeaders.length}`);

    // Take top 2 from each category
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
      seasonComplete: false,
      statsSource: `${CURRENT_SEASON} Regular Season`
    };

    console.log(`[NFL-Slate] Success - ${nextGame.visitor_team.abbreviation} @ ${nextGame.home_team.abbreviation}`);

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
