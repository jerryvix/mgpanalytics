// Team identities for the chat's league detection and game matching: every
// NFL, MLB, NBA and NHL team as city + nickname (with the short forms people
// type: "D-backs", "Jays", "Nats", "Sox" with its city), and every FBS and FCS
// college football team as school + nickname (ESPN's list, Sep 2026). "St.
// Louis Cardinals" is MLB, "Arizona Cardinals" the NFL, "Louisville
// Cardinals" college. The app has no NHL data: its teams are here so "New
// York Rangers" or "Winnipeg Jets" is never read as another league's team.
// Used by _shared/league-detect.ts (resolve full identities before keywords)
// and _shared/pulse-chat.ts (a game matches only through its teams' real
// names; a city or school several teams share names none of them). Pure;
// covered by src/test/leagueDetect.test.ts and pulseChat.test.ts.
//
// Generated from the ESPN team list plus a hand-written pro table; aliases
// are normalized the way normalizeTeamName normalizes a question. A pro alias
// marked "~" is an everyday word ("cards", "guards", "wild", "stars") and
// counts only right after its city ("STL Cards", "Minnesota Wild").

import { DK_NCAAF_ALIASES, normalizeTeamName } from "../sync-betting-splits/match.ts";

export type TeamLeague = "NFL" | "MLB" | "NBA" | "NHL" | "COLLEGE";

export interface TeamEntry {
  league: TeamLeague;
  /** Display name, as the games tables and ESPN write it */
  name: string;
  /** City or school aliases, normalized */
  locations: string[];
  /** Nickname aliases, normalized */
  nicknames: string[];
  /** The nickname aliases that count only right after a city ("cards", "wild") */
  cityOnly?: string[];
  /** College: FBS (else FCS) */
  fbs?: boolean;
}

// [league, display name, city aliases, nickname aliases]
const PRO: Array<[TeamLeague, string, string, string]> = [
  ["NFL", "Arizona Cardinals", "arizona|ari|az", "cardinals|~cards"],
  ["NFL", "Atlanta Falcons", "atlanta|atl", "falcons"],
  ["NFL", "Baltimore Ravens", "baltimore|bal", "ravens"],
  ["NFL", "Buffalo Bills", "buffalo|buf", "bills"],
  ["NFL", "Carolina Panthers", "carolina", "panthers"],
  ["NFL", "Chicago Bears", "chicago|chi", "bears"],
  ["NFL", "Cincinnati Bengals", "cincinnati|cincy|cin", "bengals"],
  ["NFL", "Cleveland Browns", "cleveland|cle", "browns"],
  ["NFL", "Dallas Cowboys", "dallas|dal", "cowboys"],
  ["NFL", "Denver Broncos", "denver", "broncos"],
  ["NFL", "Detroit Lions", "detroit|det", "lions"],
  ["NFL", "Green Bay Packers", "green bay|gb", "packers|~pack"],
  ["NFL", "Houston Texans", "houston|hou", "texans"],
  ["NFL", "Indianapolis Colts", "indianapolis|indy|ind", "colts"],
  ["NFL", "Jacksonville Jaguars", "jacksonville|jax", "jaguars|jags"],
  ["NFL", "Kansas City Chiefs", "kansas city|kc", "chiefs"],
  ["NFL", "Las Vegas Raiders", "las vegas|vegas|lv|oakland", "raiders"],
  ["NFL", "Los Angeles Chargers", "los angeles|la|lac", "chargers|~bolts"],
  ["NFL", "Los Angeles Rams", "los angeles|la|lar", "rams"],
  ["NFL", "Miami Dolphins", "miami|mia", "dolphins|~fins"],
  ["NFL", "Minnesota Vikings", "minnesota", "vikings|vikes"],
  ["NFL", "New England Patriots", "new england", "patriots|pats"],
  ["NFL", "New Orleans Saints", "new orleans|nola", "saints"],
  ["NFL", "New York Giants", "new york|ny|nyg", "giants"],
  ["NFL", "New York Jets", "new york|ny|nyj", "jets"],
  ["NFL", "Philadelphia Eagles", "philadelphia|philly|phi", "eagles"],
  ["NFL", "Pittsburgh Steelers", "pittsburgh|pit", "steelers"],
  ["NFL", "San Francisco 49ers", "san francisco|sf", "49ers|niners"],
  ["NFL", "Seattle Seahawks", "seattle", "seahawks"],
  ["NFL", "Tampa Bay Buccaneers", "tampa bay|tampa|tb", "buccaneers|bucs"],
  ["NFL", "Tennessee Titans", "tennessee", "titans"],
  ["NFL", "Washington Commanders", "washington|wsh|dc", "commanders"],
  ["MLB", "Arizona Diamondbacks", "arizona|ari|az", "diamondbacks|d backs|dbacks"],
  ["MLB", "Atlanta Braves", "atlanta|atl", "braves"],
  ["MLB", "Baltimore Orioles", "baltimore|bal", "orioles"],
  ["MLB", "Boston Red Sox", "boston|bos", "red sox|sox"],
  ["MLB", "Chicago Cubs", "chicago|chi|chc", "cubs"],
  ["MLB", "Chicago White Sox", "chicago|chi|chw|cws", "white sox|sox"],
  ["MLB", "Cincinnati Reds", "cincinnati|cincy|cin", "reds"],
  ["MLB", "Cleveland Guardians", "cleveland|cle", "guardians|~guards|~indians"],
  ["MLB", "Colorado Rockies", "colorado", "rockies|rox"],
  ["MLB", "Detroit Tigers", "detroit|det", "tigers"],
  ["MLB", "Houston Astros", "houston|hou", "astros|stros"],
  ["MLB", "Kansas City Royals", "kansas city|kc", "royals"],
  ["MLB", "Los Angeles Angels", "los angeles|la|laa|anaheim", "angels|halos"],
  ["MLB", "Los Angeles Dodgers", "los angeles|la|lad", "dodgers"],
  ["MLB", "Miami Marlins", "miami|mia", "marlins"],
  ["MLB", "Milwaukee Brewers", "milwaukee|mil", "brewers"],
  ["MLB", "Minnesota Twins", "minnesota", "twins"],
  ["MLB", "New York Mets", "new york|ny|nym", "mets"],
  ["MLB", "New York Yankees", "new york|ny|nyy", "yankees|yanks"],
  ["MLB", "Athletics", "sacramento|oakland|las vegas|oak|ath", "athletics"],
  ["MLB", "Philadelphia Phillies", "philadelphia|philly|phi", "phillies|phils"],
  ["MLB", "Pittsburgh Pirates", "pittsburgh|pit", "pirates|~bucs"],
  ["MLB", "San Diego Padres", "san diego", "padres|~friars"],
  ["MLB", "San Francisco Giants", "san francisco|sf", "giants"],
  ["MLB", "Seattle Mariners", "seattle", "mariners"],
  ["MLB", "St. Louis Cardinals", "st louis|saint louis|stl", "cardinals|~cards|~redbirds"],
  ["MLB", "Tampa Bay Rays", "tampa bay|tampa|tb", "rays"],
  ["MLB", "Texas Rangers", "texas|tex", "rangers"],
  ["MLB", "Toronto Blue Jays", "toronto|tor", "blue jays|~jays"],
  ["MLB", "Washington Nationals", "washington|wsh|dc", "nationals|nats"],
  ["NBA", "Atlanta Hawks", "atlanta|atl", "hawks"],
  ["NBA", "Boston Celtics", "boston|bos", "celtics|celts"],
  ["NBA", "Brooklyn Nets", "brooklyn|bkn", "nets"],
  ["NBA", "Charlotte Hornets", "charlotte|cha", "hornets"],
  ["NBA", "Chicago Bulls", "chicago|chi", "bulls"],
  ["NBA", "Cleveland Cavaliers", "cleveland|cle", "cavaliers|cavs"],
  ["NBA", "Dallas Mavericks", "dallas|dal", "mavericks|mavs"],
  ["NBA", "Denver Nuggets", "denver", "nuggets"],
  ["NBA", "Detroit Pistons", "detroit|det", "pistons"],
  ["NBA", "Golden State Warriors", "golden state|gsw", "warriors|~dubs"],
  ["NBA", "Houston Rockets", "houston|hou", "rockets"],
  ["NBA", "Indiana Pacers", "indiana|ind", "pacers"],
  ["NBA", "LA Clippers", "los angeles|la|lac", "clippers|~clips"],
  ["NBA", "Los Angeles Lakers", "los angeles|la|lal", "lakers"],
  ["NBA", "Memphis Grizzlies", "memphis|mem", "grizzlies|grizz"],
  ["NBA", "Miami Heat", "miami|mia", "heat"],
  ["NBA", "Milwaukee Bucks", "milwaukee|mil", "bucks"],
  ["NBA", "Minnesota Timberwolves", "minnesota", "timberwolves|wolves|twolves"],
  ["NBA", "New Orleans Pelicans", "new orleans|nola|nop", "pelicans|pels"],
  ["NBA", "New York Knicks", "new york|ny|nyk", "knicks"],
  ["NBA", "Oklahoma City Thunder", "oklahoma city|okc", "thunder"],
  ["NBA", "Orlando Magic", "orlando|orl", "magic"],
  ["NBA", "Philadelphia 76ers", "philadelphia|philly|phi", "76ers|sixers"],
  ["NBA", "Phoenix Suns", "phoenix|phx", "suns"],
  ["NBA", "Portland Trail Blazers", "portland|por", "trail blazers|blazers"],
  ["NBA", "Sacramento Kings", "sacramento|sac", "kings"],
  ["NBA", "San Antonio Spurs", "san antonio|sas", "spurs"],
  ["NBA", "Toronto Raptors", "toronto|tor", "raptors"],
  ["NBA", "Utah Jazz", "utah|uta", "jazz"],
  ["NBA", "Washington Wizards", "washington|wsh|dc", "wizards"],
  ["NHL", "Anaheim Ducks", "anaheim", "ducks"],
  ["NHL", "Boston Bruins", "boston|bos", "bruins"],
  ["NHL", "Buffalo Sabres", "buffalo|buf", "sabres"],
  ["NHL", "Calgary Flames", "calgary|cgy", "flames"],
  ["NHL", "Carolina Hurricanes", "carolina", "hurricanes|~canes"],
  ["NHL", "Chicago Blackhawks", "chicago|chi", "blackhawks"],
  ["NHL", "Colorado Avalanche", "colorado", "avalanche|avs"],
  ["NHL", "Columbus Blue Jackets", "columbus|cbj", "blue jackets"],
  ["NHL", "Dallas Stars", "dallas|dal", "~stars"],
  ["NHL", "Detroit Red Wings", "detroit|det", "red wings|~wings"],
  ["NHL", "Edmonton Oilers", "edmonton|edm", "oilers"],
  ["NHL", "Florida Panthers", "florida|fla", "panthers"],
  ["NHL", "Los Angeles Kings", "los angeles|la|lak", "kings"],
  ["NHL", "Minnesota Wild", "minnesota", "~wild"],
  ["NHL", "Montreal Canadiens", "montreal|mtl", "canadiens|habs"],
  ["NHL", "Nashville Predators", "nashville|nsh", "predators|preds"],
  ["NHL", "New Jersey Devils", "new jersey|nj|njd", "devils"],
  ["NHL", "New York Islanders", "new york|ny|nyi", "islanders|~isles"],
  ["NHL", "New York Rangers", "new york|ny|nyr", "rangers"],
  ["NHL", "Ottawa Senators", "ottawa|ott", "senators|~sens"],
  ["NHL", "Philadelphia Flyers", "philadelphia|philly|phi", "flyers"],
  ["NHL", "Pittsburgh Penguins", "pittsburgh|pit", "penguins|~pens"],
  ["NHL", "San Jose Sharks", "san jose|sj|sjs", "sharks"],
  ["NHL", "Seattle Kraken", "seattle", "kraken"],
  ["NHL", "St. Louis Blues", "st louis|saint louis|stl", "~blues"],
  ["NHL", "Tampa Bay Lightning", "tampa bay|tampa|tb|tbl", "~lightning"],
  ["NHL", "Toronto Maple Leafs", "toronto|tor", "maple leafs|leafs"],
  ["NHL", "Utah Mammoth", "utah|uta", "~mammoth|~hockey club"],
  ["NHL", "Vancouver Canucks", "vancouver", "canucks"],
  ["NHL", "Vegas Golden Knights", "vegas|las vegas|vgk", "golden knights"],
  ["NHL", "Washington Capitals", "washington|wsh|dc", "capitals|~caps"],
  ["NHL", "Winnipeg Jets", "winnipeg|wpg", "jets"],
];

// [display name, school, nickname, division], ESPN
const COLLEGE: Array<[string, string, string, "FBS" | "FCS"]> = [
  ["Auburn Tigers", "Auburn", "Tigers", "FBS"],
  ["UAB Blazers", "UAB", "Blazers", "FBS"],
  ["South Alabama Jaguars", "South Alabama", "Jaguars", "FBS"],
  ["Arkansas Razorbacks", "Arkansas", "Razorbacks", "FBS"],
  ["Arizona State Sun Devils", "Arizona State", "Sun Devils", "FBS"],
  ["Arizona Wildcats", "Arizona", "Wildcats", "FBS"],
  ["Sacramento State Hornets", "Sacramento State", "Hornets", "FBS"],
  ["San Diego State Aztecs", "San Diego State", "Aztecs", "FBS"],
  ["San José State Spartans", "San José State", "Spartans", "FBS"],
  ["Stanford Cardinal", "Stanford", "Cardinal", "FBS"],
  ["California Golden Bears", "California", "Golden Bears", "FBS"],
  ["UCLA Bruins", "UCLA", "Bruins", "FBS"],
  ["USC Trojans", "USC", "Trojans", "FBS"],
  ["Colorado State Rams", "Colorado State", "Rams", "FBS"],
  ["Colorado Buffaloes", "Colorado", "Buffaloes", "FBS"],
  ["UConn Huskies", "UConn", "Huskies", "FBS"],
  ["Delaware Blue Hens", "Delaware", "Blue Hens", "FBS"],
  ["Florida State Seminoles", "Florida State", "Seminoles", "FBS"],
  ["Jacksonville State Gamecocks", "Jacksonville State", "Gamecocks", "FBS"],
  ["Florida Gators", "Florida", "Gators", "FBS"],
  ["South Florida Bulls", "South Florida", "Bulls", "FBS"],
  ["Georgia Tech Yellow Jackets", "Georgia Tech", "Yellow Jackets", "FBS"],
  ["Georgia Bulldogs", "Georgia", "Bulldogs", "FBS"],
  ["Hawai'i Rainbow Warriors", "Hawai'i", "Rainbow Warriors", "FBS"],
  ["Iowa State Cyclones", "Iowa State", "Cyclones", "FBS"],
  ["Boise State Broncos", "Boise State", "Broncos", "FBS"],
  ["Northwestern Wildcats", "Northwestern", "Wildcats", "FBS"],
  ["Indiana Hoosiers", "Indiana", "Hoosiers", "FBS"],
  ["Notre Dame Fighting Irish", "Notre Dame", "Fighting Irish", "FBS"],
  ["Kentucky Wildcats", "Kentucky", "Wildcats", "FBS"],
  ["Louisville Cardinals", "Louisville", "Cardinals", "FBS"],
  ["Western Kentucky Hilltoppers", "Western Kentucky", "Hilltoppers", "FBS"],
  ["LSU Tigers", "LSU", "Tigers", "FBS"],
  ["Boston College Eagles", "Boston College", "Eagles", "FBS"],
  ["Massachusetts Minutemen", "Massachusetts", "Minutemen", "FBS"],
  ["Maryland Terrapins", "Maryland", "Terrapins", "FBS"],
  ["Michigan State Spartans", "Michigan State", "Spartans", "FBS"],
  ["Michigan Wolverines", "Michigan", "Wolverines", "FBS"],
  ["Minnesota Golden Gophers", "Minnesota", "Golden Gophers", "FBS"],
  ["Missouri Tigers", "Missouri", "Tigers", "FBS"],
  ["Ole Miss Rebels", "Ole Miss", "Rebels", "FBS"],
  ["Duke Blue Devils", "Duke", "Blue Devils", "FBS"],
  ["East Carolina Pirates", "East Carolina", "Pirates", "FBS"],
  ["NC State Wolfpack", "NC State", "Wolfpack", "FBS"],
  ["North Carolina Tar Heels", "North Carolina", "Tar Heels", "FBS"],
  ["Wake Forest Demon Deacons", "Wake Forest", "Demon Deacons", "FBS"],
  ["Nebraska Cornhuskers", "Nebraska", "Cornhuskers", "FBS"],
  ["Rutgers Scarlet Knights", "Rutgers", "Scarlet Knights", "FBS"],
  ["New Mexico State Aggies", "New Mexico State", "Aggies", "FBS"],
  ["New Mexico Lobos", "New Mexico", "Lobos", "FBS"],
  ["Syracuse Orange", "Syracuse", "Orange", "FBS"],
  ["Bowling Green Falcons", "Bowling Green", "Falcons", "FBS"],
  ["Miami (OH) RedHawks", "Miami (OH)", "RedHawks", "FBS"],
  ["Ohio State Buckeyes", "Ohio State", "Buckeyes", "FBS"],
  ["Ohio Bobcats", "Ohio", "Bobcats", "FBS"],
  ["Oklahoma State Cowboys", "Oklahoma State", "Cowboys", "FBS"],
  ["Oklahoma Sooners", "Oklahoma", "Sooners", "FBS"],
  ["Tulsa Golden Hurricane", "Tulsa", "Golden Hurricane", "FBS"],
  ["Oregon State Beavers", "Oregon State", "Beavers", "FBS"],
  ["Penn State Nittany Lions", "Penn State", "Nittany Lions", "FBS"],
  ["Temple Owls", "Temple", "Owls", "FBS"],
  ["Pittsburgh Panthers", "Pittsburgh", "Panthers", "FBS"],
  ["Clemson Tigers", "Clemson", "Tigers", "FBS"],
  ["Memphis Tigers", "Memphis", "Tigers", "FBS"],
  ["Vanderbilt Commodores", "Vanderbilt", "Commodores", "FBS"],
  ["Baylor Bears", "Baylor", "Bears", "FBS"],
  ["Rice Owls", "Rice", "Owls", "FBS"],
  ["Texas A&M Aggies", "Texas A&M", "Aggies", "FBS"],
  ["Houston Cougars", "Houston", "Cougars", "FBS"],
  ["North Texas Mean Green", "North Texas", "Mean Green", "FBS"],
  ["Texas Longhorns", "Texas", "Longhorns", "FBS"],
  ["BYU Cougars", "BYU", "Cougars", "FBS"],
  ["Utah Utes", "Utah", "Utes", "FBS"],
  ["James Madison Dukes", "James Madison", "Dukes", "FBS"],
  ["Virginia Cavaliers", "Virginia", "Cavaliers", "FBS"],
  ["Virginia Tech Hokies", "Virginia Tech", "Hokies", "FBS"],
  ["Washington Huskies", "Washington", "Huskies", "FBS"],
  ["Washington State Cougars", "Washington State", "Cougars", "FBS"],
  ["Wisconsin Badgers", "Wisconsin", "Badgers", "FBS"],
  ["Marshall Thundering Herd", "Marshall", "Thundering Herd", "FBS"],
  ["West Virginia Mountaineers", "West Virginia", "Mountaineers", "FBS"],
  ["Fresno State Bulldogs", "Fresno State", "Bulldogs", "FBS"],
  ["Georgia Southern Eagles", "Georgia Southern", "Eagles", "FBS"],
  ["Old Dominion Monarchs", "Old Dominion", "Monarchs", "FBS"],
  ["Louisiana Ragin' Cajuns", "Louisiana", "Ragin' Cajuns", "FBS"],
  ["Coastal Carolina Chanticleers", "Coastal Carolina", "Chanticleers", "FBS"],
  ["Texas State Bobcats", "Texas State", "Bobcats", "FBS"],
  ["Utah State Aggies", "Utah State", "Aggies", "FBS"],
  ["Alabama Crimson Tide", "Alabama", "Crimson Tide", "FBS"],
  ["Kennesaw State Owls", "Kennesaw State", "Owls", "FBS"],
  ["Mississippi State Bulldogs", "Mississippi State", "Bulldogs", "FBS"],
  ["Army Black Knights", "Army", "Black Knights", "FBS"],
  ["Illinois Fighting Illini", "Illinois", "Fighting Illini", "FBS"],
  ["Air Force Falcons", "Air Force", "Falcons", "FBS"],
  ["Akron Zips", "Akron", "Zips", "FBS"],
  ["App State Mountaineers", "App State", "Mountaineers", "FBS"],
  ["Arkansas State Red Wolves", "Arkansas State", "Red Wolves", "FBS"],
  ["Ball State Cardinals", "Ball State", "Cardinals", "FBS"],
  ["Buffalo Bulls", "Buffalo", "Bulls", "FBS"],
  ["UCF Knights", "UCF", "Knights", "FBS"],
  ["Central Michigan Chippewas", "Central Michigan", "Chippewas", "FBS"],
  ["Cincinnati Bearcats", "Cincinnati", "Bearcats", "FBS"],
  ["Eastern Michigan Eagles", "Eastern Michigan", "Eagles", "FBS"],
  ["Florida Atlantic Owls", "Florida Atlantic", "Owls", "FBS"],
  ["Florida International Panthers", "Florida International", "Panthers", "FBS"],
  ["Georgia State Panthers", "Georgia State", "Panthers", "FBS"],
  ["Iowa Hawkeyes", "Iowa", "Hawkeyes", "FBS"],
  ["Kansas Jayhawks", "Kansas", "Jayhawks", "FBS"],
  ["Kansas State Wildcats", "Kansas State", "Wildcats", "FBS"],
  ["Kent State Golden Flashes", "Kent State", "Golden Flashes", "FBS"],
  ["Liberty Flames", "Liberty", "Flames", "FBS"],
  ["Louisiana Tech Bulldogs", "Louisiana Tech", "Bulldogs", "FBS"],
  ["Miami Hurricanes", "Miami", "Hurricanes", "FBS"],
  ["Middle Tennessee Blue Raiders", "Middle Tennessee", "Blue Raiders", "FBS"],
  ["Navy Midshipmen", "Navy", "Midshipmen", "FBS"],
  ["Charlotte 49ers", "Charlotte", "49ers", "FBS"],
  ["UL Monroe Warhawks", "UL Monroe", "Warhawks", "FBS"],
  ["UNLV Rebels", "UNLV", "Rebels", "FBS"],
  ["Nevada Wolf Pack", "Nevada", "Wolf Pack", "FBS"],
  ["North Dakota State Bison", "North Dakota State", "Bison", "FBS"],
  ["Northern Illinois Huskies", "Northern Illinois", "Huskies", "FBS"],
  ["Oregon Ducks", "Oregon", "Ducks", "FBS"],
  ["Purdue Boilermakers", "Purdue", "Boilermakers", "FBS"],
  ["Sam Houston Bearkats", "Sam Houston", "Bearkats", "FBS"],
  ["SMU Mustangs", "SMU", "Mustangs", "FBS"],
  ["Southern Miss Golden Eagles", "Southern Miss", "Golden Eagles", "FBS"],
  ["South Carolina Gamecocks", "South Carolina", "Gamecocks", "FBS"],
  ["Missouri State Bears", "Missouri State", "Bears", "FBS"],
  ["TCU Horned Frogs", "TCU", "Horned Frogs", "FBS"],
  ["Tennessee Volunteers", "Tennessee", "Volunteers", "FBS"],
  ["UTSA Roadrunners", "UTSA", "Roadrunners", "FBS"],
  ["UTEP Miners", "UTEP", "Miners", "FBS"],
  ["Texas Tech Red Raiders", "Texas Tech", "Red Raiders", "FBS"],
  ["Toledo Rockets", "Toledo", "Rockets", "FBS"],
  ["Troy Trojans", "Troy", "Trojans", "FBS"],
  ["Tulane Green Wave", "Tulane", "Green Wave", "FBS"],
  ["Western Michigan Broncos", "Western Michigan", "Broncos", "FBS"],
  ["Wyoming Cowboys", "Wyoming", "Cowboys", "FBS"],
  ["Cal Poly Mustangs", "Cal Poly", "Mustangs", "FCS"],
  ["Yale Bulldogs", "Yale", "Bulldogs", "FCS"],
  ["Georgetown Hoyas", "Georgetown", "Hoyas", "FCS"],
  ["Howard Bison", "Howard", "Bison", "FCS"],
  ["Florida A&M Rattlers", "Florida A&M", "Rattlers", "FCS"],
  ["Stetson Hatters", "Stetson", "Hatters", "FCS"],
  ["Idaho Vandals", "Idaho", "Vandals", "FCS"],
  ["Southern Illinois Salukis", "Southern Illinois", "Salukis", "FCS"],
  ["Murray State Racers", "Murray State", "Racers", "FCS"],
  ["Holy Cross Crusaders", "Holy Cross", "Crusaders", "FCS"],
  ["Harvard Crimson", "Harvard", "Crimson", "FCS"],
  ["Towson Tigers", "Towson", "Tigers", "FCS"],
  ["Montana State Bobcats", "Montana State", "Bobcats", "FCS"],
  ["Montana Grizzlies", "Montana", "Grizzlies", "FCS"],
  ["North Dakota Fighting Hawks", "North Dakota", "Fighting Hawks", "FCS"],
  ["Dartmouth Big Green", "Dartmouth", "Big Green", "FCS"],
  ["New Hampshire Wildcats", "New Hampshire", "Wildcats", "FCS"],
  ["Princeton Tigers", "Princeton", "Tigers", "FCS"],
  ["Columbia Lions", "Columbia", "Lions", "FCS"],
  ["Cornell Big Red", "Cornell", "Big Red", "FCS"],
  ["Pennsylvania Quakers", "Pennsylvania", "Quakers", "FCS"],
  ["Villanova Wildcats", "Villanova", "Wildcats", "FCS"],
  ["Brown Bears", "Brown", "Bears", "FCS"],
  ["Rhode Island Rams", "Rhode Island", "Rams", "FCS"],
  ["Furman Paladins", "Furman", "Paladins", "FCS"],
  ["South Dakota Coyotes", "South Dakota", "Coyotes", "FCS"],
  ["Chattanooga Mocs", "Chattanooga", "Mocs", "FCS"],
  ["Southern Utah Thunderbirds", "Southern Utah", "Thunderbirds", "FCS"],
  ["Richmond Spiders", "Richmond", "Spiders", "FCS"],
  ["Indiana State Sycamores", "Indiana State", "Sycamores", "FCS"],
  ["Stonehill Skyhawks", "Stonehill", "Skyhawks", "FCS"],
  ["San Diego Toreros", "San Diego", "Toreros", "FCS"],
  ["UC Davis Aggies", "UC Davis", "Aggies", "FCS"],
  ["Idaho State Bengals", "Idaho State", "Bengals", "FCS"],
  ["Maine Black Bears", "Maine", "Black Bears", "FCS"],
  ["Lafayette Leopards", "Lafayette", "Leopards", "FCS"],
  ["Eastern Washington Eagles", "Eastern Washington", "Eagles", "FCS"],
  ["UAlbany Great Danes", "UAlbany", "Great Danes", "FCS"],
  ["Abilene Christian Wildcats", "Abilene Christian", "Wildcats", "FCS"],
  ["Alabama A&M Bulldogs", "Alabama A&M", "Bulldogs", "FCS"],
  ["Alabama State Hornets", "Alabama State", "Hornets", "FCS"],
  ["Alcorn State Braves", "Alcorn State", "Braves", "FCS"],
  ["Arkansas-Pine Bluff Golden Lions", "Arkansas-Pine Bluff", "Golden Lions", "FCS"],
  ["Austin Peay Governors", "Austin Peay", "Governors", "FCS"],
  ["Bethune-Cookman Wildcats", "Bethune-Cookman", "Wildcats", "FCS"],
  ["Bucknell Bison", "Bucknell", "Bison", "FCS"],
  ["Butler Bulldogs", "Butler", "Bulldogs", "FCS"],
  ["Campbell Fighting Camels", "Campbell", "Fighting Camels", "FCS"],
  ["Central Arkansas Bears", "Central Arkansas", "Bears", "FCS"],
  ["Central Connecticut Blue Devils", "Central Connecticut", "Blue Devils", "FCS"],
  ["Charleston Southern Buccaneers", "Charleston Southern", "Buccaneers", "FCS"],
  ["Chicago State Cougars", "Chicago State", "Cougars", "FCS"],
  ["Colgate Raiders", "Colgate", "Raiders", "FCS"],
  ["Davidson Wildcats", "Davidson", "Wildcats", "FCS"],
  ["Dayton Flyers", "Dayton", "Flyers", "FCS"],
  ["Delaware State Hornets", "Delaware State", "Hornets", "FCS"],
  ["Drake Bulldogs", "Drake", "Bulldogs", "FCS"],
  ["Duquesne Dukes", "Duquesne", "Dukes", "FCS"],
  ["East Tennessee State Buccaneers", "East Tennessee State", "Buccaneers", "FCS"],
  ["Eastern Illinois Panthers", "Eastern Illinois", "Panthers", "FCS"],
  ["Eastern Kentucky Colonels", "Eastern Kentucky", "Colonels", "FCS"],
  ["Elon Phoenix", "Elon", "Phoenix", "FCS"],
  ["Fordham Rams", "Fordham", "Rams", "FCS"],
  ["Gardner-Webb Runnin' Bulldogs", "Gardner-Webb", "Runnin' Bulldogs", "FCS"],
  ["Hampton Pirates", "Hampton", "Pirates", "FCS"],
  ["Houston Christian Huskies", "Houston Christian", "Huskies", "FCS"],
  ["Illinois State Redbirds", "Illinois State", "Redbirds", "FCS"],
  ["Jackson State Tigers", "Jackson State", "Tigers", "FCS"],
  ["Lamar Cardinals", "Lamar", "Cardinals", "FCS"],
  ["Lehigh Mountain Hawks", "Lehigh", "Mountain Hawks", "FCS"],
  ["Long Island University Sharks", "Long Island University", "Sharks", "FCS"],
  ["Marist Red Foxes", "Marist", "Red Foxes", "FCS"],
  ["McNeese Cowboys", "McNeese", "Cowboys", "FCS"],
  ["Mercer Bears", "Mercer", "Bears", "FCS"],
  ["Mercyhurst Lakers", "Mercyhurst", "Lakers", "FCS"],
  ["Mississippi Valley State Delta Devils", "Mississippi Valley State", "Delta Devils", "FCS"],
  ["Monmouth Hawks", "Monmouth", "Hawks", "FCS"],
  ["Morehead State Eagles", "Morehead State", "Eagles", "FCS"],
  ["Morgan State Bears", "Morgan State", "Bears", "FCS"],
  ["North Carolina Central Eagles", "North Carolina Central", "Eagles", "FCS"],
  ["New Haven Chargers", "New Haven", "Chargers", "FCS"],
  ["Nicholls Colonels", "Nicholls", "Colonels", "FCS"],
  ["North Carolina A&T Aggies", "North Carolina A&T", "Aggies", "FCS"],
  ["Norfolk State Spartans", "Norfolk State", "Spartans", "FCS"],
  ["North Alabama Lions", "North Alabama", "Lions", "FCS"],
  ["Northern Colorado Bears", "Northern Colorado", "Bears", "FCS"],
  ["Northern Iowa Panthers", "Northern Iowa", "Panthers", "FCS"],
  ["Northern Arizona Lumberjacks", "Northern Arizona", "Lumberjacks", "FCS"],
  ["Northwestern State Demons", "Northwestern State", "Demons", "FCS"],
  ["Portland State Vikings", "Portland State", "Vikings", "FCS"],
  ["Prairie View A&M Panthers", "Prairie View A&M", "Panthers", "FCS"],
  ["Presbyterian Blue Hose", "Presbyterian", "Blue Hose", "FCS"],
  ["Robert Morris Colonials", "Robert Morris", "Colonials", "FCS"],
  ["Sacred Heart Pioneers", "Sacred Heart", "Pioneers", "FCS"],
  ["Samford Bulldogs", "Samford", "Bulldogs", "FCS"],
  ["SE Louisiana Lions", "SE Louisiana", "Lions", "FCS"],
  ["Southeast Missouri State Redhawks", "Southeast Missouri State", "Redhawks", "FCS"],
  ["South Carolina State Bulldogs", "South Carolina State", "Bulldogs", "FCS"],
  ["South Dakota State Jackrabbits", "South Dakota State", "Jackrabbits", "FCS"],
  ["Southern Jaguars", "Southern", "Jaguars", "FCS"],
  ["Stephen F. Austin Lumberjacks", "Stephen F. Austin", "Lumberjacks", "FCS"],
  ["Stony Brook Seawolves", "Stony Brook", "Seawolves", "FCS"],
  ["Tarleton State Texans", "Tarleton State", "Texans", "FCS"],
  ["UT Martin Skyhawks", "UT Martin", "Skyhawks", "FCS"],
  ["Tennessee State Tigers", "Tennessee State", "Tigers", "FCS"],
  ["Tennessee Tech Golden Eagles", "Tennessee Tech", "Golden Eagles", "FCS"],
  ["Texas Southern Tigers", "Texas Southern", "Tigers", "FCS"],
  ["The Citadel Bulldogs", "The Citadel", "Bulldogs", "FCS"],
  ["Valparaiso Beacons", "Valparaiso", "Beacons", "FCS"],
  ["VMI Keydets", "VMI", "Keydets", "FCS"],
  ["Wagner Seahawks", "Wagner", "Seahawks", "FCS"],
  ["Weber State Wildcats", "Weber State", "Wildcats", "FCS"],
  ["West Georgia Wolves", "West Georgia", "Wolves", "FCS"],
  ["Western Illinois Leathernecks", "Western Illinois", "Leathernecks", "FCS"],
  ["Western Carolina Catamounts", "Western Carolina", "Catamounts", "FCS"],
  ["William & Mary Tribe", "William & Mary", "Tribe", "FCS"],
  ["Wofford Terriers", "Wofford", "Terriers", "FCS"],
  ["Youngstown State Penguins", "Youngstown State", "Penguins", "FCS"],
  ["Grambling Tigers", "Grambling", "Tigers", "FCS"],
  ["Merrimack Warriors", "Merrimack", "Warriors", "FCS"],
  ["Bryant Bulldogs", "Bryant", "Bulldogs", "FCS"],
  ["Lindenwood Lions", "Lindenwood", "Lions", "FCS"],
  ["East Texas A&M Lions", "East Texas A&M", "Lions", "FCS"],
  ["St. Thomas Tommies", "St. Thomas", "Tommies", "FCS"],
  ["Incarnate Word Cardinals", "Incarnate Word", "Cardinals", "FCS"],
  ["Utah Tech Trailblazers", "Utah Tech", "Trailblazers", "FCS"],
  ["West Florida Argonauts", "West Florida", "Argonauts", "FCS"],
];

/** School aliases people type that ESPN's location doesn't spell */
const COLLEGE_ALIASES: Record<string, string> = {
  "Pittsburgh Panthers": "pitt",
  "Miami Hurricanes": "miami fl|miami florida|miami fla",
  "Miami (OH) RedHawks": "miami ohio|miami",
  "Texas A&M Aggies": "tamu",
  "UConn Huskies": "connecticut",
  "Massachusetts Minutemen": "umass",
  "LSU Tigers": "louisiana state",
  "Southern Miss Golden Eagles": "southern mississippi",
  "App State Mountaineers": "appalachian state",
  "NC State Wolfpack": "north carolina state",
  "Florida International Panthers": "fiu",
  "Florida Atlantic Owls": "fau",
  "UCF Knights": "central florida",
  "Ole Miss Rebels": "mississippi",
  "USC Trojans": "southern california",
  "BYU Cougars": "brigham young",
  "SMU Mustangs": "southern methodist",
  "TCU Horned Frogs": "texas christian",
  "UL Monroe Warhawks": "louisiana monroe",
  "Sam Houston Bearkats": "sam houston state"
};

// Short names bettors type. Some name several schools ("OSU": Ohio State,
// Oklahoma State, Oregon State; "UM", "MSU", "SDSU"): the opponent named or
// the teams playing that week decide, else the chat asks which one
const COLLEGE_SHORT_NAMES: Record<string, string> = {
  "Georgia Bulldogs": "uga",
  "Oklahoma Sooners": "ou",
  "Alabama Crimson Tide": "bama",
  "Missouri Tigers": "mizzou",
  "West Virginia Mountaineers": "wvu",
  "Vanderbilt Commodores": "vandy",
  "Penn State Nittany Lions": "psu",
  "San Diego State Aztecs": "sdsu",
  "South Dakota State Jackrabbits": "sdsu",
  "Kentucky Wildcats": "uk",
  "Washington State Cougars": "wazzu",
  "Syracuse Orange": "cuse",
  "Arizona Wildcats": "zona",
  "North Carolina Tar Heels": "unc",
  "Virginia Cavaliers": "uva",
  "Virginia Tech Hokies": "vt",
  "Boston College Eagles": "bc",
  "Florida State Seminoles": "fsu",
  "Florida Gators": "uf",
  "Michigan Wolverines": "um",
  "Miami Hurricanes": "um",
  "Ohio State Buckeyes": "osu",
  "Oklahoma State Cowboys": "osu|okstate|ok state",
  "Oregon State Beavers": "osu",
  "Kansas Jayhawks": "ku",
  "Kansas State Wildcats": "k state|kstate",
  "Mississippi State Bulldogs": "miss state|miss st|msu",
  "Michigan State Spartans": "msu",
  "Texas A&M Aggies": "a and m",
  "NC State Wolfpack": "ncsu",
  "San José State Spartans": "sjsu",
  "Notre Dame Fighting Irish": "nd",
};
// Nickname short forms ("Vols", "Noles"); "Ags" is every Aggies team's
const COLLEGE_NICKNAME_SHORT: Record<string, string> = {
  "Tennessee Volunteers": "vols",
  "Florida State Seminoles": "noles",
  "Texas Longhorns": "horns",
  "Arkansas Razorbacks": "hogs",
  "Nebraska Cornhuskers": "huskers",
  "Miami Hurricanes": "canes",
  "Oklahoma State Cowboys": "pokes",
};

// Everyday words a college nickname's last word can be ("Mean Green"): never an alias alone
const NOT_ALIASES = new Set(["green", "state", "red", "blue", "gold", "golden"]);

/** Words that never name a team on their own: compass words, "new", "old", "central", "state", "college"... */
export const GENERIC_WORDS: ReadonlySet<string> = new Set([
  "north", "south", "east", "west", "northern", "southern", "eastern", "western", "central", "middle",
  "new", "old", "state", "st", "university", "college", "coastal", "city", "valley", "tech", "saint", "the",
]);
// Places that name no team alone: the generic words ("Southern" is a school,
// but "southern teams" is not about it), and "Vegas", which in a betting
// question is the sportsbook town
const NOT_A_PLACE_ALONE = new Set([...GENERIC_WORDS, "vegas", "las vegas", "lv"]);

// DK's school labels ("Miami FL", "ECU", "Cal"), by the school they name
const DK_LABELS = new Map<string, string[]>();
for (const [label, school] of Object.entries(DK_NCAAF_ALIASES)) DK_LABELS.set(school, [...(DK_LABELS.get(school) ?? []), label]);

const PRO_TEAMS: TeamEntry[] = PRO.map(([league, name, cities, nicks]) => ({
  league,
  name,
  locations: cities.split("|"),
  nicknames: nicks.split("|").map((n) => n.replace(/^~/, "")),
  cityOnly: nicks.split("|").filter((n) => n.startsWith("~")).map((n) => n.slice(1)),
}));
const PRO_NICKNAMES = new Set(PRO_TEAMS.flatMap((t) => t.nicknames));

const COLLEGE_TEAMS: TeamEntry[] = COLLEGE.map(([name, school, nickname, division]) => {
  const loc = normalizeTeamName(school);
  const plain = normalizeTeamName(school.replace(/\s*\(.*?\)\s*/g, " "));
  const nick = normalizeTeamName(nickname);
  const words = nick.split(" ");
  const last = words[words.length - 1];
  const schools = [
    loc,
    plain,
    ...(COLLEGE_ALIASES[name] ? COLLEGE_ALIASES[name].split("|") : []),
    ...(COLLEGE_SHORT_NAMES[name] ? COLLEGE_SHORT_NAMES[name].split("|") : []),
    ...(DK_LABELS.get(loc) ?? []),
  ];
  const shortNicknames = [
    ...(COLLEGE_NICKNAME_SHORT[name] ? COLLEGE_NICKNAME_SHORT[name].split("|") : []),
    ...(nick === "aggies" ? ["ags"] : []),
  ];
  return {
    league: "COLLEGE" as const,
    name,
    // Plus "Kent St", "Ohio St": how books and people shorten "State"; and
    // "Ohio States", a possessive typed without its apostrophe ("michigan
    // states odds"), which must never fall back to the shorter school
    locations: [
      ...new Set([...schools, ...schools.filter((x) => x.endsWith(" state")).flatMap((x) => [x.replace(/ state$/, " st"), `${x}s`])]),
    ],
    // "Gophers" for the Golden Gophers, "Tide" for the Crimson Tide; never a
    // pro nickname ("Warriors" is Golden State's) or an everyday word
    nicknames: [...(words.length > 1 && !PRO_NICKNAMES.has(last) && !NOT_ALIASES.has(last) ? [nick, last] : [nick]), ...shortNicknames],
    fbs: division === "FBS",
  };
});

export const TEAMS: TeamEntry[] = [...PRO_TEAMS, ...COLLEGE_TEAMS];

function index(key: (t: TeamEntry) => string[]): Map<string, TeamEntry[]> {
  const map = new Map<string, TeamEntry[]>();
  for (const t of TEAMS) for (const k of key(t)) map.set(k, [...(map.get(k) ?? []), t]);
  return map;
}
const IDENTITIES = index((t) => t.locations.flatMap((l) => t.nicknames.map((n) => `${l} ${n}`)));
// A nickname alone (no city): everyday-word aliases never count
const NICKNAMES = index((t) => t.nicknames.filter((n) => !t.cityOnly?.includes(n)));
const LOCATIONS = index((t) => t.locations);
const BY_NAME = index((t) => [normalizeTeamName(t.name)]);
const longest = (keys: Iterable<string>) => Math.max(...[...keys].map((k) => k.split(" ").length));
const MAX_IDENTITY = longest(IDENTITIES.keys());
const MAX_NICKNAME = longest(NICKNAMES.keys());
const MAX_LOCATION = longest(LOCATIONS.keys());

export interface TeamMention {
  /**
   * identity: city or school + nickname; nickname: a nickname with no city or
   * school it forms a team with; place: a city or school alone ("houston",
   * "boston college", "ucf")
   */
  kind: "identity" | "nickname" | "place";
  /** The teams the words can mean */
  teams: TeamEntry[];
  /** Token span [start, end) in the normalized question */
  start: number;
  end: number;
  text: string;
  /**
   * A place whose bare name is also a common surname, first name or word
   * ("rice", "troy", "temple", "marshall") with nothing around it saying it's
   * the team: it names a team only alongside that team's opponent
   */
  weak?: boolean;
}

// Everyday, betting, league and calendar words: never a first name
// ("Is Temple favored", "DraftKings Temple line", "Saturday Rice game")
const EVERYDAY_WORDS = new Set(
  (
    "i im id ill me my we us our you your he she they it its the a an and or but if so of to in on at for from with by about " +
    "is are was were be been am do does did has have had can could will would should shall may might must not no yes " +
    "who whos what whats when where wheres why how hows which whose whom " +
    "this that these those there here now then than just also only even still really very please hey hi yo ok okay thanks lets let " +
    "show tell give get find see look check compare predict prediction predictions preview breakdown analysis thoughts take takes " +
    "any all some best top biggest most more less much many every each other another number ranked unranked " +
    "odds line lines spread spreads total totals over under moneyline ml ats cover covers covering public sharp sharps split splits " +
    "handle money bet bets betting bettor pick picks favored favorite favorites underdog underdogs dog dogs win wins won lose loses " +
    "score scores game games matchup matchups vs versus v prop props parlay parlays upset upsets " +
    "tonight today tomorrow yesterday week weekend weekday day night morning afternoon evening season year " +
    "monday tuesday wednesday thursday friday saturday sunday " +
    "nfl ncaa ncaaf ncaab ncaamb cfb college football basketball baseball hockey nba mlb nhl fbs fcs " +
    "sec acc aac big ten pac mwc mac cusa sun belt conference division east west north south " +
    "draftkings dk fanduel caesars betmgm espn vegas"
  ).split(/\s+/),
);
// Words after a school that make it the team, not a surname ("Rice odds",
// "Temple game", "Houston NFL", "the Georgia side", "Clemson going",
// "Georgia SEC championship", "Georgia playoff odds"), also after "to"
// ("Georgia to cover", "Houston to win")
const TEAM_CUES = new Set(
  (
    "odds line lines spread spreads total totals over under moneyline ml ats cover covers covering public sharp sharps split splits " +
    "handle money bet bets betting pick picks favored favorite underdog dog win wins beat game games matchup vs versus v at side sides going " +
    "tonight today tomorrow this week weekend monday thursday friday saturday sunday score prediction predictions preview " +
    "nfl ncaa ncaaf cfb college football basketball baseball hockey nba mlb nhl " +
    "sec acc aac mwc mac cusa b1g big pac afc nfc championship championships title bowl bowls playoff playoffs cfp " +
    "rose sugar orange cotton fiesta peach national natty super semifinal semifinals semis quarterfinal quarterfinals minus plus"
  ).split(/\s+/),
);
const COLLEGE_WORD = /(^| )(college|ncaa|ncaaf|cfb)( |$)/;
// Schools and cities whose bare name is also a common US surname, first name
// or word ("Rashee Rice", "Troy Franklin", "Marshall Faulk", "Dallas
// Goedert", "navy blue"): alone they need corroboration (TEAM_CUES around
// them, the nickname, "University", a college word, or the opponent)
const NAME_LIKE_PLACES = new Set(
  (
    "rice troy army navy liberty temple duke tulane miami buffalo toledo marshall houston baylor stanford charlotte memphis " +
    "tulsa nevada wyoming washington utah georgia virginia indiana auburn clemson purdue vanderbilt rutgers northwestern " +
    "brown penn howard butler drake lamar wagner campbell davidson furman mercer samford richmond bryant elon hampton montana " +
    "cornell dayton stetson lafayette mcneese tarleton nicholls colgate presbyterian marist monmouth harvard yale princeton " +
    "columbia wofford bucknell dallas denver orlando cleveland phoenix brooklyn um uk bc nd"
  ).split(/\s+/),
);
// A city, school or nickname that is one word on its own: capitalized, never
// a first name. Words only inside longer names ("Young" of Brigham Young,
// "St" of St. Louis) are not in it, so "Bryce Young Alabama" still reads as a person
const TEAM_WORDS = new Set([...LOCATIONS.keys(), ...NICKNAMES.keys()].filter((k) => !k.includes(" ")));

/** The question's words as normalizeTeamName splits them, case kept ("Rashee", "Rice", "A&M" as "A and M") */
function casedWords(question: string): string[] {
  return question
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    // A possessive first, as normalizeTeamName does ("Ohio State's", "Titans'")
    .replace(/(\w)['\u2018\u2019\u02bc]s\b/gi, "$1")
    .replace(/(\w)([sS])['\u2018\u2019\u02bc](?!\w)/g, "$1$2")
    .replace(/['\u2018\u2019\u02bb\u02bc.]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** "Draft Kings" written as two words is the sportsbook, one word: its "Kings" is no team */
export function joinSportsbooks(question: string): string {
  return question.replace(/\bdraft[\s-]+kings\b/gi, "DraftKings");
}

// Real words one edit away from "state" (never a typo of it), and the texting spelling "st8"
const NOT_STATE_TYPOS = new Set(["stats", "slate", "stage", "stake", "skate", "spate", "stale", "stare", "stave", "suite", "estate", "stated", "states", "tate"]);
const damerau1 = (a: string, b: string): boolean => {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const diff = [...a].map((c, i) => (c === b[i] ? -1 : i)).filter((i) => i >= 0);
    return diff.length === 1 || (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]);
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  for (let i = 0; i < long.length; i++) if (long.slice(0, i) + long.slice(i + 1) === short) return true;
  return false;
};
/** A word one edit away from "state" ("sate", "stat", "staet") or "st8": after a school, that school's State */
function stateTypo(word: string): boolean {
  if (word === "st8") return true;
  return word.length >= 4 && !NOT_STATE_TYPOS.has(word) && damerau1(word, "state");
}

// Words that rule out the team right after them ("besides Alabama", "anyone but Ohio State", "except the Chiefs",
// "not counting Alabama, who is the public on in the SEC")
const NEGATIONS = new Set(["besides", "except", "excluding", "but", "not", "neither", "without", "minus", "ignoring"]);
const NEGATION_PAIRS = new Set(["other than", "aside from", "apart from", "not including", "not counting", "outside of", "leaving out"]);
/** Whether the team phrase starting at `start` is ruled out: a negation right before it, "the", "for", "both" or "either" aside */
function negatedAt(tokens: string[], start: number): boolean {
  let i = start - 1;
  while (i >= 0 && ["the", "for", "both", "either"].includes(tokens[i])) i--;
  return NEGATIONS.has(tokens[i] ?? "") || (i > 0 && NEGATION_PAIRS.has(`${tokens[i - 1]} ${tokens[i]}`));
}
// Words that carry a list of ruled-out teams on ("besides Alabama, Georgia and LSU", "not counting the Chiefs or Bills");
// a comma leaves no word at all
const LIST_JOINERS = new Set(["and", "or", "nor", "the"]);

// A stadium's name, not the team ("Ohio Stadium", "Notre Dame Stadium", "Georgia Dome"); "field goals" is the team's.
// A bowl's name ("Liberty Bowl") is an event: the team's bowl only when one is scheduled (pulse-chat.ts eventGames)
const VENUE_WORDS = new Set(["stadium", "stadiums", "field", "arena", "coliseum", "dome"]);
const venueAfter = (tokens: string[], end: number): boolean =>
  VENUE_WORDS.has(tokens[end] ?? "") && !(tokens[end] === "field" && /^goals?$/.test(tokens[end + 1] ?? ""));

/**
 * Every team a question names, left to right, longest phrase first: full
 * identities ("st louis cardinals", "louisville cardinals", "miami redhawks"),
 * bare nicknames ("cardinals", "yankees") and places alone ("houston",
 * "new york", "central florida"; never a generic word like "new" or "west").
 * A place right after a capitalized word that is no team, league or everyday
 * word is a person ("Rashee Rice", "Tyler Warren Temple", "Josh Allen
 * Buffalo"): `people`, not a team. So is a team the question rules out
 * ("besides Alabama", "SEC excluding Alabama", "anyone but Ohio State"), and
 * a school before a "State" typo when it has no State school ("Miami Sate");
 * with one, the typo is "state" ("Iowa Sate", "Michigan Stat", "Ohio St8").
 * A name-like place alone is `weak`. "University (of)" around a place keeps
 * its college teams only. "Draft Kings" is the sportsbook
 * (joinSportsbooks), one token "draftkings".
 */
export function scanTeams(question: string): { tokens: string[]; mentions: TeamMention[]; people: TeamMention[] } {
  const text = joinSportsbooks(question);
  const tokens = normalizeTeamName(text).split(" ").filter(Boolean);
  // "Iowa Sate", "Michigan Stat", "Ohio St8": the State school when there is one, else no team there at all
  const noTeam = new Set<number>();
  tokens.forEach((t, i) => {
    if (!stateTypo(t)) return;
    const school = locationEndingAt(tokens, i);
    if (!school) return;
    if (LOCATIONS.has(`${school.text} state`)) tokens[i] = "state";
    else for (let k = i - school.text.split(" ").length; k <= i; k++) noTeam.add(k);
  });
  const cased = casedWords(text);
  const capitalized = (i: number) => cased.length === tokens.length && /^[A-Z]/.test(cased[i] ?? "");
  const mentions: TeamMention[] = [];
  const people: TeamMention[] = [];
  // Where a list of ruled-out teams may go on: the end of the last one; and where the last team phrase ended
  let chainFrom: number | null = null;
  let lastTeamEnd = -1;
  for (let i = 0; i < tokens.length; ) {
    let found: TeamMention | null = null;
    for (let len = Math.min(MAX_IDENTITY, tokens.length - i); len >= 2 && !found; len--) {
      const text = tokens.slice(i, i + len).join(" ");
      const teams = IDENTITIES.get(text);
      if (teams) found = { kind: "identity", teams, start: i, end: i + len, text };
    }
    // Else the longer of a nickname and a place (a nickname on a tie)
    let nickname: TeamMention | null = null;
    for (let len = Math.min(MAX_NICKNAME, tokens.length - i); len >= 1 && !found && !nickname; len--) {
      const text = tokens.slice(i, i + len).join(" ");
      const teams = NICKNAMES.get(text);
      if (teams) nickname = { kind: "nickname", teams, start: i, end: i + len, text };
    }
    let place: TeamMention | null = null;
    for (let len = Math.min(MAX_LOCATION, tokens.length - i); len >= 1 && !found && !place; len--) {
      const text = tokens.slice(i, i + len).join(" ");
      const teams = NOT_A_PLACE_ALONE.has(text) ? undefined : LOCATIONS.get(text);
      if (teams) place = { kind: "place", teams, start: i, end: i + len, text };
    }
    if (!found) found = place && (!nickname || place.end > nickname.end) ? place : nickname;
    if (found?.kind === "place") {
      const before = tokens[found.start - 1];
      // Right after another team phrase ("Kansas City Miami", "A&M LSU", "Miss State Missouri"), one the question
      // rules out included ("besides Ohio State, Texas and Georgia"): a team, never a surname
      const afterTeam = lastTeamEnd === found.start;
      if (!afterTeam && before !== undefined && capitalized(found.start - 1) && !EVERYDAY_WORDS.has(before) && !TEAM_WORDS.has(before)) {
        people.push(found);
        i = found.end;
        continue;
      }
      const university =
        tokens[found.end] === "university" || tokens[found.end] === "u" || (before === "of" && tokens[found.start - 2] === "university");
      const colleges = found.teams.filter((t) => t.league === "COLLEGE");
      if (university && colleges.length) found.teams = colleges;
    }
    if (found) {
      // A school behind a "State" typo that names no State school, a stadium's name, or a team the question rules
      // out ("besides Alabama", "SEC excluding Alabama", "anyone but Ohio State"), with every team listed after it
      // ("besides Alabama, Georgia and LSU"): no team, and no label lands there
      const overlapsTypo = [...noTeam].some((k) => found!.start <= k && k < found!.end);
      const negated =
        negatedAt(tokens, found.start) || (chainFrom !== null && tokens.slice(chainFrom, found.start).every((t) => LIST_JOINERS.has(t)));
      if (overlapsTypo || negated || venueAfter(tokens, found.end)) people.push(found);
      else mentions.push(found);
      chainFrom = negated ? found.end : null;
      lastTeamEnd = found.end;
      i = found.end;
    } else {
      i++;
    }
  }
  // A name-like place alone is the team only with something around it saying so
  const college = COLLEGE_WORD.test(tokens.join(" "));
  for (const m of mentions) {
    if (m.kind !== "place" || !NAME_LIKE_PLACES.has(m.text)) continue;
    const before = tokens[m.start - 1];
    const after = tokens[m.end];
    const teamBefore = mentions.some((x) => x.end === m.start);
    const teamAfter = mentions.some((x) => x.start === m.end);
    const nickname = mentions.some((x) => x.kind === "nickname" && x.teams.some((t) => m.teams.includes(t)));
    const cueAfter = TEAM_CUES.has(after ?? "") || (after === "to" && TEAM_CUES.has(tokens[m.end + 1] ?? ""));
    const cued =
      college ||
      nickname ||
      after === "university" ||
      after === "u" ||
      ((before === undefined || teamBefore || EVERYDAY_WORDS.has(before)) &&
        // Ending the question after "the" it is the country or the service ("legal in the UK", "join the Army")
        (after === undefined ? before !== "the" : teamAfter || cueAfter || /^\d/.test(after)));
    if (!cued) m.weak = true;
  }
  // A name-like school listed with a team ("Alabama and Georgia", "Georgia or Alabama this week") is a team too
  const joined = (a: TeamMention, b: TeamMention) => {
    const between = tokens.slice(Math.min(a.end, b.end), Math.max(a.start, b.start));
    return between.length === 1 && TEAM_LIST_JOINERS.has(between[0]);
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (const m of mentions) {
      if (m.weak && mentions.some((x) => x !== m && !x.weak && joined(m, x))) {
        m.weak = false;
        changed = true;
      }
    }
  }
  return { tokens, mentions, people };
}
// Words that join teams in a list
const TEAM_LIST_JOINERS = new Set(["and", "or", "nor"]);

/** The longest city or school alias that ends right before token `end` */
export function locationEndingAt(tokens: string[], end: number): { text: string; teams: TeamEntry[] } | null {
  for (let len = Math.min(MAX_LOCATION, end); len >= 1; len--) {
    const text = tokens.slice(end - len, end).join(" ");
    const teams = LOCATIONS.get(text);
    if (teams) return { text, teams };
  }
  return null;
}

/** The table entry for a games-table team name ("Arizona Cardinals", "Miami (OH) RedHawks") */
export function teamByName(name: string, league?: TeamLeague): TeamEntry | null {
  const hits = BY_NAME.get(normalizeTeamName(name)) ?? [];
  return (league ? hits.find((t) => t.league === league) : hits[0]) ?? null;
}

// ---------------------------------------------------------------------------
// Conferences and divisions: the scope of a splits question that names no
// team ("SEC public betting", "Big Ten sharp money", "AFC East splits").
// FBS conferences as ESPN's standings list them for 2026 (Sep 24 2026); NFL
// divisions. A game is in a conference's scope when either team is in it.
// ---------------------------------------------------------------------------

export const CONFERENCE_TEAMS: Record<string, string[]> = {
  "American": ["Army Black Knights","Charlotte 49ers","East Carolina Pirates","Florida Atlantic Owls","Memphis Tigers","Navy Midshipmen","North Texas Mean Green","Rice Owls","South Florida Bulls","Temple Owls","Tulane Green Wave","Tulsa Golden Hurricane","UAB Blazers","UTSA Roadrunners"],
  "ACC": ["Boston College Eagles","California Golden Bears","Clemson Tigers","Duke Blue Devils","Florida State Seminoles","Georgia Tech Yellow Jackets","Louisville Cardinals","Miami Hurricanes","NC State Wolfpack","North Carolina Tar Heels","Pittsburgh Panthers","SMU Mustangs","Stanford Cardinal","Syracuse Orange","Virginia Cavaliers","Virginia Tech Hokies","Wake Forest Demon Deacons"],
  "Big 12": ["Arizona State Sun Devils","Arizona Wildcats","BYU Cougars","Baylor Bears","Cincinnati Bearcats","Colorado Buffaloes","Houston Cougars","Iowa State Cyclones","Kansas Jayhawks","Kansas State Wildcats","Oklahoma State Cowboys","TCU Horned Frogs","Texas Tech Red Raiders","UCF Knights","Utah Utes","West Virginia Mountaineers"],
  "Big Ten": ["Illinois Fighting Illini","Indiana Hoosiers","Iowa Hawkeyes","Maryland Terrapins","Michigan State Spartans","Michigan Wolverines","Minnesota Golden Gophers","Nebraska Cornhuskers","Northwestern Wildcats","Ohio State Buckeyes","Oregon Ducks","Penn State Nittany Lions","Purdue Boilermakers","Rutgers Scarlet Knights","UCLA Bruins","USC Trojans","Washington Huskies","Wisconsin Badgers"],
  "Conference USA": ["Delaware Blue Hens","Florida International Panthers","Jacksonville State Gamecocks","Kennesaw State Owls","Liberty Flames","Middle Tennessee Blue Raiders","Missouri State Bears","New Mexico State Aggies","Sam Houston Bearkats","Western Kentucky Hilltoppers"],
  "Independents": ["Notre Dame Fighting Irish","UConn Huskies"],
  "MAC": ["Akron Zips","Ball State Cardinals","Bowling Green Falcons","Buffalo Bulls","Central Michigan Chippewas","Eastern Michigan Eagles","Kent State Golden Flashes","Massachusetts Minutemen","Miami (OH) RedHawks","Ohio Bobcats","Sacramento State Hornets","Toledo Rockets","Western Michigan Broncos"],
  "Mountain West": ["Air Force Falcons","Hawai'i Rainbow Warriors","Nevada Wolf Pack","New Mexico Lobos","North Dakota State Bison","Northern Illinois Huskies","San José State Spartans","UNLV Rebels","UTEP Miners","Wyoming Cowboys"],
  "Pac-12": ["Boise State Broncos","Colorado State Rams","Fresno State Bulldogs","Oregon State Beavers","San Diego State Aztecs","Texas State Bobcats","Utah State Aggies","Washington State Cougars"],
  "SEC": ["Alabama Crimson Tide","Arkansas Razorbacks","Auburn Tigers","Florida Gators","Georgia Bulldogs","Kentucky Wildcats","LSU Tigers","Mississippi State Bulldogs","Missouri Tigers","Oklahoma Sooners","Ole Miss Rebels","South Carolina Gamecocks","Tennessee Volunteers","Texas A&M Aggies","Texas Longhorns","Vanderbilt Commodores"],
  "Sun Belt": ["App State Mountaineers","Arkansas State Red Wolves","Coastal Carolina Chanticleers","Georgia Southern Eagles","Georgia State Panthers","James Madison Dukes","Louisiana Ragin' Cajuns","Louisiana Tech Bulldogs","Marshall Thundering Herd","Old Dominion Monarchs","South Alabama Jaguars","Southern Miss Golden Eagles","Troy Trojans","UL Monroe Warhawks"],
  "AFC East": ["Buffalo Bills", "Miami Dolphins", "New England Patriots", "New York Jets"],
  "AFC North": ["Baltimore Ravens", "Cincinnati Bengals", "Cleveland Browns", "Pittsburgh Steelers"],
  "AFC South": ["Houston Texans", "Indianapolis Colts", "Jacksonville Jaguars", "Tennessee Titans"],
  "AFC West": ["Denver Broncos", "Kansas City Chiefs", "Las Vegas Raiders", "Los Angeles Chargers"],
  "NFC East": ["Dallas Cowboys", "New York Giants", "Philadelphia Eagles", "Washington Commanders"],
  "NFC North": ["Chicago Bears", "Detroit Lions", "Green Bay Packers", "Minnesota Vikings"],
  "NFC South": ["Atlanta Falcons", "Carolina Panthers", "New Orleans Saints", "Tampa Bay Buccaneers"],
  "NFC West": ["Arizona Cardinals", "Los Angeles Rams", "San Francisco 49ers", "Seattle Seahawks"],
};

// The words for each (normalized); "AFC" and "NFC" alone are all four of their divisions
const CONFERENCE_WORDS: Array<[string, string[]]> = [
  ["sec", ["SEC"]],
  ["big ten|big 10|b1g|b10", ["Big Ten"]],
  ["acc", ["ACC"]],
  ["big 12|big twelve|big xii|b12", ["Big 12"]],
  ["pac 12|pac12|pac twelve", ["Pac-12"]],
  ["aac|american athletic|american conference", ["American"]],
  ["mwc|mountain west", ["Mountain West"]],
  ["sun belt|sunbelt", ["Sun Belt"]],
  ["c usa|cusa|conference usa", ["Conference USA"]],
  ["mac|mid american|midamerican", ["MAC"]],
  ["independents|fbs independents", ["Independents"]],
  ...["afc", "nfc"].flatMap((c): Array<[string, string[]]> => [
    ...["east", "north", "south", "west"].map((d): [string, string[]] => [`${c} ${d}`, [`${c.toUpperCase()} ${d[0].toUpperCase()}${d.slice(1)}`]]),
    [c, ["East", "North", "South", "West"].map((d) => `${c.toUpperCase()} ${d}`)],
  ]),
];

const NOT_THE_SEC_BEFORE = new Set(["a", "one", "1", "per", "few", "couple"]);
const CONFERENCE_PHRASES = CONFERENCE_WORDS.flatMap(([words, confs]) => words.split("|").map((w) => ({ words: w.split(" "), confs }))).sort(
  (a, b) => b.words.length - a.words.length,
);

/**
 * Where a question's normalized words name a conference or division, left to
 * right, the longest phrase at each word ("afc east" over "afc", "mid
 * american" over "american conference"): the token span [start, end) and
 * the conferences it means
 */
export function conferenceSpans(tokens: string[]): Array<{ start: number; end: number; confs: string[] }> {
  const out: Array<{ start: number; end: number; confs: string[] }> = [];
  for (let i = 0; i < tokens.length; ) {
    const hit = CONFERENCE_PHRASES.find((p) => p.words.every((w, k) => tokens[i + k] === w));
    // "give me a sec", "one sec": a second, not the SEC
    if (!hit || (hit.words.join(" ") === "sec" && NOT_THE_SEC_BEFORE.has(tokens[i - 1] ?? ""))) {
      i++;
      continue;
    }
    out.push({ start: i, end: i + hit.words.length, confs: hit.confs });
    i += hit.words.length;
  }
  return out;
}

/** The nickname as the display name writes it: "Texans", "Blue Jays", "RedHawks" */
export function displayNickname(team: TeamEntry): string {
  const words = team.nicknames[0].split(" ").length;
  return team.name.trim().split(/\s+/).slice(-words).join(" ");
}

// ---------------------------------------------------------------------------
// Seasons (UTC dates): college football late August to late January, college
// basketball early November to early April, the NFL August to mid-February,
// MLB late March to early November, the NBA mid-October to late June, the
// NHL early October to late June.
// ---------------------------------------------------------------------------

/** College football: late August through the late-January title game (UTC dates) */
export function ncaafInSeason(now: Date): boolean {
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  return (m === 7 && d >= 20) || (m >= 8 && m <= 11) || (m === 0 && d <= 25);
}

/** College basketball: early November through the early-April title game (UTC dates) */
export function ncaabInSeason(now: Date): boolean {
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  return (m === 10 && d >= 3) || m === 11 || m <= 2 || (m === 3 && d <= 8);
}

/** Preseason through the Super Bowl, MLB's opener through the World Series, NBA tip-off through the Finals, NHL opening night through the Stanley Cup Final */
export function inSeason(league: TeamLeague, now: Date): boolean {
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  if (league === "NFL") return m >= 7 || m === 0 || (m === 1 && d <= 15);
  if (league === "MLB") return (m === 2 && d >= 20) || (m >= 3 && m <= 9) || (m === 10 && d <= 5);
  if (league === "NBA") return (m === 9 && d >= 15) || m >= 10 || m <= 4 || (m === 5 && d <= 25);
  if (league === "NHL") return (m === 9 && d >= 7) || m >= 10 || m <= 4 || (m === 5 && d <= 20);
  return ncaafInSeason(now) || ncaabInSeason(now);
}
