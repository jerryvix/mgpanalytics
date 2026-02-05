import { supabase } from "@/integrations/supabase/client";

export interface NFLPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_abbreviation: string;
  team: {
    id: number;
    name: string;
    full_name: string;
    abbreviation: string;
    city: string;
    conference: string;
    division: string;
  } | null;
  jersey_number: string | null;
  height: string | null;
  weight: string | number | null;
  college: string | null;
  experience: string | number | null;
  age: number | null;
}

export interface NFLPlayerStats {
  player_id: number;
  season: number;
  games_played: number;
  // Passing stats
  pass_yards?: number;
  pass_td?: number;
  pass_attempts?: number;
  pass_completions?: number;
  interceptions?: number;
  passer_rating?: number;
  // Rushing stats
  rush_yards?: number;
  rush_td?: number;
  rush_attempts?: number;
  yards_per_carry?: number;
  fumbles_lost?: number;
  // Receiving stats
  receptions?: number;
  rec_yards?: number;
  rec_td?: number;
  targets?: number;
  yards_per_reception?: number;
  // Defensive stats
  tackles?: number;
  solo_tackles?: number;
  sacks?: number;
  tackles_for_loss?: number;
  forced_fumbles?: number;
  pass_deflections?: number;
  qb_hits?: number;
}

export interface NFLGameLogEntry {
  game_id?: number;
  game_date?: string;
  opponent?: string;
  is_home?: boolean;
  // Passing
  pass_yards?: number;
  pass_td?: number;
  pass_attempts?: number;
  pass_completions?: number;
  interceptions?: number;
  passer_rating?: number;
  // Rushing
  rush_yards?: number;
  rush_td?: number;
  rush_attempts?: number;
  fumbles_lost?: number;
  // Receiving
  receptions?: number;
  rec_yards?: number;
  rec_td?: number;
  targets?: number;
  // Defense
  tackles?: number;
  solo_tackles?: number;
  sacks?: number;
  pass_deflections?: number;
}

export interface SearchResult {
  data: NFLPlayer[];
  meta?: {
    total?: number;
    next_cursor?: string;
  };
}

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-nfl-players`;

/**
 * Search for NFL players by name
 */
export async function searchNFLPlayers(query: string, perPage = 25): Promise<SearchResult> {
  if (!query || query.length < 2) {
    return { data: [], meta: { total: 0 } };
  }

  const response = await fetch(
    `${EDGE_FUNCTION_URL}?action=search&query=${encodeURIComponent(query)}&per_page=${perPage}`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to search players');
  }

  return await response.json();
}

/**
 * Get a single NFL player by ID
 */
export async function getNFLPlayer(playerId: number | string): Promise<NFLPlayer | null> {
  const response = await fetch(
    `${EDGE_FUNCTION_URL}?action=player&id=${playerId}`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error('Failed to fetch player');
  }

  const result = await response.json();
  return result.data || result;
}

/**
 * Get NFL player season stats
 */
export async function getNFLPlayerStats(playerId: number | string, season = 2024): Promise<NFLPlayerStats | null> {
  const response = await fetch(
    `${EDGE_FUNCTION_URL}?action=stats&player_id=${playerId}&season=${season}`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch player stats');
  }

  const result = await response.json();
  // Stats endpoint returns array, get first item
  const stats = result.data?.[0] || result[0];
  return stats || null;
}

/**
 * Get NFL player game logs (game-by-game stats)
 */
export async function getNFLPlayerGameLogs(
  playerId: number | string, 
  season = 2024,
  perPage = 17
): Promise<NFLGameLogEntry[]> {
  const response = await fetch(
    `${EDGE_FUNCTION_URL}?action=game_logs&player_id=${playerId}&season=${season}&per_page=${perPage}`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch player game logs');
  }

  const result = await response.json();
  // Transform API response to our format
  const gameLogs = (result.data || []).map((entry: any) => ({
    game_id: entry.game?.id,
    game_date: entry.game?.date,
    opponent: entry.game?.home_team?.abbreviation === entry.player?.team?.abbreviation 
      ? entry.game?.visitor_team?.full_name || entry.game?.visitor_team?.name
      : entry.game?.home_team?.full_name || entry.game?.home_team?.name,
    is_home: entry.game?.home_team?.abbreviation === entry.player?.team?.abbreviation,
    // Passing
    pass_yards: entry.passing_yards || entry.pass_yards,
    pass_td: entry.passing_touchdowns || entry.pass_td,
    pass_attempts: entry.passing_attempts || entry.pass_attempts,
    pass_completions: entry.passing_completions || entry.pass_completions,
    interceptions: entry.interceptions || entry.interceptions_thrown,
    passer_rating: entry.passer_rating,
    // Rushing
    rush_yards: entry.rushing_yards || entry.rush_yards,
    rush_td: entry.rushing_touchdowns || entry.rush_td,
    rush_attempts: entry.rushing_attempts || entry.rush_attempts,
    fumbles_lost: entry.fumbles_lost,
    // Receiving
    receptions: entry.receptions || entry.receiving_receptions,
    rec_yards: entry.receiving_yards || entry.rec_yards,
    rec_td: entry.receiving_touchdowns || entry.rec_td,
    targets: entry.targets || entry.receiving_targets,
    // Defense
    tackles: entry.tackles || entry.total_tackles,
    solo_tackles: entry.solo_tackles,
    sacks: entry.sacks,
    pass_deflections: entry.pass_deflections || entry.passes_defended,
  }));
  
  // Sort by game date descending (most recent first)
  return gameLogs.sort((a: NFLGameLogEntry, b: NFLGameLogEntry) => {
    if (!a.game_date || !b.game_date) return 0;
    return new Date(b.game_date).getTime() - new Date(a.game_date).getTime();
  });
}

/**
 * Get all NFL teams
 */
export async function getNFLTeams() {
  const response = await fetch(
    `${EDGE_FUNCTION_URL}?action=teams`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch teams');
  }

  return await response.json();
}
