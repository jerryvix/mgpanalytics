// Season-long futures board — scraped from Matchbetwin on 2026-07-15.
// STATIC BY DESIGN (owner decision): pre-season numbers that mostly only move on
// major trades/injuries. Refresh once per year before each season, or on request.
// Live futures tracking is an enterprise-tier data feature we deliberately skipped.
//
// Scope: Team Totals + Player Prop futures. NCAAF carries team totals only —
// the source book lists no NCAAF player prop futures.

export interface PropFuture {
  market: string; // e.g. "Regular Season Wins", "Regular Season - Total Passing Yards"
  subject: string; // team or player name
  line: number;
  over: string; // American odds
  under: string;
}

export const FUTURES_CAPTURED_AT = "2026-07-15";
export const FUTURES_BOOK = "Matchbetwin";

export const NFL_FUTURES: PropFuture[] = [
  {
    "market": "Regular Season Wins",
    "subject": "Arizona Cardinals",
    "line": 4.5,
    "over": "+155",
    "under": "-185"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Buffalo Bills",
    "line": 10.5,
    "over": "-126",
    "under": "-104"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Chicago Bears",
    "line": 9.5,
    "over": "-104",
    "under": "-126"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Cincinnati Bengals",
    "line": 9.5,
    "over": "-150",
    "under": "+120"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Denver Broncos",
    "line": 9.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Detroit Lions",
    "line": 10.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Houston Texans",
    "line": 9.5,
    "over": "-129",
    "under": "-101"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Kansas City Chiefs",
    "line": 10.5,
    "over": "+113",
    "under": "-143"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Las Vegas Raiders",
    "line": 5.5,
    "over": "-149",
    "under": "+119"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Miami Dolphins",
    "line": 4.5,
    "over": "+103",
    "under": "-133"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Minnesota Vikings",
    "line": 8.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season Wins",
    "subject": "New Orleans Saints",
    "line": 7.5,
    "over": "-126",
    "under": "-104"
  },
  {
    "market": "Regular Season Wins",
    "subject": "New York Giants",
    "line": 7.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season Wins",
    "subject": "New York Jets",
    "line": 5.5,
    "over": "-126",
    "under": "-104"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Philadelphia Eagles",
    "line": 10.5,
    "over": "+113",
    "under": "-143"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Pittsburgh Steelers",
    "line": 8.5,
    "over": "-104",
    "under": "-126"
  },
  {
    "market": "Regular Season Wins",
    "subject": "San Francisco 49ers",
    "line": 10.5,
    "over": "+120",
    "under": "-150"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Seattle Seahawks",
    "line": 10.5,
    "over": "-120",
    "under": "-110"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Tampa Bay Buccaneers",
    "line": 8.5,
    "over": "-101",
    "under": "-129"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Tennessee Titans",
    "line": 6.5,
    "over": "-110",
    "under": "-120"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Washington Commanders",
    "line": 7.5,
    "over": "-128",
    "under": "-102"
  },
  {
    "market": "Regular Season - Total Passing Yards",
    "subject": "Bo Nix",
    "line": 3500.5,
    "over": "-112",
    "under": "-118"
  },
  {
    "market": "Regular Season - Total Passing Yards",
    "subject": "Dak Prescott",
    "line": 4000.5,
    "over": "-112",
    "under": "-118"
  },
  {
    "market": "Regular Season - Total Passing Yards",
    "subject": "Jalen Hurts",
    "line": 3250.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Yards",
    "subject": "Jordan Love",
    "line": 3550.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Yards",
    "subject": "Justin Herbert",
    "line": 3525.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Yards",
    "subject": "Lamar Jackson",
    "line": 3250.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Amon-Ra St. Brown",
    "line": 1249.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Brock Bowers",
    "line": 874.5,
    "over": "-121",
    "under": "-109"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "CeeDee Lamb",
    "line": 1200.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Drake London",
    "line": 1150.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Jamarr Chase",
    "line": 1325.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Jaxon Smith-Njigba",
    "line": 1325.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Justin Jefferson",
    "line": 1150.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "Bijan Robinson",
    "line": 1175.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "Derrick Henry",
    "line": 1275.5,
    "over": "-114",
    "under": "-116"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "James Cook",
    "line": 1249.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "Jonathan Taylor",
    "line": 1249.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "Saquon Barkley",
    "line": 1099.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Makai Lemon",
    "line": 650.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Touchdowns",
    "subject": "A.J. Brown",
    "line": 7.5,
    "over": "+116",
    "under": "-146"
  },
  {
    "market": "Regular Season - Total Receiving Touchdowns",
    "subject": "Amon-Ra St. Brown",
    "line": 9.5,
    "over": "-118",
    "under": "-112"
  },
  {
    "market": "Regular Season - Total Receiving Touchdowns",
    "subject": "Brock Bowers",
    "line": 7.5,
    "over": "+134",
    "under": "-164"
  },
  {
    "market": "Regular Season - Total Receiving Touchdowns",
    "subject": "Ceedee Lamb",
    "line": 7.5,
    "over": "-112",
    "under": "-118"
  },
  {
    "market": "Regular Season - Total Receiving Touchdowns",
    "subject": "Chris Olave",
    "line": 5.5,
    "over": "-123",
    "under": "-107"
  },
  {
    "market": "Regular Season - Total Receiving Touchdowns",
    "subject": "Davante Adams",
    "line": 9.5,
    "over": "+104",
    "under": "-134"
  },
  {
    "market": "Regular Season - Total Receiving Touchdowns",
    "subject": "DeVonta Smith",
    "line": 5.5,
    "over": "-118",
    "under": "-112"
  },
  {
    "market": "Regular Season - Total Receiving Touchdowns",
    "subject": "Drake London",
    "line": 7.5,
    "over": "+108",
    "under": "-138"
  },
  {
    "market": "Regular Season - Total Receiving Touchdowns",
    "subject": "George Pickens",
    "line": 6.5,
    "over": "-134",
    "under": "+104"
  },
  {
    "market": "Regular Season - Total Receiving Touchdowns",
    "subject": "Ja'Marr Chase",
    "line": 10.5,
    "over": "+108",
    "under": "-138"
  },
  {
    "market": "Regular Season - Total Receiving Touchdowns",
    "subject": "Jaxon Smith-Njigba",
    "line": 8.5,
    "over": "+108",
    "under": "-138"
  },
  {
    "market": "Regular Season - Total Receiving Touchdowns",
    "subject": "Justin Jefferson",
    "line": 6.5,
    "over": "-138",
    "under": "+108"
  },
  {
    "market": "Regular Season - Total Receiving Touchdowns",
    "subject": "Nico Collins",
    "line": 6.5,
    "over": "-107",
    "under": "-123"
  },
  {
    "market": "Regular Season - Total Receiving Touchdowns",
    "subject": "Puka Nacua",
    "line": 7.5,
    "over": "-138",
    "under": "+108"
  },
  {
    "market": "Regular Season - Total Receiving Touchdowns",
    "subject": "Tee Higgins",
    "line": 8.5,
    "over": "+104",
    "under": "-134"
  },
  {
    "market": "Regular Season - Total Receiving Touchdowns",
    "subject": "Tetairoa McMillan",
    "line": 6.5,
    "over": "-112",
    "under": "-118"
  },
  {
    "market": "Regular Season - Total Receiving Touchdowns",
    "subject": "Trey McBride",
    "line": 6.5,
    "over": "-102",
    "under": "-128"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "A.J. Brown",
    "line": 1125.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Brian Thomas Jr.",
    "line": 725.5,
    "over": "-121",
    "under": "-109"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Chris Olave",
    "line": 1025.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Christian Watson",
    "line": 800.5,
    "over": "-107",
    "under": "-123"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Colston Loveland",
    "line": 750.5,
    "over": "-121",
    "under": "-109"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Courtland Sutton",
    "line": 800.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "D.K. Metcalf",
    "line": 825.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Dallas Goedert",
    "line": 575.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Dalton Kincaid",
    "line": 550.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Davante Adams",
    "line": 775.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "DeVonta Smith",
    "line": 1050.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Garrett Wilson",
    "line": 1000.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "George Pickens",
    "line": 1000.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Jake Ferguson",
    "line": 525.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Jameson Williams",
    "line": 900.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Jayden Reed",
    "line": 650.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Jordan Addison",
    "line": 675.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Khalil Shakir",
    "line": 675.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Kyle Pitts",
    "line": 775.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Ladd McConkey",
    "line": 850.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Luther Burden III",
    "line": 825.5,
    "over": "-121",
    "under": "-109"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Mark Andrews",
    "line": 525.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Marvin Harrison Jr.",
    "line": 825.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Nico Collins",
    "line": 1075.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Puka Nacua",
    "line": 1325.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Rome Odunze",
    "line": 800.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Tee Higgins",
    "line": 875.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Terry McLaurin",
    "line": 950.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Tetairoa McMillan",
    "line": 950.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Trey McBride",
    "line": 1000.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Tyler Warren",
    "line": 725.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Zay Flowers",
    "line": 975.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Ashton Jeanty",
    "line": 7.5,
    "over": "+104",
    "under": "-134"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Bijan Robinson",
    "line": 8.5,
    "over": "-128",
    "under": "-102"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Breece Hall",
    "line": 5.5,
    "over": "+120",
    "under": "-150"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Chase Brown",
    "line": 5.5,
    "over": "-112",
    "under": "-118"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Christian McCaffrey",
    "line": 8.5,
    "over": "-118",
    "under": "-112"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "D'Andre Swift",
    "line": 5.5,
    "over": "-131",
    "under": "+101"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "David Montgomery",
    "line": 7.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Derrick Henry",
    "line": 12.5,
    "over": "-107",
    "under": "-123"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Drake Maye",
    "line": 3.5,
    "over": "-108",
    "under": "-122"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Jahmyr Gibbs",
    "line": 12.5,
    "over": "-102",
    "under": "-128"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Jalen Hurts",
    "line": 8.5,
    "over": "-123",
    "under": "-107"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "James Cook",
    "line": 10.5,
    "over": "-107",
    "under": "-123"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Javonte Williams",
    "line": 9.5,
    "over": "-126",
    "under": "-104"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Jaxson Dart",
    "line": 4.5,
    "over": "-131",
    "under": "+101"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Jeremiyah Love",
    "line": 5.5,
    "over": "-134",
    "under": "+104"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Jonathan Taylor",
    "line": 11.5,
    "over": "+104",
    "under": "-134"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Josh Allen",
    "line": 11.5,
    "over": "-102",
    "under": "-128"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Kenneth Walker III",
    "line": 7.5,
    "over": "-107",
    "under": "-123"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Kyren Williams",
    "line": 9.5,
    "over": "-128",
    "under": "-102"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Lamar Jackson",
    "line": 3.5,
    "over": "-131",
    "under": "+101"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Omarion Hampton",
    "line": 7.5,
    "over": "-128",
    "under": "-102"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Rhamondre Stevenson",
    "line": 5.5,
    "over": "-127",
    "under": "-103"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Saquon Barkley",
    "line": 7.5,
    "over": "-102",
    "under": "-128"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "Tony Pollard",
    "line": 5.5,
    "over": "-110",
    "under": "-120"
  },
  {
    "market": "Regular Season - Total Rushing Touchdowns",
    "subject": "TreVeyon Henderson",
    "line": 5.5,
    "over": "-101",
    "under": "-129"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "Bhayshul Tuten",
    "line": 700.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "Blake Corum",
    "line": 675.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "Breece Hall",
    "line": 900.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "Chase Brown",
    "line": 825.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "D'Andre Swift",
    "line": 800.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "De'Von Achane",
    "line": 1000.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "Drake Maye",
    "line": 425.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "Jalen Hurts",
    "line": 400.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "Jaxson Dart",
    "line": 450.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "Jayden Daniels",
    "line": 550.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "Josh Allen",
    "line": 500.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "Kyren Williams",
    "line": 1000.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "Lamar Jackson",
    "line": 575.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "Omarion Hampton",
    "line": 950.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "Tony Pollard",
    "line": 800.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Sacks",
    "subject": "Myles Garrett",
    "line": 15.75,
    "over": "-123",
    "under": "-107"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Baker Mayfield",
    "line": 25.5,
    "over": "-104",
    "under": "-126"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Bo Nix",
    "line": 24.5,
    "over": "-109",
    "under": "-121"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Brock Purdy",
    "line": 27.5,
    "over": "-121",
    "under": "-109"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Bryce Young",
    "line": 20.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "C.J. Stroud",
    "line": 22.5,
    "over": "-104",
    "under": "-126"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Caleb Williams",
    "line": 24.5,
    "over": "-104",
    "under": "-126"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Cameron Ward",
    "line": 18.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Dak Prescott",
    "line": 27.5,
    "over": "-104",
    "under": "-126"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Drake Maye",
    "line": 26.5,
    "over": "-109",
    "under": "-121"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Fernando Mendoza",
    "line": 12.5,
    "over": "-122",
    "under": "-108"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Jalen Hurts",
    "line": 22.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Jared Goff",
    "line": 29.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Jaxson Dart",
    "line": 19.5,
    "over": "-121",
    "under": "-109"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Jayden Daniels",
    "line": 21.5,
    "over": "-109",
    "under": "-121"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Joe Burrow",
    "line": 32.5,
    "over": "-121",
    "under": "-109"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Jordan Love",
    "line": 24.5,
    "over": "-109",
    "under": "-121"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Josh Allen",
    "line": 24.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Justin Herbert",
    "line": 24.5,
    "over": "-121",
    "under": "-109"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Lamar Jackson",
    "line": 24.5,
    "over": "-121",
    "under": "-109"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Matthew Stafford",
    "line": 30.5,
    "over": "-109",
    "under": "-121"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Sam Darnold",
    "line": 23.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Touchdowns",
    "subject": "Trevor Lawrence",
    "line": 25.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Yards",
    "subject": "Aaron Rodgers",
    "line": 3200.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Yards",
    "subject": "Baker Mayfield",
    "line": 3550.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Yards",
    "subject": "Bryce Young",
    "line": 3025.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Yards",
    "subject": "Cam Ward",
    "line": 3250.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Yards",
    "subject": "Drake Maye",
    "line": 3750.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Yards",
    "subject": "Fernando Mendoza",
    "line": 2350.5,
    "over": "-121",
    "under": "-109"
  },
  {
    "market": "Regular Season - Total Passing Yards",
    "subject": "Jared Goff",
    "line": 4100.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Yards",
    "subject": "Jaxson Dart",
    "line": 3100.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Yards",
    "subject": "Joe Burrow",
    "line": 4000.5,
    "over": "-112",
    "under": "-118"
  },
  {
    "market": "Regular Season - Total Passing Yards",
    "subject": "Matthew Stafford",
    "line": 3975.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Yards",
    "subject": "Sam Darnold",
    "line": 3750.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Yards",
    "subject": "Trevor Lawrence",
    "line": 3775.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Passing Yards",
    "subject": "Tyler Shough",
    "line": 3700.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Touchdowns",
    "subject": "Travis Kelce",
    "line": 4.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Carnell Tate",
    "line": 774.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Denzel Boston",
    "line": 475.5,
    "over": "-112",
    "under": "-118"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "DJ Moore",
    "line": 824.5,
    "over": "-119",
    "under": "-111"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Jaylen Waddle",
    "line": 874.5,
    "over": "-126",
    "under": "-104"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Jordyn Tyson",
    "line": 774.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "KC Concepcion",
    "line": 625.5,
    "over": "-118",
    "under": "-112"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Kenyon Sadiq",
    "line": 475.5,
    "over": "-112",
    "under": "-118"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Michael Pittman Jr.",
    "line": 774.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Receiving Yards",
    "subject": "Omar Cooper Jr.",
    "line": 549.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "Jeremiyah Love",
    "line": 900.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season - Total Rushing Yards",
    "subject": "Kenneth Walker III",
    "line": 924.5,
    "over": "-120",
    "under": "-110"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Atlanta Falcons",
    "line": 6.5,
    "over": "-138",
    "under": "+108"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Baltimore Ravens",
    "line": 11.5,
    "over": "+113",
    "under": "-143"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Cleveland Browns",
    "line": 5.5,
    "over": "-128",
    "under": "-102"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Los Angeles Rams",
    "line": 11.5,
    "over": "-128",
    "under": "-102"
  }
];

export const NCAAF_FUTURES: PropFuture[] = [
  {
    "market": "Regular Season Wins",
    "subject": "Arkansas Razorbacks",
    "line": 4.5,
    "over": "+125",
    "under": "-155"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Virginia Tech Hokies",
    "line": 6.5,
    "over": "-154",
    "under": "+124"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Air Force Falcons",
    "line": 6.5,
    "over": "-158",
    "under": "+128"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Akron Zips",
    "line": 4.5,
    "over": "-125",
    "under": "-105"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Alabama Crimson Tide",
    "line": 8.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Appalachian State Mountaineers",
    "line": 5.5,
    "over": "-161",
    "under": "+131"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Arizona State Sun Devils",
    "line": 6.5,
    "over": "-121",
    "under": "-109"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Arizona Wildcats",
    "line": 7.5,
    "over": "+108",
    "under": "-138"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Arkansas State Red Wolves",
    "line": 6.5,
    "over": "+111",
    "under": "-141"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Army Black Knights",
    "line": 7.5,
    "over": "-146",
    "under": "+116"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Auburn Tigers",
    "line": 6.5,
    "over": "-119",
    "under": "-111"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Ball State Cardinals",
    "line": 3.5,
    "over": "-120",
    "under": "-110"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Baylor Bears",
    "line": 6.5,
    "over": "+119",
    "under": "-149"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Boston College Eagles",
    "line": 3.5,
    "over": "+103",
    "under": "-133"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Bowling Green Falcons",
    "line": 4.5,
    "over": "-158",
    "under": "+128"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Buffalo Bulls",
    "line": 6.5,
    "over": "+140",
    "under": "-170"
  },
  {
    "market": "Regular Season Wins",
    "subject": "BYU Cougars",
    "line": 8.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season Wins",
    "subject": "California Golden Bears",
    "line": 6.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Central Michigan Chippewas",
    "line": 6.5,
    "over": "+111",
    "under": "-141"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Charlotte 49ers",
    "line": 2.5,
    "over": "+121",
    "under": "-151"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Cincinnati Bearcats",
    "line": 5.5,
    "over": "-109",
    "under": "-121"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Clemson Tigers",
    "line": 7.5,
    "over": "-140",
    "under": "+110"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Coastal Carolina Chanticleers",
    "line": 4.5,
    "over": "-146",
    "under": "+116"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Colorado Buffaloes",
    "line": 4.5,
    "over": "+124",
    "under": "-154"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Delaware Fightin Blue Hens",
    "line": 5.5,
    "over": "-164",
    "under": "+134"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Duke Blue Devils",
    "line": 5.5,
    "over": "-133",
    "under": "+103"
  },
  {
    "market": "Regular Season Wins",
    "subject": "East Carolina Pirates",
    "line": 7.5,
    "over": "-105",
    "under": "-125"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Eastern Michigan Eagles",
    "line": 5.5,
    "over": "-151",
    "under": "+121"
  },
  {
    "market": "Regular Season Wins",
    "subject": "FIU Panthers",
    "line": 6.5,
    "over": "+121",
    "under": "-151"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Florida Atlantic Owls",
    "line": 5.5,
    "over": "-125",
    "under": "-105"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Florida Gators",
    "line": 7.5,
    "over": "+119",
    "under": "-149"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Florida State Seminoles",
    "line": 6.5,
    "over": "+136",
    "under": "-166"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Georgia Bulldogs",
    "line": 9.5,
    "over": "-179",
    "under": "+149"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Georgia Southern Eagles",
    "line": 4.5,
    "over": "-151",
    "under": "+121"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Georgia State Panthers",
    "line": 4.5,
    "over": "+140",
    "under": "-170"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Georgia Tech Yellow Jackets",
    "line": 6.5,
    "over": "-105",
    "under": "-125"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Hawaii Rainbow Warriors",
    "line": 7.5,
    "over": "+121",
    "under": "-151"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Houston Cougars",
    "line": 7.5,
    "over": "-157",
    "under": "+127"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Illinois Fighting Illini",
    "line": 7.5,
    "over": "+131",
    "under": "-161"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Indiana Hoosiers",
    "line": 10.5,
    "over": "-104",
    "under": "-126"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Iowa Hawkeyes",
    "line": 7.5,
    "over": "-128",
    "under": "-102"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Iowa State Cyclones",
    "line": 5.5,
    "over": "+108",
    "under": "-138"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Jacksonville State Gamecocks",
    "line": 7.5,
    "over": "+105",
    "under": "-135"
  },
  {
    "market": "Regular Season Wins",
    "subject": "James Madison Dukes",
    "line": 8.5,
    "over": "-131",
    "under": "+101"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Kansas Jayhawks",
    "line": 5.5,
    "over": "-166",
    "under": "+136"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Kansas State Wildcats",
    "line": 7.5,
    "over": "-183",
    "under": "+153"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Kennesaw State Owls",
    "line": 6.5,
    "over": "+121",
    "under": "-151"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Kent State Golden Flashes",
    "line": 3.5,
    "over": "-105",
    "under": "-125"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Kentucky Wildcats",
    "line": 4.5,
    "over": "-137",
    "under": "+107"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Liberty Flames",
    "line": 8.5,
    "over": "+116",
    "under": "-146"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Louisiana Ragin' Cajuns",
    "line": 7.5,
    "over": "+116",
    "under": "-146"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Louisiana Tech Bulldogs",
    "line": 5.5,
    "over": "-158",
    "under": "+128"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Louisville Cardinals",
    "line": 7.5,
    "over": "-171",
    "under": "+141"
  },
  {
    "market": "Regular Season Wins",
    "subject": "LSU Tigers",
    "line": 8.5,
    "over": "-112",
    "under": "-118"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Marshall Thundering Herd",
    "line": 7.5,
    "over": "+111",
    "under": "-141"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Maryland Terrapins",
    "line": 4.5,
    "over": "-207",
    "under": "+177"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Memphis Tigers",
    "line": 7.5,
    "over": "-125",
    "under": "-105"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Miami (OH) Redhawks",
    "line": 7.5,
    "over": "+134",
    "under": "-164"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Miami Florida Hurricanes",
    "line": 10.5,
    "over": "-119",
    "under": "-111"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Michigan State Spartans",
    "line": 3.5,
    "over": "-166",
    "under": "+136"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Michigan Wolverines",
    "line": 8.5,
    "over": "+134",
    "under": "-164"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Middle Tennessee Blue Raiders",
    "line": 3.5,
    "over": "-158",
    "under": "+128"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Minnesota Golden Gophers",
    "line": 5.5,
    "over": "-154",
    "under": "+124"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Mississippi State Bulldogs",
    "line": 4.5,
    "over": "-133",
    "under": "+103"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Missouri State Bears",
    "line": 4.5,
    "over": "+111",
    "under": "-141"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Missouri Tigers",
    "line": 6.5,
    "over": "-138",
    "under": "+108"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Navy Midshipmen",
    "line": 7.5,
    "over": "-158",
    "under": "+128"
  },
  {
    "market": "Regular Season Wins",
    "subject": "NC State Wolfpack",
    "line": 6.5,
    "over": "-183",
    "under": "+153"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Nebraska Cornhuskers",
    "line": 6.5,
    "over": "+119",
    "under": "-149"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Nevada Wolf Pack",
    "line": 4.5,
    "over": "+121",
    "under": "-151"
  },
  {
    "market": "Regular Season Wins",
    "subject": "New Mexico Lobos",
    "line": 7.5,
    "over": "-180",
    "under": "+150"
  },
  {
    "market": "Regular Season Wins",
    "subject": "New Mexico State Aggies",
    "line": 4.5,
    "over": "-120",
    "under": "-110"
  },
  {
    "market": "Regular Season Wins",
    "subject": "North Carolina Tarheels",
    "line": 4.5,
    "over": "-135",
    "under": "+105"
  },
  {
    "market": "Regular Season Wins",
    "subject": "North Dakota State Bison",
    "line": 9.5,
    "over": "+170",
    "under": "-222"
  },
  {
    "market": "Regular Season Wins",
    "subject": "North Texas Mean Green",
    "line": 5.5,
    "over": "-150",
    "under": "+120"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Northern Illinois Huskies",
    "line": 3.5,
    "over": "-135",
    "under": "+105"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Northwestern Wildcats",
    "line": 5.5,
    "over": "-104",
    "under": "-126"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Notre Dame Fighting Irish",
    "line": 11.5,
    "over": "+161",
    "under": "-191"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Ohio Bobcats",
    "line": 6.5,
    "over": "-151",
    "under": "+121"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Ohio State Buckeyes",
    "line": 9.5,
    "over": "-166",
    "under": "+136"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Oklahoma Sooners",
    "line": 7.5,
    "over": "-141",
    "under": "+111"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Oklahoma State Cowboys",
    "line": 5.5,
    "over": "-161",
    "under": "+131"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Old Dominion Monarchs",
    "line": 7.5,
    "over": "-120",
    "under": "-110"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Ole Miss Rebels",
    "line": 7.5,
    "over": "-154",
    "under": "+124"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Oregon Ducks",
    "line": 10.5,
    "over": "+105",
    "under": "-135"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Penn State Nittany Lions",
    "line": 9.5,
    "over": "+134",
    "under": "-164"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Pittsburgh Panthers",
    "line": 7.5,
    "over": "-151",
    "under": "+121"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Purdue Boilermakers",
    "line": 3.5,
    "over": "+103",
    "under": "-133"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Rice Owls",
    "line": 3.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Rutgers Scarlet Knights",
    "line": 4.5,
    "over": "-148",
    "under": "+118"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Sam Houston State Bearkats",
    "line": 3.5,
    "over": "+121",
    "under": "-151"
  },
  {
    "market": "Regular Season Wins",
    "subject": "San Jose State Spartans",
    "line": 4.5,
    "over": "-169",
    "under": "+139"
  },
  {
    "market": "Regular Season Wins",
    "subject": "SMU Mustangs",
    "line": 8.5,
    "over": "-133",
    "under": "+103"
  },
  {
    "market": "Regular Season Wins",
    "subject": "South Alabama Jaguars",
    "line": 5.5,
    "over": "-131",
    "under": "+101"
  },
  {
    "market": "Regular Season Wins",
    "subject": "South Carolina Gamecocks",
    "line": 6.5,
    "over": "+105",
    "under": "-135"
  },
  {
    "market": "Regular Season Wins",
    "subject": "South Florida Bulls",
    "line": 8.5,
    "over": "+116",
    "under": "-146"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Southern Miss Golden Eagles",
    "line": 3.5,
    "over": "-151",
    "under": "+121"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Stanford Cardinal",
    "line": 3.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Syracuse Orange",
    "line": 4.5,
    "over": "-102",
    "under": "-128"
  },
  {
    "market": "Regular Season Wins",
    "subject": "TCU Horned Frogs",
    "line": 6.5,
    "over": "-149",
    "under": "+119"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Temple Owls",
    "line": 5.5,
    "over": "+101",
    "under": "-131"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Tennessee Volunteers",
    "line": 7.5,
    "over": "-109",
    "under": "-121"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Texas A&M Aggies",
    "line": 8.5,
    "over": "-111",
    "under": "-119"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Texas Longhorns",
    "line": 9.5,
    "over": "+119",
    "under": "-149"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Texas Tech Red Raiders",
    "line": 10.5,
    "over": "-233",
    "under": "+185"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Toledo Rockets",
    "line": 7.5,
    "over": "-131",
    "under": "+101"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Troy Trojans",
    "line": 6.5,
    "over": "-141",
    "under": "+111"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Tulane Green Wave",
    "line": 7.5,
    "over": "+121",
    "under": "-151"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Tulsa Golden Hurricane",
    "line": 5.5,
    "over": "-105",
    "under": "-125"
  },
  {
    "market": "Regular Season Wins",
    "subject": "UAB Blazers",
    "line": 3.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season Wins",
    "subject": "UCF Knights",
    "line": 5.5,
    "over": "-150",
    "under": "+120"
  },
  {
    "market": "Regular Season Wins",
    "subject": "UCLA Bruins",
    "line": 6.5,
    "over": "+107",
    "under": "-137"
  },
  {
    "market": "Regular Season Wins",
    "subject": "UConn Huskies",
    "line": 6.5,
    "over": "+163",
    "under": "-193"
  },
  {
    "market": "Regular Season Wins",
    "subject": "ULM Warhawks",
    "line": 3.5,
    "over": "-115",
    "under": "-115"
  },
  {
    "market": "Regular Season Wins",
    "subject": "UMass Minutemen",
    "line": 2.5,
    "over": "-146",
    "under": "+116"
  },
  {
    "market": "Regular Season Wins",
    "subject": "UNLV Rebels",
    "line": 7.5,
    "over": "-131",
    "under": "+101"
  },
  {
    "market": "Regular Season Wins",
    "subject": "USC Trojans",
    "line": 8.5,
    "over": "+110",
    "under": "-140"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Utah Utes",
    "line": 8.5,
    "over": "-149",
    "under": "+119"
  },
  {
    "market": "Regular Season Wins",
    "subject": "UTEP Miners",
    "line": 3.5,
    "over": "+111",
    "under": "-141"
  },
  {
    "market": "Regular Season Wins",
    "subject": "UTSA Roadrunners",
    "line": 7.5,
    "over": "-125",
    "under": "-105"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Vanderbilt Commodores",
    "line": 6.5,
    "over": "+147",
    "under": "-177"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Virginia Cavaliers",
    "line": 7.5,
    "over": "-154",
    "under": "+124"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Wake Forest Demon Deacons",
    "line": 5.5,
    "over": "-133",
    "under": "+103"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Washington Huskies",
    "line": 7.5,
    "over": "-166",
    "under": "+136"
  },
  {
    "market": "Regular Season Wins",
    "subject": "West Virginia Mountaineers",
    "line": 5.5,
    "over": "-149",
    "under": "+119"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Western Kentucky Hilltoppers",
    "line": 7.5,
    "over": "+128",
    "under": "-158"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Western Michigan Broncos",
    "line": 7.5,
    "over": "+121",
    "under": "-151"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Wisconsin Badgers",
    "line": 6.5,
    "over": "-119",
    "under": "-111"
  },
  {
    "market": "Regular Season Wins",
    "subject": "Wyoming Cowboys",
    "line": 5.5,
    "over": "-110",
    "under": "-120"
  }
];
