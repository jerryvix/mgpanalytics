// Props Analysis Handler for Chatbot
// Provides advanced stats context for prop bet queries

import { supabase } from "@/integrations/supabase/client";
import { gradeProp, PropContext, PropType, getGradeColor } from "@/utils/matchupGrader";
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

interface SeasonStats {
  games_played: number | null;
  pass_yards: number | null;
  pass_td: number | null;
  pass_attempts: number | null;
  pass_completions: number | null;
  rush_yards: number | null;
  rush_attempts: number | null;
  rush_td: number | null;
  rec_yards: number | null;
  receptions: number | null;
  rec_td: number | null;
  targets: number | null;
}

interface GameLog {
  pass_yards: number | null;
  rush_yards: number | null;
  rec_yards: number | null;
  receptions: number | null;
  pass_td: number | null;
  rush_td: number | null;
  rec_td: number | null;
  opponent_abbr: string | null;
  game_date: string | null;
}

// Query detection patterns
const PROP_PATTERNS = [
  /(\d+\.?\d*)\s*(passing|pass)\s*yards?/i,
  /(\d+\.?\d*)\s*(rushing|rush)\s*yards?/i,
  /(\d+\.?\d*)\s*(receiving|rec)\s*yards?/i,
  /(\d+\.?\d*)\s*receptions?/i,
  /o\/?u\s*(\d+\.?\d*)/i,
  /over\s*under\s*(\d+\.?\d*)/i,
  /\bprop\b.*(\d+\.?\d*)/i,
  /\banalyz[es]?\b.*prop/i,
  /prop.*analysis/i,
  /should\s+i\s+(bet|take)/i,
];

// Player name cache
const playerCache = new Map<string, Player>();

async function findPlayer(name: string): Promise<Player | null> {
  const normalizedName = name.toLowerCase().trim();
  
  if (playerCache.has(normalizedName)) {
    return playerCache.get(normalizedName)!;
  }

  const { data, error } = await supabase
    .from("players")
    .select("id, name, first_name, last_name, position, team_abbr, team_name")
    .eq("sport", "NFL")
    .or(`name.ilike.%${normalizedName}%,first_name.ilike.%${normalizedName}%,last_name.ilike.%${normalizedName}%`)
    .limit(5);

  if (error || !data || data.length === 0) return null;

  const exactMatch = data.find(
    (p) => p.name?.toLowerCase() === normalizedName ||
           `${p.first_name} ${p.last_name}`.toLowerCase() === normalizedName
  );
  
  const player = exactMatch || data[0];
  playerCache.set(normalizedName, player);
  return player;
}

// NFL uses start-year convention in DB (2025 = 2025-26 season)
function getCurrentNflSeason(): number {
  const now = new Date();
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1; // NFL starts in September (month 8)
}

async function getPlayerStats(playerId: string): Promise<SeasonStats | null> {
  const { data, error } = await supabase
    .from("player_season_stats")
    .select("*")
    .eq("player_id", playerId)
    .eq("sport", "NFL")
    .eq("season", getCurrentNflSeason())
    .single();

  if (error || !data) return null;
  return data as unknown as SeasonStats;
}

async function getPlayerGameLogs(playerId: string, limit = 5): Promise<GameLog[]> {
  const { data, error } = await supabase
    .from("player_game_logs")
    .select("*")
    .eq("player_id", playerId)
    .eq("sport", "NFL")
    .eq("season", getCurrentNflSeason())
    .order("game_date", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as unknown as GameLog[];
}

function extractPlayerName(query: string): string | null {
  // Remove prop-related terms to isolate player name
  const cleaned = query.toLowerCase()
    .replace(/\b(what('s|s)?|show|tell|me|about|the|is|are|for|get|find|analyze|analysis)\b/gi, "")
    .replace(/\b(prop|over|under|o\/u|passing|rushing|receiving|yards|receptions?|td|touchdowns?)\b/gi, "")
    .replace(/\d+\.?\d*/g, "")
    .replace(/[?!.,]/g, "")
    .trim();

  const words = cleaned.split(/\s+/).filter(w => w.length > 1);
  
  if (words.length >= 2) {
    return words.slice(0, 2).join(" ");
  } else if (words.length === 1 && words[0].length > 2) {
    return words[0];
  }
  
  return null;
}

function extractPropDetails(query: string): { propType: PropType; line: number } | null {
  const lowerQuery = query.toLowerCase();
  
  // Try to find line value
  const lineMatch = query.match(/(\d+\.?\d*)/);
  const line = lineMatch ? parseFloat(lineMatch[1]) : 0;
  
  // Detect prop type
  if (/pass(ing)?\s*yards?/i.test(lowerQuery)) {
    return { propType: "passing_yards", line };
  }
  if (/rush(ing)?\s*yards?/i.test(lowerQuery)) {
    return { propType: "rushing_yards", line };
  }
  if (/rec(eiving)?\s*yards?/i.test(lowerQuery)) {
    return { propType: "receiving_yards", line };
  }
  if (/receptions?/i.test(lowerQuery)) {
    return { propType: "receptions", line };
  }
  if (/pass(ing)?\s*t(ouch)?d/i.test(lowerQuery)) {
    return { propType: "pass_td", line };
  }
  if (/rush(ing)?\s*t(ouch)?d/i.test(lowerQuery)) {
    return { propType: "rush_td", line };
  }
  if (/rec(eiving)?\s*t(ouch)?d/i.test(lowerQuery)) {
    return { propType: "rec_td", line };
  }
  
  return null;
}

function getSeasonAvgForProp(stats: SeasonStats, propType: PropType): number {
  const games = stats.games_played || 1;
  
  switch (propType) {
    case "passing_yards":
      return (stats.pass_yards || 0) / games;
    case "rushing_yards":
      return (stats.rush_yards || 0) / games;
    case "receiving_yards":
      return (stats.rec_yards || 0) / games;
    case "receptions":
      return (stats.receptions || 0) / games;
    case "pass_td":
      return (stats.pass_td || 0) / games;
    case "rush_td":
      return (stats.rush_td || 0) / games;
    case "rec_td":
      return (stats.rec_td || 0) / games;
    default:
      return 0;
  }
}

function getGameLogValue(log: GameLog, propType: PropType): number {
  switch (propType) {
    case "passing_yards":
      return log.pass_yards || 0;
    case "rushing_yards":
      return log.rush_yards || 0;
    case "receiving_yards":
      return log.rec_yards || 0;
    case "receptions":
      return log.receptions || 0;
    case "pass_td":
      return log.pass_td || 0;
    case "rush_td":
      return log.rush_td || 0;
    case "rec_td":
      return log.rec_td || 0;
    default:
      return 0;
  }
}

const PROP_TYPE_LABELS: Record<PropType, string> = {
  passing_yards: "Passing Yards",
  rushing_yards: "Rushing Yards",
  receiving_yards: "Receiving Yards",
  receptions: "Receptions",
  pass_td: "Passing TDs",
  rush_td: "Rushing TDs",
  rec_td: "Receiving TDs",
  fantasy: "Fantasy Points"
};

function formatPropAnalysisResponse(
  player: Player,
  propType: PropType,
  line: number,
  stats: SeasonStats,
  gameLogs: GameLog[]
): string {
  const displayName = player.name || `${player.first_name} ${player.last_name}`;
  const position = player.position || "PLAYER";
  const team = player.team_abbr || "";
  
  // Calculate averages
  const seasonAvg = getSeasonAvgForProp(stats, propType);
  const last5Values = gameLogs.slice(0, 5).map(g => getGameLogValue(g, propType));
  const last5Avg = last5Values.length > 0 
    ? last5Values.reduce((a, b) => a + b, 0) / last5Values.length 
    : seasonAvg;
  const last5HitRate = last5Values.filter(v => v > line).length / Math.max(last5Values.length, 1);

  // Calculate advanced stats
  const advancedStats = calculateAdvancedStats(stats as any, gameLogs as any, position);

  // Build context
  const context: PropContext = {
    playerName: displayName,
    propType,
    line,
    position,
    seasonAvg,
    last5Avg,
    last5HitRate,
    advancedStats: {
      epa: advancedStats.epa_per_play,
      targetShare: advancedStats.target_share,
      airYardsShare: advancedStats.air_yards_share,
      catchRate: advancedStats.catch_rate,
      yardsAfterContact: advancedStats.yards_after_contact,
      explosiveRate: advancedStats.explosive_run_rate,
      snapShare: advancedStats.snap_share,
      pressureRate: advancedStats.pressure_rate,
    }
  };

  // Grade the prop
  const result = gradeProp(context);

  // Format response
  let response = `📊 **${displayName}** (${team} ${position})\n`;
  response += `**O/U ${line} ${PROP_TYPE_LABELS[propType]}**\n\n`;
  
  response += `**Grade: ${result.grade}** (${result.confidence} confidence)\n\n`;
  
  response += `**ADVANCED CONTEXT:**\n`;
  response += `├─ Season Avg: ${seasonAvg.toFixed(1)} ${seasonAvg > line ? "(over line) ✓" : "(under line)"}\n`;
  response += `├─ Last 5 Avg: ${last5Avg.toFixed(1)}\n`;
  response += `├─ Last 5 Hit Rate: ${Math.round(last5HitRate * 100)}% (${last5Values.filter(v => v > line).length}/5 over)\n`;
  
  // Add position-specific advanced stats
  if (propType === "passing_yards" && advancedStats.pressure_rate) {
    response += `├─ Pressure Rate: ${advancedStats.pressure_rate.toFixed(1)}%\n`;
  }
  if ((propType === "receiving_yards" || propType === "receptions") && advancedStats.target_share) {
    response += `├─ Target Share: ${advancedStats.target_share.toFixed(1)}%\n`;
  }
  if (propType === "rushing_yards" && advancedStats.yards_after_contact) {
    response += `├─ Yards After Contact: ${advancedStats.yards_after_contact.toFixed(1)}\n`;
  }
  
  response += `\n**FACTORS TO CONSIDER:**\n`;
  
  result.favorableFactors.slice(0, 3).forEach(factor => {
    response += `✓ ${factor}\n`;
  });
  
  result.concernFactors.slice(0, 2).forEach(factor => {
    response += `⚠ ${factor}\n`;
  });
  
  response += `\n**RECENT GAMES:**\n`;
  gameLogs.slice(0, 5).forEach((game, i) => {
    const value = getGameLogValue(game, propType);
    const vs = game.opponent_abbr || "OPP";
    const indicator = value > line ? "✓" : "✗";
    response += `${i + 1}. vs ${vs}: ${value} ${indicator}\n`;
  });
  
  response += `\n*${result.summary}*\n\n`;
  response += `⚠️ *This analysis provides data and statistics only. Past performance does not guarantee future results. Please gamble responsibly.*`;

  return response;
}

// Main handler
export async function handlePropAnalysisQuery(query: string): Promise<string | null> {
  // Extract prop details
  const propDetails = extractPropDetails(query);
  if (!propDetails || propDetails.line === 0) {
    return null;
  }

  // Extract player name
  const playerName = extractPlayerName(query);
  if (!playerName) {
    return "Please specify a player name. For example: \"Analyze Josh Allen 275.5 passing yards prop\"";
  }

  const player = await findPlayer(playerName);
  if (!player) {
    return `I couldn't find an NFL player matching "${playerName}". Try using their full name.`;
  }

  // Get stats and game logs
  const [stats, gameLogs] = await Promise.all([
    getPlayerStats(player.id),
    getPlayerGameLogs(player.id, 10)
  ]);

  if (!stats) {
    const displayName = player.name || `${player.first_name} ${player.last_name}`;
    return `No 2024 stats found for ${displayName}. They may not have played this season yet.`;
  }

  return formatPropAnalysisResponse(
    player,
    propDetails.propType,
    propDetails.line,
    stats,
    gameLogs
  );
}

// Detection function for routing
export function shouldHandlePropAnalysis(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  
  // Must have a number (the line)
  if (!/\d+\.?\d*/.test(query)) return false;
  
  // Check for prop-related patterns
  return PROP_PATTERNS.some(p => p.test(lowerQuery));
}
