// Advanced Stats Handler for NFL Chatbot
// Handles queries about EPA, CPOE, target share, and other advanced metrics

import { supabase } from "@/integrations/supabase/client";
import { 
  QB_ADVANCED_STATS, 
  RB_ADVANCED_STATS, 
  WR_TE_ADVANCED_STATS, 
  DEF_ADVANCED_STATS,
  StatDefinition,
  getStatDefinitions 
} from "@/data/statDefinitions";
import { calculateAdvancedStats } from "@/utils/advancedStatsCalculator";

// Types
interface Player {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  team_abbr: string | null;
  team_name: string | null;
}

interface PlayerSeasonStats {
  games_played: number | null;
  pass_yards: number | null;
  pass_td: number | null;
  pass_attempts: number | null;
  pass_completions: number | null;
  pass_int: number | null;
  passer_rating: number | null;
  rush_yards: number | null;
  rush_attempts: number | null;
  rush_td: number | null;
  rec_yards: number | null;
  receptions: number | null;
  rec_td: number | null;
  targets: number | null;
  tackles: number | null;
  sacks: number | null;
  interceptions: number | null;
  raw_data: Record<string, unknown> | null;
}

interface GameLog {
  game_date: string | null;
  opponent_abbr: string | null;
  pass_yards: number | null;
  pass_td: number | null;
  rush_yards: number | null;
  rush_td: number | null;
  rec_yards: number | null;
  receptions: number | null;
  targets: number | null;
}

// Query detection patterns
const ADVANCED_STAT_PATTERNS = [
  /\bepa\b/i,
  /\bcpoe\b/i,
  /\badvanced\s+stats?\b/i,
  /\byards\s+after\s+contact\b/i,
  /\btarget\s+share\b/i,
  /\bair\s+yards?\b/i,
  /\bcatch\s+rate\b/i,
  /\byac\b/i,
  /\bpressure\s+rate\b/i,
  /\bseparation\b/i,
  /\bexplosive\s+(run|play)\s+rate\b/i,
  /\bsnap\s+share\b/i,
  /\broute\s+participation\b/i,
  /\bpass\s+rush\s+win\s+rate\b/i,
  /\brun\s+stop\s+rate\b/i,
  /\bpasser\s+rating\s+allowed\b/i,
  /\bhow\s+efficient\b/i,
  /\befficiency\b/i,
];

const STAT_EXPLANATION_PATTERNS = [
  /what\s+is\s+(epa|cpoe|yac|target\s+share|air\s+yards|separation|prwr)/i,
  /explain\s+(epa|cpoe|yac|target\s+share|air\s+yards|separation)/i,
  /what\s+does\s+(epa|cpoe|yac)\s+mean/i,
];

const LEADERBOARD_PATTERNS = [
  /\b(best|top|leading|highest)\s+(qbs?|quarterbacks?)\s+by\s+(\w+)/i,
  /\b(best|top|leading|highest)\s+(rbs?|running\s+backs?)\s+by\s+(\w+)/i,
  /\b(best|top|leading|highest)\s+(wrs?|wide\s+receivers?|tes?|tight\s+ends?)\s+by\s+(\w+)/i,
];

// Player name cache
const playerCache = new Map<string, Player>();

// Helper functions
function formatDecimal(value: number | undefined | null, decimals = 2): string {
  if (value === undefined || value === null || isNaN(value)) return "N/A";
  return value.toFixed(decimals);
}

function formatPercent(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return "N/A";
  return value.toFixed(1) + "%";
}

function getPositionGroup(position: string | null): string {
  if (!position) return "";
  const pos = position.toUpperCase();
  if (pos === "QB") return "QB";
  if (pos === "RB" || pos === "FB") return "RB";
  if (pos === "WR" || pos === "TE") return "WR_TE";
  if (["DE", "DT", "LB", "CB", "S", "DB", "OLB", "ILB", "NT", "EDGE"].includes(pos)) return "DEF";
  return "";
}

async function findPlayer(name: string): Promise<Player | null> {
  const normalizedName = name.toLowerCase().trim();
  
  // Check cache first
  if (playerCache.has(normalizedName)) {
    return playerCache.get(normalizedName)!;
  }

  // Search in database
  const { data, error } = await supabase
    .from("players")
    .select("id, name, first_name, last_name, position, team_abbr, team_name")
    .eq("sport", "NFL")
    .or(`name.ilike.%${normalizedName}%,first_name.ilike.%${normalizedName}%,last_name.ilike.%${normalizedName}%`)
    .limit(5);

  if (error || !data || data.length === 0) {
    return null;
  }

  // Find best match
  const exactMatch = data.find(
    (p) => p.name?.toLowerCase() === normalizedName ||
           `${p.first_name} ${p.last_name}`.toLowerCase() === normalizedName
  );
  
  const player = exactMatch || data[0];
  playerCache.set(normalizedName, player);
  return player;
}

async function getPlayerStats(playerId: string): Promise<PlayerSeasonStats | null> {
  const { data, error } = await supabase
    .from("player_season_stats")
    .select("*")
    .eq("player_id", playerId)
    .eq("sport", "NFL")
    .eq("season", 2024)
    .single();

  if (error || !data) return null;
  return data as unknown as PlayerSeasonStats;
}

async function getPlayerGameLogs(playerId: string): Promise<GameLog[]> {
  const { data, error } = await supabase
    .from("player_game_logs")
    .select("*")
    .eq("player_id", playerId)
    .eq("sport", "NFL")
    .eq("season", 2024)
    .order("game_date", { ascending: false })
    .limit(17);

  if (error || !data) return [];
  return data as unknown as GameLog[];
}

function extractPlayerName(query: string): string | null {
  // Remove common patterns to isolate player name
  let cleaned = query.toLowerCase()
    .replace(/\b(what('s|s)?|show|tell|me|about|the|is|are|for|get|find)\b/gi, "")
    .replace(/\b(epa|cpoe|yac|advanced\s+stats?|target\s+share|air\s+yards?|efficiency)\b/gi, "")
    .replace(/\b(this\s+season|2024|season|nfl)\b/gi, "")
    .replace(/[?!.,]/g, "")
    .trim();

  // Common name patterns (first last or just last name)
  const words = cleaned.split(/\s+/).filter(w => w.length > 1);
  
  if (words.length >= 2) {
    return words.slice(0, 2).join(" ");
  } else if (words.length === 1 && words[0].length > 2) {
    return words[0];
  }
  
  return null;
}

function getStatExplanation(statKey: string): string {
  const allStats = [
    ...QB_ADVANCED_STATS,
    ...RB_ADVANCED_STATS,
    ...WR_TE_ADVANCED_STATS,
    ...DEF_ADVANCED_STATS
  ];
  
  const stat = allStats.find(s => 
    s.key.toLowerCase().includes(statKey.toLowerCase()) ||
    s.shortName.toLowerCase().includes(statKey.toLowerCase()) ||
    s.name.toLowerCase().includes(statKey.toLowerCase())
  );

  if (!stat) return null as unknown as string;

  let explanation = `📊 **${stat.name} (${stat.shortName})**\n\n`;
  explanation += `${stat.description}\n\n`;
  
  if (stat.leagueAverage !== undefined) {
    const unit = stat.unit || "";
    explanation += `**League Average:** ${stat.leagueAverage}${unit}\n\n`;
  }
  
  // Add betting relevance
  const bettingContext = getBettingContext(stat.key);
  if (bettingContext) {
    explanation += `**Betting Relevance:** ${bettingContext}`;
  }
  
  return explanation;
}

function getBettingContext(statKey: string): string {
  const contexts: Record<string, string> = {
    epa_per_play: "High EPA indicates consistent scoring efficiency. QBs with high EPA often exceed passing yard props.",
    cpoe: "QBs with positive CPOE perform above expectation, suggesting sustainable production for prop bets.",
    target_share: "High target share means consistent opportunity volume - key for over/under on receptions and receiving yards.",
    yards_after_catch: "High YAC indicates playmaking ability - useful for evaluating receiving yard props.",
    catch_rate: "High catch rate reduces target variance - more reliable for reception props.",
    explosive_run_rate: "RBs with high explosive rates can hit overs with fewer touches - valuable for yardage props.",
    snap_share: "Indicates workload security. High snap share = more opportunities for rushing/receiving production.",
    pressure_rate: "High pressure rate affects passing efficiency - useful when betting against QBs.",
    separation: "Wide receivers with good separation create easier targets - correlates with catch rate and yards.",
  };
  
  return contexts[statKey] || "";
}

function formatAdvancedStatsResponse(
  player: Player,
  stats: PlayerSeasonStats,
  gameLogs: GameLog[],
  specificStat?: string
): string {
  const positionGroup = getPositionGroup(player.position);
  const displayName = player.name || `${player.first_name} ${player.last_name}`;
  const team = player.team_abbr || player.team_name || "";
  const position = player.position || "PLAYER";
  
  // Calculate advanced stats
  const advancedStats = calculateAdvancedStats(
    stats as any,
    gameLogs as any,
    position
  );
  
  const definitions = getStatDefinitions(positionGroup);
  
  // If specific stat requested
  if (specificStat) {
    const statDef = definitions.find(d => 
      d.key.toLowerCase().includes(specificStat.toLowerCase()) ||
      d.shortName.toLowerCase().includes(specificStat.toLowerCase())
    );
    
    if (statDef) {
      const value = advancedStats[statDef.key as keyof typeof advancedStats];
      const formattedValue = statDef.format === "percent" 
        ? formatPercent(value as number)
        : formatDecimal(value as number);
      
      let response = `📊 **${displayName}** (${team} ${position})\n\n`;
      response += `**${statDef.name}:** ${formattedValue}\n\n`;
      response += `${statDef.description}\n\n`;
      
      if (statDef.leagueAverage !== undefined) {
        const comparison = (value as number || 0) > statDef.leagueAverage 
          ? "above" : "below";
        const diff = Math.abs((value as number || 0) - statDef.leagueAverage);
        response += `*${formatDecimal(diff)} ${comparison} league average (${statDef.leagueAverage}${statDef.unit || ""})*`;
      }
      
      return response;
    }
  }
  
  // General advanced stats overview
  let response = `📊 **${displayName}** (${team} ${position}) - Advanced Stats\n\n`;
  
  // Show top 5 most relevant stats
  const topStats = definitions.slice(0, 5);
  
  topStats.forEach(statDef => {
    const value = advancedStats[statDef.key as keyof typeof advancedStats];
    const formattedValue = statDef.format === "percent" 
      ? formatPercent(value as number)
      : formatDecimal(value as number);
    
    let indicator = "";
    if (statDef.leagueAverage !== undefined && value !== undefined) {
      const isGood = statDef.higherIsBetter 
        ? (value as number) > statDef.leagueAverage 
        : (value as number) < statDef.leagueAverage;
      indicator = isGood ? " ✅" : " ⚠️";
    }
    
    response += `• **${statDef.shortName}:** ${formattedValue}${indicator}\n`;
  });
  
  response += `\n*${definitions.length - 5} more advanced metrics available*`;
  
  return response;
}

async function handleLeaderboardQuery(query: string): Promise<string | null> {
  // Parse the leaderboard query
  const match = query.match(/\b(best|top|leading|highest)\s+(\w+)\s+by\s+(\w+)/i);
  if (!match) return null;
  
  const positionRaw = match[2].toLowerCase();
  const statRaw = match[3].toLowerCase();
  
  // Map position
  let positionGroup = "";
  if (positionRaw.includes("qb") || positionRaw.includes("quarterback")) {
    positionGroup = "QB";
  } else if (positionRaw.includes("rb") || positionRaw.includes("running")) {
    positionGroup = "RB";
  } else if (positionRaw.includes("wr") || positionRaw.includes("receiver") || 
             positionRaw.includes("te") || positionRaw.includes("tight")) {
    positionGroup = "WR_TE";
  }
  
  if (!positionGroup) return null;
  
  const definitions = getStatDefinitions(positionGroup);
  const statDef = definitions.find(d => 
    d.key.toLowerCase().includes(statRaw) ||
    d.shortName.toLowerCase().replace(/[%\/]/g, "").includes(statRaw)
  );
  
  if (!statDef) {
    return `I couldn't find the stat "${statRaw}". Available ${positionGroup} stats include: ${definitions.map(d => d.shortName).join(", ")}`;
  }
  
  // For now, return a placeholder with stat info
  // (Full leaderboard would require fetching all players - could be expensive)
  return `📊 **${statDef.name} Leaderboard**\n\n` +
    `Looking for top ${positionGroup}s by ${statDef.shortName}...\n\n` +
    `*Leaderboard data requires analyzing all ${positionGroup} players. ` +
    `Try asking about a specific player's ${statDef.shortName} instead.*\n\n` +
    `**About ${statDef.name}:** ${statDef.description}`;
}

// Main handler
export async function handleAdvancedStatsQuery(query: string): Promise<string | null> {
  const lowerQuery = query.toLowerCase();
  
  // Check for stat explanation query
  const explanationMatch = lowerQuery.match(
    /(?:what\s+is|explain|what\s+does)\s+(\w+)(?:\s+mean)?/i
  );
  if (explanationMatch) {
    const statKey = explanationMatch[1];
    const explanation = getStatExplanation(statKey);
    if (explanation) return explanation;
  }
  
  // Check for leaderboard query
  if (LEADERBOARD_PATTERNS.some(p => p.test(query))) {
    const leaderboardResult = await handleLeaderboardQuery(query);
    if (leaderboardResult) return leaderboardResult;
  }
  
  // Extract player name and find player
  const playerName = extractPlayerName(query);
  if (!playerName) {
    return "Please specify a player name. For example: \"What's Patrick Mahomes' EPA?\"";
  }
  
  const player = await findPlayer(playerName);
  if (!player) {
    return `I couldn't find an NFL player matching "${playerName}". Try using their full name.`;
  }
  
  // Get stats and game logs
  const [stats, gameLogs] = await Promise.all([
    getPlayerStats(player.id),
    getPlayerGameLogs(player.id)
  ]);
  
  if (!stats) {
    const displayName = player.name || `${player.first_name} ${player.last_name}`;
    return `No 2024 stats found for ${displayName}. They may not have played this season yet.`;
  }
  
  // Detect which specific stat is being asked about
  let specificStat: string | undefined;
  
  if (/\bepa\b/i.test(query)) specificStat = "epa";
  else if (/\bcpoe\b/i.test(query)) specificStat = "cpoe";
  else if (/\byards\s+after\s+contact\b/i.test(query)) specificStat = "yards_after_contact";
  else if (/\btarget\s+share\b/i.test(query)) specificStat = "target_share";
  else if (/\bair\s+yards?\b/i.test(query)) specificStat = "air_yards";
  else if (/\bcatch\s+rate\b/i.test(query)) specificStat = "catch_rate";
  else if (/\byac\b/i.test(query)) specificStat = "yards_after_catch";
  else if (/\bpressure\s+rate\b/i.test(query)) specificStat = "pressure_rate";
  else if (/\bseparation\b/i.test(query)) specificStat = "separation";
  else if (/\bsnap\s+share\b/i.test(query)) specificStat = "snap_share";
  
  return formatAdvancedStatsResponse(player, stats, gameLogs, specificStat);
}

// Detection function for routing
export function shouldHandleAdvancedStats(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  
  // Check if query matches any advanced stat patterns
  const matchesPattern = ADVANCED_STAT_PATTERNS.some(p => p.test(lowerQuery));
  
  // Check for stat explanation patterns
  const matchesExplanation = STAT_EXPLANATION_PATTERNS.some(p => p.test(lowerQuery));
  
  // Check for leaderboard patterns
  const matchesLeaderboard = LEADERBOARD_PATTERNS.some(p => p.test(lowerQuery));
  
  return matchesPattern || matchesExplanation || matchesLeaderboard;
}
