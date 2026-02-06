import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================
// ZERO-HALLUCINATION SYSTEM PROMPT
// ============================================================
const SYSTEM_INSTRUCTION = `You are the MGP Analyst, a sports analytics assistant. Your role is to provide DATA and INSIGHTS based ONLY on the data provided to you.

═══════════════════════════════════════════════════════════
CRITICAL RULES - ZERO HALLUCINATION MODE
═══════════════════════════════════════════════════════════

1. ONLY USE DATA PROVIDED: You can ONLY reference data that appears in the [MGP DATA] section below. If information is not in that section, you MUST say "That information isn't available right now" and suggest what you CAN help with (schedules, odds, player stats, injury reports).

2. NEVER INVENT DATA: Do not make up statistics, odds, lines, scores, or any numerical data. If you're uncertain, say so.

3. CITE YOUR SOURCES: Always reference where the data came from (e.g., "MGP Database", "The Odds API").

4. NO PREDICTIONS: Never predict outcomes or recommend bets. Show data only.

5. HANDLE MISSING DATA GRACEFULLY:
   - If no data is provided: "That information isn't available right now."
   - If partial data: Share what you have and note what's missing.

6. STRICT ODDS RULES:
   - NEVER cite odds, spreads, moneylines, or totals from your training data
   - ONLY report odds that appear in the [MGP DATA] section below
   - If odds are not provided in [MGP DATA], say "I don't have current odds for that game"

═══════════════════════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════════════════════

Keep responses CONCISE (3-5 key points max):
- Lead with the most relevant data
- Use exact numbers from the data (no rounding)
- Include source attribution

═══════════════════════════════════════════════════════════
BETTING NOTATION
═══════════════════════════════════════════════════════════

SPREADS: "Magic -6.5, Hornets +6.5"
MONEYLINES: "Magic -244, Hornets +200"  
TOTALS: "O/U 229.5"
PROPS: "Josh Allen O/U 275.5 passing yards"

═══════════════════════════════════════════════════════════
STRICT DATA INTEGRITY
═══════════════════════════════════════════════════════════

If the [MGP DATA] section does not contain the answer to the user's question:
- Respond ONLY with: "That information isn't available right now."
- NEVER estimate, extrapolate, interpolate, or use your training knowledge for stats, scores, odds, or results
- NEVER fill in gaps with plausible-sounding numbers
- It is better to say nothing than to risk providing incorrect data

═══════════════════════════════════════════════════════════
PROHIBITED PHRASES
═══════════════════════════════════════════════════════════

NEVER SAY: "will", "should", "likely", "probably", "expect", "predict", "I think", "chances are", "confident that"
NEVER SAY: "synced", "sync", "admin panel", "backend", "database", "edge function", "API call"

ALWAYS SAY: "The data shows...", "According to MGP...", "Based on the numbers..."`;

// ============================================================
// TYPES
// ============================================================
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SourceRef {
  provider: string;
  endpoint: string;
  fetched_at: string;
  ids: Record<string, string>;
  note?: string;
}

interface FetchedData {
  games?: unknown[];
  odds?: unknown[];
  players?: unknown[];
  injuries?: unknown[];
}

// ============================================================
// INTENT CLASSIFICATION
// ============================================================
function detectLeague(message: string): string {
  const m = message.toLowerCase();
  if (/\b(nfl|football|chiefs|eagles|bills|ravens|cowboys|niners|packers|lions|texans|commanders|dolphins|broncos|raiders|jets|giants|bears|vikings|colts|jaguars|titans|bengals|browns|steelers|saints|buccaneers|panthers|falcons|cardinals|seahawks|rams|chargers)\b/.test(m)) return "NFL";
  if (/\b(nba|basketball|lakers|celtics|warriors|bucks|heat|nuggets|suns|clippers|sixers|knicks|nets|bulls|mavericks|grizzlies|kings|pelicans|timberwolves|thunder|rockets|spurs|magic|hawks|hornets|pistons|pacers|wizards|blazers|jazz|raptors|cavaliers)\b/.test(m)) return "NBA";
  if (/\b(ncaab|ncaamb|college basketball|march madness|duke|kentucky|kansas|gonzaga|purdue|uconn|houston|tennessee|auburn|alabama|arizona|baylor|creighton|marquette)\b/.test(m)) return "NCAAB";
  if (/\b(ncaaf|college football|cfb|playoff|buckeyes|crimson tide|bulldogs|wolverines|longhorns|gators|seminoles|tigers|sooners)\b/.test(m)) return "NCAAF";
  if (/\b(mlb|baseball|yankees|dodgers|braves|astros|phillies|padres|mets|orioles|guardians|rangers|mariners|twins|rays|diamondbacks|cubs|cardinals|red sox|giants|angels|athletics|royals|brewers|pirates|reds|tigers|nationals|rockies|marlins|white sox)\b/.test(m)) return "MLB";
  return "NFL"; // Default to NFL
}

function detectIntent(message: string): string {
  const m = message.toLowerCase();
  if (/\b(odds|line|spread|total|over|under|moneyline|ml|ats|point spread)\b/.test(m)) return "odds";
  if (/\b(game|schedule|when|playing|tonight|today|upcoming|matchup)\b/.test(m)) return "games";
  if (/\b(player|stats?|average|scoring|points|yards|rushing|passing|receiving)\b/.test(m)) return "player_stats";
  if (/\b(injur|out|questionable|doubtful|status|health)\b/.test(m)) return "injuries";
  return "general";
}

// ============================================================
// DATA FETCHING
// ============================================================
async function fetchRelevantData(
  supabase: any,
  league: string,
  intent: string
): Promise<{ data: FetchedData; sources: SourceRef[] }> {
  const fetchedData: FetchedData = {};
  const sources: SourceRef[] = [];
  const now = new Date();
  const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  // Always fetch upcoming games for context
  const gameTable = league === "NFL" ? "games" : 
                    league === "NBA" ? "nba_games" :
                    league === "NCAAB" ? "ncaab_games" :
                    league === "NCAAF" ? "ncaaf_games" :
                    league === "MLB" ? "mlb_games" : "games";

  try {
    const { data: games } = await supabase
      .from(gameTable)
      .select("*")
      .gte("date", now.toISOString())
      .lte("date", in48Hours.toISOString())
      .order("date", { ascending: true })
      .limit(10);

    if (games?.length) {
      fetchedData.games = games;
      sources.push({
        provider: "mgp_database",
        endpoint: `${league}/games`,
        fetched_at: now.toISOString(),
        ids: {},
      });
    }
  } catch (e) {
    console.error("Error fetching games:", e);
  }

  // Fetch odds if relevant
  if (intent === "odds" || intent === "general") {
    const oddsTable = league === "NFL" ? "odds" : 
                      league === "NBA" ? "nba_odds" :
                      league === "NCAAB" ? "ncaab_odds" :
                      league === "NCAAF" ? "ncaaf_odds" :
                      league === "MLB" ? "mlb_odds" : null;

    if (oddsTable) {
      try {
        const { data: odds } = await supabase
          .from(oddsTable)
          .select("*")
          .limit(20);

        if (odds?.length) {
          fetchedData.odds = odds;
          sources.push({
            provider: "the_odds_api",
            endpoint: `${league}/odds`,
            fetched_at: now.toISOString(),
            ids: {},
          });
        }
      } catch (e) {
        console.error("Error fetching odds:", e);
      }
    }
  }

  // Fetch player stats if relevant
  if (intent === "player_stats" || intent === "general") {
    try {
      const sport = league === "NCAAB" ? "NCAAB" : league;
      const { data: players } = await supabase
        .from("players")
        .select("*, player_season_stats(*)")
        .eq("sport", sport)
        .eq("is_featured", true)
        .limit(10);

      if (players?.length) {
        fetchedData.players = players;
        sources.push({
          provider: "mgp_database",
          endpoint: `${league}/players`,
          fetched_at: now.toISOString(),
          ids: {},
        });
      }
    } catch (e) {
      console.error("Error fetching players:", e);
    }
  }

  // Fetch injuries if relevant
  if (intent === "injuries") {
    try {
      const sport = league === "NCAAB" ? "NCAAB" : league;
      const { data: injuries } = await supabase
        .from("players")
        .select("*")
        .eq("sport", sport)
        .neq("injury_status", "Healthy")
        .not("injury_status", "is", null)
        .limit(20);

      if (injuries?.length) {
        fetchedData.injuries = injuries;
        sources.push({
          provider: "mgp_database",
          endpoint: `${league}/injuries`,
          fetched_at: now.toISOString(),
          ids: {},
        });
      }
    } catch (e) {
      console.error("Error fetching injuries:", e);
    }
  }

  return { data: fetchedData, sources };
}

function formatDataForPrompt(data: FetchedData, sources: SourceRef[]): string {
  if (Object.keys(data).length === 0 || Object.values(data).every(v => !v?.length)) {
    return "\n[MGP DATA]\nNo data available for this query.\n";
  }

  let prompt = "\n[MGP DATA]\n";
  
  if (data.games?.length) {
    prompt += "\n📅 UPCOMING GAMES:\n";
    data.games.slice(0, 5).forEach((g: any) => {
      const date = new Date(g.date).toLocaleString("en-US", { 
        weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York"
      });
      prompt += `• ${g.visitor_team_name} @ ${g.home_team_name} - ${date} ET\n`;
    });
  }

  if (data.odds?.length) {
    prompt += "\n📊 CURRENT ODDS:\n";
    data.odds.slice(0, 5).forEach((o: any) => {
      prompt += `• Spread: ${o.spread_value > 0 ? "+" : ""}${o.spread_value}, Total: O/U ${o.total_value} (${o.sportsbook})\n`;
    });
  }

  if (data.players?.length) {
    prompt += "\n👤 PLAYER STATS:\n";
    data.players.slice(0, 5).forEach((p: any) => {
      const stats = p.player_season_stats?.[0];
      if (stats) {
        if (p.sport === "NBA" || p.sport === "NCAAB") {
          prompt += `• ${p.name} (${p.team_abbr}): ${stats.points_per_game?.toFixed(1) || 0} PPG, ${stats.rebounds_per_game?.toFixed(1) || 0} RPG, ${stats.assists_per_game?.toFixed(1) || 0} APG\n`;
        } else if (p.sport === "NFL") {
          prompt += `• ${p.name} (${p.team_abbr}, ${p.position}): ${stats.pass_yards || 0} pass yds, ${stats.rush_yards || 0} rush yds, ${stats.rec_yards || 0} rec yds\n`;
        }
      } else {
        prompt += `• ${p.name} (${p.team_abbr}, ${p.position})\n`;
      }
    });
  }

  if (data.injuries?.length) {
    prompt += "\n🏥 INJURY REPORT:\n";
    data.injuries.slice(0, 5).forEach((p: any) => {
      prompt += `• ${p.name} (${p.team_abbr}): ${p.injury_status}${p.injury_designation ? ` - ${p.injury_designation}` : ""}\n`;
    });
  }

  prompt += "\n[DATA SOURCES]\n";
  sources.forEach((s) => {
    prompt += `• ${s.provider}: ${s.endpoint} (fetched ${new Date(s.fetched_at).toLocaleTimeString("en-US", { timeZone: "America/New_York" })} ET)\n`;
  });

  return prompt;
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
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
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

    console.log(`[gemini-chat] Authenticated user: ${user.id}`);

    const { messages, webSearchEnabled = false } = await req.json() as { messages: ChatMessage[]; webSearchEnabled?: boolean };
    const lastUserMessage = messages.filter(m => m.role === "user").pop()?.content || "";

    console.log("Processing chat request with", messages.length, "messages");

    // Detect league and intent from conversation
    const league = detectLeague(lastUserMessage);
    const intent = detectIntent(lastUserMessage);
    
    console.log(`[gemini-chat] Detected league: ${league}, intent: ${intent}`);

    // Fetch relevant data from our database
    const { data: fetchedData, sources } = await fetchRelevantData(supabase, league, intent);
    const dataPrompt = formatDataForPrompt(fetchedData, sources);

    // Get current date/time for context
    const now = new Date();
    const currentDate = now.toLocaleDateString('en-US', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York'
    });
    const currentTime = now.toLocaleTimeString('en-US', { 
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York'
    });

    // Build complete system prompt with data
    const fullSystemInstruction = `${SYSTEM_INSTRUCTION}

═══════════════════════════════════════════════════════════
CURRENT CONTEXT
═══════════════════════════════════════════════════════════

TODAY: ${currentDate}
TIME: ${currentTime} ET
DETECTED LEAGUE: ${league}

CURRENT SPORTS SEASONS:
- NFL: 2024-25 season (Super Bowl LIX coming February 2025)
- NBA: 2024-25 season (Regular season)
- NCAAB: 2024-25 season (Conference play)
- NCAAF: 2024-25 season (Completed)
- MLB: Offseason (2025 season starts March/April)

${dataPrompt}

REMEMBER: Only use the data above. If information is missing, say "That information isn't available right now" and suggest what data you DO have.`;

    // Build conversation for Gemini — trim to last 10 messages to prevent context overflow
    const recentMessages = messages.length > 10 ? messages.slice(-10) : messages;
    const contents = recentMessages.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    // Call Gemini (Google Search grounding is opt-in via webSearchEnabled parameter)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{ text: fullSystemInstruction }],
          },
          ...(webSearchEnabled ? { tools: [{ googleSearch: {} }] } : {}),
          generationConfig: {
            temperature: 0.4, // Lower temperature for more factual
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to get AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const textContent = candidate?.content?.parts?.find((part: { text?: string }) => part.text);
    let responseText = textContent?.text || "I couldn't generate a response. Please try again.";

    // Detect truncated responses
    if (candidate?.finishReason === "MAX_TOKENS") {
      console.warn("[gemini-chat] Response truncated due to MAX_TOKENS");
      responseText += "\n\n*Response was trimmed for length. Try asking a more specific question.*";
    }

    // Build sources array from our fetched data + any Google search grounding
    const responseSources: { title: string; url: string }[] = [];
    
    // Add our MGP data sources
    sources.forEach((s) => {
      responseSources.push({
        title: `${s.provider}: ${s.endpoint}`,
        url: `#mgp-data-${s.endpoint.replace(/\//g, "-")}`,
      });
    });

    // Add Google grounding sources if available
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web?.uri && chunk.web?.title) {
          if (!responseSources.some(s => s.url === chunk.web.uri)) {
            responseSources.push({
              title: chunk.web.title,
              url: chunk.web.uri,
            });
          }
        }
      }
    }

    console.log("Response generated with", responseSources.length, "sources");

    return new Response(
      JSON.stringify({
        content: responseText,
        sources: responseSources,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[gemini-chat] Error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    
    return new Response(
      JSON.stringify({ error: "An error occurred while processing your request. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
