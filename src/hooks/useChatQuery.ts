import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, isToday, isTomorrow, startOfWeek, endOfWeek } from "date-fns";

interface Game {
  id: number;
  home_team_name: string;
  visitor_team_name: string;
  status: string;
  date: string;
  league: string;
}

interface Odd {
  id: string;
  game_id: number;
  sportsbook: string;
  spread_value: number | null;
  spread_odds: number | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
  total_value: number | null;
  total_over_odds: number | null;
  total_under_odds: number | null;
  updated_at: string;
}

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

interface PlayerSeasonStats {
  id: string;
  player_id: string | null;
  season: number;
  games_played: number | null;
  pass_yards: number | null;
  pass_td: number | null;
  pass_int: number | null;
  rush_yards: number | null;
  rush_td: number | null;
  rush_attempts: number | null;
  receptions: number | null;
  rec_yards: number | null;
  rec_td: number | null;
  targets: number | null;
  fantasy_points: number | null;
  fantasy_points_ppr: number | null;
}

// Common NFL player names for quick detection
const KNOWN_PLAYERS = [
  "josh allen", "patrick mahomes", "lamar jackson", "jalen hurts", "joe burrow",
  "cj stroud", "c.j. stroud", "tua tagovailoa", "dak prescott", "justin herbert",
  "saquon barkley", "derrick henry", "breece hall", "bijan robinson", "jahmyr gibbs",
  "jonathan taylor", "christian mccaffrey", "josh jacobs", "kyren williams", "james cook",
  "tyreek hill", "ja'marr chase", "jamarr chase", "ceedee lamb", "cd lamb", "amon-ra st. brown",
  "davante adams", "garrett wilson", "mike evans", "deebo samuel", "cooper kupp",
  "travis kelce", "sam laporta", "george kittle", "mark andrews", "t.j. hockenson",
  "justin jefferson", "a.j. brown", "aj brown", "stefon diggs", "dk metcalf",
];

// Team name variations for matching
const TEAM_ALIASES: Record<string, string[]> = {
  "Buffalo Bills": ["bills", "buffalo"],
  "Kansas City Chiefs": ["chiefs", "kc", "kansas city"],
  "Philadelphia Eagles": ["eagles", "philly", "philadelphia"],
  "San Francisco 49ers": ["49ers", "niners", "san francisco", "sf"],
  "Detroit Lions": ["lions", "detroit"],
  "Green Bay Packers": ["packers", "green bay", "gb"],
  "Baltimore Ravens": ["ravens", "baltimore"],
  "Houston Texans": ["texans", "houston"],
  "Dallas Cowboys": ["cowboys", "dallas"],
  "Miami Dolphins": ["dolphins", "miami"],
  "New York Jets": ["jets", "ny jets"],
  "New York Giants": ["giants", "ny giants"],
  "Los Angeles Rams": ["rams", "la rams"],
  "Los Angeles Chargers": ["chargers", "la chargers"],
  "Seattle Seahawks": ["seahawks", "seattle"],
  "Denver Broncos": ["broncos", "denver"],
  "Tampa Bay Buccaneers": ["bucs", "buccaneers", "tampa", "tampa bay"],
  "New Orleans Saints": ["saints", "new orleans"],
  "Atlanta Falcons": ["falcons", "atlanta"],
  "Carolina Panthers": ["panthers", "carolina"],
  "Minnesota Vikings": ["vikings", "minnesota"],
  "Chicago Bears": ["bears", "chicago"],
  "Arizona Cardinals": ["cardinals", "arizona"],
  "Las Vegas Raiders": ["raiders", "las vegas", "vegas"],
  "Cincinnati Bengals": ["bengals", "cincy", "cincinnati"],
  "Cleveland Browns": ["browns", "cleveland"],
  "Pittsburgh Steelers": ["steelers", "pittsburgh"],
  "Indianapolis Colts": ["colts", "indy", "indianapolis"],
  "Jacksonville Jaguars": ["jaguars", "jags", "jacksonville"],
  "Tennessee Titans": ["titans", "tennessee"],
  "New England Patriots": ["patriots", "pats", "new england"],
  "Washington Commanders": ["commanders", "washington"],
};

function findTeamName(query: string): string | null {
  const lowerQuery = query.toLowerCase();
  
  for (const [fullName, aliases] of Object.entries(TEAM_ALIASES)) {
    if (aliases.some(alias => lowerQuery.includes(alias))) {
      return fullName;
    }
    if (lowerQuery.includes(fullName.toLowerCase())) {
      return fullName;
    }
  }
  return null;
}

// Detect player names in query
function detectPlayerName(query: string): string | null {
  const lowerQuery = query.toLowerCase();
  
  // Check known players first
  for (const player of KNOWN_PLAYERS) {
    if (lowerQuery.includes(player)) {
      return player;
    }
  }
  
  // Try to detect "first last" pattern (2-3 word names)
  const words = lowerQuery.split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    const twoWord = `${words[i]} ${words[i + 1]}`;
    // Skip common phrases
    if (["top 5", "top 10", "how is", "who is", "what is", "tell me", "show me"].includes(twoWord)) continue;
    // If word looks like a name (capitalized in original or starts with letter)
    if (words[i].length > 1 && words[i + 1].length > 1) {
      // Check if it might be a player name pattern
      if (!["the", "and", "for", "with", "about", "from"].includes(words[i])) {
        return twoWord;
      }
    }
  }
  
  return null;
}

// Detect position queries
function detectPositionQuery(query: string): { position: string; limit: number } | null {
  const lowerQuery = query.toLowerCase();
  
  // Detect "top N" pattern
  const topMatch = lowerQuery.match(/top\s*(\d+)/);
  const limit = topMatch ? parseInt(topMatch[1]) : 5;
  
  if (lowerQuery.includes("quarterback") || lowerQuery.match(/\bqb[s]?\b/)) {
    return { position: "QB", limit };
  }
  if (lowerQuery.includes("running back") || lowerQuery.match(/\brb[s]?\b/)) {
    return { position: "RB", limit };
  }
  if (lowerQuery.includes("wide receiver") || lowerQuery.match(/\bwr[s]?\b/)) {
    return { position: "WR", limit };
  }
  if (lowerQuery.includes("tight end") || lowerQuery.match(/\bte[s]?\b/)) {
    return { position: "TE", limit };
  }
  
  return null;
}

function formatPrice(price: number | null): string {
  if (price === null) return "N/A";
  return price >= 0 ? `+${price}` : `${price}`;
}

function formatLine(line: number | null): string {
  if (line === null) return "N/A";
  return line >= 0 ? `+${line}` : `${line}`;
}

function formatGameTime(dateString: string): string {
  try {
    const date = parseISO(dateString);
    return format(date, "MMM d, h:mm a");
  } catch {
    return dateString;
  }
}

function formatDataFreshness(dateString: string): string {
  try {
    const date = parseISO(dateString);
    return format(date, "MMM d, h:mm a");
  } catch {
    return "recently";
  }
}

function formatNumber(n: number | null): string {
  if (n === null || n === undefined) return "0";
  return n.toLocaleString();
}

export function useChatQuery() {
  // Player lookup by name
  const findPlayer = async (name: string): Promise<Player | null> => {
    // Try exact match first
    const { data: exactMatch } = await supabase
      .from("players")
      .select("*")
      .eq("sport", "NFL")
      .ilike("name", `%${name}%`)
      .limit(1);
    
    if (exactMatch && exactMatch.length > 0) {
      return exactMatch[0] as Player;
    }
    
    // Try first + last name concatenation
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
        return nameMatch[0] as Player;
      }
    }
    
    return null;
  };

  // Get player season stats
  const getPlayerStats = async (playerId: string): Promise<PlayerSeasonStats | null> => {
    const { data } = await supabase
      .from("player_season_stats")
      .select("*")
      .eq("player_id", playerId)
      .eq("sport", "NFL")
      .order("season", { ascending: false })
      .limit(1);
    
    if (data && data.length > 0) {
      return data[0] as PlayerSeasonStats;
    }
    return null;
  };

  // Handle player query
  const handlePlayerQuery = async (playerName: string): Promise<string> => {
    const player = await findPlayer(playerName);
    
    if (!player) {
      return `I couldn't find "${playerName}" in the database. Try the full name (e.g., "Josh Allen" or "Patrick Mahomes").`;
    }
    
    const stats = await getPlayerStats(player.id);
    const displayName = player.name || `${player.first_name} ${player.last_name}`;
    const position = player.position || "Unknown";
    const team = player.team_name || player.team_abbr || "Unknown Team";
    
    if (!stats) {
      return `🏈 ${displayName} (${position}, ${team})\n\nI found the player but don't have their stats yet. Stats data is being synced.`;
    }
    
    // Build response based on position
    let response = `🏈 ${displayName} (${position}, ${team}) - ${stats.season} Season:\n\n`;
    
    if (position === "QB") {
      response += `Passing: ${formatNumber(stats.pass_yards)} yards, ${stats.pass_td || 0} TDs, ${stats.pass_int || 0} INTs\n`;
      if (stats.rush_yards && stats.rush_yards > 0) {
        response += `Rushing: ${formatNumber(stats.rush_yards)} yards, ${stats.rush_td || 0} TDs\n`;
      }
    } else if (position === "RB") {
      response += `Rushing: ${formatNumber(stats.rush_yards)} yards, ${stats.rush_td || 0} TDs (${stats.rush_attempts || 0} carries)\n`;
      if (stats.receptions && stats.receptions > 0) {
        response += `Receiving: ${stats.receptions} rec, ${formatNumber(stats.rec_yards)} yards, ${stats.rec_td || 0} TDs\n`;
      }
    } else if (position === "WR" || position === "TE") {
      response += `Receiving: ${stats.receptions || 0} rec, ${formatNumber(stats.rec_yards)} yards, ${stats.rec_td || 0} TDs\n`;
      if (stats.targets) {
        response += `Targets: ${stats.targets}\n`;
      }
    } else {
      // Generic stats
      if (stats.pass_yards && stats.pass_yards > 0) {
        response += `Passing: ${formatNumber(stats.pass_yards)} yards, ${stats.pass_td || 0} TDs\n`;
      }
      if (stats.rush_yards && stats.rush_yards > 0) {
        response += `Rushing: ${formatNumber(stats.rush_yards)} yards, ${stats.rush_td || 0} TDs\n`;
      }
      if (stats.rec_yards && stats.rec_yards > 0) {
        response += `Receiving: ${stats.receptions || 0} rec, ${formatNumber(stats.rec_yards)} yards\n`;
      }
    }
    
    response += `Games: ${stats.games_played || 0}`;
    
    if (stats.fantasy_points_ppr) {
      response += ` | Fantasy (PPR): ${stats.fantasy_points_ppr.toFixed(1)}`;
    }
    
    return response;
  };

  // Handle leaderboard queries
  const handleLeaderboardQuery = async (position: string, limit: number): Promise<string> => {
    let orderBy = "fantasy_points_ppr";
    let statLabel = "Fantasy PPR";
    
    if (position === "QB") {
      orderBy = "pass_yards";
      statLabel = "Pass Yards";
    } else if (position === "RB") {
      orderBy = "rush_yards";
      statLabel = "Rush Yards";
    } else if (position === "WR" || position === "TE") {
      orderBy = "rec_yards";
      statLabel = "Rec Yards";
    }
    
    // Get player IDs for position
    const { data: players } = await supabase
      .from("players")
      .select("id, name, first_name, last_name, team_abbr")
      .eq("sport", "NFL")
      .eq("position", position);
    
    if (!players || players.length === 0) {
      return `No ${position}s found in the database.`;
    }
    
    const playerIds = players.map(p => p.id);
    
    // Get stats ordered by the relevant stat
    const { data: stats } = await supabase
      .from("player_season_stats")
      .select("*")
      .in("player_id", playerIds)
      .eq("sport", "NFL")
      .eq("season", 2025)
      .order(orderBy, { ascending: false, nullsFirst: false })
      .limit(limit);
    
    if (!stats || stats.length === 0) {
      return `No ${position} stats found for 2025 season.`;
    }
    
    const playerMap = new Map(players.map(p => [p.id, p]));
    
    let response = `🏈 Top ${limit} ${position}s (${statLabel}):\n\n`;
    
    stats.forEach((s, i) => {
      const player = playerMap.get(s.player_id);
      const name = player?.name || `${player?.first_name} ${player?.last_name}` || "Unknown";
      const team = player?.team_abbr || "";
      
      let statValue = "";
      if (position === "QB") {
        statValue = `${formatNumber(s.pass_yards)} yds, ${s.pass_td} TD`;
      } else if (position === "RB") {
        statValue = `${formatNumber(s.rush_yards)} yds, ${s.rush_td} TD`;
      } else {
        statValue = `${formatNumber(s.rec_yards)} yds, ${s.rec_td} TD`;
      }
      
      response += `${i + 1}. ${name} (${team}): ${statValue}\n`;
    });
    
    return response;
  };

  const processQuery = async (query: string): Promise<string> => {
    const lowerQuery = query.toLowerCase().trim();
    
    try {
      // PRIORITY 1: Leaderboard queries (top QBs, best RBs, etc.)
      const positionQuery = detectPositionQuery(lowerQuery);
      if (positionQuery && (lowerQuery.includes("top") || lowerQuery.includes("best") || lowerQuery.includes("leading"))) {
        return await handleLeaderboardQuery(positionQuery.position, positionQuery.limit);
      }
      
      // PRIORITY 2: Player-specific queries
      const playerName = detectPlayerName(lowerQuery);
      if (playerName) {
        return await handlePlayerQuery(playerName);
      }
      
      // TYPE A: Games by date
      if (
        lowerQuery.includes("what games") ||
        lowerQuery.includes("which games") ||
        lowerQuery.includes("games this") ||
        lowerQuery.includes("games today") ||
        lowerQuery.includes("games tomorrow") ||
        lowerQuery.includes("upcoming games") ||
        lowerQuery.includes("any games")
      ) {
        return await handleGamesQuery(lowerQuery);
      }
      
      // TYPE B: Team odds
      if (
        lowerQuery.includes("odds") ||
        lowerQuery.includes("spread") ||
        lowerQuery.includes("moneyline") ||
        lowerQuery.includes("line")
      ) {
        const teamName = findTeamName(lowerQuery);
        if (teamName) {
          return await handleOddsQuery(teamName);
        }
        // General odds question without team
        return await handleAllOddsQuery();
      }
      
      // TYPE C: Who is playing
      if (
        lowerQuery.includes("who is playing") ||
        lowerQuery.includes("who are") ||
        lowerQuery.includes("playing against") ||
        lowerQuery.includes("opponent") ||
        lowerQuery.includes("matchup")
      ) {
        const teamName = findTeamName(lowerQuery);
        if (teamName) {
          return await handleMatchupQuery(teamName);
        }
      }
      
      // TYPE D: Stats queries (spreads/totals)
      if (
        lowerQuery.includes("biggest") ||
        lowerQuery.includes("highest") ||
        lowerQuery.includes("largest") ||
        lowerQuery.includes("favorite") ||
        lowerQuery.includes("underdog")
      ) {
        return await handleStatsQuery(lowerQuery);
      }
      
      // Team info without specific request
      const teamName = findTeamName(lowerQuery);
      if (teamName) {
        return await handleTeamQuery(teamName);
      }
      
      // TYPE E: Fallback for unsupported features
      if (
        lowerQuery.includes("prediction") ||
        lowerQuery.includes("pick") ||
        lowerQuery.includes("who will win") ||
        lowerQuery.includes("should i bet")
      ) {
        return "I'm not wired into predictions yet. Once that layer is live, it will help with matchup-level analysis. For now, I can walk you through the current odds and line movement. Want to see odds for a specific team?";
      }
      
      if (
        lowerQuery.includes("history") ||
        lowerQuery.includes("record") ||
        lowerQuery.includes("past games") ||
        lowerQuery.includes("last game")
      ) {
        return "Historical data isn't active yet, but it's planned. Once available, it will add context for trends and patterns. I can show you the current upcoming schedule and odds though!";
      }
      
      // General fallback
      return "I can help with NFL games, odds, and player stats! Try asking:\n• \"How is Josh Allen doing?\"\n• \"Top 5 QBs\"\n• \"What are the Chiefs odds?\"\n• \"What games are this weekend?\"";
      
    } catch (error) {
      console.error("Chat query error:", error);
      return "Oops, having trouble fetching that data. Try again in a moment.";
    }
  };
  
  const handleGamesQuery = async (query: string): Promise<string> => {
    // Get games that are not final/completed - includes various status formats
    const { data: games, error } = await supabase
      .from("games")
      .select("*")
      .eq("league", "NFL")
      .not("status", "ilike", "%final%")
      .gte("date", new Date().toISOString())
      .order("date", { ascending: true });
    
    if (error) throw error;
    
    if (!games || games.length === 0) {
      return "No upcoming NFL games found right now. Check back later for new matchups!";
    }
    
    // Filter based on time reference in query
    let filteredGames = games;
    const now = new Date();
    
    if (query.includes("today")) {
      filteredGames = games.filter(g => isToday(parseISO(g.date)));
    } else if (query.includes("tomorrow")) {
      filteredGames = games.filter(g => isTomorrow(parseISO(g.date)));
    } else if (query.includes("weekend") || query.includes("this week")) {
      const weekStart = startOfWeek(now, { weekStartsOn: 0 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 0 });
      filteredGames = games.filter(g => {
        const gameDate = parseISO(g.date);
        return gameDate >= weekStart && gameDate <= weekEnd;
      });
    }
    
    if (filteredGames.length === 0) {
      // Fall back to all upcoming games
      filteredGames = games.slice(0, 5);
      const gamesList = filteredGames
        .map(g => `${g.visitor_team_name} @ ${g.home_team_name} (${formatGameTime(g.date)})`)
        .join("\n• ");
      
      return `🏈 Upcoming games:\n• ${gamesList}${games.length > 5 ? `\n\n...and ${games.length - 5} more!` : ""}`;
    }
    
    const gamesList = filteredGames
      .map(g => `${g.visitor_team_name} @ ${g.home_team_name} (${formatGameTime(g.date)})`)
      .join("\n• ");
    
    return `🏈 ${filteredGames.length} game${filteredGames.length > 1 ? "s" : ""} found:\n• ${gamesList}`;
  };
  
  const handleOddsQuery = async (teamName: string): Promise<string> => {
    // Find the game for this team - not final and in the future
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("*")
      .eq("league", "NFL")
      .not("status", "ilike", "%final%")
      .gte("date", new Date().toISOString())
      .or(`home_team_name.ilike.%${teamName}%,visitor_team_name.ilike.%${teamName}%`)
      .order("date", { ascending: true })
      .limit(1);
    
    if (gamesError) throw gamesError;
    
    if (!games || games.length === 0) {
      return `I don't see an upcoming game for the ${teamName.split(" ").pop()} right now. They might not have a scheduled matchup yet.`;
    }
    
    const game = games[0];
    const isHome = game.home_team_name.toLowerCase().includes(teamName.toLowerCase().split(" ").pop() || "");
    const opponent = isHome ? game.visitor_team_name : game.home_team_name;
    
    // Get DraftKings odds
    const { data: odds, error: oddsError } = await supabase
      .from("odds")
      .select("*")
      .eq("game_id", game.id)
      .ilike("sportsbook", "%draftkings%")
      .limit(1);
    
    if (oddsError) throw oddsError;
    
    if (!odds || odds.length === 0) {
      return `📊 ${teamName.split(" ").pop()} vs ${opponent.split(" ").pop()} (${formatGameTime(game.date)})\n\nOdds aren't available yet for this game. Check back closer to game time!`;
    }
    
    const o = odds[0];
    const teamSpread = isHome ? o.spread_value : (o.spread_value ? -o.spread_value : null);
    const teamML = isHome ? o.moneyline_home : o.moneyline_away;
    
    let response = `📊 ${teamName.split(" ").pop()} vs ${opponent.split(" ").pop()} (${formatGameTime(game.date)})\n\n`;
    response += `Spread: ${formatLine(teamSpread)}\n`;
    response += `Moneyline: ${formatPrice(teamML)}\n`;
    response += `Total: ${o.total_value || "N/A"}\n\n`;
    response += `(DraftKings • Synced: ${formatDataFreshness(o.updated_at)})`;
    
    return response;
  };
  
  const handleAllOddsQuery = async (): Promise<string> => {
    const { data: games, error } = await supabase
      .from("games")
      .select("*")
      .eq("league", "NFL")
      .not("status", "ilike", "%final%")
      .gte("date", new Date().toISOString())
      .order("date", { ascending: true })
      .limit(3);
    
    if (error) throw error;
    
    if (!games || games.length === 0) {
      return "No upcoming games with odds available right now.";
    }
    
    const gameIds = games.map(g => g.id);
    const { data: allOdds, error: oddsError } = await supabase
      .from("odds")
      .select("*")
      .in("game_id", gameIds)
      .ilike("sportsbook", "%draftkings%");
    
    if (oddsError) throw oddsError;
    
    let response = "📊 Quick odds overview:\n\n";
    
    for (const game of games) {
      const odds = allOdds?.find(o => o.game_id === game.id);
      response += `${game.visitor_team_name.split(" ").pop()} @ ${game.home_team_name.split(" ").pop()}: `;
      if (odds) {
        response += `Spread ${formatLine(odds.spread_value)}, Total ${odds.total_value || "N/A"}`;
      } else {
        response += "Odds TBD";
      }
      response += "\n";
    }
    
    response += "\nAsk about a specific team for more details!";
    return response;
  };
  
  const handleMatchupQuery = async (teamName: string): Promise<string> => {
    const { data: games, error } = await supabase
      .from("games")
      .select("*")
      .eq("league", "NFL")
      .not("status", "ilike", "%final%")
      .gte("date", new Date().toISOString())
      .or(`home_team_name.ilike.%${teamName}%,visitor_team_name.ilike.%${teamName}%`)
      .order("date", { ascending: true })
      .limit(1);
    
    if (error) throw error;
    
    if (!games || games.length === 0) {
      return `I don't see an upcoming game for the ${teamName.split(" ").pop()} right now.`;
    }
    
    const game = games[0];
    const isHome = game.home_team_name.toLowerCase().includes(teamName.toLowerCase().split(" ").pop() || "");
    const opponent = isHome ? game.visitor_team_name : game.home_team_name;
    const location = isHome ? "at home" : "on the road";
    
    return `🏈 The ${teamName.split(" ").pop()} are playing the ${opponent.split(" ").pop()} ${location} on ${formatGameTime(game.date)}.`;
  };
  
  const handleStatsQuery = async (query: string): Promise<string> => {
    // Get all upcoming games with odds - not final and in the future
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("*")
      .eq("league", "NFL")
      .not("status", "ilike", "%final%")
      .gte("date", new Date().toISOString());
    
    if (gamesError) throw gamesError;
    
    if (!games || games.length === 0) {
      return "No upcoming games to analyze right now.";
    }
    
    const gameIds = games.map(g => g.id);
    const { data: allOdds, error: oddsError } = await supabase
      .from("odds")
      .select("*")
      .in("game_id", gameIds)
      .ilike("sportsbook", "%draftkings%");
    
    if (oddsError) throw oddsError;
    
    if (!allOdds || allOdds.length === 0) {
      return "No odds data available to analyze right now.";
    }
    
    // Find biggest favorite (most negative spread)
    if (query.includes("favorite") || query.includes("biggest spread") || query.includes("largest spread")) {
      const withSpreads = allOdds.filter(o => o.spread_value !== null);
      if (withSpreads.length === 0) return "No spread data available.";
      
      const biggestFavorite = withSpreads.reduce((min, o) => 
        (o.spread_value! < min.spread_value!) ? o : min
      );
      
      const game = games.find(g => g.id === biggestFavorite.game_id);
      if (!game) return "Couldn't find game details.";
      
      return `📊 Biggest favorite: ${game.home_team_name.split(" ").pop()} at ${formatLine(biggestFavorite.spread_value)} vs ${game.visitor_team_name.split(" ").pop()}.`;
    }
    
    // Find biggest underdog
    if (query.includes("underdog")) {
      const withSpreads = allOdds.filter(o => o.spread_value !== null);
      if (withSpreads.length === 0) return "No spread data available.";
      
      const biggestUnderdog = withSpreads.reduce((max, o) => 
        (o.spread_value! > max.spread_value!) ? o : max
      );
      
      const game = games.find(g => g.id === biggestUnderdog.game_id);
      if (!game) return "Couldn't find game details.";
      
      return `📊 Biggest underdog: ${game.visitor_team_name.split(" ").pop()} at ${formatLine(-biggestUnderdog.spread_value!)} vs ${game.home_team_name.split(" ").pop()}.`;
    }
    
    // Highest/lowest total
    if (query.includes("total") || query.includes("over") || query.includes("under")) {
      const withTotals = allOdds.filter(o => o.total_value !== null);
      if (withTotals.length === 0) return "No totals data available.";
      
      if (query.includes("highest") || query.includes("biggest")) {
        const highest = withTotals.reduce((max, o) => 
          (o.total_value! > max.total_value!) ? o : max
        );
        const game = games.find(g => g.id === highest.game_id);
        if (!game) return "Couldn't find game details.";
        
        return `📊 Highest total: ${game.home_team_name.split(" ").pop()} vs ${game.visitor_team_name.split(" ").pop()} at ${highest.total_value}.`;
      } else {
        const lowest = withTotals.reduce((min, o) => 
          (o.total_value! < min.total_value!) ? o : min
        );
        const game = games.find(g => g.id === lowest.game_id);
        if (!game) return "Couldn't find game details.";
        
        return `📊 Lowest total: ${game.home_team_name.split(" ").pop()} vs ${game.visitor_team_name.split(" ").pop()} at ${lowest.total_value}.`;
      }
    }
    
    return "I can find biggest favorites, underdogs, or highest/lowest totals. What would you like to know?";
  };
  
  const handleTeamQuery = async (teamName: string): Promise<string> => {
    // Get game info and odds for the team - not final and in the future
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("*")
      .eq("league", "NFL")
      .not("status", "ilike", "%final%")
      .gte("date", new Date().toISOString())
      .or(`home_team_name.ilike.%${teamName}%,visitor_team_name.ilike.%${teamName}%`)
      .order("date", { ascending: true })
      .limit(1);
    
    if (gamesError) throw gamesError;
    
    if (!games || games.length === 0) {
      return `I don't see an upcoming game for the ${teamName.split(" ").pop()} right now. Check back later!`;
    }
    
    const game = games[0];
    const isHome = game.home_team_name.toLowerCase().includes(teamName.toLowerCase().split(" ").pop() || "");
    const opponent = isHome ? game.visitor_team_name : game.home_team_name;
    
    // Get odds
    const { data: odds, error: oddsError } = await supabase
      .from("odds")
      .select("*")
      .eq("game_id", game.id)
      .ilike("sportsbook", "%draftkings%")
      .limit(1);
    
    if (oddsError) throw oddsError;
    
    let response = `🏈 ${teamName.split(" ").pop()} vs ${opponent.split(" ").pop()}\n`;
    response += `📅 ${formatGameTime(game.date)}\n`;
    
    if (odds && odds.length > 0) {
      const o = odds[0];
      const teamSpread = isHome ? o.spread_value : (o.spread_value ? -o.spread_value : null);
      response += `📊 Spread: ${formatLine(teamSpread)} | Total: ${o.total_value || "N/A"}`;
    } else {
      response += `📊 Odds coming soon`;
    }
    
    return response;
  };
  
  return { processQuery };
}
