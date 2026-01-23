// Player name matching utilities for chatbot queries

// Common NFL player names for quick detection
export const KNOWN_NFL_PLAYERS: string[] = [
  // QBs
  "josh allen", "patrick mahomes", "lamar jackson", "jalen hurts", "joe burrow",
  "cj stroud", "c.j. stroud", "tua tagovailoa", "dak prescott", "justin herbert",
  "brock purdy", "jared goff", "jordan love", "geno smith", "baker mayfield",
  "kyler murray", "matthew stafford", "sam darnold", "caleb williams", "jayden daniels",
  // RBs
  "saquon barkley", "derrick henry", "breece hall", "bijan robinson", "jahmyr gibbs",
  "jonathan taylor", "christian mccaffrey", "josh jacobs", "kyren williams", "james cook",
  "joe mixon", "alvin kamara", "travis etienne", "de'von achane", "devon achane",
  "aaron jones", "isiah pacheco", "ken walker", "najee harris", "rachaad white",
  // WRs
  "tyreek hill", "ja'marr chase", "jamarr chase", "ceedee lamb", "cd lamb", "amon-ra st. brown",
  "davante adams", "garrett wilson", "mike evans", "deebo samuel", "cooper kupp",
  "justin jefferson", "a.j. brown", "aj brown", "stefon diggs", "dk metcalf",
  "chris olave", "drake london", "puka nacua", "nico collins", "marvin harrison jr",
  "malik nabers", "terry mclaurin", "jaylen waddle", "brian thomas jr", "ladd mcconkey",
  // TEs
  "travis kelce", "sam laporta", "george kittle", "mark andrews", "t.j. hockenson",
  "trey mcbride", "dalton kincaid", "evan engram", "david njoku", "jake ferguson",
  // DEF notable
  "myles garrett", "t.j. watt", "tj watt", "nick bosa", "micah parsons",
  "maxx crosby", "trevon diggs", "sauce gardner", "patrick surtain",
];

export interface ParsedStatsQuery {
  playerName: string | null;
  timeFrame: "last_games" | "season" | "career" | "vs_team";
  gameCount: number;
  statType: string | null;
  teamFilter: string | null;
}

// Time frame patterns
const LAST_GAMES_PATTERN = /(?:last|past|recent|previous)\s*(\d+)?\s*(?:game[s]?|week[s]?|start[s]?)/i;
const SEASON_PATTERN = /(?:this\s+season|season\s+stats|season\s+total|2024|2025|\d{4}\s+season)/i;
const CAREER_PATTERN = /(?:career|all[- ]time|lifetime)/i;
const VS_TEAM_PATTERN = /(?:against|vs\.?|versus)\s+(?:the\s+)?(\w+(?:\s+\w+)?)/i;

// Stat type keywords
const STAT_KEYWORDS: Record<string, string[]> = {
  passing: ["passing", "pass yards", "pass", "throws", "completions", "attempts"],
  rushing: ["rushing", "rush yards", "rush", "carries", "runs"],
  receiving: ["receiving", "receptions", "rec yards", "catches", "targets"],
  touchdowns: ["touchdowns", "tds", "td", "scores", "scoring"],
  interceptions: ["interceptions", "ints", "picks"],
  sacks: ["sacks", "qb hits"],
  fantasy: ["fantasy", "ppr", "fpts"],
};

// Team aliases for "against X" queries
const TEAM_KEYWORDS: Record<string, string> = {
  "bills": "BUF", "buffalo": "BUF",
  "chiefs": "KC", "kansas city": "KC",
  "eagles": "PHI", "philly": "PHI", "philadelphia": "PHI",
  "49ers": "SF", "niners": "SF", "san francisco": "SF",
  "lions": "DET", "detroit": "DET",
  "packers": "GB", "green bay": "GB",
  "ravens": "BAL", "baltimore": "BAL",
  "texans": "HOU", "houston": "HOU",
  "cowboys": "DAL", "dallas": "DAL",
  "dolphins": "MIA", "miami": "MIA",
  "jets": "NYJ", "new york jets": "NYJ",
  "giants": "NYG", "new york giants": "NYG",
  "rams": "LAR", "la rams": "LAR",
  "chargers": "LAC", "la chargers": "LAC",
  "seahawks": "SEA", "seattle": "SEA",
  "broncos": "DEN", "denver": "DEN",
  "bucs": "TB", "buccaneers": "TB", "tampa": "TB",
  "saints": "NO", "new orleans": "NO",
  "falcons": "ATL", "atlanta": "ATL",
  "panthers": "CAR", "carolina": "CAR",
  "vikings": "MIN", "minnesota": "MIN",
  "bears": "CHI", "chicago": "CHI",
  "cardinals": "ARI", "arizona": "ARI",
  "raiders": "LV", "las vegas": "LV", "vegas": "LV",
  "bengals": "CIN", "cincy": "CIN", "cincinnati": "CIN",
  "browns": "CLE", "cleveland": "CLE",
  "steelers": "PIT", "pittsburgh": "PIT",
  "colts": "IND", "indy": "IND", "indianapolis": "IND",
  "jaguars": "JAX", "jags": "JAX", "jacksonville": "JAX",
  "titans": "TEN", "tennessee": "TEN",
  "patriots": "NE", "pats": "NE", "new england": "NE",
  "commanders": "WAS", "washington": "WAS",
};

/**
 * Fuzzy match player name using known players list
 */
export function matchPlayerName(query: string): string | null {
  const lowerQuery = query.toLowerCase();
  
  // Direct match in known players
  for (const player of KNOWN_NFL_PLAYERS) {
    if (lowerQuery.includes(player)) {
      return player;
    }
  }
  
  // Try fuzzy matching with word boundaries
  const words = lowerQuery.split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    const twoWord = `${words[i]} ${words[i + 1]}`;
    // Check partial matches
    for (const player of KNOWN_NFL_PLAYERS) {
      const playerParts = player.split(" ");
      // Match by last name + partial first
      if (playerParts.length >= 2) {
        const lastName = playerParts[playerParts.length - 1];
        if (words[i + 1] === lastName && words[i].startsWith(playerParts[0][0])) {
          return player;
        }
      }
    }
    
    // Skip common non-name phrases
    const skipPhrases = ["top 5", "top 10", "how is", "who is", "what is", "tell me", 
                         "show me", "last 5", "last 10", "last game", "this season"];
    if (skipPhrases.some(p => twoWord.includes(p))) continue;
    
    // Check if it looks like a name (not common words)
    const skipWords = ["the", "and", "for", "with", "about", "from", "what", "how", 
                       "who", "when", "where", "many", "much", "does", "have", "has"];
    if (!skipWords.includes(words[i]) && !skipWords.includes(words[i + 1])) {
      // Return as potential player name
      if (words[i].length > 1 && words[i + 1].length > 2) {
        return twoWord;
      }
    }
  }
  
  return null;
}

/**
 * Parse query to extract time frame, stat type, and filters
 */
export function parseNFLStatsQuery(query: string): ParsedStatsQuery {
  const lowerQuery = query.toLowerCase();
  
  // Detect player name
  const playerName = matchPlayerName(query);
  
  // Detect time frame
  let timeFrame: ParsedStatsQuery["timeFrame"] = "season";
  let gameCount = 5;
  let teamFilter: string | null = null;
  
  // Check for "last X games"
  const lastGamesMatch = lowerQuery.match(LAST_GAMES_PATTERN);
  if (lastGamesMatch) {
    timeFrame = "last_games";
    gameCount = lastGamesMatch[1] ? parseInt(lastGamesMatch[1]) : 5;
  }
  // Check for "against X"
  else if (VS_TEAM_PATTERN.test(lowerQuery)) {
    const vsMatch = lowerQuery.match(VS_TEAM_PATTERN);
    if (vsMatch) {
      timeFrame = "vs_team";
      const teamKeyword = vsMatch[1].toLowerCase();
      teamFilter = TEAM_KEYWORDS[teamKeyword] || teamKeyword.toUpperCase();
    }
  }
  // Check for career
  else if (CAREER_PATTERN.test(lowerQuery)) {
    timeFrame = "career";
  }
  // Check for season (default or explicit)
  else if (SEASON_PATTERN.test(lowerQuery) || playerName) {
    timeFrame = "season";
  }
  
  // Detect stat type
  let statType: string | null = null;
  for (const [type, keywords] of Object.entries(STAT_KEYWORDS)) {
    if (keywords.some(kw => lowerQuery.includes(kw))) {
      statType = type;
      break;
    }
  }
  
  return {
    playerName,
    timeFrame,
    gameCount,
    statType,
    teamFilter,
  };
}

/**
 * Check if a query is asking for game log / recent performance data
 */
export function isGameLogQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return LAST_GAMES_PATTERN.test(lowerQuery) || 
         lowerQuery.includes("game log") ||
         lowerQuery.includes("recent games") ||
         lowerQuery.includes("game by game") ||
         (lowerQuery.includes("last") && lowerQuery.includes("game"));
}

/**
 * Check if a query asks about performance vs a specific team
 */
export function isVsTeamQuery(query: string): boolean {
  return VS_TEAM_PATTERN.test(query.toLowerCase());
}
