interface Suggestion {
  text: string;
  query: string;
}

// Common NFL player names for detection
const NFL_PLAYERS = [
  "mahomes", "allen", "hurts", "burrow", "jackson", "herbert", "lawrence", "stroud",
  "love", "richardson", "purdy", "prescott", "cousins", "mayfield", "goff", "stafford",
  "henry", "mccaffrey", "chubb", "cook", "barkley", "taylor", "mixon", "ekeler",
  "hill", "jefferson", "chase", "lamb", "diggs", "adams", "brown", "waddle", "kelce",
  "andrews", "kittle", "waller", "hockenson", "pitts"
];

// NBA player names
const NBA_PLAYERS = [
  "lebron", "james", "curry", "steph", "durant", "giannis", "jokic", "embiid",
  "tatum", "luka", "doncic", "morant", "booker", "mitchell", "brown", "edwards",
  "wembanyama", "gilgeous", "alexander", "lillard", "harden", "kyrie", "irving"
];

// Team name patterns
const NFL_TEAMS = [
  "chiefs", "bills", "eagles", "bengals", "ravens", "chargers", "jaguars", "texans",
  "packers", "colts", "dolphins", "lions", "49ers", "niners", "cowboys", "buccaneers",
  "jets", "vikings", "seahawks", "broncos", "raiders", "steelers", "browns", "saints",
  "falcons", "panthers", "commanders", "giants", "rams", "cardinals", "bears", "patriots"
];

const NBA_TEAMS = [
  "lakers", "celtics", "warriors", "bucks", "nuggets", "76ers", "sixers", "suns",
  "heat", "nets", "knicks", "mavs", "mavericks", "grizzlies", "cavaliers", "cavs",
  "pelicans", "thunder", "timberwolves", "wolves", "clippers", "kings", "hawks",
  "bulls", "raptors", "jazz", "spurs", "rockets", "magic", "pistons", "hornets", "blazers"
];

// Stat keywords
const STAT_KEYWORDS = {
  passing: ["pass", "passing", "yards", "touchdowns", "tds", "completions", "attempts", "passer rating"],
  rushing: ["rush", "rushing", "carries", "rushing yards", "yards per carry"],
  receiving: ["receiving", "receptions", "catches", "targets", "receiving yards", "rec"],
  scoring: ["points", "scoring", "ppg", "rebounds", "assists", "steals", "blocks", "3-pointers", "threes"],
  general: ["stats", "statistics", "performance", "average", "season"]
};

// Betting keywords
const BETTING_KEYWORDS = ["odds", "spread", "line", "moneyline", "over", "under", "total", "prop", "bet", "betting"];

function detectPlayerName(query: string): string | null {
  const lowerQuery = query.toLowerCase();
  
  // Check NFL players
  for (const player of NFL_PLAYERS) {
    if (lowerQuery.includes(player)) {
      return player.charAt(0).toUpperCase() + player.slice(1);
    }
  }
  
  // Check NBA players
  for (const player of NBA_PLAYERS) {
    if (lowerQuery.includes(player)) {
      return player.charAt(0).toUpperCase() + player.slice(1);
    }
  }
  
  // Try to extract a capitalized name pattern
  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  const matches = query.match(namePattern);
  if (matches && matches.length > 0) {
    // Filter out common non-name words
    const filteredMatches = matches.filter(m => 
      !["The", "What", "How", "Who", "When", "Where", "This", "That", "Game", "Team"].includes(m)
    );
    if (filteredMatches.length > 0) {
      return filteredMatches[0];
    }
  }
  
  return null;
}

function detectTeamNames(query: string): string[] {
  const lowerQuery = query.toLowerCase();
  const foundTeams: string[] = [];
  
  for (const team of [...NFL_TEAMS, ...NBA_TEAMS]) {
    if (lowerQuery.includes(team)) {
      foundTeams.push(team.charAt(0).toUpperCase() + team.slice(1));
    }
  }
  
  return foundTeams;
}

function detectStatType(query: string): string | null {
  const lowerQuery = query.toLowerCase();
  
  for (const [category, keywords] of Object.entries(STAT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerQuery.includes(keyword)) {
        return category;
      }
    }
  }
  
  return null;
}

function detectQueryType(query: string): "player" | "game" | "prop" | "odds" | "general" {
  const lowerQuery = query.toLowerCase();
  
  // Check for prop bet queries
  if (lowerQuery.includes("prop") || (lowerQuery.includes("line") && detectPlayerName(query))) {
    return "prop";
  }
  
  // Check for odds/betting queries
  if (BETTING_KEYWORDS.some(kw => lowerQuery.includes(kw))) {
    return "odds";
  }
  
  // Check for game/matchup queries
  if (lowerQuery.includes("game") || lowerQuery.includes("matchup") || 
      lowerQuery.includes(" vs ") || lowerQuery.includes(" at ") ||
      detectTeamNames(query).length >= 2) {
    return "game";
  }
  
  // Check for player queries
  if (detectPlayerName(query)) {
    return "player";
  }
  
  return "general";
}

export function generateFollowUpSuggestions(query: string, response: string): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const queryType = detectQueryType(query);
  const playerName = detectPlayerName(query);
  const teams = detectTeamNames(query);
  const statType = detectStatType(query);
  
  switch (queryType) {
    case "player":
      if (playerName) {
        // Career/season stats queries
        if (query.toLowerCase().includes("career") || query.toLowerCase().includes("season")) {
          suggestions.push({
            text: `${playerName}'s last 5 games?`,
            query: `How has ${playerName} performed in the last 5 games?`
          });
        }
        
        // Specific stat queries
        if (statType) {
          suggestions.push({
            text: `${playerName}'s prop lines?`,
            query: `What are ${playerName}'s prop lines for the next game?`
          });
        }
        
        // Team matchup context
        if (teams.length > 0) {
          suggestions.push({
            text: `Home vs away splits?`,
            query: `How does ${playerName} perform at home versus away?`
          });
        }
        
        // Default player follow-ups
        if (suggestions.length < 2) {
          suggestions.push({
            text: `${playerName}'s next game?`,
            query: `When is ${playerName}'s next game and who do they play?`
          });
        }
        if (suggestions.length < 3) {
          suggestions.push({
            text: `Compare to similar players?`,
            query: `How does ${playerName} compare to other top players at their position?`
          });
        }
      }
      break;
      
    case "game":
      if (teams.length > 0) {
        suggestions.push({
          text: "Current odds?",
          query: `What are the current odds for the ${teams.join(" vs ")} game?`
        });
        suggestions.push({
          text: "Over/under line?",
          query: `What's the over/under total for ${teams.join(" vs ")}?`
        });
        suggestions.push({
          text: "Sharp money action?",
          query: `How are sharps betting on the ${teams.join(" vs ")} game?`
        });
      } else {
        suggestions.push({
          text: "Today's best odds?",
          query: "What are the best odds for today's games?"
        });
        suggestions.push({
          text: "Biggest spreads?",
          query: "Which games have the biggest point spreads today?"
        });
      }
      break;
      
    case "prop":
      if (playerName) {
        suggestions.push({
          text: `${playerName}'s recent average?`,
          query: `What's ${playerName}'s average in the last 5 games for this stat?`
        });
        suggestions.push({
          text: "Hit rate on this line?",
          query: `How often does ${playerName} hit this line?`
        });
        suggestions.push({
          text: "Best sportsbook line?",
          query: `Which sportsbook has the best line for ${playerName}?`
        });
      } else {
        suggestions.push({
          text: "Top props today?",
          query: "What are the best prop bets for today's games?"
        });
        suggestions.push({
          text: "High-value props?",
          query: "Which player props have the most value today?"
        });
      }
      break;
      
    case "odds":
      suggestions.push({
        text: "Line movement?",
        query: "Has this line moved since opening?"
      });
      suggestions.push({
        text: "Best sportsbook?",
        query: "Which sportsbook has the best line for this game?"
      });
      suggestions.push({
        text: "Public vs sharp money?",
        query: "Where is the public money vs sharp money on this game?"
      });
      break;
      
    default:
      // General fallback suggestions
      suggestions.push({
        text: "Today's games?",
        query: "What games are happening today?"
      });
      suggestions.push({
        text: "Best betting values?",
        query: "What are the best betting values for today?"
      });
      suggestions.push({
        text: "Line movements?",
        query: "Which lines have moved the most today?"
      });
  }
  
  // Filter out any suggestions that might be too similar to the original query
  const lowerQuery = query.toLowerCase();
  const filteredSuggestions = suggestions.filter(s => {
    const lowerSuggestionQuery = s.query.toLowerCase();
    // Check for significant overlap
    const overlap = lowerQuery.split(" ").filter(word => 
      word.length > 3 && lowerSuggestionQuery.includes(word)
    ).length;
    return overlap < 4; // Allow some overlap but not too much
  });
  
  return filteredSuggestions.slice(0, 3);
}
