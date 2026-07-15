// Trending Bets — full-season futures paired with a verifiable "did you know".
//
// Every `nugget` is a real, checkable fact with a `source`; lines/odds are the
// live 2026-27 sportsbook boards (DraftKings/consensus) captured at build time
// and web-verified July 2026. When a futures-odds + nugget sync lands it
// replaces this file — the shape below is exactly what it emits, so no UI
// rework is needed. Game-level props slot in via the "Game Props" category.
//
// RULE: never ship an unverifiable nugget. Set `verified: false` and it is
// hidden from users until a source is attached. Year ranges use the compact
// apostrophe style, e.g. ('20-'21).

export type BetCategory =
  | "Win Totals"
  | "Awards"
  | "Division"
  | "Conference"
  | "Championship"
  | "Game Props"; // reserved for in-season expansion

export interface TrendingBet {
  id: string;
  category: BetCategory;
  subject: string; // team or player
  logoHint?: string; // team abbr for a future logo lookup
  market: string; // "Regular Season Wins", "AP MVP", ...
  line: string; // "O/U 10.5" or "+600"
  odds?: string; // secondary odds detail, e.g. "Over -120 / Under +100"
  book: string;
  nugget: string;
  source: string;
  verified: boolean;
  updated: string; // ISO date the line was captured
}

const D = "2026-07-14"; // capture date for these boards

export const NFL_TRENDING: TrendingBet[] = [
  // ---- Win Totals ----
  {
    id: "nfl-wins-ravens",
    category: "Win Totals",
    subject: "Baltimore Ravens",
    logoHint: "BAL",
    market: "Regular Season Wins",
    line: "O/U 11.5",
    odds: "Over +115 / Under -140",
    book: "DraftKings",
    nugget:
      "Baltimore opens co-favorite for most wins in the AFC at 11.5 — despite going just 8-9 in '25 and missing the playoffs. It's the biggest projected turnaround on the board, and adding elite edge rusher Trey Hendrickson is a big reason the market believes it.",
    source: "2026 NFL win totals; 2025 standings",
    verified: true,
    updated: D,
  },
  {
    id: "nfl-wins-bills",
    category: "Win Totals",
    subject: "Buffalo Bills",
    logoHint: "BUF",
    market: "Regular Season Wins",
    line: "O/U 10.5",
    odds: "Over -120 / Under +100",
    book: "DraftKings",
    nugget:
      "Buffalo has won 11+ games in five of the last six seasons and hasn't finished below 10 wins since '19. At 10.5, the book is essentially asking whether the Josh Allen-era floor finally dips.",
    source: "NFL standings '19-'25",
    verified: true,
    updated: D,
  },
  {
    id: "nfl-wins-cardinals",
    category: "Win Totals",
    subject: "Arizona Cardinals",
    logoHint: "ARI",
    market: "Regular Season Wins",
    line: "O/U 4.5",
    book: "DraftKings",
    nugget:
      "At 4.5, Arizona owns the lowest win total in the entire NFL — a full seven games below the Ravens and Rams at the top. It's the market's clearest single signal of a team the books expect to rebuild.",
    source: "2026 NFL win totals",
    verified: true,
    updated: D,
  },
  // ---- Awards ----
  {
    id: "nfl-mvp-allen",
    category: "Awards",
    subject: "Josh Allen",
    logoHint: "BUF",
    market: "AP NFL MVP",
    line: "+550",
    book: "DraftKings",
    nugget:
      "Allen enters as the reigning MVP — but repeating is one of the hardest feats in the sport. Only five players have ever won back-to-back MVP, and none since Aaron Rodgers in ('20-'21).",
    source: "AP MVP voting history",
    verified: true,
    updated: D,
  },
  {
    id: "nfl-mvp-jackson",
    category: "Awards",
    subject: "Lamar Jackson",
    logoHint: "BAL",
    market: "AP NFL MVP",
    line: "+700",
    book: "DraftKings",
    nugget:
      "Jackson is already a two-time MVP ('19, '23). A third would put him in an exclusive club of three-time winners — a list still topped by Peyton Manning's five.",
    source: "AP MVP voting history",
    verified: true,
    updated: D,
  },
  {
    id: "nfl-dpoy-garrett",
    category: "Awards",
    subject: "Myles Garrett",
    logoHint: "CLE",
    market: "AP Defensive Player of the Year",
    line: "+400",
    book: "DraftKings",
    nugget:
      "Garrett is the reigning DPOY (a two-time winner in '23 and '25) and just the second player ever to take it unanimously, after J.J. Watt in '14. A 2026 win would make him the first to win three DPOYs in four years since Watt.",
    source: "AP DPOY history; 2026 NFL Honors",
    verified: true,
    updated: D,
  },
  {
    id: "nfl-mvp-nonqb",
    category: "Awards",
    subject: "The field (non-QBs)",
    market: "AP NFL MVP",
    line: "Longshots",
    book: "DraftKings",
    nugget:
      "Every serious MVP favorite is a quarterback — for good reason. The last 13 MVPs have all been QBs, and since 2001 only three non-quarterbacks have won the award, all of them running backs.",
    source: "AP MVP winners since 2001",
    verified: true,
    updated: D,
  },
  // ---- Division ----
  {
    id: "nfl-div-afceast",
    category: "Division",
    subject: "Buffalo Bills",
    logoHint: "BUF",
    market: "AFC East Winner",
    line: "-125",
    book: "DraftKings",
    nugget:
      "Buffalo won five straight AFC East titles ('20-'24) before New England — behind second-year QB Drake Maye — grabbed it in '25 and rode it all the way to Super Bowl LX. The Bills are now favored to take the division right back.",
    source: "NFL division champions; 2025 standings",
    verified: true,
    updated: D,
  },
  {
    id: "nfl-div-afcnorth",
    category: "Division",
    subject: "Baltimore Ravens",
    logoHint: "BAL",
    market: "AFC North Winner",
    line: "-105",
    book: "DraftKings",
    nugget:
      "The Ravens are favored to win the North despite an 8-9 '25 — while the Bengals, coming off 6-11, made the offseason's boldest swing, trading their first-round pick for star DT Dexter Lawrence. It's shaping up as the league's most volatile division.",
    source: "2026 division odds; offseason moves",
    verified: true,
    updated: D,
  },
];

export const NCAAF_TRENDING: TrendingBet[] = [
  // ---- Win Totals ----
  {
    id: "ncaaf-wins-alabama",
    category: "Win Totals",
    subject: "Alabama Crimson Tide",
    logoHint: "ALA",
    market: "Regular Season Wins",
    line: "O/U 8.5",
    odds: "Over -118 / Under -104",
    book: "DraftKings",
    nugget:
      "Alabama won 10+ games in 16 straight seasons under Nick Saban ('08-'23). That streak ended the year after he retired — and with the SEC moving to a nine-game conference schedule in 2026, the Tide's total sits at a startling 8.5.",
    source: "Alabama football records; 2026 win totals",
    verified: true,
    updated: D,
  },
  {
    id: "ncaaf-wins-sec",
    category: "Win Totals",
    subject: "Georgia · Texas · Ohio State",
    market: "Regular Season Wins",
    line: "O/U 9.5",
    book: "DraftKings",
    nugget:
      "Georgia, Texas, and Ohio State all open at 9.5 wins — and not a single SEC team cracked a 10-win total for 2026. The reason is structural: the SEC's new nine-game conference schedule means one more brutal game for everyone.",
    source: "2026 college football win totals",
    verified: true,
    updated: D,
  },
  // ---- Awards ----
  {
    id: "ncaaf-heisman-carr",
    category: "Awards",
    subject: "CJ Carr",
    logoHint: "ND",
    market: "Heisman Trophy",
    line: "+700",
    book: "DraftKings",
    nugget:
      "Carr (Notre Dame) opens as the +700 favorite. History is on his side positionally — quarterbacks have won 16 of the last 20 Heismans — but not institutionally: Notre Dame hasn't produced a Heisman winner since Tim Brown in 1987.",
    source: "Heisman Trust records",
    verified: true,
    updated: D,
  },
  {
    id: "ncaaf-heisman-manning",
    category: "Awards",
    subject: "Arch Manning",
    logoHint: "TEX",
    market: "Heisman Trophy",
    line: "+800",
    book: "DraftKings",
    nugget:
      "Arch Manning opens second at +800 — and no Manning has ever won the Heisman. Grandfather Archie finished third in 1970 and Peyton was the runner-up in 1997. Arch carries the family's best shot yet.",
    source: "Heisman voting history",
    verified: true,
    updated: D,
  },
  {
    id: "ncaaf-heisman-smith",
    category: "Awards",
    subject: "Jeremiah Smith",
    logoHint: "OSU",
    market: "Heisman Trophy",
    line: "+1400",
    book: "DraftKings",
    nugget:
      "Ohio State's Jeremiah Smith is the best non-QB on the board at +1400. He'd be bucking history hard: before DeVonta Smith in 2020, no wide receiver had won the Heisman since Desmond Howard in 1991.",
    source: "Heisman winners by position",
    verified: true,
    updated: D,
  },
  // ---- Conference ----
  {
    id: "ncaaf-sec-title",
    category: "Conference",
    subject: "Texas Longhorns",
    logoHint: "TEX",
    market: "SEC Championship",
    line: "+300",
    book: "DraftKings",
    nugget:
      "Texas (+300) edges Georgia (+350) atop the SEC with Arch Manning back under center. Georgia is chasing history it already made once — its back-to-back national titles in ('21-'22) were the first repeat champion since Alabama in ('11-'12).",
    source: "2026 SEC title odds; CFP champions",
    verified: true,
    updated: D,
  },
  {
    id: "ncaaf-bigten-title",
    category: "Conference",
    subject: "Ohio State Buckeyes",
    logoHint: "OSU",
    market: "Big Ten Championship",
    line: "+180",
    book: "DraftKings",
    nugget:
      "Ohio State opens the clear Big Ten favorite at +180 with Julian Sayin and star WR Jeremiah Smith back. Reigning champ Indiana (+250) is close behind — the Hoosiers stunned the sport in '25 and now have to prove it wasn't a one-off.",
    source: "2026 Big Ten title odds",
    verified: true,
    updated: D,
  },
  // ---- Championship ----
  {
    id: "ncaaf-natl-osu",
    category: "Championship",
    subject: "Ohio State Buckeyes",
    logoHint: "OSU",
    market: "National Championship",
    line: "+600",
    book: "DraftKings",
    nugget:
      "Ohio State opens as the +600 national-title favorite — one year after Indiana shocked college football, going a perfect 16-0 to win its first-ever championship and become just the third 16-0 champion in history, joining 1894 Yale and 2019 North Dakota State.",
    source: "2026 national title odds; 2025 CFP",
    verified: true,
    updated: D,
  },
  {
    id: "ncaaf-natl-conference",
    category: "Championship",
    subject: "Big Ten vs. SEC",
    market: "National Championship",
    line: "Conference futures",
    book: "DraftKings",
    nugget:
      "Since 2006, SEC programs have won more national titles than the rest of the FBS combined — yet the last two crowns both went to the Big Ten: Ohio State ('24) and Indiana ('25). The board reflects the shift, with Big Ten teams holding three of the four shortest title prices.",
    source: "National championship history",
    verified: true,
    updated: D,
  },
];

export const MLB_TRENDING: TrendingBet[] = [
  // ---- Championship ----
  {
    id: "mlb-ws-dodgers",
    category: "Championship",
    subject: "Los Angeles Dodgers",
    logoHint: "LAD",
    market: "World Series",
    line: "+190",
    book: "DraftKings",
    nugget:
      "The Dodgers enter the All-Star break the standalone favorite — chasing a THREE-PEAT after winning it all in '24 and '25. No team has won three straight World Series since the ('98-'00) Yankees, and no NL team has ever done it.",
    source: "World Series champions; 2026 odds at the All-Star break",
    verified: true,
    updated: "2026-07-14",
  },
  {
    id: "mlb-ws-yankees",
    category: "Championship",
    subject: "New York Yankees",
    logoHint: "NYY",
    market: "World Series",
    line: "+550",
    book: "DraftKings",
    nugget:
      "The Yankees' 27 titles are the most in North American pro sports — but they haven't added one since '09, their longest championship drought since the ('78-'96) gap. They sit second on the board yet don't even lead their league: Tampa Bay owns the AL's best record at the break.",
    source: "World Series history; 2026 AL standings at the break",
    verified: true,
    updated: "2026-07-14",
  },
  {
    id: "mlb-ws-brewers",
    category: "Championship",
    subject: "Milwaukee Brewers",
    logoHint: "MIL",
    market: "World Series",
    line: "+1100",
    book: "DraftKings",
    nugget:
      "Milwaukee holds the third-shortest price on the board — and is one of just five MLB franchises that has never won a World Series. The Brewers' only pennant came back in '82, before an entire generation of their fans was born.",
    source: "World Series history; 2026 odds",
    verified: true,
    updated: "2026-07-14",
  },
  // ---- Awards ----
  {
    id: "mlb-almvp-alvarez",
    category: "Awards",
    subject: "Yordan Alvarez",
    logoHint: "HOU",
    market: "AL MVP",
    line: "-165",
    book: "DraftKings",
    nugget:
      "Alvarez leads MLB in OPS at the break and has pulled away to odds-on favorite. He has never won an MVP — a first would also be Houston's first since Jose Altuve in '17.",
    source: "AP MVP history; 2026 leaderboards at the break",
    verified: true,
    updated: "2026-07-14",
  },
  {
    id: "mlb-nlmvp-ohtani",
    category: "Awards",
    subject: "Shohei Ohtani",
    logoHint: "LAD",
    market: "NL MVP",
    line: "-1000",
    odds: "Field +650",
    book: "DraftKings",
    nugget:
      "Ohtani is such a prohibitive favorite that DraftKings opened a 'vs. the field' market. He owns four MVPs ('21, '23, '24, '25) — three straight seasons — and a fifth would leave only Barry Bonds (7) ahead of him all-time.",
    source: "AP/BBWAA MVP history",
    verified: true,
    updated: "2026-07-14",
  },
  {
    id: "mlb-almvp-caminero",
    category: "Awards",
    subject: "Junior Caminero",
    logoHint: "TB",
    market: "AL MVP",
    line: "+450",
    book: "DraftKings",
    nugget:
      "The board's fastest riser: Caminero was 20-1 two weeks ago and is +450 at the break, powering a Tampa Bay club with the AL's best record (56-37). The Rays have never had an MVP winner in franchise history.",
    source: "2026 MVP odds movement; MVP history",
    verified: true,
    updated: "2026-07-14",
  },
];

export function trendingFor(sport: "NFL" | "NCAAF" | "MLB"): TrendingBet[] {
  const all = sport === "NFL" ? NFL_TRENDING : sport === "NCAAF" ? NCAAF_TRENDING : MLB_TRENDING;
  return all.filter((b) => b.verified);
}
