import { useQuery } from "@tanstack/react-query";

const EDGE_FUNCTION_URL =
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nfl-slate-leaders`;

interface DetailedStats {
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
}

export interface LeaderPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_abbreviation: string;
  team:
    | {
        id: number;
        abbreviation: string;
        full_name: string;
        name: string;
      }
    | null;
  jersey_number: string | null;
  stat_value: number;
  stat_type: string;
  rank: number;
  detailed_stats?: DetailedStats;
  headshot_url?: string | null;
}

export interface SlateData {
  game:
    | {
        id: number;
        date: string;
        time: string | null;
        datetime: string;
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
    | null;
  leaders: {
    passing: LeaderPlayer[];
    rushing: LeaderPlayer[];
    receiving: LeaderPlayer[];
  };
  message?: string;
  isSuperBowl?: boolean;
  isPlayoffs?: boolean;
  seasonComplete?: boolean;
  statsSource?: string;
}

export function useNFLSlateLeaders(options?: { enabled?: boolean }) {
  return useQuery<SlateData>({
    queryKey: ["nfl-slate-leaders"],
    queryFn: async () => {
      const response = await fetch(EDGE_FUNCTION_URL, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch slate data");
      }

      return response.json();
    },
    enabled: options?.enabled ?? true,
    refetchInterval: 30 * 60 * 1000,
  });
}
