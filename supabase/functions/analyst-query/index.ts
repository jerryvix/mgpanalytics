import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================
// TYPES
// ============================================================
interface SourceRef {
  provider: string;
  endpoint: string;
  fetched_at: string;
  ids: Record<string, string>;
  note?: string;
}

interface AnalystRequest {
  league: string;
  user_question: string;
  game_id?: string;
  team_id?: string;
  player_id?: string;
}

interface AnalystResponse {
  answer: string;
  sources: SourceRef[];
  data_used: Record<string, unknown>;
}

type IntentType = 
  | "odds_lines"
  | "schedule_games" 
  | "game_detail"
  | "player_stats"
  | "team_roster"
  | "injuries"
  | "unknown";

// ============================================================
// INTENT CLASSIFICATION
// ============================================================
function classifyIntent(question: string): IntentType {
  const q = question.toLowerCase();
  
  // Odds/Lines patterns
  if (/\b(odds|line|spread|total|over|under|moneyline|ml|ats|point spread|betting line|movement)\b/.test(q)) {
    return "odds_lines";
  }
  
  // Schedule/Games patterns
  if (/\b(games?|schedule|when|playing|tonight|today|tomorrow|upcoming|slate|matchup)\b/.test(q)) {
    if (/\b(detail|score|stats|quarter|half)\b/.test(q)) {
      return "game_detail";
    }
    return "schedule_games";
  }
  
  // Player stats patterns
  if (/\b(player|stats?|average|averaging|scoring|points|rebounds|assists|yards|touchdowns|passing|rushing|receiving|performance)\b/.test(q)) {
    return "player_stats";
  }
  
  // Team/Roster patterns
  if (/\b(roster|team|players on|lineup|starting|bench)\b/.test(q)) {
    return "team_roster";
  }
  
  // Injuries patterns
  if (/\b(injur|out|questionable|doubtful|probable|status|health)\b/.test(q)) {
    return "injuries";
  }
  
  return "unknown";
}

// ============================================================
// DATA FETCHING HELPERS
// ============================================================
async function fetchOddsData(
  supabase: any,
  league: string,
  gameId?: string
): Promise<{ data: unknown[]; source: SourceRef }> {
  let query;
  const normalizedLeague = league.toUpperCase();
  
  if (normalizedLeague === "NFL") {
    query = supabase.from("odds").select("*, games!inner(*)");
    if (gameId) {
      query = query.eq("game_id", gameId);
    }
  } else if (normalizedLeague === "NBA") {
    query = supabase.from("nba_odds").select("*, nba_games!inner(*)");
    if (gameId) {
      query = query.eq("game_id", gameId);
    }
  } else if (normalizedLeague === "NCAAB" || normalizedLeague === "NCAAMB") {
    query = supabase.from("ncaab_odds").select("*, ncaab_games!inner(*)");
    if (gameId) {
      query = query.eq("game_id", gameId);
    }
  } else {
    return {
      data: [],
      source: {
        provider: "mgp_database",
        endpoint: `${league}/odds`,
        fetched_at: new Date().toISOString(),
        ids: {},
        note: "League not supported for odds",
      },
    };
  }

  const { data, error } = await query.limit(20);
  
  if (error) {
    console.error("Error fetching odds:", error);
    return {
      data: [],
      source: {
        provider: "mgp_database",
        endpoint: `${league}/odds`,
        fetched_at: new Date().toISOString(),
        ids: gameId ? { game_id: gameId } : {},
        note: "Error fetching data",
      },
    };
  }

  return {
    data: data || [],
    source: {
      provider: "mgp_database",
      endpoint: `${league}/odds`,
      fetched_at: new Date().toISOString(),
      ids: gameId ? { game_id: gameId } : {},
    },
  };
}

async function fetchGamesData(
  supabase: any,
  league: string
): Promise<{ data: unknown[]; source: SourceRef }> {
  const now = new Date();
  const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const normalizedLeague = league.toUpperCase();
  
  let tableName: string;
  if (normalizedLeague === "NFL") {
    tableName = "games";
  } else if (normalizedLeague === "NBA") {
    tableName = "nba_games";
  } else if (normalizedLeague === "NCAAB" || normalizedLeague === "NCAAMB") {
    tableName = "ncaab_games";
  } else if (normalizedLeague === "NCAAF") {
    tableName = "ncaaf_games";
  } else if (normalizedLeague === "MLB") {
    tableName = "mlb_games";
  } else {
    return {
      data: [],
      source: {
        provider: "mgp_database",
        endpoint: `${league}/games`,
        fetched_at: new Date().toISOString(),
        ids: {},
        note: "League not supported",
      },
    };
  }

  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .gte("date", now.toISOString())
    .lte("date", in48Hours.toISOString())
    .order("date", { ascending: true })
    .limit(10);

  if (error) {
    console.error("Error fetching games:", error);
  }

  return {
    data: data || [],
    source: {
      provider: "mgp_database",
      endpoint: `${league}/games`,
      fetched_at: new Date().toISOString(),
      ids: {},
    },
  };
}

async function fetchPlayerStats(
  supabase: any,
  league: string,
  playerName?: string
): Promise<{ data: unknown[]; source: SourceRef }> {
  const normalizedLeague = league.toUpperCase();
  const sport = normalizedLeague === "NCAAMB" ? "NCAAB" : normalizedLeague;
  
  let query = supabase
    .from("players")
    .select("*, player_season_stats(*), player_game_logs(*)")
    .eq("sport", sport);
  
  if (playerName) {
    query = query.ilike("name", `%${playerName}%`);
  } else {
    query = query.eq("is_featured", true);
  }

  const { data, error } = await query.limit(5);

  if (error) {
    console.error("Error fetching player stats:", error);
  }

  return {
    data: data || [],
    source: {
      provider: "mgp_database",
      endpoint: `${league}/players`,
      fetched_at: new Date().toISOString(),
      ids: playerName ? { search: playerName } : {},
    },
  };
}

async function fetchInjuries(
  supabase: any,
  league: string,
  teamName?: string
): Promise<{ data: unknown[]; source: SourceRef }> {
  const normalizedLeague = league.toUpperCase();
  const sport = normalizedLeague === "NCAAMB" ? "NCAAB" : normalizedLeague;
  
  let query = supabase
    .from("players")
    .select("*")
    .eq("sport", sport)
    .neq("injury_status", "Healthy")
    .not("injury_status", "is", null);
  
  if (teamName) {
    query = query.or(`team_name.ilike.%${teamName}%,team_abbr.ilike.%${teamName}%`);
  }

  const { data, error } = await query.limit(20);

  if (error) {
    console.error("Error fetching injuries:", error);
  }

  return {
    data: data || [],
    source: {
      provider: "mgp_database",
      endpoint: `${league}/injuries`,
      fetched_at: new Date().toISOString(),
      ids: teamName ? { team: teamName } : {},
    },
  };
}

// ============================================================
// RESPONSE GENERATION
// ============================================================
async function generateAnswer(
  geminiKey: string,
  question: string,
  intent: IntentType,
  data: Record<string, unknown>,
  sources: SourceRef[]
): Promise<string> {
  // If no data, return not available message
  const hasData = Object.values(data).some(v => 
    Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined
  );
  
  if (!hasData) {
    return "That information isn't available right now. I can help with game schedules, odds, player stats, and injury reports.";
  }

  const systemPrompt = `You are the MGP Analyst. You ONLY answer based on the data provided below.

CRITICAL RULES:
1. NEVER make up statistics, odds, lines, or any numerical data
2. NEVER predict outcomes or recommend bets
3. If the data doesn't contain what the user is asking for, say "That information isn't available right now" and suggest what you CAN help with (schedules, odds, player stats, injury reports)
4. Always cite the data source (MGP Database, The Odds API, etc.)
5. Keep responses concise - 3-5 key data points maximum
6. Format numbers exactly as provided - don't round or estimate
7. NEVER estimate, extrapolate, or use training knowledge for stats/scores/odds
8. NEVER use words like "synced", "admin panel", "backend", or "database" in responses

DATA PROVIDED:
${JSON.stringify(data, null, 2)}

SOURCES:
${sources.map(s => `- ${s.provider}: ${s.endpoint} (fetched at ${s.fetched_at})`).join("\n")}

USER QUESTION: ${question}

Based ONLY on the data above, provide a helpful response. If the data doesn't contain the answer, say "That information isn't available right now" and mention what types of data you can help with.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
          generationConfig: {
            temperature: 0.3, // Lower temperature for more factual responses
            maxOutputTokens: 512,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error("Gemini API error:", response.status);
      return formatFallbackAnswer(intent, data, sources);
    }

    const result = await response.json();
    const answer = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    return answer || formatFallbackAnswer(intent, data, sources);
  } catch (error) {
    console.error("Error generating answer:", error);
    return formatFallbackAnswer(intent, data, sources);
  }
}

function formatFallbackAnswer(
  intent: IntentType,
  data: Record<string, unknown>,
  sources: SourceRef[]
): string {
  const sourceNote = sources.length > 0 
    ? `\n\n*Data from ${sources[0].provider} as of ${new Date(sources[0].fetched_at).toLocaleTimeString()}*`
    : "";

  switch (intent) {
    case "odds_lines": {
      const odds = data.odds as unknown[];
      if (!odds?.length) return "No odds data available for this matchup." + sourceNote;
      
      const first = odds[0] as any;
      const game = first.games || first.nba_games || first.ncaab_games;
      return `**${game?.visitor_team_name || "Away"} @ ${game?.home_team_name || "Home"}**\n` +
        `Spread: ${first.spread_value > 0 ? "+" : ""}${first.spread_value}\n` +
        `Total: O/U ${first.total_value}\n` +
        `(${first.sportsbook})` + sourceNote;
    }
    
    case "schedule_games": {
      const games = data.games as unknown[];
      if (!games?.length) return "No upcoming games found in the next 48 hours." + sourceNote;
      
      return games.slice(0, 5).map((g: any) => {
        const date = new Date(g.date).toLocaleString("en-US", { 
          weekday: "short", 
          month: "short", 
          day: "numeric", 
          hour: "numeric", 
          minute: "2-digit" 
        });
        return `• ${g.visitor_team_name} @ ${g.home_team_name} - ${date}`;
      }).join("\n") + sourceNote;
    }
    
    case "player_stats": {
      const players = data.players as unknown[];
      if (!players?.length) return "No player data found." + sourceNote;
      
      return players.slice(0, 3).map((p: any) => {
        const stats = p.player_season_stats?.[0];
        if (!stats) return `• ${p.name} (${p.position}, ${p.team_abbr})`;
        
        if (p.sport === "NBA" || p.sport === "NCAAB") {
          return `• ${p.name}: ${stats.points_per_game?.toFixed(1) || 0} PPG, ${stats.rebounds_per_game?.toFixed(1) || 0} RPG, ${stats.assists_per_game?.toFixed(1) || 0} APG`;
        } else {
          return `• ${p.name}: ${stats.pass_yards || 0} pass yds, ${stats.rush_yards || 0} rush yds`;
        }
      }).join("\n") + sourceNote;
    }
    
    case "injuries": {
      const injuries = data.injuries as unknown[];
      if (!injuries?.length) return "No injury reports found." + sourceNote;
      
      return injuries.slice(0, 5).map((p: any) => 
        `• ${p.name} (${p.team_abbr}): ${p.injury_status}${p.injury_designation ? ` - ${p.injury_designation}` : ""}`
      ).join("\n") + sourceNote;
    }
    
    default:
      return "That information isn't available right now. I can help with game schedules, odds, player stats, and injury reports." + sourceNote;
  }
}

// ============================================================
// MAIN HANDLER
// ============================================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiKey) {
      console.error("GEMINI_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Service configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request
    const body: AnalystRequest = await req.json();
    const { league, user_question, game_id, team_id, player_id } = body;

    if (!league || !user_question) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: league, user_question" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Classify intent
    const intent = classifyIntent(user_question);
    console.log(`[analyst-query] Intent: ${intent} for question: ${user_question.substring(0, 50)}...`);

    // Fetch relevant data based on intent
    const sources: SourceRef[] = [];
    const dataUsed: Record<string, unknown> = {};

    switch (intent) {
      case "odds_lines": {
        const oddsResult = await fetchOddsData(supabase, league, game_id);
        dataUsed.odds = oddsResult.data;
        sources.push(oddsResult.source);
        break;
      }
      
      case "schedule_games": {
        const gamesResult = await fetchGamesData(supabase, league);
        dataUsed.games = gamesResult.data;
        sources.push(gamesResult.source);
        break;
      }
      
      case "game_detail": {
        if (game_id) {
          const oddsResult = await fetchOddsData(supabase, league, game_id);
          dataUsed.odds = oddsResult.data;
          sources.push(oddsResult.source);
        } else {
          const gamesResult = await fetchGamesData(supabase, league);
          dataUsed.games = gamesResult.data;
          sources.push(gamesResult.source);
        }
        break;
      }
      
      case "player_stats": {
        // Try to extract player name from question
        const playerMatch = user_question.match(/(?:about|for|on|how is|how's|what about|stats for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
        const playerName = playerMatch?.[1];
        
        const playerResult = await fetchPlayerStats(supabase, league, playerName);
        dataUsed.players = playerResult.data;
        sources.push(playerResult.source);
        break;
      }
      
      case "team_roster": {
        // Extract team name from question
        const teamMatch = user_question.match(/(?:roster|players on|lineup for)\s+(?:the\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
        const teamName = teamMatch?.[1];
        
        const playerResult = await fetchPlayerStats(supabase, league, undefined);
        dataUsed.players = playerResult.data;
        sources.push(playerResult.source);
        break;
      }
      
      case "injuries": {
        const teamMatch = user_question.match(/(?:injured|injuries|out)\s+(?:on|for)?\s*(?:the\s+)?([A-Za-z]+)/i);
        const teamName = teamMatch?.[1];
        
        const injuryResult = await fetchInjuries(supabase, league, teamName);
        dataUsed.injuries = injuryResult.data;
        sources.push(injuryResult.source);
        break;
      }
      
      default: {
        // Fetch multiple data types for general questions
        const gamesResult = await fetchGamesData(supabase, league);
        dataUsed.games = gamesResult.data;
        sources.push(gamesResult.source);
        
        const oddsResult = await fetchOddsData(supabase, league);
        dataUsed.odds = oddsResult.data;
        sources.push(oddsResult.source);
        break;
      }
    }

    // Generate answer using Gemini with strict grounding
    const answer = await generateAnswer(geminiKey, user_question, intent, dataUsed, sources);

    const response: AnalystResponse = {
      answer,
      sources,
      data_used: dataUsed,
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[analyst-query] Error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
