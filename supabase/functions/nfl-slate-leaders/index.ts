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

  console.log(`[NFL-Slate] Fetching: ${url.toString().substring(0, 150)}...`);
  
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
  interceptions_thrown: number | null;
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
    interceptions_thrown,
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
  const intRate = ((interceptions_thrown ?? 0) / passing_attempts) * 100;
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
    interceptions?: number | null;
    rushing_yards?: number;
    rushing_yards_per_game?: number;
    rushing_touchdowns?: number;
    receiving_yards?: number;
    receiving_yards_per_game?: number;
    receptions?: number;
    receiving_touchdowns?: number;
    games_played?: number;
  };
  headshot_url?: string | null;
}

// Manual Super Bowl LX overrides (used when API is missing/incorrect)
const SUPER_BOWL_LX_OVERRIDES = {
  drake_maye: {
    fullName: "Drake Maye",
    espnHeadshotUrl: "https://a.espncdn.com/i/headshots/nfl/players/full/4431611.png",
    stats: {
      games_played: 17,
      passing_yards: 4394,
      passing_touchdowns: 31,
      interceptions_thrown: 8,
      passing_attempts: 0,
      completions: 0,
      rushing_yards: 0,
      rushing_touchdowns: 0,
      rushing_attempts: 0,
      receiving_yards: 0,
      receiving_touchdowns: 0,
      receptions: 0,
      targets: 0,
    } as Omit<PlayerSeasonStats, "player_id">,
    qbr: 77.2,
    passing_yards_per_game: 258.5,
  },
  sam_darnold: {
    fullName: "Sam Darnold",
    espnHeadshotUrl: "https://a.espncdn.com/i/headshots/nfl/players/full/3912547.png",
    interceptions_thrown: 14,
    qbr: 56.9,
    passing_yards: 4048,
  },
} as const;

// Explicit starter mapping with BDL player IDs for depth chart accuracy
// This ensures the correct starter is used regardless of what the /players endpoint returns
const STARTER_PLAYER_IDS: Record<string, { name: string; id: number; position: string }[]> = {
  'Patriots': [
    { name: 'Drake Maye', id: 2437, position: 'QB' },
    { name: 'Rhamondre Stevenson', id: 761, position: 'RB' },
    { name: 'Ja\'Lynn Polk', id: 2439, position: 'WR' },
    { name: 'Hunter Henry', id: 911, position: 'TE' },
  ],
  'Seahawks': [
    { name: 'Sam Darnold', id: 70, position: 'QB' },
    { name: 'Kenneth Walker III', id: 713, position: 'RB' },
    { name: 'Jaxon Smith-Njigba', id: 869, position: 'WR' },
    { name: 'DK Metcalf', id: 129, position: 'WR' },
  ],
};

// Players to exclude (backups who shouldn't appear as leaders)
const EXCLUDED_PLAYERS: string[] = [
  'Joshua Dobbs',
  'Bailey Zappe',
  'Drew Lock',
  'Geno Smith',
  'Joe Milton III',
  'Jacob Eason',
  'Tommy DeVito',
];

function isKnownStarter(playerName: string, teamName: string): boolean {
  for (const [team, starters] of Object.entries(STARTER_PLAYER_IDS)) {
    if (teamName.toLowerCase().includes(team.toLowerCase())) {
      return starters.some(s => playerName.toLowerCase().includes(s.name.toLowerCase()));
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
    const keywords = teamName.toLowerCase().split(' ');
    const result = await bdlFetch(apiKey, '/teams');
    const teams: BDLTeam[] = result.data || [];
    
    for (const team of teams) {
      const fullNameLower = team.full_name.toLowerCase();
      const nameLower = team.name.toLowerCase();
      
      if (fullNameLower === teamName.toLowerCase()) {
        return team;
      }
      
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

// Parse BDL NFL season stats - handles both flat and nested structures
function parseSeasonStats(stat: Record<string, unknown>): PlayerSeasonStats | null {
  // BDL NFL API returns nested structures like: { passing: { yards: 4048, touchdowns: 25 }, rushing: { yards: 95 } }
  const passing = (stat.passing || {}) as Record<string, unknown>;
  const rushing = (stat.rushing || {}) as Record<string, unknown>;
  const receiving = (stat.receiving || {}) as Record<string, unknown>;
  
  const numOrNull = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // Also check for flat structure fallback
  const passYards = numOrNull(passing.yards) ?? numOrNull((stat as any).passing_yards) ?? 0;
  const passTD = numOrNull(passing.touchdowns) ?? numOrNull((stat as any).passing_touchdowns) ?? 0;
  const passAttempts = numOrNull(passing.attempts) ?? numOrNull((stat as any).passing_attempts) ?? 0;
  const passCompletions = numOrNull(passing.completions) ?? numOrNull((stat as any).passing_completions) ?? numOrNull((stat as any).completions) ?? 0;

  // IMPORTANT: do NOT default missing INTs to 0; keep null so overrides can kick in.
  const passINT =
    numOrNull(passing.interceptions) ??
    numOrNull((stat as any).passing_interceptions) ??
    numOrNull((stat as any).interceptions_thrown) ??
    numOrNull((stat as any).interceptions);
  
  const rushYards = numOrNull(rushing.yards) ?? numOrNull((stat as any).rushing_yards) ?? 0;
  const rushTD = numOrNull(rushing.touchdowns) ?? numOrNull((stat as any).rushing_touchdowns) ?? 0;
  const rushAttempts = numOrNull(rushing.attempts) ?? numOrNull((stat as any).rushing_attempts) ?? 0;
  
  const recYards = numOrNull(receiving.yards) ?? numOrNull((stat as any).receiving_yards) ?? 0;
  const recTD = numOrNull(receiving.touchdowns) ?? numOrNull((stat as any).receiving_touchdowns) ?? 0;
  const receptions = numOrNull(receiving.receptions) ?? numOrNull((stat as any).receptions) ?? 0;
  const targets = numOrNull(receiving.targets) ?? numOrNull((stat as any).receiving_targets) ?? numOrNull((stat as any).targets) ?? 0;
  
  const gamesPlayed = numOrNull((stat as any).games_played) ?? 1;
  
  console.log(
    `[NFL-Slate] Parsed stats: GP=${gamesPlayed}, PassYds=${passYards}, PassTD=${passTD}, INT=${passINT ?? "null"}, RushYds=${rushYards}`
  );
  
  return {
    player_id: 0,
    games_played: gamesPlayed,
    passing_yards: passYards,
    passing_touchdowns: passTD,
    interceptions_thrown: passINT,
    passing_attempts: passAttempts,
    completions: passCompletions,
    rushing_yards: rushYards,
    rushing_touchdowns: rushTD,
    rushing_attempts: rushAttempts,
    receiving_yards: recYards,
    receiving_touchdowns: recTD,
    receptions: receptions,
    targets: targets
  };
}

// Fetch player stats by ID directly
async function fetchPlayerStatsById(apiKey: string, playerId: number): Promise<PlayerSeasonStats | null> {
  try {
    const result = await bdlFetch(apiKey, '/season_stats', {
      season: CURRENT_SEASON,
      player_ids: [playerId]
    });
    
    const stat = result.data?.[0];
    if (!stat) {
      console.log(`[NFL-Slate] No 2025 stats found for player ID ${playerId}`);
      return null;
    }
    
    // Log raw response for debugging
    console.log(`[NFL-Slate] Raw stat for ID ${playerId}: ${JSON.stringify(stat).substring(0, 300)}`);
    
    const parsed = parseSeasonStats(stat);
    if (parsed) {
      parsed.player_id = playerId;
    }
    return parsed;
  } catch (error) {
    console.error(`[NFL-Slate] Error fetching stats for player ${playerId}:`, error);
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

    // Step 3: Determine which team name matches which team
    const homeTeamKey = homeTeam.name; // e.g., "Patriots"
    const awayTeamKey = awayTeam.name; // e.g., "Seahawks"

    const isSuperBowlLXMatchup =
      isSuperBowl &&
      ((homeTeamKey === "Patriots" && awayTeamKey === "Seahawks") ||
        (homeTeamKey === "Seahawks" && awayTeamKey === "Patriots"));

    // Step 4: Directly fetch stats for known starters first (guaranteed accurate depth chart)
    console.log(`[NFL-Slate] Fetching stats for known starters...`);
    
    const homeStarters = STARTER_PLAYER_IDS[homeTeamKey] || [];
    const awayStarters = STARTER_PLAYER_IDS[awayTeamKey] || [];
    const allStarterIds = [...homeStarters, ...awayStarters].map(s => s.id);
    
    console.log(`[NFL-Slate] Starter IDs to fetch: ${allStarterIds.join(', ')}`);
    
    // Fetch starter stats in parallel
    const starterStatsPromises = allStarterIds.map(id => fetchPlayerStatsById(apiKey, id));
    const starterStatsResults = await Promise.all(starterStatsPromises);
    
    const starterStats = new Map<number, PlayerSeasonStats>();
    starterStatsResults.forEach((stats, index) => {
      if (stats && (stats.passing_yards > 0 || stats.rushing_yards > 0 || stats.receiving_yards > 0)) {
        starterStats.set(allStarterIds[index], stats);
        console.log(`[NFL-Slate] Starter stats loaded: ID ${allStarterIds[index]} - Pass:${stats.passing_yards}, Rush:${stats.rushing_yards}, Rec:${stats.receiving_yards}`);
      }
    });
    
    console.log(`[NFL-Slate] Collected stats for ${starterStats.size} known starters`);

    // Step 5: Also fetch broader roster to catch any top performers we might miss
    const [homePlayersResult, awayPlayersResult] = await Promise.all([
      bdlFetch(apiKey, '/players', { team_ids: [homeTeam.id], per_page: 100 }),
      bdlFetch(apiKey, '/players', { team_ids: [awayTeam.id], per_page: 100 })
    ]);

    const allPlayers: NFLPlayer[] = [
      ...(homePlayersResult.data || []),
      ...(awayPlayersResult.data || [])
    ];
    console.log(`[NFL-Slate] Found ${allPlayers.length} total players on rosters`);
    
    // Log QBs specifically for debugging
    const qbs = allPlayers.filter(p => p.position_abbreviation === 'QB' || p.position === 'Quarterback');
    console.log(`[NFL-Slate] QBs on rosters: ${qbs.map(p => `${p.first_name} ${p.last_name} (${p.team?.abbreviation})`).join(', ')}`);

    // Step 6: Filter to skill positions
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

    // Step 7: Fetch 2025 season stats for roster players (excluding starters we already have)
    const rosterPlayerIds = playerIds.filter(id => !starterStats.has(id));
    
    const batchSize = 25;
    const batches: number[][] = [];
    for (let i = 0; i < rosterPlayerIds.length; i += batchSize) {
      batches.push(rosterPlayerIds.slice(i, i + batchSize));
    }

    console.log(`[NFL-Slate] Fetching ${CURRENT_SEASON} season stats in ${batches.length} batches for ${rosterPlayerIds.length} roster players`);

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
    
    // Aggregate all stats (starters + roster)
    const allPlayerStats = new Map<number, PlayerSeasonStats>(starterStats);
    
    for (const statsResult of statsResults) {
      for (const stat of statsResult.data || []) {
        const playerId = stat.player?.id;
        if (!playerId) continue;
        
        // Skip if we already have starter stats for this player
        if (starterStats.has(playerId)) continue;

        const parsed = parseSeasonStats(stat);
        if (parsed) {
          parsed.player_id = playerId;
          allPlayerStats.set(playerId, parsed);
        }
      }
    }

    console.log(`[NFL-Slate] Total stats collected for ${allPlayerStats.size} players`);

    // Step 8: Build leader arrays with detailed stats
    const passLeaders: EnhancedLeaderPlayer[] = [];
    const rushLeaders: EnhancedLeaderPlayer[] = [];
    const recLeaders: EnhancedLeaderPlayer[] = [];

    // First add known starters with their stats
    for (const starter of [...homeStarters, ...awayStarters]) {
      let stats = allPlayerStats.get(starter.id) ?? null;

      // Manual injection for Super Bowl LX QBs (missing or incorrect API values)
      if (isSuperBowlLXMatchup && starter.position === "QB") {
        if (starter.name === SUPER_BOWL_LX_OVERRIDES.drake_maye.fullName) {
          if (!stats || stats.passing_yards === 0) {
            stats = {
              player_id: starter.id,
              ...SUPER_BOWL_LX_OVERRIDES.drake_maye.stats,
            };
            allPlayerStats.set(starter.id, stats);
            console.log(`[NFL-Slate] Applied manual override: Drake Maye 2025 regular season stats`);
          }
        }

        if (starter.name === SUPER_BOWL_LX_OVERRIDES.sam_darnold.fullName) {
          if (stats) {
            // Force fix for the '0 INT' bug
            if ((stats.interceptions_thrown ?? 0) === 0) {
              stats.interceptions_thrown = SUPER_BOWL_LX_OVERRIDES.sam_darnold.interceptions_thrown;
            }
            // Keep yards stable
            if (stats.passing_yards === 0) {
              stats.passing_yards = SUPER_BOWL_LX_OVERRIDES.sam_darnold.passing_yards;
            }
            allPlayerStats.set(starter.id, stats);
            console.log(`[NFL-Slate] Applied manual override: Sam Darnold INT=${stats.interceptions_thrown}`);
          }
        }
      }

      if (!stats) {
        console.log(`[NFL-Slate] No stats for starter: ${starter.name} (ID: ${starter.id})`);
        continue;
      }
      
      const player = playerMap.get(starter.id);
      const gamesPlayed = stats.games_played || 1;
      
      // Determine team assignment
      const isHomeTeam = homeStarters.some(s => s.id === starter.id);
      const team = isHomeTeam ? homeTeam : awayTeam;
      
      const basePlayer = player || {
        id: starter.id,
        first_name: starter.name.split(' ')[0],
        last_name: starter.name.split(' ').slice(1).join(' '),
        position: starter.position,
        position_abbreviation: starter.position,
        team: team,
        jersey_number: null
      };

      // QB - Passing Leaders
      if (starter.position === 'QB' && stats.passing_yards > 0) {
        const manualQbr =
          isSuperBowlLXMatchup && starter.name === SUPER_BOWL_LX_OVERRIDES.drake_maye.fullName
            ? SUPER_BOWL_LX_OVERRIDES.drake_maye.qbr
            : isSuperBowlLXMatchup && starter.name === SUPER_BOWL_LX_OVERRIDES.sam_darnold.fullName
              ? SUPER_BOWL_LX_OVERRIDES.sam_darnold.qbr
              : null;

        const qbr = manualQbr ?? calculateQBR(stats);
        console.log(`[NFL-Slate] Adding QB starter: ${starter.name} - ${stats.passing_yards} yds, ${stats.interceptions_thrown ?? "null"} INTs, QBR: ${qbr}`);

        const manualYpg =
          isSuperBowlLXMatchup && starter.name === SUPER_BOWL_LX_OVERRIDES.drake_maye.fullName
            ? SUPER_BOWL_LX_OVERRIDES.drake_maye.passing_yards_per_game
            : null;
        passLeaders.push({
          ...basePlayer,
          team: team,
          stat_value: stats.passing_yards,
          stat_type: 'Passing Yards',
          rank: 0,
          detailed_stats: {
            qbr,
            passing_yards: stats.passing_yards,
            passing_yards_per_game:
              manualYpg ?? Math.round((stats.passing_yards / gamesPlayed) * 10) / 10,
            passing_touchdowns: stats.passing_touchdowns,
            interceptions: stats.interceptions_thrown,
            rushing_yards: stats.rushing_yards,
            games_played: gamesPlayed
          },
          headshot_url:
            isSuperBowlLXMatchup && starter.name === SUPER_BOWL_LX_OVERRIDES.drake_maye.fullName
              ? SUPER_BOWL_LX_OVERRIDES.drake_maye.espnHeadshotUrl
              : isSuperBowlLXMatchup && starter.name === SUPER_BOWL_LX_OVERRIDES.sam_darnold.fullName
                ? SUPER_BOWL_LX_OVERRIDES.sam_darnold.espnHeadshotUrl
                : null,
        });
      }

      // RB - Rushing Leaders
      if (starter.position === 'RB' && stats.rushing_yards > 0) {
        console.log(`[NFL-Slate] Adding RB starter: ${starter.name} - ${stats.rushing_yards} rush yds`);
        rushLeaders.push({
          ...basePlayer,
          team: team,
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

      // WR/TE - Receiving Leaders
      if (['WR', 'TE'].includes(starter.position) && stats.receiving_yards > 0) {
        console.log(`[NFL-Slate] Adding WR/TE starter: ${starter.name} - ${stats.receiving_yards} rec yds`);
        recLeaders.push({
          ...basePlayer,
          team: team,
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

    // Then add any other roster players with stats (non-starters)
    for (const [playerId, stats] of allPlayerStats.entries()) {
      // Skip if already added as starter
      if ([...homeStarters, ...awayStarters].some(s => s.id === playerId)) continue;
      
      const player = playerMap.get(playerId);
      if (!player) continue;

      const posAbbr = player.position_abbreviation || '';
      const gamesPlayed = stats.games_played || 1;
      const playerFullName = `${player.first_name} ${player.last_name}`;
      
      // Skip excluded players (backups)
      if (isExcludedPlayer(playerFullName)) {
        console.log(`[NFL-Slate] Skipping excluded player: ${playerFullName}`);
        continue;
      }
      
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

    // Select top leader from each team (one per team for the matchup)
    const selectOnePerTeam = (leaders: EnhancedLeaderPlayer[], homeTeamId: number, awayTeamId: number): EnhancedLeaderPlayer[] => {
      const homeLeader = leaders.find(p => p.team?.id === homeTeamId);
      const awayLeader = leaders.find(p => p.team?.id === awayTeamId);
      const result: EnhancedLeaderPlayer[] = [];
      
      // Add away team leader first (visitor), then home team leader
      if (awayLeader) result.push({ ...awayLeader, rank: 1 });
      if (homeLeader) result.push({ ...homeLeader, rank: 2 });
      
      return result;
    };

    const finalPassLeaders = selectOnePerTeam(passLeaders, homeTeam.id, awayTeam.id);
    const finalRushLeaders = selectOnePerTeam(rushLeaders, homeTeam.id, awayTeam.id);
    const finalRecLeaders = selectOnePerTeam(recLeaders, homeTeam.id, awayTeam.id);

    console.log(`[NFL-Slate] Final Leaders - Pass: ${finalPassLeaders.map(p => `${p.first_name} ${p.last_name} (${p.team?.abbreviation})`).join(', ')}`);
    console.log(`[NFL-Slate] Final Leaders - Rush: ${finalRushLeaders.map(p => `${p.first_name} ${p.last_name} (${p.team?.abbreviation})`).join(', ')}`);
    console.log(`[NFL-Slate] Final Leaders - Rec: ${finalRecLeaders.map(p => `${p.first_name} ${p.last_name} (${p.team?.abbreviation})`).join(', ')}`);

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
        passing: finalPassLeaders,
        rushing: finalRushLeaders,
        receiving: finalRecLeaders
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
