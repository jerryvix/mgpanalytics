import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

interface BDLTeam {
  id: number;
  abbreviation: string;
  full_name: string;
  name: string;
}

interface NFLPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_abbreviation: string;
  team: BDLTeam | null;
  jersey_number: string | null;
}

interface PlayerSeasonStats {
  player_id: number;
  games_played: number;
  passing_yards: number;
  passing_touchdowns: number;
  interceptions_thrown: number;
  passing_attempts: number;
  completions: number;
  rushing_yards: number;
  rushing_touchdowns: number;
  rushing_attempts: number;
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

  const compPct = (completions / passing_attempts) * 100;
  const compComponent = Math.min((compPct - 30) * 0.5, 25);
  const ypa = passing_yards / passing_attempts;
  const ypaComponent = Math.min((ypa - 3) * 3, 25);
  const tdRate = (passing_touchdowns / passing_attempts) * 100;
  const tdComponent = Math.min(tdRate * 5, 25);
  const intRate = (interceptions_thrown / passing_attempts) * 100;
  const intPenalty = Math.min(intRate * 5, 20);
  const rushYardsPerGame = rushing_yards / games_played;
  const rushBonus = Math.min(rushYardsPerGame * 0.3 + (rushing_touchdowns * 2), 15);
  const rawQBR = compComponent + ypaComponent + tdComponent - intPenalty + rushBonus;
  const normalizedQBR = Math.max(0, Math.min(100, rawQBR + 30));

  return Math.round(normalizedQBR * 10) / 10;
}

interface EnhancedLeaderPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_abbreviation: string;
  team: BDLTeam | null;
  jersey_number: string | null;
  stat_value: number;
  stat_type: string;
  rank: number;
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

// Known starter overrides for depth chart accuracy
// This ensures starters like Drake Maye are prioritized over backups
const STARTER_OVERRIDES: Record<string, string[]> = {
  'Patriots': ['Drake Maye', 'Rhamondre Stevenson', 'Ja\'Lynn Polk', 'Hunter Henry'],
  'Seahawks': ['Sam Darnold', 'Kenneth Walker III', 'Jaxon Smith-Njigba', 'DK Metcalf'],
};

// Players to exclude (backups who shouldn't appear as leaders)
const EXCLUDED_PLAYERS: string[] = [
  'Joshua Dobbs',
  'Bailey Zappe',
];

function isKnownStarter(playerName: string, teamName: string): boolean {
  for (const [team, starters] of Object.entries(STARTER_OVERRIDES)) {
    if (teamName.toLowerCase().includes(team.toLowerCase())) {
      return starters.some(s => playerName.toLowerCase().includes(s.toLowerCase()));
    }
  }
  return false;
}

function isExcludedPlayer(playerName: string): boolean {
  return EXCLUDED_PLAYERS.some(excluded => 
    playerName.toLowerCase().includes(excluded.toLowerCase())
  );
}

// Find BDL team by name search
async function findTeamByName(apiKey: string, teamName: string): Promise<BDLTeam | null> {
  try {
    // Extract key words from team name for matching
    const keywords = teamName.toLowerCase().split(' ');
    const result = await bdlFetch(apiKey, '/teams');
    const teams: BDLTeam[] = result.data || [];
    
    // Find best match
    for (const team of teams) {
      const fullNameLower = team.full_name.toLowerCase();
      const nameLower = team.name.toLowerCase();
      
      // Exact match check
      if (fullNameLower === teamName.toLowerCase()) {
        return team;
      }
      
      // Check if team name or full name contains key words
      const matchCount = keywords.filter(kw => 
        fullNameLower.includes(kw) || nameLower.includes(kw)
      ).length;
      
      if (matchCount >= 2 || nameLower === keywords[keywords.length - 1]) {
        return team;
      }
    }
    
    console.log(`[NFL-Slate] Could not find team: ${teamName}`);
    return null;
  } catch (error) {
    console.error(`[NFL-Slate] Error finding team ${teamName}:`, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('BALLDONTLIE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!apiKey) {
      throw new Error('BALLDONTLIE_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[NFL-Slate] Starting scalable engine for ${CURRENT_SEASON} season...`);

    // Step 1: Get next game from our database (authoritative source)
    const now = new Date().toISOString();
    const { data: upcomingGames, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .eq('league', 'NFL')
      .gt('date', now)
      .order('date', { ascending: true })
      .limit(1);

    if (gamesError) {
      console.error('[NFL-Slate] Database error:', gamesError);
      throw new Error('Failed to fetch games from database');
    }

    let nextGame = upcomingGames?.[0];
    let isSuperBowl = false;
    let isPlayoffs = false;

    // If no future games, check for the most recent postseason game
    if (!nextGame) {
      const { data: postseasonGames } = await supabase
        .from('games')
        .select('*')
        .eq('league', 'NFL')
        .eq('postseason', true)
        .eq('season', CURRENT_SEASON)
        .order('date', { ascending: false })
        .limit(1);
      
      if (postseasonGames?.[0]) {
        nextGame = postseasonGames[0];
        console.log('[NFL-Slate] Using most recent postseason game as slate');
      }
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

    // Determine game type
    isPlayoffs = nextGame.postseason === true;
    isSuperBowl = isPlayoffs && (nextGame.week >= 5 || 
      (nextGame.home_team_name.includes('Patriots') && nextGame.visitor_team_name.includes('Seahawks')) ||
      (nextGame.home_team_name.includes('Seahawks') && nextGame.visitor_team_name.includes('Patriots')));

    console.log(`[NFL-Slate] Next game from DB: ${nextGame.visitor_team_name} @ ${nextGame.home_team_name} (Week ${nextGame.week})`);

    // Step 2: Dynamically find BDL team IDs by searching API
    const [homeTeam, awayTeam] = await Promise.all([
      findTeamByName(apiKey, nextGame.home_team_name),
      findTeamByName(apiKey, nextGame.visitor_team_name)
    ]);

    if (!homeTeam || !awayTeam) {
      console.error(`[NFL-Slate] Could not find teams in BDL: Home=${nextGame.home_team_name}, Away=${nextGame.visitor_team_name}`);
      return new Response(
        JSON.stringify({ 
          game: {
            id: nextGame.id,
            date: nextGame.date,
            datetime: nextGame.date,
            week: nextGame.week,
            postseason: nextGame.postseason,
            status: nextGame.status,
            home_team: { id: 0, abbreviation: '???', full_name: nextGame.home_team_name, name: nextGame.home_team_name.split(' ').pop() },
            visitor_team: { id: 0, abbreviation: '???', full_name: nextGame.visitor_team_name, name: nextGame.visitor_team_name.split(' ').pop() }
          },
          leaders: { passing: [], rushing: [], receiving: [] },
          message: 'Team mapping failed. Stats unavailable.',
          isSuperBowl,
          isPlayoffs,
          seasonComplete: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[NFL-Slate] Found teams - Home: ${homeTeam.id} (${homeTeam.full_name}), Away: ${awayTeam.id} (${awayTeam.full_name})`);

    // Step 3: Fetch rosters from BDL API
    const [homePlayersResult, awayPlayersResult] = await Promise.all([
      bdlFetch(apiKey, '/players', { team_ids: [homeTeam.id], per_page: 100 }),
      bdlFetch(apiKey, '/players', { team_ids: [awayTeam.id], per_page: 100 })
    ]);

    const allPlayers: NFLPlayer[] = [
      ...(homePlayersResult.data || []),
      ...(awayPlayersResult.data || [])
    ];
    console.log(`[NFL-Slate] Found ${allPlayers.length} total players on rosters`);

    // Step 4: Filter to skill positions
    const skillPositions = ['QB', 'RB', 'FB', 'WR', 'TE'];
    const skillPlayers = allPlayers.filter(p => {
      const pos = p.position_abbreviation || '';
      return skillPositions.includes(pos) || 
             p.position === 'Quarterback' || 
             p.position === 'Running Back' ||
             p.position === 'Wide Receiver' ||
             p.position === 'Tight End';
    });
    
    console.log(`[NFL-Slate] Skill players: ${skillPlayers.length}`);

    const playerIds = skillPlayers.map(p => p.id);
    const playerMap = new Map<number, NFLPlayer>();
    skillPlayers.forEach(p => playerMap.set(p.id, p));

    // Step 5: Fetch 2025 season stats in parallel batches
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

    // Step 6: Build leader arrays with detailed stats
    const passLeaders: EnhancedLeaderPlayer[] = [];
    const rushLeaders: EnhancedLeaderPlayer[] = [];
    const recLeaders: EnhancedLeaderPlayer[] = [];

    for (const [playerId, stats] of playerStats.entries()) {
      const player = playerMap.get(playerId);
      if (!player) continue;

      const posAbbr = player.position_abbreviation || '';
      const gamesPlayed = stats.games_played || 1;

      const playerFullName = `${player.first_name} ${player.last_name}`;
      const teamName = player.team?.full_name || '';
      
      // Skip excluded players (backups)
      if (isExcludedPlayer(playerFullName)) {
        console.log(`[NFL-Slate] Skipping excluded player: ${playerFullName}`);
        continue;
      }
      
      const isStarter = isKnownStarter(playerFullName, teamName);
      // QBs - Passing Leaders (prioritize known starters)
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

    // Sort by stats, but prioritize known starters
    const sortWithStarterPriority = (leaders: EnhancedLeaderPlayer[]) => {
      return leaders.sort((a, b) => {
        const aName = `${a.first_name} ${a.last_name}`;
        const bName = `${b.first_name} ${b.last_name}`;
        const aTeam = a.team?.full_name || '';
        const bTeam = b.team?.full_name || '';
        const aIsStarter = isKnownStarter(aName, aTeam);
        const bIsStarter = isKnownStarter(bName, bTeam);
        
        // Starters always come first
        if (aIsStarter && !bIsStarter) return -1;
        if (!aIsStarter && bIsStarter) return 1;
        
        // Otherwise sort by stat value
        return b.stat_value - a.stat_value;
      });
    };

    sortWithStarterPriority(passLeaders);
    sortWithStarterPriority(rushLeaders);
    sortWithStarterPriority(recLeaders);

    passLeaders.forEach((p, i) => { p.rank = i + 1; });
    rushLeaders.forEach((p, i) => { p.rank = i + 1; });
    recLeaders.forEach((p, i) => { p.rank = i + 1; });

    console.log(`[NFL-Slate] Leaders - Pass: ${passLeaders.length}, Rush: ${rushLeaders.length}, Rec: ${recLeaders.length}`);

    const response = {
      game: {
        id: nextGame.id,
        date: nextGame.date,
        time: null,
        datetime: nextGame.date,
        week: nextGame.week,
        postseason: nextGame.postseason,
        status: nextGame.status,
        home_team: homeTeam,
        visitor_team: awayTeam
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

    console.log(`[NFL-Slate] Success - ${awayTeam.abbreviation} @ ${homeTeam.abbreviation} (Super Bowl: ${isSuperBowl})`);

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
