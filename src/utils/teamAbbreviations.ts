// Consolidated team abbreviation maps for all supported leagues

const NBA_TEAM_ABBREVS: Record<string, string> = {
  "Atlanta Hawks": "ATL",
  "Boston Celtics": "BOS",
  "Brooklyn Nets": "BKN",
  "Charlotte Hornets": "CHA",
  "Chicago Bulls": "CHI",
  "Cleveland Cavaliers": "CLE",
  "Dallas Mavericks": "DAL",
  "Denver Nuggets": "DEN",
  "Detroit Pistons": "DET",
  "Golden State Warriors": "GSW",
  "Houston Rockets": "HOU",
  "Indiana Pacers": "IND",
  "LA Clippers": "LAC",
  "Los Angeles Clippers": "LAC",
  "Los Angeles Lakers": "LAL",
  "LA Lakers": "LAL",
  "Memphis Grizzlies": "MEM",
  "Miami Heat": "MIA",
  "Milwaukee Bucks": "MIL",
  "Minnesota Timberwolves": "MIN",
  "New Orleans Pelicans": "NOP",
  "New York Knicks": "NYK",
  "Oklahoma City Thunder": "OKC",
  "Orlando Magic": "ORL",
  "Philadelphia 76ers": "PHI",
  "Phoenix Suns": "PHX",
  "Portland Trail Blazers": "POR",
  "Sacramento Kings": "SAC",
  "San Antonio Spurs": "SAS",
  "Toronto Raptors": "TOR",
  "Utah Jazz": "UTA",
  "Washington Wizards": "WAS",
};

const NFL_TEAM_ABBREVS: Record<string, string> = {
  "Arizona Cardinals": "ARI",
  "Atlanta Falcons": "ATL",
  "Baltimore Ravens": "BAL",
  "Buffalo Bills": "BUF",
  "Carolina Panthers": "CAR",
  "Chicago Bears": "CHI",
  "Cincinnati Bengals": "CIN",
  "Cleveland Browns": "CLE",
  "Dallas Cowboys": "DAL",
  "Denver Broncos": "DEN",
  "Detroit Lions": "DET",
  "Green Bay Packers": "GB",
  "Houston Texans": "HOU",
  "Indianapolis Colts": "IND",
  "Jacksonville Jaguars": "JAX",
  "Kansas City Chiefs": "KC",
  "Las Vegas Raiders": "LV",
  "Los Angeles Chargers": "LAC",
  "LA Chargers": "LAC",
  "Los Angeles Rams": "LAR",
  "LA Rams": "LAR",
  "Miami Dolphins": "MIA",
  "Minnesota Vikings": "MIN",
  "New England Patriots": "NE",
  "New Orleans Saints": "NO",
  "New York Giants": "NYG",
  "New York Jets": "NYJ",
  "Philadelphia Eagles": "PHI",
  "Pittsburgh Steelers": "PIT",
  "San Francisco 49ers": "SF",
  "Seattle Seahawks": "SEA",
  "Tampa Bay Buccaneers": "TB",
  "Tennessee Titans": "TEN",
  "Washington Commanders": "WAS",
};

// Common NCAAB teams — power conferences + well-known programs
const NCAAB_TEAM_ABBREVS: Record<string, string> = {
  "Duke Blue Devils": "DUKE",
  "North Carolina Tar Heels": "UNC",
  "Kentucky Wildcats": "UK",
  "Kansas Jayhawks": "KU",
  "Gonzaga Bulldogs": "GONZ",
  "UCLA Bruins": "UCLA",
  "Villanova Wildcats": "NOVA",
  "Michigan State Spartans": "MSU",
  "Michigan Wolverines": "MICH",
  "Ohio State Buckeyes": "OSU",
  "Purdue Boilermakers": "PUR",
  "Indiana Hoosiers": "IND",
  "Iowa Hawkeyes": "IOWA",
  "Illinois Fighting Illini": "ILL",
  "Wisconsin Badgers": "WISC",
  "Auburn Tigers": "AUB",
  "Alabama Crimson Tide": "BAMA",
  "Tennessee Volunteers": "TENN",
  "Florida Gators": "UF",
  "LSU Tigers": "LSU",
  "Arkansas Razorbacks": "ARK",
  "Texas Longhorns": "TEX",
  "Texas Tech Red Raiders": "TTU",
  "Baylor Bears": "BAY",
  "Houston Cougars": "UH",
  "Arizona Wildcats": "ARIZ",
  "Arizona State Sun Devils": "ASU",
  "Oregon Ducks": "ORE",
  "USC Trojans": "USC",
  "Colorado Buffaloes": "COLO",
  "UConn Huskies": "UCON",
  "Connecticut Huskies": "UCON",
  "Creighton Bluejays": "CREI",
  "Marquette Golden Eagles": "MARQ",
  "Xavier Musketeers": "XAV",
  "St. John's Red Storm": "SJU",
  "Virginia Cavaliers": "UVA",
  "Louisville Cardinals": "LOU",
  "Syracuse Orange": "SYR",
  "Miami Hurricanes": "MIA",
  "Florida State Seminoles": "FSU",
  "NC State Wolfpack": "NCST",
  "Wake Forest Demon Deacons": "WAKE",
  "Clemson Tigers": "CLEM",
  "Georgia Bulldogs": "UGA",
  "Mississippi State Bulldogs": "MSST",
  "Ole Miss Rebels": "MISS",
  "Iowa State Cyclones": "ISU",
  "Kansas State Wildcats": "KSU",
  "Oklahoma Sooners": "OU",
  "West Virginia Mountaineers": "WVU",
  "TCU Horned Frogs": "TCU",
  "San Diego State Aztecs": "SDSU",
  "Memphis Tigers": "MEM",
  "Dayton Flyers": "DAY",
  "BYU Cougars": "BYU",
  "Penn State Nittany Lions": "PSU",
  "Maryland Terrapins": "UMD",
  "Rutgers Scarlet Knights": "RUT",
  "Northwestern Wildcats": "NW",
  "Nebraska Cornhuskers": "NEB",
  "Minnesota Golden Gophers": "MINN",
};

/**
 * Get abbreviated team name for display.
 * Falls back to a short form derived from the name if no match found.
 */
export function getTeamAbbrev(teamName: string, league?: string): string {
  if (!teamName) return "TBD";

  // Try league-specific map first if league is known
  if (league) {
    const upper = league.toUpperCase();
    if (upper === "NBA" && NBA_TEAM_ABBREVS[teamName]) return NBA_TEAM_ABBREVS[teamName];
    if (upper === "NFL" && NFL_TEAM_ABBREVS[teamName]) return NFL_TEAM_ABBREVS[teamName];
    if ((upper === "NCAAB" || upper === "CBB") && NCAAB_TEAM_ABBREVS[teamName]) return NCAAB_TEAM_ABBREVS[teamName];
  }

  // Try all maps
  if (NBA_TEAM_ABBREVS[teamName]) return NBA_TEAM_ABBREVS[teamName];
  if (NFL_TEAM_ABBREVS[teamName]) return NFL_TEAM_ABBREVS[teamName];
  if (NCAAB_TEAM_ABBREVS[teamName]) return NCAAB_TEAM_ABBREVS[teamName];

  // Fallback: extract a reasonable short form
  // For NCAAB-style names like "Gonzaga Bulldogs", use first word capped at 5 chars
  const words = teamName.trim().split(/\s+/);
  if (words.length >= 2) {
    // Use the last word (mascot) — usually more recognizable for college
    // But if it's a well-known city/school, use first word
    const first = words[0].toUpperCase().substring(0, 4);
    return first;
  }
  return teamName.substring(0, 4).toUpperCase();
}

// MLB Stats API abbreviation → ESPN logo slug (only where they differ).
// ESPN's CDN uses its own slugs, e.g. https://a.espncdn.com/i/teamlogos/mlb/500/chw.png
const MLB_API_TO_ESPN_SLUG: Record<string, string> = {
  CWS: "chw", // Chicago White Sox
  AZ: "ari", // Arizona Diamondbacks
  ATH: "ath", // Athletics — current branding (legacy "oak" also exists on ESPN)
};

/**
 * Normalize an MLB Stats API team abbreviation to the slug ESPN's logo CDN expects.
 * Unknown abbreviations pass through lowercased (monogram fallback covers misses).
 */
export function getEspnMlbSlug(abbr: string): string {
  const a = (abbr || "").trim().toUpperCase();
  if (!a) return "";
  return (MLB_API_TO_ESPN_SLUG[a] ?? a).toLowerCase();
}

export { NBA_TEAM_ABBREVS, NFL_TEAM_ABBREVS, NCAAB_TEAM_ABBREVS };
