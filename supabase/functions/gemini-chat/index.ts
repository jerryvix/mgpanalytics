import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================
// SYSTEM PROMPT — BASE + QUESTION-TYPE-SPECIFIC RULES
// ============================================================
const SYSTEM_INSTRUCTION_BASE = `You are the MGP Analyst, a sports analytics assistant designed to help users explore and understand sports data. You operate as a teacher-student model: your job is to surface information, ask clarifying questions, and empower the user to draw their own conclusions.

═══════════════════════════════════════════════════════════
IDENTITY & APPROACH (TEACHER-STUDENT MODEL)
═══════════════════════════════════════════════════════════

1. You are a research tool, not an advisor. Frame information as tools for the user's own analysis, never as conclusions or recommendations.
2. Ask clarifying questions when a query is ambiguous: "Are you looking at season averages or recent games?" "Do you want DraftKings or all books?"
3. End responses with exploration, not calls to action: "If you'd like, we can dig into his road splits" or "Want to compare this with another player?"
4. Clearly attribute data sources: "Based on MGP data..." vs "Based on publicly available information..."

═══════════════════════════════════════════════════════════
CRITICAL RULES - ZERO HALLUCINATION MODE
═══════════════════════════════════════════════════════════

2. NEVER INVENT MARKET DATA: Do not make up odds, lines, spreads, totals, or prop numbers. If you're uncertain, say so.

3. CITE YOUR SOURCES: Always reference where the data came from (e.g., "MGP data", "The Odds API", "publicly available stats").

4. NON-PRESCRIPTIVE: Never predict outcomes, recommend bets, or tell the user what to do. Present data descriptively.

5. HANDLE MISSING DATA — ALWAYS SHARE WHAT YOU HAVE:
   - ALWAYS share available data first, then note gaps.
   - If partial data exists: Lead with what you have. Example: "I don't have specific odds for that matchup, but here's what I do have..."
   - Only say "not available" when the query is market-specific AND no relevant MGP data exists at all.

═══════════════════════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════════════════════

Keep responses CONCISE (3-5 key points max):
- Lead with the most relevant data
- Use exact numbers from MGP data (no rounding)
- Include source attribution
- End with an exploration prompt when natural

═══════════════════════════════════════════════════════════
BETTING NOTATION
═══════════════════════════════════════════════════════════

SPREADS: "Magic -6.5, Hornets +6.5"
MONEYLINES: "Magic -244, Hornets +200"
TOTALS: "O/U 229.5"
PROPS: "Josh Allen O/U 275.5 passing yards"

═══════════════════════════════════════════════════════════
PROHIBITED PHRASES
═══════════════════════════════════════════════════════════

NEVER SAY: "will", "should bet", "lock", "likely", "probably", "expect", "predict", "I think", "chances are", "confident that", "hot pick", "best bet"
NEVER SAY: "synced", "sync", "admin panel", "backend", "database", "edge function", "API call"

INSTEAD SAY: "The data shows...", "According to MGP...", "Based on the numbers...", "Here's what's available..."

═══════════════════════════════════════════════════════════
RESPONSE ENDING RULE
═══════════════════════════════════════════════════════════

- ALWAYS end responses with 2-3 exploration options for the user.
  Examples: "Want to look at his road splits?", "We could also compare the over/under history.", "If you're curious, I can pull up the matchup trends."
- NEVER end with an implied action, decision-oriented summary, or conclusive statement.
- The final sentence must invite deeper research, not wrap up analysis.`;

// Question-type-specific rule overlays
const QUESTION_TYPE_RULES: Record<QuestionType, string> = {
  MARKET_SPECIFIC: `
═══════════════════════════════════════════════════════════
QUESTION TYPE: MARKET_SPECIFIC (Strict MGP Data Only)
═══════════════════════════════════════════════════════════

This question is about odds, lines, props, or market data.
- ONLY use data from the [MGP DATA] section for odds, lines, and props. Never fabricate market data.
- NEVER cite odds, spreads, moneylines, or totals from your training data.
- If odds are not in [MGP DATA], say "I don't have current odds for that" and offer related data that IS available.
- If [MGP DATA] is completely empty, say "That market data isn't available right now" and suggest checking back later.
- NEVER use your general knowledge to fill in market data gaps.`,

  CONTEXTUAL: `
═══════════════════════════════════════════════════════════
QUESTION TYPE: CONTEXTUAL (Hybrid — MGP Data Preferred)
═══════════════════════════════════════════════════════════

This question is about trends, matchup analysis, or situational factors.
- Use [MGP DATA] when available as your primary source.
- You MAY supplement with general sports knowledge for context (historical trends, general positional tendencies).
- CLEARLY DISTINGUISH sources: "Based on MGP data, he's averaging..." vs "Generally speaking, rookie QBs tend to..."
- NEVER fabricate specific stats or numbers. General observations are OK if labeled as such.
- Frame contextual info as descriptive, not prescriptive.`,

  FACTUAL: `
═══════════════════════════════════════════════════════════
QUESTION TYPE: FACTUAL (Open — General Knowledge Allowed)
═══════════════════════════════════════════════════════════

This question is about factual sports information (stats, history, biographical info).
- You MAY answer using your general knowledge. Do NOT say "that data isn't available in MGP" for factual questions.
- If [MGP DATA] is available, include it and cite it. If not, answer from your knowledge.
- NEVER fabricate odds, lines, or market data even in factual mode.
- Still follow teacher-student framing: present facts descriptively, end with exploration prompts.
- Clearly attribute: "Based on publicly available stats..." vs "According to MGP data..."`,
};

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
  results?: unknown[];
  odds?: unknown[];
  players?: unknown[];
  injuries?: unknown[];
  props?: unknown[];
  prop_results?: unknown[];
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
  if (/\b(props?|player prop|over\s*\/?\s*under\s+\d|o\/u\s+\d)\b/.test(m)) return "props";
  if (/\b(odds|line|spread|total|over|under|moneyline|ml|ats|point spread)\b/.test(m)) return "odds";
  if (/\b(who won|final score|result|score of|did .+ (win|lose|cover|beat)|last night|yesterday|recap|box score)\b/.test(m)) return "results";
  if (/\b(game|schedule|when|playing|tonight|today|upcoming|matchup)\b/.test(m)) return "games";
  if (/\b(player|stats?|average|scoring|points|yards|rushing|passing|receiving)\b/.test(m)) return "player_stats";
  if (/\b(injur|out|questionable|doubtful|status|health)\b/.test(m)) return "injuries";
  return "general";
}

// ============================================================
// QUESTION TYPE CLASSIFICATION (P3-09)
// Determines how strictly responses must adhere to MGP data
// ============================================================
type QuestionType = "MARKET_SPECIFIC" | "CONTEXTUAL" | "FACTUAL";

function classifyQuestionType(message: string): QuestionType {
  const m = message.toLowerCase();

  // MARKET_SPECIFIC: odds, lines, props, books, movement, value, edge
  if (/\b(odds|line|spread|total|moneyline|ml|ats|point spread|prop|over\s*\/?\s*under|o\/u|book|sportsbook|draftkings|fanduel|betmgm|caesars|movement|moved|value|edge|mispricing|sharp|steam|juice|vig|handle)\b/.test(m)) {
    return "MARKET_SPECIFIC";
  }

  // CONTEXTUAL: trends, matchup analysis, situational, streaks, splits
  if (/\b(trend|matchup|factor|situational|home.*(road|away)|road.*(home|away)|streak|split|against.*(spread|the)|ats|when|how.*(do|does|perform)|last\s+\d+\s+games|pace|rating|efficiency|advantage|comparison|compare)\b/.test(m)) {
    return "CONTEXTUAL";
  }

  // Default: FACTUAL — pure sports facts, stats, history, biographical
  return "FACTUAL";
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

  // Fetch completed game results if relevant (last 7 days)
  if (intent === "results" || intent === "general") {
    try {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const { data: results } = await supabase
        .from(gameTable)
        .select("*")
        .eq("is_final", true)
        .gte("date", sevenDaysAgo.toISOString())
        .order("date", { ascending: false })
        .limit(15);

      if (results?.length) {
        fetchedData.results = results;
        sources.push({
          provider: "mgp_database",
          endpoint: `${league}/results`,
          fetched_at: now.toISOString(),
          ids: {},
        });
      }
    } catch (e) {
      console.error("Error fetching results:", e);
    }
  }

  // Fetch odds if relevant (also for games/results/props intents as fallback context)
  if (intent === "odds" || intent === "general" || intent === "games" || intent === "results" || intent === "props") {
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

  // Fetch player props if relevant
  if (intent === "props" || intent === "general") {
    try {
      const today = new Date().toISOString().split("T")[0];
      const { data: props } = await supabase
        .from("player_props")
        .select("*, players!inner(name, team_name)")
        .eq("sport", league)
        .eq("is_active", true)
        .gte("game_date", today)
        .order("game_date", { ascending: true })
        .limit(50);

      if (props?.length) {
        fetchedData.props = props;
        sources.push({
          provider: "mgp_database",
          endpoint: `${league}/player_props`,
          fetched_at: now.toISOString(),
          ids: {},
        });
      }

      // Also fetch recent prop results (last 3 days, graded)
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
        .toISOString().split("T")[0];
      const { data: gradedProps } = await supabase
        .from("player_props")
        .select("*, players!inner(name, team_name)")
        .eq("sport", league)
        .eq("graded", true)
        .gte("game_date", threeDaysAgo)
        .order("game_date", { ascending: false })
        .limit(30);

      if (gradedProps?.length) {
        fetchedData.prop_results = gradedProps;
        sources.push({
          provider: "mgp_database",
          endpoint: `${league}/prop_results`,
          fetched_at: now.toISOString(),
          ids: {},
        });
      }
    } catch (e) {
      console.error("Error fetching props:", e);
    }
  }

  return { data: fetchedData, sources };
}

function formatDataForPrompt(data: FetchedData, sources: SourceRef[]): string {
  if (Object.keys(data).length === 0 || Object.values(data).every(v => !v?.length)) {
    return "\n[MGP DATA]\nNo data available for this query. Suggest the user ask about upcoming games, player stats, odds, or injury reports.\n";
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

  if (data.results?.length) {
    prompt += "\n🏆 RECENT RESULTS:\n";
    data.results.slice(0, 10).forEach((g: any) => {
      const date = new Date(g.date).toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York"
      });
      const homeScore = g.home_score ?? "?";
      const awayScore = g.away_score ?? "?";
      prompt += `• ${date}: ${g.visitor_team_name} ${awayScore} @ ${g.home_team_name} ${homeScore} (FINAL)\n`;
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

  if (data.props?.length) {
    prompt += "\n🎯 PLAYER PROPS:\n";
    const byPlayer: Record<string, any[]> = {};
    for (const p of data.props as any[]) {
      const name = p.players?.name || "Unknown";
      if (!byPlayer[name]) byPlayer[name] = [];
      byPlayer[name].push(p);
    }
    for (const [name, playerProps] of Object.entries(byPlayer).slice(0, 10)) {
      const team = (playerProps[0] as any).players?.team_name || "";
      prompt += `\n${name} (${team}):\n`;
      for (const prop of playerProps.slice(0, 6)) {
        const overOdds = prop.over_odds ? (prop.over_odds > 0 ? `+${prop.over_odds}` : prop.over_odds) : "—";
        const underOdds = prop.under_odds ? (prop.under_odds > 0 ? `+${prop.under_odds}` : prop.under_odds) : "—";
        prompt += `  • ${prop.prop_type}: O/U ${prop.line} (Over ${overOdds} / Under ${underOdds}) — ${prop.sportsbook}\n`;
      }
    }
  }

  if (data.prop_results?.length) {
    prompt += "\n📊 RECENT PROP RESULTS:\n";
    const byPlayer: Record<string, any[]> = {};
    for (const p of data.prop_results as any[]) {
      const name = p.players?.name || "Unknown";
      if (!byPlayer[name]) byPlayer[name] = [];
      byPlayer[name].push(p);
    }
    for (const [name, playerProps] of Object.entries(byPlayer).slice(0, 8)) {
      const team = (playerProps[0] as any).players?.team_name || "";
      const gameDate = new Date(playerProps[0].game_date).toLocaleDateString("en-US", {
        month: "short", day: "numeric", timeZone: "America/New_York"
      });
      prompt += `\n${name} (${team}) — ${gameDate}:\n`;
      for (const prop of playerProps.slice(0, 6)) {
        const resultLabel = prop.result === "over" ? "OVER ✓" : prop.result === "under" ? "UNDER" : prop.result === "push" ? "PUSH" : "VOID";
        prompt += `  • ${prop.prop_type}: Line ${prop.line}, Actual ${prop.actual_value} → ${resultLabel}\n`;
      }
    }
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

    // Detect league, intent, and question type from conversation
    const league = detectLeague(lastUserMessage);
    const intent = detectIntent(lastUserMessage);
    const questionType = classifyQuestionType(lastUserMessage);

    console.log(`[gemini-chat] Detected league: ${league}, intent: ${intent}, questionType: ${questionType}`);

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

    // Build complete system prompt with data + question-type rules
    const fullSystemInstruction = `${SYSTEM_INSTRUCTION_BASE}
${QUESTION_TYPE_RULES[questionType]}

═══════════════════════════════════════════════════════════
CURRENT CONTEXT
═══════════════════════════════════════════════════════════

TODAY: ${currentDate}
TIME: ${currentTime} ET
DETECTED LEAGUE: ${league}

CURRENT SPORTS SEASONS:
${(() => {
  const n = new Date();
  const yr = n.getFullYear();
  const mo = n.getMonth(); // 0-indexed
  const nflSeason = mo >= 8 ? yr : yr - 1;
  const nbaSeason = mo >= 9 ? yr : yr - 1;
  return `- NFL: ${nflSeason}-${String(nflSeason + 1).slice(2)} season
- NBA: ${nbaSeason}-${String(nbaSeason + 1).slice(2)} season (Regular season)
- NCAAB: ${nbaSeason}-${String(nbaSeason + 1).slice(2)} season
- NCAAF: ${nflSeason}-${String(nflSeason + 1).slice(2)} season
- MLB: ${mo >= 3 && mo <= 9 ? yr + " season (Active)" : "Offseason (" + (mo < 3 ? yr : yr + 1) + " season starts March/April)"}`;
})()}

${dataPrompt}

REMEMBER: ALWAYS lead with whatever data IS available. If the exact answer is missing but related data exists, share that and note the gap. End with an exploration prompt to keep the conversation going.`;

    // Build conversation for Gemini — trim to last 10 messages to prevent context overflow
    const recentMessages = messages.length > 10 ? messages.slice(-10) : messages;
    const contents = recentMessages.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    // Auto-enable Google Search for FACTUAL questions so Gemini can fetch current stats
    const useSearch = webSearchEnabled || questionType === "FACTUAL";

    // Call Gemini (Google Search grounding enabled for FACTUAL questions or when user opts in)
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
          ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
          generationConfig: {
            temperature: 0.4, // Lower temperature for more factual
            maxOutputTokens: 4096,
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
