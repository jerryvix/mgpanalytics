import { Sport } from "./types";

// NFL Teams
const NFL_TEAMS = [
  "chiefs", "bills", "eagles", "bengals", "ravens", "chargers", "jaguars", "texans",
  "packers", "colts", "dolphins", "lions", "49ers", "niners", "cowboys", "buccaneers",
  "jets", "vikings", "seahawks", "broncos", "raiders", "steelers", "browns", "saints",
  "falcons", "panthers", "commanders", "giants", "rams", "cardinals", "bears", "patriots"
];

// NBA Teams
const NBA_TEAMS = [
  "lakers", "celtics", "warriors", "bucks", "nuggets", "76ers", "sixers", "suns",
  "heat", "nets", "knicks", "mavs", "mavericks", "grizzlies", "cavaliers", "cavs",
  "pelicans", "thunder", "timberwolves", "wolves", "clippers", "kings", "hawks",
  "bulls", "raptors", "jazz", "spurs", "rockets", "magic", "pistons", "hornets", "blazers"
];

// NCAAB Teams (major programs)
const NCAAB_TEAMS = [
  "duke", "blue devils", "unc", "tar heels", "kentucky", "wildcats", "kansas", "jayhawks",
  "gonzaga", "bulldogs", "villanova", "baylor", "bears", "auburn", "tigers", "purdue",
  "boilermakers", "houston", "cougars", "tennessee", "volunteers", "arizona", "uconn",
  "huskies", "creighton", "bluejays", "marquette", "golden eagles", "texas", "longhorns",
  "alabama", "crimson tide", "indiana", "hoosiers", "michigan state", "spartans"
];

// NCAAF Teams (major programs)
const NCAAF_TEAMS = [
  "georgia", "bulldogs", "ohio state", "buckeyes", "michigan", "wolverines", "alabama",
  "crimson tide", "clemson", "tigers", "lsu", "usc", "trojans", "texas", "longhorns",
  "oregon", "ducks", "penn state", "nittany lions", "florida state", "seminoles",
  "oklahoma", "sooners", "notre dame", "fighting irish", "tennessee", "volunteers"
];

// MLB Teams
const MLB_TEAMS = [
  "yankees", "dodgers", "astros", "braves", "mets", "phillies", "padres", "rangers",
  "orioles", "twins", "guardians", "rays", "mariners", "blue jays", "red sox",
  "brewers", "cardinals", "cubs", "diamondbacks", "giants", "marlins", "nationals",
  "pirates", "reds", "rockies", "royals", "tigers", "white sox", "angels", "athletics"
];

// NFL Players
const NFL_PLAYERS = [
  "mahomes", "allen", "hurts", "burrow", "jackson", "herbert", "lawrence", "stroud",
  "love", "richardson", "purdy", "prescott", "cousins", "mayfield", "goff", "stafford",
  "henry", "mccaffrey", "chubb", "cook", "barkley", "taylor", "mixon", "ekeler",
  "hill", "jefferson", "chase", "lamb", "diggs", "adams", "brown", "waddle", "kelce",
  "andrews", "kittle", "waller", "hockenson", "pitts", "robinson", "swift", "jacobs",
  "pollard", "stevenson", "gibbs", "achane", "williams"
];

// NBA Players
const NBA_PLAYERS = [
  "lebron", "james", "curry", "steph", "durant", "giannis", "jokic", "embiid",
  "tatum", "luka", "doncic", "morant", "booker", "mitchell", "brown", "edwards",
  "wembanyama", "gilgeous", "alexander", "lillard", "harden", "kyrie", "irving",
  "butler", "bam", "adebayo", "fox", "sabonis", "haliburton", "brunson", "randle",
  "davis", "murray", "maxey", "young", "trae"
];

// MLB Players
const MLB_PLAYERS = [
  "ohtani", "trout", "judge", "soto", "acuna", "betts", "freeman", "harper",
  "rodriguez", "tatis", "devers", "turner", "cole", "degrom", "verlander", "kershaw",
  "scherzer", "alcantara", "cease", "gausman", "manoah", "strider", "webb", "bieber"
];

// Sport-specific stat keywords
const STAT_KEYWORDS_BY_SPORT: Record<Sport, string[]> = {
  NFL: [
    "passing", "rushing", "receiving", "touchdowns", "tds", "yards", "completions",
    "interceptions", "sacks", "carries", "targets", "receptions", "passer rating",
    "qbr", "red zone", "fantasy", "snap count"
  ],
  NBA: [
    "points", "rebounds", "assists", "steals", "blocks", "3-pointers", "threes",
    "field goal", "free throw", "minutes", "usage", "per", "plus-minus", "triple-double",
    "double-double", "back-to-back", "usage rate"
  ],
  NCAAB: [
    "points", "rebounds", "assists", "seed", "tournament", "bracket", "conference",
    "march madness", "ncaa tournament", "big ten", "sec", "acc", "big 12", "pac-12"
  ],
  NCAAF: [
    "passing", "rushing", "touchdowns", "yards", "playoff", "cfp", "heisman",
    "conference championship", "bowl game", "sec", "big ten"
  ],
  MLB: [
    "era", "batting average", "home runs", "rbi", "strikeouts", "whip", "ops",
    "war", "innings", "saves", "stolen bases", "hits", "walks", "pitcher", "hitter",
    "lefty", "righty", "day game", "night game"
  ],
  unknown: []
};

// Explicit sport mentions
const SPORT_KEYWORDS: Record<Sport, string[]> = {
  NFL: ["nfl", "football", "national football league"],
  NBA: ["nba", "basketball", "national basketball association"],
  NCAAB: ["ncaab", "college basketball", "march madness", "ncaa basketball"],
  NCAAF: ["ncaaf", "college football", "cfb", "ncaa football"],
  MLB: ["mlb", "baseball", "major league baseball"],
  unknown: []
};

// Position keywords by sport
const POSITION_KEYWORDS: Record<Sport, string[]> = {
  NFL: ["qb", "quarterback", "rb", "running back", "wr", "wide receiver", "te", "tight end", "defense", "kicker"],
  NBA: ["point guard", "shooting guard", "small forward", "power forward", "center", "pg", "sg", "sf", "pf"],
  NCAAB: ["guard", "forward", "center"],
  NCAAF: ["quarterback", "running back", "wide receiver", "tight end", "linebacker"],
  MLB: ["pitcher", "catcher", "infielder", "outfielder", "first base", "shortstop", "starter", "reliever", "closer"],
  unknown: []
};

export function detectSport(query: string): Sport {
  const lowerQuery = query.toLowerCase();
  
  // Check explicit sport mentions first
  for (const [sport, keywords] of Object.entries(SPORT_KEYWORDS)) {
    if (sport === "unknown") continue;
    for (const keyword of keywords) {
      if (lowerQuery.includes(keyword)) {
        return sport as Sport;
      }
    }
  }
  
  // Check team names
  for (const team of NFL_TEAMS) {
    if (lowerQuery.includes(team)) return "NFL";
  }
  for (const team of NBA_TEAMS) {
    if (lowerQuery.includes(team)) return "NBA";
  }
  for (const team of MLB_TEAMS) {
    if (lowerQuery.includes(team)) return "MLB";
  }
  // Check college teams (overlapping names, so check last)
  for (const team of NCAAB_TEAMS) {
    if (lowerQuery.includes(team)) return "NCAAB";
  }
  for (const team of NCAAF_TEAMS) {
    if (lowerQuery.includes(team)) return "NCAAF";
  }
  
  // Check player names
  for (const player of NFL_PLAYERS) {
    if (lowerQuery.includes(player)) return "NFL";
  }
  for (const player of NBA_PLAYERS) {
    if (lowerQuery.includes(player)) return "NBA";
  }
  for (const player of MLB_PLAYERS) {
    if (lowerQuery.includes(player)) return "MLB";
  }
  
  // Check sport-specific stat keywords
  for (const [sport, keywords] of Object.entries(STAT_KEYWORDS_BY_SPORT)) {
    if (sport === "unknown") continue;
    for (const keyword of keywords) {
      if (lowerQuery.includes(keyword)) {
        // Handle overlapping keywords with priority
        if (keyword === "points" || keyword === "rebounds" || keyword === "assists") {
          // These are primarily basketball
          if (lowerQuery.includes("nba") || lowerQuery.includes("basketball")) return "NBA";
          if (lowerQuery.includes("college") || lowerQuery.includes("ncaa")) return "NCAAB";
          return "NBA"; // Default to NBA for basketball stats
        }
        if (keyword === "passing" || keyword === "rushing" || keyword === "touchdowns") {
          // These are primarily football
          if (lowerQuery.includes("college") || lowerQuery.includes("ncaa")) return "NCAAF";
          return "NFL"; // Default to NFL for football stats
        }
        return sport as Sport;
      }
    }
  }
  
  return "unknown";
}

export function detectPosition(query: string, sport: Sport): string | null {
  const lowerQuery = query.toLowerCase();
  const positions = POSITION_KEYWORDS[sport] || [];
  
  for (const position of positions) {
    if (lowerQuery.includes(position)) {
      return position;
    }
  }
  
  return null;
}

export function detectPlayerName(query: string): string | null {
  const lowerQuery = query.toLowerCase();
  
  // Check all player lists
  const allPlayers = [...NFL_PLAYERS, ...NBA_PLAYERS, ...MLB_PLAYERS];
  
  for (const player of allPlayers) {
    if (lowerQuery.includes(player)) {
      return player.charAt(0).toUpperCase() + player.slice(1);
    }
  }
  
  // Try to extract a capitalized name pattern
  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  const matches = query.match(namePattern);
  if (matches && matches.length > 0) {
    const filteredMatches = matches.filter(m => 
      !["The", "What", "How", "Who", "When", "Where", "This", "That", "Game", "Team", "NBA", "NFL", "MLB"].includes(m)
    );
    if (filteredMatches.length > 0) {
      return filteredMatches[0];
    }
  }
  
  return null;
}

export function detectTeamNames(query: string): string[] {
  const lowerQuery = query.toLowerCase();
  const foundTeams: string[] = [];
  
  const allTeams = [...NFL_TEAMS, ...NBA_TEAMS, ...NCAAB_TEAMS, ...NCAAF_TEAMS, ...MLB_TEAMS];
  
  for (const team of allTeams) {
    if (lowerQuery.includes(team)) {
      foundTeams.push(team.charAt(0).toUpperCase() + team.slice(1));
    }
  }
  
  return [...new Set(foundTeams)]; // Remove duplicates
}

export function detectStatType(query: string): string | null {
  const lowerQuery = query.toLowerCase();
  
  const statCategories: Record<string, string[]> = {
    passing: ["pass", "passing", "yards", "touchdowns", "tds", "completions", "attempts", "passer rating"],
    rushing: ["rush", "rushing", "carries", "rushing yards", "yards per carry"],
    receiving: ["receiving", "receptions", "catches", "targets", "receiving yards", "rec"],
    scoring: ["points", "scoring", "ppg"],
    rebounding: ["rebounds", "boards", "rpg"],
    playmaking: ["assists", "apg", "dimes"],
    shooting: ["3-pointers", "threes", "field goal", "shooting"],
    pitching: ["era", "strikeouts", "whip", "innings", "pitch"],
    hitting: ["batting average", "home runs", "rbi", "hits", "ops"]
  };
  
  for (const [category, keywords] of Object.entries(statCategories)) {
    for (const keyword of keywords) {
      if (lowerQuery.includes(keyword)) {
        return category;
      }
    }
  }
  
  return null;
}
