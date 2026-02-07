import { supabase } from "@/integrations/supabase/client";
import { handleNbaPropsQuery, shouldHandleNbaPropsQuery } from "./nbaPropsHandler";

// Known NBA player names for quick detection
const KNOWN_NBA_PLAYERS = [
  // Stars
  "lebron james", "stephen curry", "kevin durant", "giannis antetokounmpo",
  "jayson tatum", "luka doncic", "nikola jokic", "joel embiid", "ja morant",
  "anthony davis", "jimmy butler", "damian lillard", "devin booker",
  "donovan mitchell", "trae young", "zion williamson", "anthony edwards",
  "lamelo ball", "paolo banchero", "victor wembanyama", "shai gilgeous-alexander",
  "karl-anthony towns", "domantas sabonis", "de'aaron fox", "tyrese haliburton",
  "tyrese maxey", "chet holmgren", "scottie barnes", "evan mobley",
  "jaren jackson jr", "bam adebayo", "jaylen brown", "paul george",
  "kawhi leonard", "russell westbrook", "kyrie irving", "james harden",
  "chris paul", "draymond green", "klay thompson", "andrew wiggins",
];

// NBA team aliases
const NBA_TEAM_ALIASES: Record<string, string[]> = {
  "Boston Celtics": ["celtics", "boston"],
  "Los Angeles Lakers": ["lakers", "la lakers", "los angeles lakers"],
  "Golden State Warriors": ["warriors", "gsw", "golden state", "dubs"],
  "Miami Heat": ["heat", "miami"],
  "Brooklyn Nets": ["nets", "brooklyn"],
  "New York Knicks": ["knicks", "new york", "nyk"],
  "Philadelphia 76ers": ["sixers", "76ers", "philly", "philadelphia"],
  "Milwaukee Bucks": ["bucks", "milwaukee"],
  "Denver Nuggets": ["nuggets", "denver"],
  "Phoenix Suns": ["suns", "phoenix"],
  "Dallas Mavericks": ["mavs", "mavericks", "dallas"],
  "Memphis Grizzlies": ["grizzlies", "memphis"],
  "Cleveland Cavaliers": ["cavs", "cavaliers", "cleveland"],
  "Sacramento Kings": ["kings", "sacramento"],
  "Oklahoma City Thunder": ["thunder", "okc", "oklahoma city"],
  "Minnesota Timberwolves": ["timberwolves", "wolves", "minnesota"],
  "New Orleans Pelicans": ["pelicans", "new orleans"],
  "Atlanta Hawks": ["hawks", "atlanta"],
  "Chicago Bulls": ["bulls", "chicago"],
  "Toronto Raptors": ["raptors", "toronto"],
  "Indiana Pacers": ["pacers", "indiana"],
  "Orlando Magic": ["magic", "orlando"],
  "Charlotte Hornets": ["hornets", "charlotte"],
  "Detroit Pistons": ["pistons", "detroit"],
  "Washington Wizards": ["wizards", "washington"],
  "Houston Rockets": ["rockets", "houston"],
  "San Antonio Spurs": ["spurs", "san antonio"],
  "Utah Jazz": ["jazz", "utah"],
  "Portland Trail Blazers": ["blazers", "portland", "trail blazers"],
  "Los Angeles Clippers": ["clippers", "la clippers"],
};

interface NBAPlayer {
  id: string;
  name: string;
  position: string | null;
  team_name: string | null;
  team_abbr: string | null;
  injury_status: string | null;
}

interface NBASeasonStats {
  points_per_game: number | null;
  rebounds_per_game: number | null;
  assists_per_game: number | null;
  steals_per_game: number | null;
  blocks_per_game: number | null;
  minutes_per_game: number | null;
  field_goal_pct: number | null;
  three_point_pct: number | null;
  free_throw_pct: number | null;
  turnovers_per_game: number | null;
  games_played: number | null;
  season: number;
}

interface NBAGameLog {
  game_date: string;
  opponent_name?: string | null;
  opponent_abbr?: string | null;
  result?: string | null;
  minutes?: number | null;
  points?: number | null;
  rebounds?: number | null;
  assists?: number | null;
  steals?: number | null;
  blocks?: number | null;
  turnovers?: number | null;
  fg_made?: number | null;
  fg_attempted?: number | null;
  three_made?: number | null;
  three_attempted?: number | null;
}

// Check if query is NBA-related
export function isNbaQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  
  // Check for explicit NBA mention
  if (/\bnba\b/.test(lowerQuery) || /\bbasketball\b/.test(lowerQuery)) {
    return true;
  }
  
  // Check for known players
  for (const player of KNOWN_NBA_PLAYERS) {
    if (lowerQuery.includes(player) || lowerQuery.includes(player.split(" ").pop()!)) {
      return true;
    }
  }
  
  // Check for team names
  for (const aliases of Object.values(NBA_TEAM_ALIASES)) {
    if (aliases.some(alias => lowerQuery.includes(alias))) {
      return true;
    }
  }
  
  return false;
}

// Extract player name from query
function extractNbaPlayerName(query: string): string | null {
  const lowerQuery = query.toLowerCase();
  
  // Check known players
  for (const player of KNOWN_NBA_PLAYERS) {
    if (lowerQuery.includes(player)) {
      return player;
    }
    // Check last name only
    const lastName = player.split(" ").pop()!;
    if (lowerQuery.includes(lastName) && lastName.length > 4) {
      return player;
    }
  }
  
  return null;
}

// Extract team name from query
function extractNbaTeamName(query: string): string | null {
  const lowerQuery = query.toLowerCase();
  
  for (const [fullName, aliases] of Object.entries(NBA_TEAM_ALIASES)) {
    if (aliases.some(alias => lowerQuery.includes(alias))) {
      return fullName;
    }
  }
  
  return null;
}

// Detect query type
function detectQueryType(query: string): "stats" | "game_log" | "props" | "game" | "leaders" | "unknown" {
  const lowerQuery = query.toLowerCase();
  
  if (shouldHandleNbaPropsQuery(query)) return "props";
  if (/last\s*\d*\s*games?/.test(lowerQuery) || /game log/.test(lowerQuery) || /recent/.test(lowerQuery)) return "game_log";
  if (/leader/.test(lowerQuery) || /top\s*\d+/.test(lowerQuery) || /best\s+scorer/.test(lowerQuery)) return "leaders";
  if (/game|tonight|today|schedule|matchup/.test(lowerQuery) && !extractNbaPlayerName(query)) return "game";
  if (extractNbaPlayerName(query)) return "stats";
  
  return "unknown";
}

// Format season stats response
function formatSeasonStats(player: NBAPlayer, stats: NBASeasonStats): string {
  const position = player.position || "—";
  const team = player.team_name || "—";
  const injury = player.injury_status ? `\n⚠️ Status: ${player.injury_status}` : "";
  
  return `**${player.name}** - ${stats.season} Season
${position} • ${team}${injury}

📊 **PER GAME AVERAGES**
Points: ${stats.points_per_game?.toFixed(1) || "—"} | Rebounds: ${stats.rebounds_per_game?.toFixed(1) || "—"} | Assists: ${stats.assists_per_game?.toFixed(1) || "—"}
Steals: ${stats.steals_per_game?.toFixed(1) || "—"} | Blocks: ${stats.blocks_per_game?.toFixed(1) || "—"} | Minutes: ${stats.minutes_per_game?.toFixed(1) || "—"}

🎯 **SHOOTING**
FG%: ${stats.field_goal_pct ? stats.field_goal_pct.toFixed(1) + "%" : "—"} | 3P%: ${stats.three_point_pct ? stats.three_point_pct.toFixed(1) + "%" : "—"} | FT%: ${stats.free_throw_pct ? stats.free_throw_pct.toFixed(1) + "%" : "—"}

Games Played: ${stats.games_played || "—"}

*Want to see their last 5 games or tonight's props?*`;
}

// Format game log response
function formatGameLog(player: NBAPlayer, logs: NBAGameLog[], count: number): string {
  if (logs.length === 0) {
    return `No recent game logs found for **${player.name}**. I can look up their season stats instead — just ask!`;
  }
  
  const recentLogs = logs.slice(0, count);
  
  let response = `**${player.name}** - Last ${recentLogs.length} Games\n\n`;
  
  for (const log of recentLogs) {
    const date = new Date(log.game_date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const result = log.result || "—";
    const pts = log.points ?? 0;
    const reb = log.rebounds ?? 0;
    const ast = log.assists ?? 0;
    const opp = log.opponent_name || log.opponent_abbr || "—";
    
    response += `${date} vs ${opp}: **${pts} pts**, ${reb} reb, ${ast} ast (${result})\n`;
  }
  
  // Calculate averages
  const avgPts = recentLogs.reduce((sum, g) => sum + (g.points ?? 0), 0) / recentLogs.length;
  const avgReb = recentLogs.reduce((sum, g) => sum + (g.rebounds ?? 0), 0) / recentLogs.length;
  const avgAst = recentLogs.reduce((sum, g) => sum + (g.assists ?? 0), 0) / recentLogs.length;
  
  response += `\n**${count}-GAME AVG**: ${avgPts.toFixed(1)} pts | ${avgReb.toFixed(1)} reb | ${avgAst.toFixed(1)} ast`;
  
  return response;
}

// Format games response
function formatGamesResponse(games: any[]): string {
  if (games.length === 0) {
    return "No NBA games scheduled for today. Check back closer to game time or ask about a specific team or player.";
  }
  
  let response = `🏀 **NBA Games Today**\n\n`;
  
  for (const game of games.slice(0, 10)) {
    const time = new Date(game.game_date).toLocaleTimeString("en-US", { 
      hour: "numeric", 
      minute: "2-digit",
      hour12: true 
    });
    const status = game.status === "Final" ? "FINAL" : game.status === "In Progress" ? "🔴 LIVE" : time;
    
    response += `**${game.visitor_team}** @ **${game.home_team}**\n`;
    response += `${status}`;
    if (game.home_score && game.visitor_score) {
      response += ` | ${game.visitor_score} - ${game.home_score}`;
    }
    response += `\n\n`;
  }
  
  return response;
}

// Main NBA query handler
export async function handleNbaQuery(query: string): Promise<string | null> {
  const queryType = detectQueryType(query);
  
  // Handle props queries
  if (queryType === "props") {
    return handleNbaPropsQuery(query);
  }
  
  // Handle game queries
  if (queryType === "game") {
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    
    const { data: games } = await supabase
      .from("nba_games")
      .select("*")
      .gte("game_date", today)
      .lte("game_date", tomorrow)
      .order("game_date", { ascending: true })
      .limit(15);
    
    return formatGamesResponse(games || []);
  }
  
  // Handle player-specific queries
  const playerName = extractNbaPlayerName(query);
  if (!playerName) {
    return null;
  }
  
  // Find player
  const { data: players } = await supabase
    .from("players")
    .select("id, name, position, team_name, team_abbr, injury_status")
    .eq("sport", "NBA")
    .ilike("name", `%${playerName}%`)
    .limit(1);
  
  if (!players || players.length === 0) {
    return `I couldn't find an NBA player matching "${playerName}". Try using their full name.`;
  }
  
  const player = players[0] as NBAPlayer;
  
  // Handle game log queries
  if (queryType === "game_log") {
    const countMatch = query.toLowerCase().match(/last\s*(\d+)/);
    const count = countMatch ? parseInt(countMatch[1]) : 5;
    
    const { data: logs } = await supabase
      .from("player_game_logs")
      .select("game_date, opponent_name, opponent_abbr, result, minutes, points, rebounds, assists, steals, blocks, turnovers, fg_made, fg_attempted, three_made, three_attempted")
      .eq("player_id", player.id)
      .eq("sport", "NBA")
      .order("game_date", { ascending: false })
      .limit(count);
    
    return formatGameLog(player, (logs || []) as NBAGameLog[], count);
  }
  
  // Default: season stats
  const { data: stats } = await supabase
    .from("player_season_stats")
    .select("*")
    .eq("player_id", player.id)
    .eq("sport", "NBA")
    .order("season", { ascending: false })
    .limit(1);
  
  if (!stats || stats.length === 0) {
    return `I found **${player.name}** (${player.position || "—"}, ${player.team_name || "—"}) but their stats aren't available yet. Try asking about their recent games or props instead.`;
  }
  
  return formatSeasonStats(player, stats[0] as NBASeasonStats);
}

// Check if query should use the specific stat extractor
export function shouldExtractSpecificStat(query: string): { stat: string; playerName: string } | null {
  const lowerQuery = query.toLowerCase();
  const playerName = extractNbaPlayerName(query);
  
  if (!playerName) return null;
  
  // Match patterns like "how many 3s does curry average" or "curry 3 point average"
  if (/3s?\b|three.?point|3pt|3-point/.test(lowerQuery)) {
    return { stat: "threes", playerName };
  }
  if (/points?\s+(per\s+game|average|avg)/.test(lowerQuery) || /how\s+many\s+points/.test(lowerQuery)) {
    return { stat: "points", playerName };
  }
  if (/rebounds?\s+(per\s+game|average|avg)/.test(lowerQuery) || /how\s+many\s+rebounds/.test(lowerQuery)) {
    return { stat: "rebounds", playerName };
  }
  if (/assists?\s+(per\s+game|average|avg)/.test(lowerQuery) || /how\s+many\s+assists/.test(lowerQuery)) {
    return { stat: "assists", playerName };
  }
  if (/steals?\s+(per\s+game|average|avg)/.test(lowerQuery)) {
    return { stat: "steals", playerName };
  }
  if (/blocks?\s+(per\s+game|average|avg)/.test(lowerQuery)) {
    return { stat: "blocks", playerName };
  }
  
  return null;
}

// Handle specific stat query
export async function handleSpecificStatQuery(stat: string, playerName: string): Promise<string | null> {
  const { data: players } = await supabase
    .from("players")
    .select("id, name, team_name")
    .eq("sport", "NBA")
    .ilike("name", `%${playerName}%`)
    .limit(1);
  
  if (!players || players.length === 0) {
    return `I couldn't find an NBA player matching "${playerName}".`;
  }
  
  const player = players[0];
  
  const { data: stats } = await supabase
    .from("player_season_stats")
    .select("*")
    .eq("player_id", player.id)
    .eq("sport", "NBA")
    .order("season", { ascending: false })
    .limit(1);
  
  if (!stats || stats.length === 0) {
    return `I found **${player.name}** but don't have their stats yet.`;
  }
  
  const s = stats[0];
  const team = player.team_name || "—";
  
  switch (stat) {
    case "threes":
      // Calculate 3PM per game from raw data if available
      const rawData = s.raw_data as Record<string, unknown> | null;
      const tpm = rawData?.fg3m || rawData?.three_pointers_made;
      const gp = s.games_played || 1;
      const tpmPerGame = tpm ? (Number(tpm) / gp).toFixed(1) : "—";
      const pct = s.three_point_pct ? s.three_point_pct.toFixed(1) + "%" : "—";
      return `🏀 **${player.name}** (${team}) averages **${tpmPerGame} three-pointers per game** this season on ${pct} shooting.`;
    
    case "points":
      return `🏀 **${player.name}** (${team}) averages **${s.points_per_game?.toFixed(1) || "—"} points per game** this season.`;
    
    case "rebounds":
      return `🏀 **${player.name}** (${team}) averages **${s.rebounds_per_game?.toFixed(1) || "—"} rebounds per game** this season.`;
    
    case "assists":
      return `🏀 **${player.name}** (${team}) averages **${s.assists_per_game?.toFixed(1) || "—"} assists per game** this season.`;
    
    case "steals":
      return `🏀 **${player.name}** (${team}) averages **${s.steals_per_game?.toFixed(1) || "—"} steals per game** this season.`;
    
    case "blocks":
      return `🏀 **${player.name}** (${team}) averages **${s.blocks_per_game?.toFixed(1) || "—"} blocks per game** this season.`;
    
    default:
      return null;
  }
}
