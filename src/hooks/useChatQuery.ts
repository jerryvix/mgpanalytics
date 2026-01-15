import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, isThisWeek, isToday, isTomorrow, startOfWeek, endOfWeek, addDays } from "date-fns";

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

export function useChatQuery() {
  const processQuery = async (query: string): Promise<string> => {
    const lowerQuery = query.toLowerCase().trim();
    
    try {
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
      
      // TYPE D: Stats queries
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
        lowerQuery.includes("player") ||
        lowerQuery.includes("stats") ||
        lowerQuery.includes("injury") ||
        lowerQuery.includes("injuries") ||
        lowerQuery.includes("roster") ||
        lowerQuery.includes("depth chart")
      ) {
        return "I don't have player-level stats wired in yet. That data is coming online soon. I can show team-level trends or odds for any game if you'd like. Try asking: \"What are the Bills odds?\"";
      }
      
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
      return "I can help with upcoming NFL games and odds! Try asking:\n• \"What games are this weekend?\"\n• \"What are the Chiefs odds?\"\n• \"Who is playing the Bills?\"\n• \"What's the biggest spread?\"";
      
    } catch (error) {
      console.error("Chat query error:", error);
      return "Oops, having trouble fetching that data. Try again in a moment.";
    }
  };
  
  const handleGamesQuery = async (query: string): Promise<string> => {
    const { data: games, error } = await supabase
      .from("games")
      .select("*")
      .eq("league", "NFL")
      .in("status", ["scheduled", "Scheduled", "SCHEDULED", "live", "Live", "LIVE", "in progress", "In Progress"])
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
    // Find the game for this team
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("*")
      .eq("league", "NFL")
      .in("status", ["scheduled", "Scheduled", "SCHEDULED", "live", "Live", "LIVE", "in progress", "In Progress"])
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
      .in("status", ["scheduled", "Scheduled", "SCHEDULED"])
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
      .in("status", ["scheduled", "Scheduled", "SCHEDULED", "live", "Live", "LIVE"])
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
    // Get all upcoming games with odds
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("*")
      .eq("league", "NFL")
      .in("status", ["scheduled", "Scheduled", "SCHEDULED"]);
    
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
    // Get game info and odds for the team
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("*")
      .eq("league", "NFL")
      .in("status", ["scheduled", "Scheduled", "SCHEDULED", "live", "Live", "LIVE"])
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
