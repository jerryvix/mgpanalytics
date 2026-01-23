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
  // Receiving stats
  receptions?: number;
  rec_yards?: number;
  rec_td?: number;
  targets?: number;
  yards_per_reception?: number;
}

export interface SearchResult {
  data: NFLPlayer[];
  meta?: {
    total?: number;
    next_cursor?: string;
  };
}

const EDGE_FUNCTION_URL = `https://pgrrbkhxukxvzzauviyp.supabase.co/functions/v1/search-nfl-players`;

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
