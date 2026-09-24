// Hand-curated 2025 preseason season-long player prop lines, compiled from
// free public articles (source URL retained per line; captured May-Sep 2025,
// mostly Aug 11-20). There is no programmatic archive of season-long props:
// The Odds API never carried them and the good article databases are
// paywalled, so this seed is the 2025 slice of MGP's owned archive; 2026
// onward comes from the annual futures capture (futures-2026.ts).
//
// Every line here was confirmed against the cited source. Do not add
// estimated or recalled numbers. Known gaps, stated plainly:
//  - receptions: no individual season O/U found in free sources (only
//    "most receptions" leader futures): the market slot is empty, not padded.
//  - most recommendation articles quote one side's odds only; the other side
//    is null.
//  - four rows are milestone-style "X+" markets (flagged inline): a result
//    landing exactly on the whole-number line grades as a push under our
//    semantics but would have won the "X+" bet.

export interface SeedPropLine {
  market:
    | "pass_yards"
    | "pass_td"
    | "rush_yards"
    | "rush_td"
    | "rec_yards"
    | "rec_td"
    | "receptions"
    | "sacks";
  player: string;
  line: number;
  overOdds: number | null;
  underOdds: number | null;
  book: string | null;
  sourceUrl: string;
}

export const SEED_SEASON = 2025;

const SBD_BAD_LINES = "https://www.sportsbettingdime.com/news/nfl/10-season-long-player-props-where-sportsbooks-have-bad-lines-2025/";
const BETMGM_FUTURES = "https://sports.betmgm.com/en/blog/nfl/nfl-player-props-futures-bets-for-this-season-bm16/";
const BR_DK_WRTE = "https://bleacherreport.com/articles/25239586-nfl-betting-odds-jamarr-chase-justin-jefferson-more-top-wrs-tes-revealed";
const CBS_RB = "https://www.cbssports.com/betting/news/2025-nfl-futures-bets-predictions-top-player-props-running-back-prop-bet-picks-for-gibbs-warren-hall";
const CBS_QB = "https://www.cbssports.com/nfl/news/2025-nfl-futures-bets-predictions-player-props-quarterback-prop-picks-for-mahomes-burrow-murray/";
const CBS_WR = "https://www.cbssports.com/nfl/news/2025-nfl-futures-bets-predictions-player-props-wide-receiver-prop-bet-picks-for-london-worthy-nabers/";
const ESPN_TEAMS = "https://www.espn.com/espn/betting/story/_/id/45695376/2025-nfl-betting-odds-rankings-picks-props-predictions-every-team"; // ESPN BET, Aug 13 2025
const ESPN_OVERS = "https://www.espn.com/espn/betting/story/_/id/45871241/2025-nfl-odds-props-pop-betting-player-futures-predictions-analysis"; // ESPN BET, Aug 14 2025
const LVSB_ALLEN = "https://lasvegassportsbetting.com/josh-allen-2025-nfl-preview-season-odds-betting-props-futures-predictions/"; // Bovada
const FD_RESEARCH = "https://www.fanduel.com/research/4-best-nfl-player-prop-futures-bets-for-2025"; // FanDuel "Player Milestones" market (X+ thresholds, no under side)
const SB3_WR = "https://www.sportsbetting3.com/nfl/nfl-receiver-regular-season-props";
const WSN_SACKS = "https://www.wsn.com/nfl/most-sacks-tackles-picks-best-bets/";
const PFF_VERSE = "https://www.pff.com/news/bet-2025-nfl-betting-jared-verse-sack-prop-shrewd-bet";

export const SEED_PROPS_2025: SeedPropLine[] = [
  // ---------- PASSING YARDS (13) ----------
  { market: "pass_yards", player: "Cam Ward", line: 3205.5, overOdds: -110, underOdds: null, book: "bet365", sourceUrl: SBD_BAD_LINES },
  { market: "pass_yards", player: "Patrick Mahomes", line: 4050.5, overOdds: -107, underOdds: null, book: "BetRivers", sourceUrl: SBD_BAD_LINES }, // FanDuel had 4,000.5 (-114) per CBS; ESPN BET 4,000.5 (+100)
  { market: "pass_yards", player: "Trevor Lawrence", line: 3700.5, overOdds: -110, underOdds: null, book: "DraftKings", sourceUrl: SBD_BAD_LINES }, // ESPN BET had 3,500.5 (-125)
  { market: "pass_yards", player: "JJ McCarthy", line: 3650.5, overOdds: 100, underOdds: null, book: "BetMGM", sourceUrl: SBD_BAD_LINES }, // ESPN BET had 3,500.5 (under EVEN)
  { market: "pass_yards", player: "Joe Burrow", line: 4000.5, overOdds: -140, underOdds: null, book: "ESPN BET", sourceUrl: ESPN_OVERS },
  { market: "pass_yards", player: "Josh Allen", line: 3775.5, overOdds: -115, underOdds: -115, book: "Bovada", sourceUrl: LVSB_ALLEN },
  { market: "pass_yards", player: "Bryce Young", line: 3200.5, overOdds: -115, underOdds: null, book: "ESPN BET", sourceUrl: ESPN_TEAMS },
  { market: "pass_yards", player: "Caleb Williams", line: 3450.5, overOdds: -130, underOdds: null, book: "ESPN BET", sourceUrl: ESPN_TEAMS },
  { market: "pass_yards", player: "Shedeur Sanders", line: 600.5, overOdds: -115, underOdds: null, book: "ESPN BET", sourceUrl: ESPN_TEAMS },
  { market: "pass_yards", player: "C.J. Stroud", line: 3650.5, overOdds: -105, underOdds: null, book: "ESPN BET", sourceUrl: ESPN_TEAMS },
  { market: "pass_yards", player: "Anthony Richardson Sr.", line: 1500.5, overOdds: -115, underOdds: null, book: "ESPN BET", sourceUrl: ESPN_TEAMS },
  { market: "pass_yards", player: "Drake Maye", line: 3200.5, overOdds: -140, underOdds: null, book: "ESPN BET", sourceUrl: ESPN_TEAMS },
  { market: "pass_yards", player: "Aaron Rodgers", line: 3200.5, overOdds: -115, underOdds: null, book: "ESPN BET", sourceUrl: ESPN_TEAMS },

  // ---------- PASSING TDS (7) ----------
  { market: "pass_td", player: "Kyler Murray", line: 20.5, overOdds: -110, underOdds: null, book: "DraftKings", sourceUrl: CBS_QB },
  { market: "pass_td", player: "Josh Allen", line: 27.5, overOdds: -115, underOdds: -115, book: "Bovada", sourceUrl: LVSB_ALLEN },
  { market: "pass_td", player: "Joe Burrow", line: 35, overOdds: -110, underOdds: null, book: "FanDuel", sourceUrl: FD_RESEARCH }, // milestone market: "35+ passing TDs", no under offered
  { market: "pass_td", player: "Shedeur Sanders", line: 3.5, overOdds: 105, underOdds: null, book: "ESPN BET", sourceUrl: ESPN_TEAMS },
  { market: "pass_td", player: "Daniel Jones", line: 11.5, overOdds: null, underOdds: -115, book: "ESPN BET", sourceUrl: ESPN_TEAMS },
  { market: "pass_td", player: "Sam Darnold", line: 19.5, overOdds: null, underOdds: -110, book: "ESPN BET", sourceUrl: ESPN_TEAMS },
  { market: "pass_td", player: "Baker Mayfield", line: 26.5, overOdds: null, underOdds: 120, book: "ESPN BET", sourceUrl: ESPN_TEAMS },

  // ---------- RUSHING YARDS (10) ----------
  { market: "rush_yards", player: "Chase Brown", line: 875.5, overOdds: -114, underOdds: null, book: "FanDuel", sourceUrl: SBD_BAD_LINES },
  { market: "rush_yards", player: "Christian McCaffrey", line: 950.5, overOdds: -110, underOdds: null, book: "BetMGM", sourceUrl: BETMGM_FUTURES },
  { market: "rush_yards", player: "Jahmyr Gibbs", line: 1050.5, overOdds: -118, underOdds: null, book: "BetMGM", sourceUrl: CBS_RB },
  { market: "rush_yards", player: "Jaylen Warren", line: 575.5, overOdds: -125, underOdds: null, book: "DraftKings", sourceUrl: CBS_RB },
  { market: "rush_yards", player: "Breece Hall", line: 875.5, overOdds: -114, underOdds: null, book: "FanDuel", sourceUrl: CBS_RB },
  { market: "rush_yards", player: "Javonte Williams", line: 500.5, overOdds: -105, underOdds: null, book: "ESPN BET", sourceUrl: ESPN_OVERS },
  { market: "rush_yards", player: "Omarion Hampton", line: 825.5, overOdds: -115, underOdds: null, book: "ESPN BET", sourceUrl: ESPN_OVERS },
  { market: "rush_yards", player: "Josh Allen", line: 500.5, overOdds: -115, underOdds: -115, book: "Bovada", sourceUrl: LVSB_ALLEN },
  { market: "rush_yards", player: "Kyren Williams", line: 950.5, overOdds: null, underOdds: 100, book: "ESPN BET", sourceUrl: ESPN_TEAMS },
  { market: "rush_yards", player: "Saquon Barkley", line: 1400.5, overOdds: null, underOdds: -105, book: "ESPN BET", sourceUrl: ESPN_TEAMS }, // bet365 had 1,525.5 (u -115) and DraftKings 1,500.5 (u -110) in May

  // ---------- RUSHING TDS (7) ----------
  { market: "rush_td", player: "Jalen Hurts", line: 10.5, overOdds: -130, underOdds: null, book: "ESPN BET", sourceUrl: ESPN_OVERS },
  { market: "rush_td", player: "Josh Allen", line: 10.5, overOdds: -115, underOdds: -115, book: "Bovada", sourceUrl: LVSB_ALLEN },
  { market: "rush_td", player: "James Cook", line: 8.5, overOdds: null, underOdds: 100, book: "ESPN BET", sourceUrl: ESPN_TEAMS },
  { market: "rush_td", player: "Kyren Williams", line: 10.5, overOdds: null, underOdds: -125, book: "ESPN BET", sourceUrl: ESPN_TEAMS },
  { market: "rush_td", player: "Alvin Kamara", line: 4.5, overOdds: null, underOdds: -130, book: "ESPN BET", sourceUrl: ESPN_TEAMS },
  { market: "rush_td", player: "Christian McCaffrey", line: 7.5, overOdds: -105, underOdds: null, book: "ESPN BET", sourceUrl: ESPN_TEAMS },
  { market: "rush_td", player: "Kenneth Walker III", line: 6.5, overOdds: -105, underOdds: null, book: "ESPN BET", sourceUrl: ESPN_TEAMS },

  // ---------- RECEIVING YARDS (20) ----------
  { market: "rec_yards", player: "Amon-Ra St Brown", line: 1100.5, overOdds: -110, underOdds: null, book: "BetMGM", sourceUrl: SBD_BAD_LINES },
  { market: "rec_yards", player: "Evan Engram", line: 575.5, overOdds: -110, underOdds: null, book: "bet365", sourceUrl: SBD_BAD_LINES },
  { market: "rec_yards", player: "Courtland Sutton", line: 875.5, overOdds: -110, underOdds: null, book: "DraftKings", sourceUrl: SBD_BAD_LINES },
  { market: "rec_yards", player: "Tyler Warren", line: 525.5, overOdds: -110, underOdds: null, book: "bet365", sourceUrl: SBD_BAD_LINES },
  { market: "rec_yards", player: "Christian McCaffrey", line: 425.5, overOdds: -110, underOdds: null, book: "DraftKings", sourceUrl: SBD_BAD_LINES },
  { market: "rec_yards", player: "Nico Collins", line: 1250, overOdds: 125, underOdds: null, book: "BetMGM", sourceUrl: BETMGM_FUTURES }, // milestone-style "1,250+" (ESPN BET listed 1,250+ at +130)
  { market: "rec_yards", player: "Ja'Marr Chase", line: 1300.5, overOdds: -110, underOdds: -110, book: "DraftKings", sourceUrl: BR_DK_WRTE },
  { market: "rec_yards", player: "Justin Jefferson", line: 1250.5, overOdds: -120, underOdds: 100, book: "DraftKings", sourceUrl: BR_DK_WRTE },
  { market: "rec_yards", player: "CeeDee Lamb", line: 1200.5, overOdds: -110, underOdds: -110, book: "DraftKings", sourceUrl: BR_DK_WRTE },
  { market: "rec_yards", player: "Mike Evans", line: 950.5, overOdds: -120, underOdds: 100, book: "DraftKings", sourceUrl: BR_DK_WRTE },
  { market: "rec_yards", player: "Marvin Harrison Jr.", line: 975.5, overOdds: 110, underOdds: -135, book: "DraftKings", sourceUrl: BR_DK_WRTE },
  { market: "rec_yards", player: "Travis Hunter", line: 750.5, overOdds: -120, underOdds: 100, book: "DraftKings", sourceUrl: BR_DK_WRTE },
  { market: "rec_yards", player: "Kyle Pitts", line: 550.5, overOdds: -110, underOdds: -110, book: "DraftKings", sourceUrl: BR_DK_WRTE },
  { market: "rec_yards", player: "Travis Kelce", line: 700.5, overOdds: -115, underOdds: -105, book: "DraftKings", sourceUrl: BR_DK_WRTE },
  { market: "rec_yards", player: "Drake London", line: 1125.5, overOdds: -114, underOdds: null, book: "FanDuel", sourceUrl: CBS_WR }, // ESPN BET had 1,000.5 (o -170)
  { market: "rec_yards", player: "Xavier Worthy", line: 875.5, overOdds: -114, underOdds: null, book: "FanDuel", sourceUrl: CBS_WR },
  { market: "rec_yards", player: "Malik Nabers", line: 1150.5, overOdds: null, underOdds: null, book: null, sourceUrl: SB3_WR }, // preseason line quoted in article prose
  { market: "rec_yards", player: "Jameson Williams", line: 850.5, overOdds: -140, underOdds: null, book: "ESPN BET", sourceUrl: ESPN_OVERS },
  { market: "rec_yards", player: "George Pickens", line: 800.5, overOdds: -135, underOdds: null, book: "ESPN BET", sourceUrl: ESPN_TEAMS },
  { market: "rec_yards", player: "Tyreek Hill", line: 950.5, overOdds: -130, underOdds: null, book: "ESPN BET", sourceUrl: ESPN_TEAMS },

  // ---------- RECEIVING TDS (4) ----------
  { market: "rec_td", player: "Trey McBride", line: 4.5, overOdds: -110, underOdds: null, book: "ESPN BET", sourceUrl: ESPN_OVERS },
  { market: "rec_td", player: "George Pickens", line: 6, overOdds: 105, underOdds: null, book: "FanDuel", sourceUrl: FD_RESEARCH }, // milestone market: "6+", no under offered
  { market: "rec_td", player: "Nico Collins", line: 8, overOdds: 110, underOdds: null, book: "FanDuel", sourceUrl: FD_RESEARCH }, // milestone market: "8+", no under offered
  { market: "rec_td", player: "Malik Nabers", line: 7.5, overOdds: -110, underOdds: -110, book: "BetRivers", sourceUrl: SB3_WR },

  // ---------- SACKS (3) ----------
  { market: "sacks", player: "Nick Bosa", line: 10.5, overOdds: null, underOdds: null, book: "Caesars", sourceUrl: WSN_SACKS },
  { market: "sacks", player: "Jared Verse", line: 7.25, overOdds: null, underOdds: null, book: "PrizePicks", sourceUrl: PFF_VERSE },
  { market: "sacks", player: "Aidan Hutchinson", line: 14.0, overOdds: null, underOdds: -130, book: "ESPN BET", sourceUrl: ESPN_TEAMS },
];
