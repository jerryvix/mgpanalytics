import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';

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

async function bdlFetch(apiKey: string, endpoint: string, params?: Record<string, string | number>) {
  await rateLimitedDelay();
  
  const url = new URL(`${BDL_NFL_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, String(value));
      }
    });
  }

  console.log(`[NFL-Search] Fetching: ${url.toString()}`);
  
  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error(`[NFL-Search] Error ${response.status}`);
    throw new Error(`API Error ${response.status}`);
  }

  return await response.json();
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: require valid user session
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get('BALLDONTLIE_API_KEY');

    if (!apiKey) {
      throw new Error('API key not configured');
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'search';
    
    let result: any;

    switch (action) {
      case 'search': {
        // Search for players
        const query = url.searchParams.get('query') || '';
        const perPage = url.searchParams.get('per_page') || '25';
        
        if (!query || query.length < 2) {
          return new Response(
            JSON.stringify({ data: [], meta: { total: 0 } }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        result = await bdlFetch(apiKey, '/players', { 
          search: query,
          per_page: parseInt(perPage)
        });
        break;
      }
      
      case 'player': {
        // Get single player by ID
        const playerId = url.searchParams.get('id');
        
        if (!playerId) {
          return new Response(
            JSON.stringify({ error: 'Player ID required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        result = await bdlFetch(apiKey, `/players/${playerId}`);
        break;
      }
      
      case 'stats': {
        // Get player season stats
        const playerId = url.searchParams.get('player_id');
        const season = url.searchParams.get('season') || '2024';
        
        if (!playerId) {
          return new Response(
            JSON.stringify({ error: 'Player ID required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        result = await bdlFetch(apiKey, '/season_stats', { 
          player_id: playerId,
          season: parseInt(season)
        });
        break;
      }
      
      case 'game_logs': {
        // Get player game-by-game stats
        const playerId = url.searchParams.get('player_id');
        const season = url.searchParams.get('season') || '2024';
        const perPage = url.searchParams.get('per_page') || '17'; // Full season
        
        if (!playerId) {
          return new Response(
            JSON.stringify({ error: 'Player ID required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // BDL NFL uses player_ids[] for array format
        await rateLimitedDelay();
        const statsUrl = new URL(`${BDL_NFL_BASE_URL}/stats`);
        statsUrl.searchParams.append('player_ids[]', playerId);
        statsUrl.searchParams.append('season', season);
        statsUrl.searchParams.append('per_page', perPage);
        
        console.log(`[NFL-Search] Fetching game logs: ${statsUrl.toString()}`);
        
        const statsResponse = await fetch(statsUrl.toString(), {
          headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json',
          },
        });
        
        if (!statsResponse.ok) {
          const errorText = await statsResponse.text();
          console.error(`[NFL-Search] Game logs error ${statsResponse.status}: ${errorText}`);
          throw new Error(`API Error ${statsResponse.status}`);
        }
        
        result = await statsResponse.json();
        break;
      }
      
      case 'teams': {
        // Get all teams
        result = await bdlFetch(apiKey, '/teams');
        break;
      }
      
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[NFL-Search] Error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    
    return new Response(
      JSON.stringify({ error: 'Failed to fetch player data. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
