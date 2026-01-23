import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Base URLs for different sports
const BASE_URLS: Record<string, string> = {
  nfl: 'https://api.balldontlie.io/nfl/v1',
  nba: 'https://api.balldontlie.io/v1',
  ncaab: 'https://api.balldontlie.io/cbb/v1',
};

// Rate limiting delay (100ms between calls)
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

// Generic fetch function for Ball Don't Lie API
async function bdlFetch(
  apiKey: string,
  sport: string,
  endpoint: string,
  params?: Record<string, string | number>
): Promise<{ data: any; meta?: { next_cursor?: string } }> {
  await rateLimitedDelay();
  
  const baseUrl = BASE_URLS[sport.toLowerCase()];
  if (!baseUrl) {
    throw new Error(`Unsupported sport: ${sport}. Supported: nfl, nba, ncaab`);
  }

  const url = new URL(`${baseUrl}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  console.log(`[BDL] Fetching: ${url.toString()}`);
  
  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[BDL] Error ${response.status}: ${errorText}`);
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  const json = await response.json();
  console.log(`[BDL] Success: Got ${json.data?.length || 0} records`);
  return json;
}

// Fetch all pages using cursor pagination
async function fetchAllPages(
  apiKey: string,
  sport: string,
  endpoint: string,
  params?: Record<string, string | number>
): Promise<any[]> {
  const allData: any[] = [];
  let cursor: string | undefined = undefined;
  let pageCount = 0;
  const maxPages = 100; // Safety limit

  do {
    pageCount++;
    console.log(`[BDL] Fetching page ${pageCount}...`);
    
    const fetchParams: Record<string, string | number> = { ...params };
    if (cursor) {
      fetchParams.cursor = cursor;
    }

    const response = await bdlFetch(apiKey, sport, endpoint, fetchParams);
    
    if (response.data && Array.isArray(response.data)) {
      allData.push(...response.data);
    }

    cursor = response.meta?.next_cursor;
    
    if (pageCount >= maxPages) {
      console.log(`[BDL] Reached max page limit (${maxPages})`);
      break;
    }
  } while (cursor);

  console.log(`[BDL] Total records fetched: ${allData.length} across ${pageCount} pages`);
  return allData;
}

// Test API connection
async function testConnection(apiKey: string, sport: string = 'nfl'): Promise<{ success: boolean; message: string }> {
  try {
    const response = await bdlFetch(apiKey, sport, '/teams');
    const teamCount = response.data?.length || 0;
    return {
      success: true,
      message: `Connected! Found ${teamCount} ${sport.toUpperCase()} teams`,
    };
  } catch (error) {
    console.error('[BDL] Connection test failed:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('BALLDONTLIE_API_KEY');
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    console.log(`[BDL] API Key exists: ${!!apiKey}, length: ${apiKey?.length || 0}`);
    
    if (!apiKey) {
      throw new Error('BALLDONTLIE_API_KEY not configured');
    }
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error("Supabase configuration missing");
    }

    // Authenticate user - require admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized - no token provided" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.substring(7);
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claims, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized - invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claims.claims.sub;
    
    // Check admin role using service client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (roleError || roleData?.role !== "admin") {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden - admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[BDL] Admin user ${userId} authenticated, proceeding...`);

    const url = new URL(req.url);
    
    // For POST requests, parse the body first
    let body: Record<string, any> = {};
    if (req.method === 'POST') {
      const rawBody = await req.text();
      console.log(`[BDL] Raw body: ${rawBody}`);
      try {
        body = JSON.parse(rawBody);
      } catch (e) {
        console.error(`[BDL] Failed to parse body: ${e}`);
        body = {};
      }
    }

    // Get action from body first, then URL params
    const action = body.action || url.searchParams.get('action');
    const sport = body.sport || url.searchParams.get('sport') || 'nfl';
    const endpoint = body.endpoint || url.searchParams.get('endpoint') || '/teams';
    const params = body.params || {};
    const fetchAll = body.fetchAll || url.searchParams.get('fetchAll') === 'true';

    console.log(`[BDL] Action: ${action}, Sport: ${sport}, Endpoint: ${endpoint}, FetchAll: ${fetchAll}`);

    let result: any;

    switch (action) {
      case 'test':
        console.log(`[BDL] Running test connection for ${sport}...`);
        result = await testConnection(apiKey, sport);
        console.log(`[BDL] Test result: ${JSON.stringify(result)}`);
        break;
      
      case 'fetch':
        if (fetchAll) {
          result = { data: await fetchAllPages(apiKey, sport, endpoint, params) };
        } else {
          result = await bdlFetch(apiKey, sport, endpoint, params);
        }
        break;
      
      case 'players':
        // Convenience endpoint for fetching players
        const playersEndpoint = sport.toLowerCase() === 'nba' ? '/players' : '/players';
        if (fetchAll) {
          result = { data: await fetchAllPages(apiKey, sport, playersEndpoint, params) };
        } else {
          result = await bdlFetch(apiKey, sport, playersEndpoint, params);
        }
        break;
      
      case 'teams':
        result = await bdlFetch(apiKey, sport, '/teams', params);
        break;
      
      case 'games':
        const gamesEndpoint = '/games';
        if (fetchAll) {
          result = { data: await fetchAllPages(apiKey, sport, gamesEndpoint, params) };
        } else {
          result = await bdlFetch(apiKey, sport, gamesEndpoint, params);
        }
        break;
      
      case 'stats':
        // Season stats endpoint varies by sport
        const statsEndpoint = sport.toLowerCase() === 'nba' ? '/season_averages' : '/stats';
        result = await bdlFetch(apiKey, sport, statsEndpoint, params);
        break;

      default:
        // Default: perform a generic fetch
        if (fetchAll) {
          result = { data: await fetchAllPages(apiKey, sport, endpoint, params) };
        } else {
          result = await bdlFetch(apiKey, sport, endpoint, params);
        }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    // Log detailed error server-side only
    console.error('[BDL] Error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    
    // Return generic error to client
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'An error occurred while processing your request. Please try again.' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
