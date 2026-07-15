import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { getCorsHeaders } from "../_shared/cors.ts";

// Rate limit: max requests per user per window
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ============================================================
// TEAM NAME MAPPING (informal -> DB displayName)
// ============================================================
const NBA_TEAMS: Record<string, string> = {
  "lakers": "Los Angeles Lakers", "celtics": "Boston Celtics",
  "warriors": "Golden State Warriors", "bucks": "Milwaukee Bucks",
  "heat": "Miami Heat", "nuggets": "Denver Nuggets",
  "suns": "Phoenix Suns", "clippers": "LA Clippers",
  "sixers": "Philadelphia 76ers", "76ers": "Philadelphia 76ers",
  "knicks": "New York Knicks", "nets": "Brooklyn Nets",
  "bulls": "Chicago Bulls", "mavericks": "Dallas Mavericks",
  "mavs": "Dallas Mavericks", "grizzlies": "Memphis Grizzlies",
  "kings": "Sacramento Kings", "pelicans": "New Orleans Pelicans",
  "timberwolves": "Minnesota Timberwolves", "wolves": "Minnesota Timberwolves",
  "thunder": "Oklahoma City Thunder", "okc": "Oklahoma City Thunder",
  "rockets": "Houston Rockets", "spurs": "San Antonio Spurs",
  "magic": "Orlando Magic", "hawks": "Atlanta Hawks",
  "hornets": "Charlotte Hornets", "pistons": "Detroit Pistons",
  "pacers": "Indiana Pacers", "wizards": "Washington Wizards",
  "blazers": "Portland Trail Blazers", "trail blazers": "Portland Trail Blazers",
  "jazz": "Utah Jazz", "raptors": "Toronto Raptors",
  "cavaliers": "Cleveland Cavaliers", "cavs": "Cleveland Cavaliers",
};

const NFL_TEAMS: Record<string, string> = {
  "chiefs": "Kansas City Chiefs", "eagles": "Philadelphia Eagles",
  "bills": "Buffalo Bills", "ravens": "Baltimore Ravens",
  "cowboys": "Dallas Cowboys", "niners": "San Francisco 49ers",
  "49ers": "San Francisco 49ers", "packers": "Green Bay Packers",
  "lions": "Detroit Lions", "texans": "Houston Texans",
  "commanders": "Washington Commanders", "dolphins": "Miami Dolphins",
  "broncos": "Denver Broncos", "raiders": "Las Vegas Raiders",
  "jets": "New York Jets", "giants": "New York Giants",
  "bears": "Chicago Bears", "vikings": "Minnesota Vikings",
  "colts": "Indianapolis Colts", "jaguars": "Jacksonville Jaguars",
  "titans": "Tennessee Titans", "bengals": "Cincinnati Bengals",
  "browns": "Cleveland Browns", "steelers": "Pittsburgh Steelers",
  "saints": "New Orleans Saints", "buccaneers": "Tampa Bay Buccaneers",
  "bucs": "Tampa Bay Buccaneers", "panthers": "Carolina Panthers",
  "falcons": "Atlanta Falcons", "cardinals": "Arizona Cardinals",
  "seahawks": "Seattle Seahawks", "rams": "Los Angeles Rams",
  "chargers": "Los Angeles Chargers",
};

const TEAM_MAPS: Record<string, Record<string, string>> = {
  NBA: NBA_TEAMS,
  NFL: NFL_TEAMS,
};

function extractTeamNames(
  message: string,
  league: string
): { team1: string | null; team2: string | null } {
  const m = message.toLowerCase();
  const teamMap = TEAM_MAPS[league] || {};
  const sortedKeys = Object.keys(teamMap).sort((a, b) => b.length - a.length);

  const found: string[] = [];
  let remaining = m;

  for (const key of sortedKeys) {
    const pattern = new RegExp(`\\b${key.replace(/\s+/g, "\\s+")}\\b`);
    if (pattern.test(remaining)) {
      const dbName = teamMap[key];
      if (!found.includes(dbName)) {
        found.push(dbName);
        remaining = remaining.replace(pattern, "___");
      }
      if (found.length >= 2) break;
    }
  }

  return { team1: found[0] || null, team2: found[1] || null };
}

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
4. Do NOT name databases, APIs, providers, or cite specific data sources. Present information naturally.

═══════════════════════════════════════════════════════════
CRITICAL RULES - ZERO HALLUCINATION MODE
═══════════════════════════════════════════════════════════

2. NEVER INVENT MARKET DATA: Do not make up odds, lines, spreads, totals, or prop numbers. If you're uncertain, say so.

3. NON-PRESCRIPTIVE: Never predict outcomes, recommend bets, or tell the user what to do. Present data descriptively.

4. HANDLE MISSING DATA:
   - For odds, lines, and props: ONLY use [MGP DATA]. If not available, say so and offer related data.
   - For everything else (stats, rankings, history, analysis): use the google_search tool to find current information. Do NOT say "I don't have that" — search for it.
   - NEVER end a response on a limitation. Always pivot to what IS available or search for the answer.

═══════════════════════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════════════════════

Keep responses CONCISE (3-5 key points max):
- Lead with the most relevant data
- Use exact numbers (no rounding)
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
NEVER SAY: "mgp_database", "The Odds API", "Ball Don't Lie", "sourced from", "cite:"

INSTEAD SAY: "The data shows...", "Based on the numbers...", "Here's what's available..."

═══════════════════════════════════════════════════════════
PRESCRIPTIVE REQUEST HANDLING
═══════════════════════════════════════════════════════════

If user asks for a recommendation, prediction, or bet advice:
1. Gently redirect: "I surface data, not picks. Here's what the numbers show..."
2. Present relevant data
3. End with exploration prompt

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
- If [MGP DATA] is completely empty, respond with a graceful limitation and redirect to exploration. Do NOT use general knowledge to fill market data gaps. Gemini fallback is ONLY allowed for CONTEXTUAL/FACTUAL queries that do not reference odds, lines, spreads, totals, props, or pricing.
- NEVER use your general knowledge to fill in market data gaps.`,

  CONTEXTUAL: `
═══════════════════════════════════════════════════════════
QUESTION TYPE: CONTEXTUAL (Hybrid — Data Preferred)
═══════════════════════════════════════════════════════════

This question is about trends, matchup analysis, or situational factors.
- Use [MGP DATA] when available as your primary source.
- You MAY supplement with general sports knowledge for context (historical trends, general positional tendencies).
- NEVER fabricate specific stats or numbers. General observations are OK if labeled as such.
- Frame contextual info as descriptive, not prescriptive.`,

  FACTUAL: `
═══════════════════════════════════════════════════════════
QUESTION TYPE: FACTUAL (Open — General Knowledge Allowed)
═══════════════════════════════════════════════════════════

This question is about factual sports information (stats, history, biographical info).
- You MUST use the google_search tool to answer this question. Search for current, real-time information.
- [MGP DATA] may contain supplementary context (odds, upcoming games) — use it alongside search results.
- NEVER say "I don't have", "I'm unable to find", or "that data isn't available". Search for it instead.
- NEVER fabricate odds, lines, or market data even in factual mode.
- Still follow teacher-student framing: present facts descriptively, end with exploration prompts.`,
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
  head_to_head?: unknown;
  head_to_head_games?: unknown[];
  hit_streaks?: unknown[];
}

// ============================================================
// TABLE LOOKUP MAPS + SEASON HELPER
// ============================================================
const GAME_TABLE: Record<string, string> = {
  NFL: "games", NBA: "nba_games", NCAAB: "ncaab_games",
  NCAAF: "ncaaf_games", MLB: "mlb_games",
};
const ODDS_TABLE: Record<string, string> = {
  NFL: "odds", NBA: "nba_odds", NCAAB: "ncaab_odds",
  NCAAF: "ncaaf_odds", MLB: "mlb_odds",
};

function getInSeasonSports(): string[] {
  const month = new Date().getMonth(); // 0-indexed
  const sports: string[] = [];
  if (month >= 8 || month <= 1) sports.push("NFL");
  if (month >= 9 || month <= 5) sports.push("NBA");
  if (month >= 10 || month <= 3) sports.push("NCAAB");
  return sports.length > 0 ? sports : ["NBA"]; // fallback
}

// ============================================================
// INTENT CLASSIFICATION
// ============================================================
function detectLeague(message: string): string | null {
  const m = message.toLowerCase();
  if (/\b(nfl|football|super\s*bowl|superbowl|chiefs|eagles|bills|ravens|cowboys|niners|packers|lions|texans|commanders|dolphins|broncos|raiders|jets|giants|bears|vikings|colts|jaguars|titans|bengals|browns|steelers|saints|buccaneers|panthers|falcons|cardinals|seahawks|rams|chargers)\b/.test(m)) return "NFL";
  if (/\b(nba|lakers|celtics|warriors|bucks|heat|nuggets|suns|clippers|sixers|knicks|nets|bulls|mavericks|grizzlies|kings|pelicans|timberwolves|thunder|rockets|spurs|magic|hawks|hornets|pistons|pacers|wizards|blazers|jazz|raptors|cavaliers)\b/.test(m)) return "NBA";
  if (/\b(ncaab|ncaamb|college basketball|march madness|duke|kentucky|kansas|gonzaga|purdue|uconn|houston|tennessee|auburn|alabama|arizona|baylor|creighton|marquette|illinois|illini|michigan state|michigan|ohio state|iowa state|iowa|wisconsin|badgers|minnesota|indiana|hoosiers|penn state|maryland|terps|rutgers|nebraska|northwestern|oregon|washington|ucla|usc|florida|gators|georgia|lsu|ole miss|mississippi state|arkansas|razorbacks|missouri|texas a&m|a&m|south carolina|vanderbilt|oklahoma|texas|iowa state|cyclones|texas tech|tcu|cincinnati|bearcats|ucf|byu|west virginia|oklahoma state|colorado|arizona state|utah|kansas state|north carolina|unc|tar heels|virginia tech|virginia|wake forest|clemson|louisville|pitt|pittsburgh|syracuse|notre dame|boston college|georgia tech|stanford|smu|villanova|seton hall|xavier|butler|depaul|georgetown|hoyas|providence|st johns|dayton|memphis|san diego state|wichita state)\b/.test(m)) return "NCAAB";
  if (/\b(ncaaf|college football|cfb|playoff|buckeyes|crimson tide|bulldogs|wolverines|longhorns|gators|seminoles|tigers|sooners)\b/.test(m)) return "NCAAF";
  if (/\b(mlb|baseball|yankees|dodgers|braves|astros|phillies|padres|mets|orioles|guardians|rangers|mariners|twins|rays|diamondbacks|cubs|cardinals|red sox|giants|angels|athletics|royals|brewers|pirates|reds|tigers|nationals|rockies|marlins|white sox)\b/.test(m)) return "MLB";
  return null; // No sport keyword detected — will query user's active sports
}

function detectIntent(message: string): string {
  const m = message.toLowerCase();
  if (/\b(props?|player prop|over\s*\/?\s*under\s+\d|o\/u\s+\d)\b/.test(m)) return "props";
  if (/\b(odds|line|spread|total|over|under|moneyline|ml|ats|point spread)\b/.test(m)) return "odds";
  // Head-to-head: must come before "results" since "record vs" shouldn't fall into 7-day window results
  if (/\b(record\s+(vs|against|versus|this)|head[\s-]?to[\s-]?head|h2h|season\s+series|how\s+many\s+(wins?|losses?|times?)\s+(vs|against|versus)|(series|matchup)\s+(record|history)|(.+)\s+vs\s+(.+)\s+this\s+season)\b/.test(m)) return "head_to_head";
  if (/\b(who won|final score|result|score of|did .+ (win|lose|cover|beat)|last night|yesterday|recap|box score)\b/.test(m)) return "results";
  if (/\b(game|schedule|when|playing|tonight|today|upcoming|matchup)\b/.test(m)) return "games";
  if (/\b(player|stats?|average|scoring|points|yards|rushing|passing|receiving)\b/.test(m)) return "player_stats";
  if (/\b(injur|out|questionable|doubtful|status|health)\b/.test(m)) return "injuries";
  if (/\b(favou?red|favou?rite|underdog|who.*(fav|dog))\b/.test(m)) return "favored";
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
  intent: string,
  message: string,
  questionType: QuestionType = "FACTUAL"
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
  if (intent === "odds" || intent === "general" || intent === "games" || intent === "results" || intent === "props" || intent === "favored") {
    const oddsTable = league === "NFL" ? "odds" : 
                      league === "NBA" ? "nba_odds" :
                      league === "NCAAB" ? "ncaab_odds" :
                      league === "NCAAF" ? "ncaaf_odds" :
                      league === "MLB" ? "mlb_odds" : null;

    if (oddsTable) {
      try {
        // Scope odds to already-fetched upcoming games when available
        const gameIds = (fetchedData.games || []).map((g: any) => g.id);

        let odds: any[] | null = null;
        if (gameIds.length > 0) {
          const { data } = await supabase
            .from(oddsTable)
            .select("*")
            .in("game_id", gameIds)
            .order("updated_at", { ascending: false })
            .limit(40);  // Multiple books per game
          odds = data;
        } else {
          // Fallback: get most recent odds with recency ordering
          const { data } = await supabase
            .from(oddsTable)
            .select("*")
            .order("updated_at", { ascending: false })
            .limit(20);
          odds = data;
        }

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

  // Hit-streak questions MUST be answered from our own database — it's the
  // exact data the dashboard shows, so chat and UI can never contradict each
  // other. Runs for ANY question type (web results routinely serve stale
  // prior-season numbers for "active streak" questions).
  if (/hit(ting)?[ -]?streaks?|hot\s+(hitter|bat)|longest\s+(active\s+)?streak|on[ -]base\s+streak/i.test(message)) {
    try {
      const season = now.getFullYear();
      const { data: streaks } = await supabase
        .from("player_season_stats")
        .select("player_id, hit_streak, hit_streak_avg, batting_avg")
        .eq("sport", "MLB")
        .eq("season", season)
        .gte("hit_streak", 3)
        .order("hit_streak", { ascending: false })
        .limit(10);

      if (streaks?.length) {
        const ids = streaks.map((s: any) => s.player_id);
        const { data: streakPlayers } = await supabase
          .from("players")
          .select("id, name, team_abbr")
          .in("id", ids);
        const pmap = new Map((streakPlayers || []).map((p: any) => [p.id, p]));
        fetchedData.hit_streaks = streaks
          .map((s: any) => {
            const p = pmap.get(s.player_id);
            if (!p) return null;
            return {
              name: p.name,
              team: p.team_abbr,
              streak: s.hit_streak,
              streak_avg: s.hit_streak_avg,
              season_avg: s.batting_avg,
            };
          })
          .filter(Boolean);
        sources.push({
          provider: "mgp_database",
          endpoint: "MLB/hit_streaks",
          fetched_at: now.toISOString(),
          ids: {},
        });
      }
    } catch (e) {
      console.error("Error fetching hit streaks:", e);
    }
  }

  // Fetch player stats if relevant — skip for FACTUAL questions where
  // Gemini + Google Search is more accurate than our partial roster data
  if ((intent === "player_stats" || intent === "general") && questionType !== "FACTUAL") {
    try {
      const sport = league === "NCAAB" ? "NCAAB" : league;
      const { team1 } = extractTeamNames(message, league);

      let query = supabase
        .from("players")
        .select("*, player_season_stats(*)")
        .eq("sport", sport);

      if (team1) {
        // Team-specific: all players for this team (no is_featured filter)
        query = query.eq("team_name", team1).limit(15);
      } else {
        // General: featured players across the league
        query = query.eq("is_featured", true).limit(10);
      }

      const { data: players } = await query;

      if (players?.length) {
        // Sort by PPG descending so leading scorers come first
        players.sort((a: any, b: any) => {
          const aPPG = a.player_season_stats?.[0]?.points_per_game || 0;
          const bPPG = b.player_season_stats?.[0]?.points_per_game || 0;
          return bPPG - aPPG;
        });
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

  // Fetch head-to-head data
  if (intent === "head_to_head" || intent === "favored") {
    const { team1, team2 } = extractTeamNames(message, league);

    if (team1 && team2) {
      // NBA: use the existing RPC function
      if (league === "NBA") {
        try {
          const { data: h2hData, error: h2hError } = await supabase
            .rpc("get_nba_head_to_head", { p_team1: team1, p_team2: team2 });

          if (!h2hError && h2hData) {
            fetchedData.head_to_head = h2hData;
            sources.push({
              provider: "mgp_database",
              endpoint: `${league}/head_to_head`,
              fetched_at: now.toISOString(),
              ids: { team1, team2 },
            });
          }
        } catch (e) {
          console.error("Error fetching NBA H2H RPC:", e);
        }
      }

      // All leagues: fetch game-by-game results for the matchup
      try {
        const { data: gamesA } = await supabase
          .from(gameTable)
          .select("*")
          .eq("is_final", true)
          .eq("home_team_name", team1)
          .eq("visitor_team_name", team2)
          .order("date", { ascending: false });

        const { data: gamesB } = await supabase
          .from(gameTable)
          .select("*")
          .eq("is_final", true)
          .eq("home_team_name", team2)
          .eq("visitor_team_name", team1)
          .order("date", { ascending: false });

        const h2hGames = [...(gamesA || []), ...(gamesB || [])].sort(
          (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        if (h2hGames.length > 0) {
          fetchedData.head_to_head_games = h2hGames;

          // Build summary for non-NBA leagues (NBA already has RPC data)
          if (!fetchedData.head_to_head) {
            let team1Wins = 0, team2Wins = 0;
            for (const g of h2hGames as any[]) {
              const homeWon = (g.home_score ?? 0) > (g.away_score ?? 0);
              if (
                (g.home_team_name === team1 && homeWon) ||
                (g.visitor_team_name === team1 && !homeWon)
              ) {
                team1Wins++;
              } else {
                team2Wins++;
              }
            }
            fetchedData.head_to_head = {
              team1, team2,
              team1_wins: team1Wins,
              team2_wins: team2Wins,
              total_games: team1Wins + team2Wins,
              summary: `${team1Wins}-${team2Wins} this season`,
            };
          }

          sources.push({
            provider: "mgp_database",
            endpoint: `${league}/h2h_games`,
            fetched_at: now.toISOString(),
            ids: { team1, team2 },
          });
        }
      } catch (e) {
        console.error("Error fetching H2H games:", e);
      }

      // Also fetch upcoming games between the two teams
      try {
        const { data: upcomingA } = await supabase
          .from(gameTable)
          .select("*")
          .eq("home_team_name", team1)
          .eq("visitor_team_name", team2)
          .gte("date", now.toISOString())
          .order("date", { ascending: true })
          .limit(3);

        const { data: upcomingB } = await supabase
          .from(gameTable)
          .select("*")
          .eq("home_team_name", team2)
          .eq("visitor_team_name", team1)
          .gte("date", now.toISOString())
          .order("date", { ascending: true })
          .limit(3);

        const upcomingH2H = [...(upcomingA || []), ...(upcomingB || [])].sort(
          (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        if (upcomingH2H.length > 0) {
          fetchedData.games = [...(fetchedData.games || []), ...upcomingH2H];
        }
      } catch (e) {
        console.error("Error fetching upcoming H2H games:", e);
      }

      // If no H2H games found, provide each team's recent record as context
      if (!fetchedData.head_to_head_games?.length && team1 && team2) {
        try {
          for (const teamName of [team1, team2]) {
            const { data: teamGames } = await supabase
              .from(gameTable)
              .select("*")
              .eq("is_final", true)
              .or(`home_team_name.eq.${teamName},visitor_team_name.eq.${teamName}`)
              .order("date", { ascending: false })
              .limit(5);

            if (teamGames?.length) {
              if (!fetchedData.results) fetchedData.results = [];
              fetchedData.results.push(...teamGames);
            }
          }

          // Set a placeholder H2H summary
          fetchedData.head_to_head = {
            team1, team2,
            team1_wins: 0, team2_wins: 0, total_games: 0,
            summary: "No meetings this season yet",
          };
        } catch (e) {
          console.error("Error fetching team fallback for H2H:", e);
        }
      }
    }
  }

  return { data: fetchedData, sources };
}

// ============================================================
// MULTI-SPORT DATA FETCHING (when no specific league detected)
// ============================================================
interface MultiSportData {
  gamesBySport: Record<string, unknown[]>;
  oddsBySport: Record<string, unknown[]>;
}

async function fetchMultiSportData(
  supabase: any,
  sportsToQuery: string[],
  intent: string,
): Promise<{ data: MultiSportData; formattedPrompt: string; sources: SourceRef[] }> {
  const now = new Date();
  const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const gamesBySport: Record<string, unknown[]> = {};
  const oddsBySport: Record<string, unknown[]> = {};
  const sources: SourceRef[] = [];

  // Fetch games + odds for each sport in parallel
  await Promise.all(sportsToQuery.map(async (sport) => {
    const gameTable = GAME_TABLE[sport];
    const oddsTable = ODDS_TABLE[sport];
    if (!gameTable) return;

    try {
      const { data: games } = await supabase
        .from(gameTable)
        .select("*")
        .gte("date", now.toISOString())
        .lte("date", in48Hours.toISOString())
        .order("date", { ascending: true })
        .limit(10);

      if (games?.length) {
        gamesBySport[sport] = games;
        sources.push({
          provider: "mgp_database",
          endpoint: `${sport}/games`,
          fetched_at: now.toISOString(),
          ids: {},
        });

        // Fetch odds scoped to these games
        if (oddsTable && (intent === "odds" || intent === "general" || intent === "games" || intent === "favored")) {
          const gameIds = games.map((g: any) => g.id);
          const { data: odds } = await supabase
            .from(oddsTable)
            .select("*")
            .in("game_id", gameIds)
            .order("updated_at", { ascending: false })
            .limit(40);

          if (odds?.length) {
            oddsBySport[sport] = odds;
            sources.push({
              provider: "the_odds_api",
              endpoint: `${sport}/odds`,
              fetched_at: now.toISOString(),
              ids: {},
            });
          }
        }
      }
    } catch (e) {
      console.error(`Error fetching ${sport} games/odds:`, e);
    }

    // Fetch recent results for "results" intent
    if (intent === "results" || intent === "general") {
      try {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const { data: results } = await supabase
          .from(gameTable)
          .select("*")
          .eq("is_final", true)
          .gte("date", sevenDaysAgo.toISOString())
          .order("date", { ascending: false })
          .limit(10);

        if (results?.length) {
          if (!gamesBySport[`${sport}_results`]) gamesBySport[`${sport}_results`] = [];
          gamesBySport[`${sport}_results`] = results;
        }
      } catch (e) {
        console.error(`Error fetching ${sport} results:`, e);
      }
    }
  }));

  // Format the multi-sport data for the prompt
  let prompt = "\n[MGP DATA — MULTI-SPORT]\n";
  const totalGames = Object.values(gamesBySport).reduce((sum, g) => sum + g.filter(() => true).length, 0);

  if (totalGames === 0) {
    prompt += `No upcoming games found for ${sportsToQuery.join(", ")} in the next 48 hours.\nYou are in FACTUAL mode with Google Search enabled — answer using your knowledge and search results.\n`;
    return { data: { gamesBySport, oddsBySport }, formattedPrompt: prompt, sources };
  }

  for (const sport of sportsToQuery) {
    const games = gamesBySport[sport];
    if (!games?.length) continue;

    const gameMap = new Map((games as any[]).map((g: any) => [g.id, g]));

    prompt += `\n📅 UPCOMING ${sport} GAMES:\n`;
    (games as any[]).slice(0, 8).forEach((g: any) => {
      const date = new Date(g.date).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
      });
      prompt += `• ${g.visitor_team_name} @ ${g.home_team_name} — ${date} ET\n`;
    });

    const odds = oddsBySport[sport];
    if (odds?.length) {
      prompt += `\n📊 ${sport} ODDS:\n`;
      const oddsByGame = new Map<string, any[]>();
      for (const o of odds as any[]) {
        if (!oddsByGame.has(o.game_id)) oddsByGame.set(o.game_id, []);
        oddsByGame.get(o.game_id)!.push(o);
      }
      for (const [gameId, gameOdds] of oddsByGame) {
        const game = gameMap.get(gameId);
        const matchup = game
          ? `${game.visitor_team_name} @ ${game.home_team_name}`
          : "Unknown Matchup";
        const freshest = gameOdds[0];
        const age = getAgeString(freshest.updated_at);
        prompt += `\n${matchup} (updated ${age}):\n`;
        for (const o of gameOdds.slice(0, 2)) {
          prompt += `  • ${o.sportsbook}: Spread ${formatSpread(o.spread_value)}, ML Home ${o.moneyline_home || "—"} / Away ${o.moneyline_away || "—"}, Total O/U ${o.total_value || "—"}\n`;
        }
      }
    }

    // Results
    const results = gamesBySport[`${sport}_results`];
    if (results?.length) {
      prompt += `\n🏆 RECENT ${sport} RESULTS:\n`;
      (results as any[]).slice(0, 5).forEach((g: any) => {
        const date = new Date(g.date).toLocaleDateString("en-US", {
          weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York",
        });
        prompt += `• ${date}: ${g.visitor_team_name} ${g.away_score ?? "?"} @ ${g.home_team_name} ${g.home_score ?? "?"} (FINAL)\n`;
      });
    }
  }

  return { data: { gamesBySport, oddsBySport }, formattedPrompt: prompt, sources };
}

function getAgeString(updatedAt: string): string {
  const diffMs = Date.now() - new Date(updatedAt).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

function formatSpread(value: number | null): string {
  if (value == null) return "—";
  return value > 0 ? `+${value}` : `${value}`;
}

function formatDataForPrompt(data: FetchedData, sources: SourceRef[], intent?: string, league?: string): string {
  if (Object.keys(data).length === 0 || Object.values(data).every(v => !v || (Array.isArray(v) ? v.length === 0 : false))) {
    return `\n[MGP DATA]\nNo matching data found in the database for this ${intent || "general"} query about ${league || "sports"}.\nYou are in FACTUAL mode with Google Search enabled — answer using your knowledge and search results.\nDo NOT say "I don't have that data." Instead, provide what you know and note if live DB data would add precision.\n`;
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

  if (data.head_to_head) {
    const h2h = data.head_to_head as any;
    prompt += `\n🆚 HEAD-TO-HEAD: ${h2h.team1} vs ${h2h.team2}${h2h.season ? ` (${h2h.season})` : ""}\n`;
    if (h2h.total_games === 0) {
      prompt += `No head-to-head meetings this season. Each team's recent results are shown below.\n`;
    } else {
      prompt += `Season Series: ${h2h.team1} ${h2h.team1_wins} - ${h2h.team2_wins} ${h2h.team2}\n`;
      prompt += `Total games played: ${h2h.total_games}\n`;
    }

    if (data.head_to_head_games?.length) {
      prompt += "\nGame-by-game results:\n";
      (data.head_to_head_games as any[]).forEach((g: any) => {
        const date = new Date(g.date).toLocaleDateString("en-US", {
          weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York"
        });
        const homeScore = g.home_score ?? "?";
        const awayScore = g.away_score ?? "?";
        const winner = (g.home_score ?? 0) > (g.away_score ?? 0)
          ? g.home_team_name
          : g.visitor_team_name;
        prompt += `  • ${date}: ${g.visitor_team_name} ${awayScore} @ ${g.home_team_name} ${homeScore} — ${winner} win\n`;
      });
    }
  }

  if (data.odds?.length) {
    prompt += "\n📊 CURRENT ODDS:\n";
    // Build game lookup from fetched games
    const gameMap = new Map((data.games || []).map((g: any) => [g.id, g]));

    // Group odds by game
    const oddsByGame = new Map<string, any[]>();
    for (const o of data.odds as any[]) {
      const key = o.game_id;
      if (!oddsByGame.has(key)) oddsByGame.set(key, []);
      oddsByGame.get(key)!.push(o);
    }

    let oldestUpdate: string | null = null;
    for (const [gameId, gameOdds] of oddsByGame) {
      const game = gameMap.get(gameId);
      const matchup = game
        ? `${game.visitor_team_name} @ ${game.home_team_name}`
        : "Unknown Matchup";
      const freshest = gameOdds[0]; // Already sorted by updated_at desc
      const age = getAgeString(freshest.updated_at);
      if (!oldestUpdate || freshest.updated_at < oldestUpdate) {
        oldestUpdate = freshest.updated_at;
      }

      prompt += `\n${matchup} (updated ${age}):\n`;
      for (const o of gameOdds.slice(0, 4)) { // Max 4 books per game
        prompt += `  • ${o.sportsbook}: Spread ${formatSpread(o.spread_value)}, ML Home ${o.moneyline_home || "—"} / Away ${o.moneyline_away || "—"}, Total O/U ${o.total_value || "—"}\n`;
      }
    }

    // Staleness warning
    if (oldestUpdate) {
      const diffMs = Date.now() - new Date(oldestUpdate).getTime();
      if (diffMs > 6 * 60 * 60 * 1000) {
        prompt += `\n⚠ Odds data last updated over 6 hours ago. Lines may have moved since then.\n`;
      }
    }
  }

  if (data.players?.length) {
    prompt += "\n👤 PLAYER STATS (partial roster — not all team players included):\n";
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

  if (data.hit_streaks?.length) {
    prompt += "\n🔥 ACTIVE MLB HIT STREAKS — AUTHORITATIVE, LIVE FROM THE MGP DATABASE:\n";
    prompt += "(This is the exact data shown on the MGP dashboard. For any question about current/active hit streaks, use ONLY these numbers — do NOT use web search results or memory, which routinely return stale prior-season figures.)\n";
    (data.hit_streaks as any[]).forEach((s) => {
      const sAvg = s.streak_avg != null ? `, batting ${Number(s.streak_avg).toFixed(3).replace(/^0/, "")} during it` : "";
      const seasonAvg = s.season_avg != null ? ` (season ${Number(s.season_avg).toFixed(3).replace(/^0/, "")})` : "";
      prompt += `• ${s.name}${s.team ? ` (${s.team})` : ""} — ${s.streak}-game hit streak${sAvg}${seasonAvg}\n`;
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

  return prompt;
}

// ============================================================
// MAIN HANDLER
// ============================================================
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

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
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

    if (!ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY not configured");
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

    // Rate limit check
    if (!checkRateLimit(user.id)) {
      console.warn(`[gemini-chat] Rate limit exceeded for user ${user.id}`);
      return new Response(
        JSON.stringify({ error: "Too many requests. Please wait a moment before trying again." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[gemini-chat] Authenticated user: ${user.id}`);

    const { messages, activeSports: clientActiveSports, webSearchEnabled = false } = await req.json() as {
      messages: ChatMessage[];
      activeSports?: string[];
      webSearchEnabled?: boolean;
    };
    const lastUserMessage = messages.filter(m => m.role === "user").pop()?.content || "";

    console.log("Processing chat request with", messages.length, "messages");

    // Detect league, intent, and question type from conversation
    const league = detectLeague(lastUserMessage);
    const intent = detectIntent(lastUserMessage);
    const questionType = classifyQuestionType(lastUserMessage);

    // Determine which sports to query when no keyword match
    const sportsToQuery = league
      ? [league]
      : (clientActiveSports?.length ? clientActiveSports : getInSeasonSports());

    console.log(`[gemini-chat] Detected league: ${league || "AUTO"}, sportsToQuery: [${sportsToQuery.join(", ")}], intent: ${intent}, questionType: ${questionType}`);

    // Fetch relevant data from our database
    let dataPrompt: string;
    let sources: SourceRef[];

    if (league) {
      // Single-sport path (unchanged behavior)
      const result = await fetchRelevantData(supabase, league, intent, lastUserMessage, questionType);
      dataPrompt = formatDataForPrompt(result.data, result.sources, intent, league);
      sources = result.sources;
    } else {
      // Multi-sport path: query all active/in-season sports
      const result = await fetchMultiSportData(supabase, sportsToQuery, intent);
      dataPrompt = result.formattedPrompt;
      sources = result.sources;
    }

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
DETECTED LEAGUE: ${league || `AUTO — querying: ${sportsToQuery.join(", ")}`}

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

    // Build conversation for Claude — trim to last 20 messages to balance context vs cost
    const recentMessages = messages.length > 20 ? messages.slice(-20) : messages;
    const anthropicMessages = recentMessages.map((msg) => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    }));

    // Auto-enable web search for FACTUAL and CONTEXTUAL questions so Claude can fetch
    // current stats, weather, real-time matchup data, and other live information
    const useSearch = webSearchEnabled || questionType === "FACTUAL" || questionType === "CONTEXTUAL";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        temperature: 0.4,
        system: fullSystemInstruction,
        messages: anthropicMessages,
        ...(useSearch
          ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }] }
          : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error:", response.status, errorText);

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
    const contentBlocks: Array<{ type: string; text?: string; name?: string; citations?: Array<{ type: string; url?: string; title?: string }> }> = data.content || [];

    const textBlocks = contentBlocks.filter((block) => block.type === "text");
    let responseText =
      textBlocks.map((b) => b.text ?? "").join("") ||
      "I couldn't generate a response. Please try again.";

    // Detect truncated responses
    if (data.stop_reason === "max_tokens") {
      console.warn("[gemini-chat] Response truncated due to max_tokens");
      responseText += "\n\n*Response was trimmed for length. Try asking a more specific question.*";
    }

    // Build sources array from any web_search citations
    // MGP internal sources are not exposed to the consumer.
    // Only web grounding sources (external web results) are shown.
    const responseSources: { title: string; url: string }[] = [];
    let webSearchUseCount = 0;

    for (const block of contentBlocks) {
      if (block.type === "server_tool_use" && block.name === "web_search") {
        webSearchUseCount++;
      }
      if (block.type === "text" && Array.isArray(block.citations)) {
        for (const citation of block.citations) {
          if (citation.url && !responseSources.some((s) => s.url === citation.url)) {
            responseSources.push({
              title: citation.title || citation.url,
              url: citation.url,
            });
          }
        }
      }
    }

    console.log(`[gemini-chat] Web search ${useSearch ? "enabled" : "disabled"}, queries: ${webSearchUseCount}, sources: ${responseSources.length}`);

    return new Response(
      JSON.stringify({
        content: responseText,
        sources: responseSources,
        questionType,
        routerMode: "EDGE_PRIMARY",
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
