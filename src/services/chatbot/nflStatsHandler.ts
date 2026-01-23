// NFL Stats Handler for Chatbot Queries
import { supabase } from "@/integrations/supabase/client";
import { parseNFLStatsQuery, isGameLogQuery, ParsedStatsQuery } from "@/utils/playerNameMatcher";

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
  name: string;
  position: string | null;
  team_name: string | null;
  team_abbr: string | null;
  sport: string;
}

interface GameLog {
  id: string;
  player_id: string | null;
  season: number;
  week: number | null;
  game_date: string | null;
  opponent_name: string | null;
  opponent_abbr: string | null;
  home_away: string | null;
  result: string | null;
  team_score: number | null;
  opponent_score: number | null;
  // Passing
  pass_completions: number | null;
  pass_attempts: number | null;
  pass_yards: number | null;
  pass_td: number | null;
  pass_int: number | null;
  passer_rating: number | null;
  // Rushing
  rush_attempts: number | null;
  rush_yards: number | null;
  rush_td: number | null;
  // Receiving
  targets: number | null;
  receptions: number | null;
  rec_yards: number | null;
  rec_td: number | null;
  // Fantasy
  fantasy_points: number | null;
  fantasy_points_ppr: number | null;
}

interface PlayerSeasonStats {
  id: string;
  player_id: string | null;
  season: number;
  games_played: number | null;
  pass_yards: number | null;
  pass_td: number | null;
  pass_int: number | null;
  pass_completions: number | null;
  pass_attempts: number | null;
  passer_rating: number | null;
  rush_yards: number | null;
  rush_td: number | null;
  rush_attempts: number | null;
  receptions: number | null;
  rec_yards: number | null;
  rec_td: number | null;
  targets: number | null;
  fantasy_points: number | null;
  fantasy_points_ppr: number | null;
  raw_data?: Record<string, unknown> | null;
}

// Player ID cache to reduce API calls
const playerIdCache = new Map<string, Player>();

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "0";
  return n.toLocaleString();
}

function formatDecimal(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined) return "0";
  return n.toFixed(decimals);
}

function getStatFromRaw(stats: PlayerSeasonStats | null, columnKey: keyof PlayerSeasonStats, rawKey: string): number {
  if (!stats) return 0;
  const columnValue = stats[columnKey] as number | null;
  if (columnValue && columnValue > 0) return columnValue;
  
  const rawData = stats.raw_data;
  if (rawData && typeof rawData === 'object' && rawKey in rawData) {
    const rawValue = rawData[rawKey];
    if (typeof rawValue === 'number') return rawValue;
  }
  return 0;
}

/**
 * Find player by name with caching
 */
async function findPlayer(name: string): Promise<Player | null> {
  const cacheKey = name.toLowerCase();
  
  // Check cache first
  if (playerIdCache.has(cacheKey)) {
    return playerIdCache.get(cacheKey)!;
  }
  
  // Try exact match
  const { data: exactMatch } = await supabase
    .from("players")
    .select("*")
    .eq("sport", "NFL")
    .ilike("name", `%${name}%`)
    .limit(1);
  
  if (exactMatch && exactMatch.length > 0) {
    const player = exactMatch[0] as Player;
    playerIdCache.set(cacheKey, player);
    return player;
  }
  
  // Try first + last name
  const nameParts = name.trim().split(/\s+/);
  if (nameParts.length >= 2) {
    const { data: nameMatch } = await supabase
      .from("players")
      .select("*")
      .eq("sport", "NFL")
      .ilike("first_name", `%${nameParts[0]}%`)
      .ilike("last_name", `%${nameParts[nameParts.length - 1]}%`)
      .limit(1);
    
    if (nameMatch && nameMatch.length > 0) {
      const player = nameMatch[0] as Player;
      playerIdCache.set(cacheKey, player);
      return player;
    }
  }
  
  return null;
}

/**
 * Get player season stats
 */
async function getPlayerSeasonStats(playerId: string): Promise<PlayerSeasonStats | null> {
  const { data } = await supabase
    .from("player_season_stats")
    .select("*, raw_data")
    .eq("player_id", playerId)
    .eq("sport", "NFL")
    .order("season", { ascending: false })
    .limit(1);
  
  if (data && data.length > 0) {
    return data[0] as PlayerSeasonStats;
  }
  return null;
}

/**
 * Get player game logs
 */
async function getPlayerGameLogs(playerId: string, limit: number = 17): Promise<GameLog[]> {
  const { data } = await supabase
    .from("player_game_logs")
    .select("*")
    .eq("player_id", playerId)
    .eq("sport", "NFL")
    .order("game_date", { ascending: false })
    .limit(limit);
  
  return (data || []) as GameLog[];
}

/**
 * Format game log response for a QB
 */
function formatQBGameLogs(player: Player, games: GameLog[], avgLabel: string): string {
  const displayName = player.name || `${player.first_name} ${player.last_name}`;
  const team = player.team_abbr || player.team_name || "";
  
  // Calculate totals
  let totalCompletions = 0, totalAttempts = 0, totalPassYards = 0;
  let totalPassTd = 0, totalInt = 0, totalRushYards = 0, totalRushTd = 0;
  
  games.forEach(g => {
    totalCompletions += g.pass_completions || 0;
    totalAttempts += g.pass_attempts || 0;
    totalPassYards += g.pass_yards || 0;
    totalPassTd += g.pass_td || 0;
    totalInt += g.pass_int || 0;
    totalRushYards += g.rush_yards || 0;
    totalRushTd += g.rush_td || 0;
  });
  
  const gamesCount = games.length;
  const compPct = totalAttempts > 0 ? ((totalCompletions / totalAttempts) * 100).toFixed(1) : "0";
  const avgPassYards = gamesCount > 0 ? (totalPassYards / gamesCount).toFixed(1) : "0";
  
  let response = `🏈 **${displayName}** (${team}) - ${avgLabel}:\n\n`;
  response += `**${gamesCount}-Game Summary:**\n`;
  response += `- **Passing:** ${totalCompletions}/${totalAttempts} (${compPct}%)\n`;
  response += `- **${formatNumber(totalPassYards)} yards** (${avgPassYards}/game)\n`;
  response += `- **${totalPassTd} TDs, ${totalInt} INTs**\n`;
  
  if (totalRushYards > 0 || totalRushTd > 0) {
    response += `- **Rushing:** ${formatNumber(totalRushYards)} yards, ${totalRushTd} TDs\n`;
  }
  
  response += `\n**Game-by-Game:**\n`;
  
  games.forEach((g, i) => {
    const opponent = g.opponent_abbr || g.opponent_name || "OPP";
    const homeAway = g.home_away === "home" ? "vs" : "@";
    const result = g.result ? `(${g.result})` : "";
    const week = g.week ? `Wk ${g.week}` : "";
    
    const line = `${i + 1}. ${homeAway} ${opponent} ${result} ${week}: ${g.pass_completions || 0}/${g.pass_attempts || 0}, ${formatNumber(g.pass_yards)} yds, ${g.pass_td || 0} TD, ${g.pass_int || 0} INT`;
    response += line + "\n";
  });
  
  return response;
}

/**
 * Format game log response for a RB
 */
function formatRBGameLogs(player: Player, games: GameLog[], avgLabel: string): string {
  const displayName = player.name || `${player.first_name} ${player.last_name}`;
  const team = player.team_abbr || player.team_name || "";
  
  let totalRushAttempts = 0, totalRushYards = 0, totalRushTd = 0;
  let totalReceptions = 0, totalRecYards = 0, totalRecTd = 0;
  
  games.forEach(g => {
    totalRushAttempts += g.rush_attempts || 0;
    totalRushYards += g.rush_yards || 0;
    totalRushTd += g.rush_td || 0;
    totalReceptions += g.receptions || 0;
    totalRecYards += g.rec_yards || 0;
    totalRecTd += g.rec_td || 0;
  });
  
  const gamesCount = games.length;
  const ypc = totalRushAttempts > 0 ? (totalRushYards / totalRushAttempts).toFixed(1) : "0";
  const avgRushYards = gamesCount > 0 ? (totalRushYards / gamesCount).toFixed(1) : "0";
  
  let response = `🏈 **${displayName}** (${team}) - ${avgLabel}:\n\n`;
  response += `**${gamesCount}-Game Summary:**\n`;
  response += `- **Rushing:** ${totalRushAttempts} carries, ${formatNumber(totalRushYards)} yds (${ypc} YPC)\n`;
  response += `- **${totalRushTd} rushing TDs** (${avgRushYards} yds/game)\n`;
  
  if (totalReceptions > 0) {
    response += `- **Receiving:** ${totalReceptions} rec, ${formatNumber(totalRecYards)} yds, ${totalRecTd} TDs\n`;
  }
  
  response += `\n**Game-by-Game:**\n`;
  
  games.forEach((g, i) => {
    const opponent = g.opponent_abbr || g.opponent_name || "OPP";
    const homeAway = g.home_away === "home" ? "vs" : "@";
    const result = g.result ? `(${g.result})` : "";
    
    let line = `${i + 1}. ${homeAway} ${opponent} ${result}: ${g.rush_attempts || 0} car, ${formatNumber(g.rush_yards)} yds, ${g.rush_td || 0} TD`;
    if ((g.receptions || 0) > 0) {
      line += ` | ${g.receptions} rec, ${g.rec_yards || 0} yds`;
    }
    response += line + "\n";
  });
  
  return response;
}

/**
 * Format game log response for WR/TE
 */
function formatWRTEGameLogs(player: Player, games: GameLog[], avgLabel: string): string {
  const displayName = player.name || `${player.first_name} ${player.last_name}`;
  const team = player.team_abbr || player.team_name || "";
  
  let totalTargets = 0, totalReceptions = 0, totalRecYards = 0, totalRecTd = 0;
  
  games.forEach(g => {
    totalTargets += g.targets || 0;
    totalReceptions += g.receptions || 0;
    totalRecYards += g.rec_yards || 0;
    totalRecTd += g.rec_td || 0;
  });
  
  const gamesCount = games.length;
  const catchRate = totalTargets > 0 ? ((totalReceptions / totalTargets) * 100).toFixed(1) : "0";
  const ypr = totalReceptions > 0 ? (totalRecYards / totalReceptions).toFixed(1) : "0";
  const avgRecYards = gamesCount > 0 ? (totalRecYards / gamesCount).toFixed(1) : "0";
  
  let response = `🏈 **${displayName}** (${team}) - ${avgLabel}:\n\n`;
  response += `**${gamesCount}-Game Summary:**\n`;
  response += `- **Receiving:** ${totalReceptions}/${totalTargets} targets (${catchRate}%)\n`;
  response += `- **${formatNumber(totalRecYards)} yards** (${ypr} YPR, ${avgRecYards}/game)\n`;
  response += `- **${totalRecTd} TDs**\n`;
  
  response += `\n**Game-by-Game:**\n`;
  
  games.forEach((g, i) => {
    const opponent = g.opponent_abbr || g.opponent_name || "OPP";
    const homeAway = g.home_away === "home" ? "vs" : "@";
    const result = g.result ? `(${g.result})` : "";
    
    const line = `${i + 1}. ${homeAway} ${opponent} ${result}: ${g.receptions || 0}/${g.targets || 0} tgt, ${formatNumber(g.rec_yards)} yds, ${g.rec_td || 0} TD`;
    response += line + "\n";
  });
  
  return response;
}

/**
 * Format season stats response
 */
function formatSeasonStats(player: Player, stats: PlayerSeasonStats): string {
  const displayName = player.name || `${player.first_name} ${player.last_name}`;
  const position = player.position || "Unknown";
  const team = player.team_abbr || player.team_name || "";
  
  const passYards = getStatFromRaw(stats, 'pass_yards', 'passing_yards');
  const passTd = getStatFromRaw(stats, 'pass_td', 'passing_touchdowns');
  const passInt = getStatFromRaw(stats, 'pass_int', 'passing_interceptions');
  const rushYards = getStatFromRaw(stats, 'rush_yards', 'rushing_yards');
  const rushTd = getStatFromRaw(stats, 'rush_td', 'rushing_touchdowns');
  const rushAttempts = getStatFromRaw(stats, 'rush_attempts', 'rushing_attempts');
  const receptions = getStatFromRaw(stats, 'receptions', 'receptions');
  const recYards = getStatFromRaw(stats, 'rec_yards', 'receiving_yards');
  const recTd = getStatFromRaw(stats, 'rec_td', 'receiving_touchdowns');
  const targets = getStatFromRaw(stats, 'targets', 'receiving_targets');
  const gamesPlayed = getStatFromRaw(stats, 'games_played', 'games_played');
  
  let response = `🏈 **${displayName}** (${position}, ${team}) - ${stats.season} Season:\n\n`;
  
  if (position === "Quarterback") {
    const passAttempts = getStatFromRaw(stats, 'pass_attempts', 'passing_attempts');
    const passCompletions = getStatFromRaw(stats, 'pass_completions', 'passing_completions');
    const compPct = passAttempts > 0 ? ((passCompletions / passAttempts) * 100).toFixed(1) : "0";
    
    response += `**Passing:**\n`;
    response += `- ${passCompletions}/${passAttempts} (${compPct}%)\n`;
    response += `- ${formatNumber(passYards)} yards, ${passTd} TDs, ${passInt} INTs\n`;
    
    if (rushYards > 0) {
      response += `\n**Rushing:** ${formatNumber(rushYards)} yards, ${rushTd} TDs\n`;
    }
  } else if (position === "Running Back") {
    const ypc = rushAttempts > 0 ? (rushYards / rushAttempts).toFixed(1) : "0";
    response += `**Rushing:** ${formatNumber(rushYards)} yards, ${rushTd} TDs (${rushAttempts} carries, ${ypc} YPC)\n`;
    
    if (receptions > 0) {
      response += `**Receiving:** ${receptions} rec, ${formatNumber(recYards)} yards, ${recTd} TDs\n`;
    }
  } else if (position === "Wide Receiver" || position === "Tight End") {
    const ypr = receptions > 0 ? (recYards / receptions).toFixed(1) : "0";
    response += `**Receiving:** ${receptions} rec, ${formatNumber(recYards)} yards, ${recTd} TDs\n`;
    response += `- Targets: ${targets} | YPR: ${ypr}\n`;
  } else {
    if (passYards > 0) response += `**Passing:** ${formatNumber(passYards)} yards, ${passTd} TDs\n`;
    if (rushYards > 0) response += `**Rushing:** ${formatNumber(rushYards)} yards, ${rushTd} TDs\n`;
    if (recYards > 0) response += `**Receiving:** ${receptions} rec, ${formatNumber(recYards)} yards\n`;
  }
  
  response += `\n**Games Played:** ${gamesPlayed}`;
  
  if (stats.fantasy_points_ppr && stats.fantasy_points_ppr > 0) {
    response += ` | **Fantasy (PPR):** ${stats.fantasy_points_ppr.toFixed(1)}`;
  }
  
  return response;
}

/**
 * Main handler for NFL stats queries
 */
export async function handleNFLStatsQuery(query: string): Promise<string | null> {
  const parsed = parseNFLStatsQuery(query);
  
  // Must have a player name to proceed
  if (!parsed.playerName) {
    return null;
  }
  
  // Find the player
  const player = await findPlayer(parsed.playerName);
  
  if (!player) {
    // Try suggesting similar players
    return `I couldn't find an NFL player named "${parsed.playerName}". Try the full name (e.g., "Josh Allen" or "Patrick Mahomes").`;
  }
  
  const position = player.position || "";
  const isQB = position === "Quarterback" || position === "QB";
  const isRB = position === "Running Back" || position === "RB";
  const isWRTE = position === "Wide Receiver" || position === "Tight End" || 
                  position === "WR" || position === "TE";
  
  // Handle "last X games" queries
  if (parsed.timeFrame === "last_games" || isGameLogQuery(query)) {
    const gameLogs = await getPlayerGameLogs(player.id, parsed.gameCount);
    
    if (gameLogs.length === 0) {
      return `I don't have game log data for ${player.name} yet this season. Season stats may still be available.`;
    }
    
    const avgLabel = `Last ${gameLogs.length} Games`;
    
    if (isQB) {
      return formatQBGameLogs(player, gameLogs, avgLabel);
    } else if (isRB) {
      return formatRBGameLogs(player, gameLogs, avgLabel);
    } else if (isWRTE) {
      return formatWRTEGameLogs(player, gameLogs, avgLabel);
    } else {
      // Generic format for other positions
      return formatWRTEGameLogs(player, gameLogs, avgLabel);
    }
  }
  
  // Handle "vs team" queries
  if (parsed.timeFrame === "vs_team" && parsed.teamFilter) {
    const allGameLogs = await getPlayerGameLogs(player.id, 50);
    const filteredGames = allGameLogs.filter(g => 
      g.opponent_abbr?.toUpperCase() === parsed.teamFilter?.toUpperCase() ||
      g.opponent_name?.toLowerCase().includes(parsed.teamFilter?.toLowerCase() || "")
    );
    
    if (filteredGames.length === 0) {
      return `I don't have game data for ${player.name} against ${parsed.teamFilter}.`;
    }
    
    const avgLabel = `vs ${parsed.teamFilter} (${filteredGames.length} games)`;
    
    if (isQB) {
      return formatQBGameLogs(player, filteredGames, avgLabel);
    } else if (isRB) {
      return formatRBGameLogs(player, filteredGames, avgLabel);
    } else {
      return formatWRTEGameLogs(player, filteredGames, avgLabel);
    }
  }
  
  // Default: season stats
  const seasonStats = await getPlayerSeasonStats(player.id);
  
  if (!seasonStats) {
    return `🏈 ${player.name} (${position}, ${player.team_abbr || player.team_name})\n\nI found the player but don't have their stats yet. Stats data is being synced.`;
  }
  
  return formatSeasonStats(player, seasonStats);
}

/**
 * Check if a query should be handled by this handler
 */
export function shouldHandleNFLStats(query: string): boolean {
  const parsed = parseNFLStatsQuery(query);
  return parsed.playerName !== null;
}
