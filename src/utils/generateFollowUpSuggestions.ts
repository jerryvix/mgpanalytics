import { Suggestion, QueryContext, QueryType } from "./suggestions/types";
import { 
  detectSport, 
  detectPlayerName, 
  detectTeamNames, 
  detectStatType,
  detectPosition 
} from "./suggestions/sportDetection";
import { getSportSpecificSuggestions } from "./suggestions/sportTemplates";

// Re-export types for backward compatibility
export type { Suggestion };

// Betting keywords for query type detection
const BETTING_KEYWORDS = ["odds", "spread", "line", "moneyline", "over", "under", "total", "prop", "bet", "betting"];

// Game log / historical query patterns
const GAME_LOG_PATTERNS = [
  /last\s*\d*\s*games?/i,
  /past\s*\d*\s*games?/i,
  /recent\s*\d*\s*games?/i,
  /game\s*log/i,
  /vs\s+\w+/i,
  /against\s+\w+/i,
  /game[- ]by[- ]game/i,
];

function isGameLogQuery(query: string): boolean {
  return GAME_LOG_PATTERNS.some(pattern => pattern.test(query));
}

function detectQueryType(query: string, hasPlayer: boolean, teamCount: number): QueryType {
  const lowerQuery = query.toLowerCase();
  
  // Check for prop bet queries
  if (lowerQuery.includes("prop") || (lowerQuery.includes("line") && hasPlayer)) {
    return "prop";
  }
  
  // Check for odds/betting queries
  if (BETTING_KEYWORDS.some(kw => lowerQuery.includes(kw))) {
    return "odds";
  }
  
  // Check for game/matchup queries
  if (lowerQuery.includes("game") || lowerQuery.includes("matchup") || 
      lowerQuery.includes(" vs ") || lowerQuery.includes(" at ") ||
      teamCount >= 2) {
    return "game";
  }
  
  // Check for player queries
  if (hasPlayer) {
    return "player";
  }
  
  return "general";
}

function buildQueryContext(query: string): QueryContext {
  const sport = detectSport(query);
  const playerName = detectPlayerName(query);
  const teams = detectTeamNames(query);
  let statType = detectStatType(query);
  const position = detectPosition(query, sport);
  const queryType = detectQueryType(query, !!playerName, teams.length);
  
  // If this is a game log query, mark statType as historical for better suggestions
  if (isGameLogQuery(query) && playerName) {
    statType = "historical";
  }
  
  return {
    sport,
    queryType,
    playerName,
    teams,
    statType,
    position
  };
}

export function generateFollowUpSuggestions(query: string, response: string): Suggestion[] {
  // Build context from query
  const context = buildQueryContext(query);
  
  // Get sport-specific suggestions
  let suggestions = getSportSpecificSuggestions(context);
  
  // Filter out suggestions too similar to the original query
  const lowerQuery = query.toLowerCase();
  const filteredSuggestions = suggestions.filter(s => {
    const lowerSuggestionQuery = s.query.toLowerCase();
    // Check for significant overlap
    const queryWords = lowerQuery.split(" ").filter(word => word.length > 3);
    const overlap = queryWords.filter(word => lowerSuggestionQuery.includes(word)).length;
    return overlap < 4; // Allow some overlap but not too much
  });
  
  // Return max 3 suggestions
  return filteredSuggestions.slice(0, 3);
}
