export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      api_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          response_json: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          response_json: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          response_json?: Json
        }
        Relationships: []
      }
      api_request_log: {
        Row: {
          created_at: string
          duration_ms: number | null
          endpoint: string
          error_message: string | null
          id: string
          provider: string
          status_code: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          endpoint: string
          error_message?: string | null
          id?: string
          provider: string
          status_code?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          endpoint?: string
          error_message?: string | null
          id?: string
          provider?: string
          status_code?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      cappers: {
        Row: {
          added_at: string
          category: Database["public"]["Enums"]["capper_category"]
          description: string | null
          featured: boolean | null
          id: string
          mgp_followers: number | null
          mgp_verified: boolean | null
          specialty: string[] | null
          sports: string[] | null
          tier: Database["public"]["Enums"]["capper_tier"]
          updated_at: string
          x_display_name: string
          x_followers_count: number | null
          x_profile_image: string | null
          x_user_id: string
          x_username: string
          x_verified: boolean | null
        }
        Insert: {
          added_at?: string
          category?: Database["public"]["Enums"]["capper_category"]
          description?: string | null
          featured?: boolean | null
          id?: string
          mgp_followers?: number | null
          mgp_verified?: boolean | null
          specialty?: string[] | null
          sports?: string[] | null
          tier?: Database["public"]["Enums"]["capper_tier"]
          updated_at?: string
          x_display_name: string
          x_followers_count?: number | null
          x_profile_image?: string | null
          x_user_id: string
          x_username: string
          x_verified?: boolean | null
        }
        Update: {
          added_at?: string
          category?: Database["public"]["Enums"]["capper_category"]
          description?: string | null
          featured?: boolean | null
          id?: string
          mgp_followers?: number | null
          mgp_verified?: boolean | null
          specialty?: string[] | null
          sports?: string[] | null
          tier?: Database["public"]["Enums"]["capper_tier"]
          updated_at?: string
          x_display_name?: string
          x_followers_count?: number | null
          x_profile_image?: string | null
          x_user_id?: string
          x_username?: string
          x_verified?: boolean | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      games: {
        Row: {
          created_at: string
          date: string
          external_id: string | null
          home_team_name: string
          id: number
          league: string
          postseason: boolean | null
          season: number | null
          status: string
          updated_at: string
          visitor_team_name: string
          week: number | null
        }
        Insert: {
          created_at?: string
          date: string
          external_id?: string | null
          home_team_name: string
          id?: number
          league: string
          postseason?: boolean | null
          season?: number | null
          status?: string
          updated_at?: string
          visitor_team_name: string
          week?: number | null
        }
        Update: {
          created_at?: string
          date?: string
          external_id?: string | null
          home_team_name?: string
          id?: number
          league?: string
          postseason?: boolean | null
          season?: number | null
          status?: string
          updated_at?: string
          visitor_team_name?: string
          week?: number | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      mlb_games: {
        Row: {
          created_at: string | null
          date: string
          external_id: string | null
          home_team_id: string | null
          home_team_name: string
          id: string
          is_featured: boolean | null
          season: number | null
          starting_pitcher_away: string | null
          starting_pitcher_home: string | null
          status: string
          updated_at: string | null
          venue: string | null
          visitor_team_id: string | null
          visitor_team_name: string
          weather: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          external_id?: string | null
          home_team_id?: string | null
          home_team_name: string
          id?: string
          is_featured?: boolean | null
          season?: number | null
          starting_pitcher_away?: string | null
          starting_pitcher_home?: string | null
          status?: string
          updated_at?: string | null
          venue?: string | null
          visitor_team_id?: string | null
          visitor_team_name: string
          weather?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          external_id?: string | null
          home_team_id?: string | null
          home_team_name?: string
          id?: string
          is_featured?: boolean | null
          season?: number | null
          starting_pitcher_away?: string | null
          starting_pitcher_home?: string | null
          status?: string
          updated_at?: string | null
          venue?: string | null
          visitor_team_id?: string | null
          visitor_team_name?: string
          weather?: string | null
        }
        Relationships: []
      }
      mlb_odds: {
        Row: {
          created_at: string | null
          game_id: string
          id: string
          moneyline_away: number | null
          moneyline_home: number | null
          sportsbook: string
          spread_odds: number | null
          spread_value: number | null
          total_over_odds: number | null
          total_under_odds: number | null
          total_value: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          game_id: string
          id?: string
          moneyline_away?: number | null
          moneyline_home?: number | null
          sportsbook: string
          spread_odds?: number | null
          spread_value?: number | null
          total_over_odds?: number | null
          total_under_odds?: number | null
          total_value?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          game_id?: string
          id?: string
          moneyline_away?: number | null
          moneyline_home?: number | null
          sportsbook?: string
          spread_odds?: number | null
          spread_value?: number | null
          total_over_odds?: number | null
          total_under_odds?: number | null
          total_value?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mlb_odds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "mlb_games"
            referencedColumns: ["id"]
          },
        ]
      }
      nba_games: {
        Row: {
          created_at: string
          date: string
          external_id: string | null
          home_team_id: number | null
          home_team_name: string
          id: string
          season: number | null
          status: string
          updated_at: string
          visitor_team_id: number | null
          visitor_team_name: string
        }
        Insert: {
          created_at?: string
          date: string
          external_id?: string | null
          home_team_id?: number | null
          home_team_name: string
          id?: string
          season?: number | null
          status?: string
          updated_at?: string
          visitor_team_id?: number | null
          visitor_team_name: string
        }
        Update: {
          created_at?: string
          date?: string
          external_id?: string | null
          home_team_id?: number | null
          home_team_name?: string
          id?: string
          season?: number | null
          status?: string
          updated_at?: string
          visitor_team_id?: number | null
          visitor_team_name?: string
        }
        Relationships: []
      }
      nba_odds: {
        Row: {
          created_at: string
          game_id: string
          id: string
          moneyline_away: number | null
          moneyline_home: number | null
          sportsbook: string
          spread_odds: number | null
          spread_value: number | null
          total_over_odds: number | null
          total_under_odds: number | null
          total_value: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          moneyline_away?: number | null
          moneyline_home?: number | null
          sportsbook: string
          spread_odds?: number | null
          spread_value?: number | null
          total_over_odds?: number | null
          total_under_odds?: number | null
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          moneyline_away?: number | null
          moneyline_home?: number | null
          sportsbook?: string
          spread_odds?: number | null
          spread_value?: number | null
          total_over_odds?: number | null
          total_under_odds?: number | null
          total_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nba_odds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "nba_games"
            referencedColumns: ["id"]
          },
        ]
      }
      ncaab_games: {
        Row: {
          created_at: string | null
          date: string
          external_id: string | null
          home_team_conference: string | null
          home_team_id: string | null
          home_team_name: string
          home_team_rank: number | null
          id: string
          is_featured: boolean | null
          season: number | null
          status: string
          updated_at: string | null
          visitor_team_conference: string | null
          visitor_team_id: string | null
          visitor_team_name: string
          visitor_team_rank: number | null
        }
        Insert: {
          created_at?: string | null
          date: string
          external_id?: string | null
          home_team_conference?: string | null
          home_team_id?: string | null
          home_team_name: string
          home_team_rank?: number | null
          id?: string
          is_featured?: boolean | null
          season?: number | null
          status?: string
          updated_at?: string | null
          visitor_team_conference?: string | null
          visitor_team_id?: string | null
          visitor_team_name: string
          visitor_team_rank?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string
          external_id?: string | null
          home_team_conference?: string | null
          home_team_id?: string | null
          home_team_name?: string
          home_team_rank?: number | null
          id?: string
          is_featured?: boolean | null
          season?: number | null
          status?: string
          updated_at?: string | null
          visitor_team_conference?: string | null
          visitor_team_id?: string | null
          visitor_team_name?: string
          visitor_team_rank?: number | null
        }
        Relationships: []
      }
      ncaab_odds: {
        Row: {
          created_at: string | null
          game_id: string
          id: string
          moneyline_away: number | null
          moneyline_home: number | null
          sportsbook: string
          spread_odds: number | null
          spread_value: number | null
          total_over_odds: number | null
          total_under_odds: number | null
          total_value: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          game_id: string
          id?: string
          moneyline_away?: number | null
          moneyline_home?: number | null
          sportsbook: string
          spread_odds?: number | null
          spread_value?: number | null
          total_over_odds?: number | null
          total_under_odds?: number | null
          total_value?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          game_id?: string
          id?: string
          moneyline_away?: number | null
          moneyline_home?: number | null
          sportsbook?: string
          spread_odds?: number | null
          spread_value?: number | null
          total_over_odds?: number | null
          total_under_odds?: number | null
          total_value?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ncaab_odds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "ncaab_games"
            referencedColumns: ["id"]
          },
        ]
      }
      ncaaf_games: {
        Row: {
          created_at: string | null
          date: string
          external_id: string | null
          home_team_conference: string | null
          home_team_id: string | null
          home_team_name: string
          home_team_rank: number | null
          id: string
          is_featured: boolean | null
          season: number | null
          status: string
          updated_at: string | null
          venue: string | null
          visitor_team_conference: string | null
          visitor_team_id: string | null
          visitor_team_name: string
          visitor_team_rank: number | null
          weather: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          external_id?: string | null
          home_team_conference?: string | null
          home_team_id?: string | null
          home_team_name: string
          home_team_rank?: number | null
          id?: string
          is_featured?: boolean | null
          season?: number | null
          status?: string
          updated_at?: string | null
          venue?: string | null
          visitor_team_conference?: string | null
          visitor_team_id?: string | null
          visitor_team_name: string
          visitor_team_rank?: number | null
          weather?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          external_id?: string | null
          home_team_conference?: string | null
          home_team_id?: string | null
          home_team_name?: string
          home_team_rank?: number | null
          id?: string
          is_featured?: boolean | null
          season?: number | null
          status?: string
          updated_at?: string | null
          venue?: string | null
          visitor_team_conference?: string | null
          visitor_team_id?: string | null
          visitor_team_name?: string
          visitor_team_rank?: number | null
          weather?: string | null
        }
        Relationships: []
      }
      ncaaf_odds: {
        Row: {
          created_at: string | null
          game_id: string
          id: string
          moneyline_away: number | null
          moneyline_home: number | null
          sportsbook: string
          spread_odds: number | null
          spread_value: number | null
          total_over_odds: number | null
          total_under_odds: number | null
          total_value: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          game_id: string
          id?: string
          moneyline_away?: number | null
          moneyline_home?: number | null
          sportsbook: string
          spread_odds?: number | null
          spread_value?: number | null
          total_over_odds?: number | null
          total_under_odds?: number | null
          total_value?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          game_id?: string
          id?: string
          moneyline_away?: number | null
          moneyline_home?: number | null
          sportsbook?: string
          spread_odds?: number | null
          spread_value?: number | null
          total_over_odds?: number | null
          total_under_odds?: number | null
          total_value?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ncaaf_odds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "ncaaf_games"
            referencedColumns: ["id"]
          },
        ]
      }
      odds: {
        Row: {
          created_at: string
          game_id: number
          id: string
          moneyline_away: number | null
          moneyline_home: number | null
          sportsbook: string
          spread_odds: number
          spread_value: number
          total_over_odds: number | null
          total_under_odds: number | null
          total_value: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          game_id: number
          id?: string
          moneyline_away?: number | null
          moneyline_home?: number | null
          sportsbook: string
          spread_odds: number
          spread_value: number
          total_over_odds?: number | null
          total_under_odds?: number | null
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          game_id?: number
          id?: string
          moneyline_away?: number | null
          moneyline_home?: number | null
          sportsbook?: string
          spread_odds?: number
          spread_value?: number
          total_over_odds?: number | null
          total_under_odds?: number | null
          total_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "odds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      odds_history: {
        Row: {
          bookmaker: string
          created_at: string | null
          current_line: number | null
          current_price: number | null
          game_id: string
          id: string
          line_movement: string | null
          odds_type: string
          opening_line: number | null
          previous_line: number | null
          previous_price: number | null
          sport: string
          team: string | null
          timestamp: string | null
        }
        Insert: {
          bookmaker: string
          created_at?: string | null
          current_line?: number | null
          current_price?: number | null
          game_id: string
          id?: string
          line_movement?: string | null
          odds_type: string
          opening_line?: number | null
          previous_line?: number | null
          previous_price?: number | null
          sport: string
          team?: string | null
          timestamp?: string | null
        }
        Update: {
          bookmaker?: string
          created_at?: string | null
          current_line?: number | null
          current_price?: number | null
          game_id?: string
          id?: string
          line_movement?: string | null
          odds_type?: string
          opening_line?: number | null
          previous_line?: number | null
          previous_price?: number | null
          sport?: string
          team?: string | null
          timestamp?: string | null
        }
        Relationships: []
      }
      odds_snapshots: {
        Row: {
          created_at: string
          game_id: string
          game_type: string
          id: string
          line_value: number | null
          market_type: string
          price: number | null
          pulled_at: string
          sportsbook: string
        }
        Insert: {
          created_at?: string
          game_id: string
          game_type?: string
          id?: string
          line_value?: number | null
          market_type: string
          price?: number | null
          pulled_at?: string
          sportsbook: string
        }
        Update: {
          created_at?: string
          game_id?: string
          game_type?: string
          id?: string
          line_value?: number | null
          market_type?: string
          price?: number | null
          pulled_at?: string
          sportsbook?: string
        }
        Relationships: []
      }
      player_advanced_stats: {
        Row: {
          air_yards: number | null
          assist_rate: number | null
          catch_rate: number | null
          contested_catch_rate: number | null
          created_at: string | null
          id: string
          pass_epa: number | null
          per: number | null
          player_id: string | null
          raw_data: Json | null
          rebound_rate: number | null
          rec_epa: number | null
          red_zone_carries: number | null
          red_zone_targets: number | null
          rush_epa: number | null
          rush_share: number | null
          season: number
          separation: number | null
          sport: string
          success_rate: number | null
          target_share: number | null
          true_shooting: number | null
          updated_at: string | null
          usage_rate: number | null
          yards_after_catch: number | null
          yards_per_route_run: number | null
        }
        Insert: {
          air_yards?: number | null
          assist_rate?: number | null
          catch_rate?: number | null
          contested_catch_rate?: number | null
          created_at?: string | null
          id?: string
          pass_epa?: number | null
          per?: number | null
          player_id?: string | null
          raw_data?: Json | null
          rebound_rate?: number | null
          rec_epa?: number | null
          red_zone_carries?: number | null
          red_zone_targets?: number | null
          rush_epa?: number | null
          rush_share?: number | null
          season: number
          separation?: number | null
          sport: string
          success_rate?: number | null
          target_share?: number | null
          true_shooting?: number | null
          updated_at?: string | null
          usage_rate?: number | null
          yards_after_catch?: number | null
          yards_per_route_run?: number | null
        }
        Update: {
          air_yards?: number | null
          assist_rate?: number | null
          catch_rate?: number | null
          contested_catch_rate?: number | null
          created_at?: string | null
          id?: string
          pass_epa?: number | null
          per?: number | null
          player_id?: string | null
          raw_data?: Json | null
          rebound_rate?: number | null
          rec_epa?: number | null
          red_zone_carries?: number | null
          red_zone_targets?: number | null
          rush_epa?: number | null
          rush_share?: number | null
          season?: number
          separation?: number | null
          sport?: string
          success_rate?: number | null
          target_share?: number | null
          true_shooting?: number | null
          updated_at?: string | null
          usage_rate?: number | null
          yards_after_catch?: number | null
          yards_per_route_run?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_advanced_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_game_associations: {
        Row: {
          created_at: string | null
          id: string
          is_starter: boolean | null
          nba_game_id: string | null
          ncaab_game_id: string | null
          nfl_game_id: number | null
          player_id: string | null
          sport: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_starter?: boolean | null
          nba_game_id?: string | null
          ncaab_game_id?: string | null
          nfl_game_id?: number | null
          player_id?: string | null
          sport: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_starter?: boolean | null
          nba_game_id?: string | null
          ncaab_game_id?: string | null
          nfl_game_id?: number | null
          player_id?: string | null
          sport?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_game_associations_nba_game_id_fkey"
            columns: ["nba_game_id"]
            isOneToOne: false
            referencedRelation: "nba_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_game_associations_ncaab_game_id_fkey"
            columns: ["ncaab_game_id"]
            isOneToOne: false
            referencedRelation: "ncaab_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_game_associations_nfl_game_id_fkey"
            columns: ["nfl_game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_game_associations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_game_logs: {
        Row: {
          assists: number | null
          blocks: number | null
          created_at: string | null
          fantasy_points: number | null
          fantasy_points_ppr: number | null
          fg_attempted: number | null
          fg_made: number | null
          game_date: string | null
          game_id: string | null
          home_away: string | null
          id: string
          minutes: number | null
          opponent_abbr: string | null
          opponent_name: string | null
          opponent_score: number | null
          pass_attempts: number | null
          pass_completions: number | null
          pass_int: number | null
          pass_td: number | null
          pass_yards: number | null
          passer_rating: number | null
          player_id: string | null
          points: number | null
          raw_data: Json | null
          rebounds: number | null
          rec_td: number | null
          rec_yards: number | null
          receptions: number | null
          result: string | null
          rush_attempts: number | null
          rush_td: number | null
          rush_yards: number | null
          season: number
          sport: string
          steals: number | null
          targets: number | null
          team_score: number | null
          three_attempted: number | null
          three_made: number | null
          turnovers: number | null
          week: number | null
        }
        Insert: {
          assists?: number | null
          blocks?: number | null
          created_at?: string | null
          fantasy_points?: number | null
          fantasy_points_ppr?: number | null
          fg_attempted?: number | null
          fg_made?: number | null
          game_date?: string | null
          game_id?: string | null
          home_away?: string | null
          id?: string
          minutes?: number | null
          opponent_abbr?: string | null
          opponent_name?: string | null
          opponent_score?: number | null
          pass_attempts?: number | null
          pass_completions?: number | null
          pass_int?: number | null
          pass_td?: number | null
          pass_yards?: number | null
          passer_rating?: number | null
          player_id?: string | null
          points?: number | null
          raw_data?: Json | null
          rebounds?: number | null
          rec_td?: number | null
          rec_yards?: number | null
          receptions?: number | null
          result?: string | null
          rush_attempts?: number | null
          rush_td?: number | null
          rush_yards?: number | null
          season: number
          sport: string
          steals?: number | null
          targets?: number | null
          team_score?: number | null
          three_attempted?: number | null
          three_made?: number | null
          turnovers?: number | null
          week?: number | null
        }
        Update: {
          assists?: number | null
          blocks?: number | null
          created_at?: string | null
          fantasy_points?: number | null
          fantasy_points_ppr?: number | null
          fg_attempted?: number | null
          fg_made?: number | null
          game_date?: string | null
          game_id?: string | null
          home_away?: string | null
          id?: string
          minutes?: number | null
          opponent_abbr?: string | null
          opponent_name?: string | null
          opponent_score?: number | null
          pass_attempts?: number | null
          pass_completions?: number | null
          pass_int?: number | null
          pass_td?: number | null
          pass_yards?: number | null
          passer_rating?: number | null
          player_id?: string | null
          points?: number | null
          raw_data?: Json | null
          rebounds?: number | null
          rec_td?: number | null
          rec_yards?: number | null
          receptions?: number | null
          result?: string | null
          rush_attempts?: number | null
          rush_td?: number | null
          rush_yards?: number | null
          season?: number
          sport?: string
          steals?: number | null
          targets?: number | null
          team_score?: number | null
          three_attempted?: number | null
          three_made?: number | null
          turnovers?: number | null
          week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_game_logs_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_props: {
        Row: {
          actual_value: number | null
          created_at: string | null
          external_game_id: string | null
          external_player_id: string | null
          game_date: string | null
          game_id: string | null
          graded: boolean | null
          graded_at: string | null
          id: string
          is_active: boolean | null
          line: number
          opponent_team: string | null
          over_odds: number | null
          player_id: string | null
          prop_type: string
          result: string | null
          sport: string
          sportsbook: string
          under_odds: number | null
          updated_at: string | null
        }
        Insert: {
          actual_value?: number | null
          created_at?: string | null
          external_game_id?: string | null
          external_player_id?: string | null
          game_date?: string | null
          game_id?: string | null
          graded?: boolean | null
          graded_at?: string | null
          id?: string
          is_active?: boolean | null
          line: number
          opponent_team?: string | null
          over_odds?: number | null
          player_id?: string | null
          prop_type: string
          result?: string | null
          sport?: string
          sportsbook: string
          under_odds?: number | null
          updated_at?: string | null
        }
        Update: {
          actual_value?: number | null
          created_at?: string | null
          external_game_id?: string | null
          external_player_id?: string | null
          game_date?: string | null
          game_id?: string | null
          graded?: boolean | null
          graded_at?: string | null
          id?: string
          is_active?: boolean | null
          line?: number
          opponent_team?: string | null
          over_odds?: number | null
          player_id?: string | null
          prop_type?: string
          result?: string | null
          sport?: string
          sportsbook?: string
          under_odds?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_props_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_season_stats: {
        Row: {
          assists: number | null
          assists_per_game: number | null
          blocks: number | null
          blocks_per_game: number | null
          created_at: string | null
          fantasy_points: number | null
          fantasy_points_ppr: number | null
          fg_pct: number | null
          field_goal_pct: number | null
          forced_fumbles: number | null
          free_throw_pct: number | null
          ft_pct: number | null
          games_played: number | null
          games_started: number | null
          id: string
          interceptions: number | null
          minutes_per_game: number | null
          pass_attempts: number | null
          pass_completions: number | null
          pass_int: number | null
          pass_td: number | null
          pass_yards: number | null
          passer_rating: number | null
          player_id: string | null
          points: number | null
          points_per_game: number | null
          raw_data: Json | null
          rebounds: number | null
          rebounds_per_game: number | null
          rec_td: number | null
          rec_yards: number | null
          receptions: number | null
          rush_attempts: number | null
          rush_td: number | null
          rush_yards: number | null
          sacks: number | null
          season: number
          season_type: string | null
          source: string | null
          sport: string
          steals: number | null
          steals_per_game: number | null
          tackles: number | null
          targets: number | null
          three_pct: number | null
          three_point_pct: number | null
          turnovers: number | null
          turnovers_per_game: number | null
          updated_at: string | null
          yards_per_carry: number | null
          yards_per_reception: number | null
        }
        Insert: {
          assists?: number | null
          assists_per_game?: number | null
          blocks?: number | null
          blocks_per_game?: number | null
          created_at?: string | null
          fantasy_points?: number | null
          fantasy_points_ppr?: number | null
          fg_pct?: number | null
          field_goal_pct?: number | null
          forced_fumbles?: number | null
          free_throw_pct?: number | null
          ft_pct?: number | null
          games_played?: number | null
          games_started?: number | null
          id?: string
          interceptions?: number | null
          minutes_per_game?: number | null
          pass_attempts?: number | null
          pass_completions?: number | null
          pass_int?: number | null
          pass_td?: number | null
          pass_yards?: number | null
          passer_rating?: number | null
          player_id?: string | null
          points?: number | null
          points_per_game?: number | null
          raw_data?: Json | null
          rebounds?: number | null
          rebounds_per_game?: number | null
          rec_td?: number | null
          rec_yards?: number | null
          receptions?: number | null
          rush_attempts?: number | null
          rush_td?: number | null
          rush_yards?: number | null
          sacks?: number | null
          season: number
          season_type?: string | null
          source?: string | null
          sport: string
          steals?: number | null
          steals_per_game?: number | null
          tackles?: number | null
          targets?: number | null
          three_pct?: number | null
          three_point_pct?: number | null
          turnovers?: number | null
          turnovers_per_game?: number | null
          updated_at?: string | null
          yards_per_carry?: number | null
          yards_per_reception?: number | null
        }
        Update: {
          assists?: number | null
          assists_per_game?: number | null
          blocks?: number | null
          blocks_per_game?: number | null
          created_at?: string | null
          fantasy_points?: number | null
          fantasy_points_ppr?: number | null
          fg_pct?: number | null
          field_goal_pct?: number | null
          forced_fumbles?: number | null
          free_throw_pct?: number | null
          ft_pct?: number | null
          games_played?: number | null
          games_started?: number | null
          id?: string
          interceptions?: number | null
          minutes_per_game?: number | null
          pass_attempts?: number | null
          pass_completions?: number | null
          pass_int?: number | null
          pass_td?: number | null
          pass_yards?: number | null
          passer_rating?: number | null
          player_id?: string | null
          points?: number | null
          points_per_game?: number | null
          raw_data?: Json | null
          rebounds?: number | null
          rebounds_per_game?: number | null
          rec_td?: number | null
          rec_yards?: number | null
          receptions?: number | null
          rush_attempts?: number | null
          rush_td?: number | null
          rush_yards?: number | null
          sacks?: number | null
          season?: number
          season_type?: string | null
          source?: string | null
          sport?: string
          steals?: number | null
          steals_per_game?: number | null
          tackles?: number | null
          targets?: number | null
          three_pct?: number | null
          three_point_pct?: number | null
          turnovers?: number | null
          turnovers_per_game?: number | null
          updated_at?: string | null
          yards_per_carry?: number | null
          yards_per_reception?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_season_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          age: number | null
          birth_date: string | null
          college: string | null
          created_at: string | null
          experience: number | null
          external_id: string
          featured_reason: string | null
          first_name: string | null
          headshot_url: string | null
          height: string | null
          id: string
          injury_designation: string | null
          injury_status: string | null
          is_featured: boolean | null
          jersey_number: string | null
          last_name: string | null
          name: string
          position: string | null
          position_type: string | null
          raw_data: Json | null
          slate_window_end: string | null
          slate_window_start: string | null
          sport: string
          status: string | null
          team_abbr: string | null
          team_id: string | null
          team_name: string | null
          updated_at: string | null
          usage_metric: number | null
          usage_rank: number | null
          weight: number | null
        }
        Insert: {
          age?: number | null
          birth_date?: string | null
          college?: string | null
          created_at?: string | null
          experience?: number | null
          external_id: string
          featured_reason?: string | null
          first_name?: string | null
          headshot_url?: string | null
          height?: string | null
          id?: string
          injury_designation?: string | null
          injury_status?: string | null
          is_featured?: boolean | null
          jersey_number?: string | null
          last_name?: string | null
          name: string
          position?: string | null
          position_type?: string | null
          raw_data?: Json | null
          slate_window_end?: string | null
          slate_window_start?: string | null
          sport: string
          status?: string | null
          team_abbr?: string | null
          team_id?: string | null
          team_name?: string | null
          updated_at?: string | null
          usage_metric?: number | null
          usage_rank?: number | null
          weight?: number | null
        }
        Update: {
          age?: number | null
          birth_date?: string | null
          college?: string | null
          created_at?: string | null
          experience?: number | null
          external_id?: string
          featured_reason?: string | null
          first_name?: string | null
          headshot_url?: string | null
          height?: string | null
          id?: string
          injury_designation?: string | null
          injury_status?: string | null
          is_featured?: boolean | null
          jersey_number?: string | null
          last_name?: string | null
          name?: string
          position?: string | null
          position_type?: string | null
          raw_data?: Json | null
          slate_window_end?: string | null
          slate_window_start?: string | null
          sport?: string
          status?: string | null
          team_abbr?: string | null
          team_id?: string | null
          team_name?: string | null
          updated_at?: string | null
          usage_metric?: number | null
          usage_rank?: number | null
          weight?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          onboarding_completed: boolean
          onboarding_path: string | null
          trial_ended_at: string | null
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          onboarding_completed?: boolean
          onboarding_path?: string | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          onboarding_completed?: boolean
          onboarding_path?: string | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          records_synced: number | null
          started_at: string
          status: string
          sync_type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          records_synced?: number | null
          started_at?: string
          status?: string
          sync_type: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          records_synced?: number | null
          started_at?: string
          status?: string
          sync_type?: string
        }
        Relationships: []
      }
      sync_schedule: {
        Row: {
          created_at: string | null
          data_type: string
          error_message: string | null
          id: string
          last_sync_at: string | null
          last_sync_status: string | null
          next_scheduled_sync: string | null
          records_synced: number | null
          sport: string
        }
        Insert: {
          created_at?: string | null
          data_type: string
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          next_scheduled_sync?: string | null
          records_synced?: number | null
          sport: string
        }
        Update: {
          created_at?: string | null
          data_type?: string
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          next_scheduled_sync?: string | null
          records_synced?: number | null
          sport?: string
        }
        Relationships: []
      }
      user_capper_follows: {
        Row: {
          capper_id: string
          followed_at: string
          id: string
          user_id: string
        }
        Insert: {
          capper_id: string
          followed_at?: string
          id?: string
          user_id: string
        }
        Update: {
          capper_id?: string
          followed_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_capper_follows_capper_id_fkey"
            columns: ["capper_id"]
            isOneToOne: false
            referencedRelation: "cappers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_x_connections: {
        Row: {
          access_token: string
          access_token_encrypted: string | null
          connected_at: string
          id: string
          refresh_token: string | null
          refresh_token_encrypted: string | null
          scopes: string[] | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
          x_display_name: string | null
          x_profile_image: string | null
          x_user_id: string
          x_username: string
        }
        Insert: {
          access_token: string
          access_token_encrypted?: string | null
          connected_at?: string
          id?: string
          refresh_token?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
          x_display_name?: string | null
          x_profile_image?: string | null
          x_user_id: string
          x_username: string
        }
        Update: {
          access_token?: string
          access_token_encrypted?: string | null
          connected_at?: string
          id?: string
          refresh_token?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
          x_display_name?: string | null
          x_profile_image?: string | null
          x_user_id?: string
          x_username?: string
        }
        Relationships: []
      }
      x_oauth_states: {
        Row: {
          code_verifier: string
          created_at: string
          expires_at: string
          id: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          expires_at?: string
          id?: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          expires_at?: string
          id?: string
          redirect_uri?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_cache: { Args: never; Returns: undefined }
      cleanup_expired_oauth_states: { Args: never; Returns: undefined }
      get_my_x_connections: {
        Args: never
        Returns: {
          connected_at: string
          id: string
          updated_at: string
          user_id: string
          x_display_name: string
          x_profile_image: string
          x_user_id: string
          x_username: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
      capper_category:
        | "sharp_bettor"
        | "analyst"
        | "media"
        | "insider"
        | "odds_provider"
        | "community"
        | "pop_culture"
      capper_tier: "elite" | "popular" | "rising"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      capper_category: [
        "sharp_bettor",
        "analyst",
        "media",
        "insider",
        "odds_provider",
        "community",
        "pop_culture",
      ],
      capper_tier: ["elite", "popular", "rising"],
    },
  },
} as const
