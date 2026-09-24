// League detection for the chat (gemini-chat).
//
// resolveLeague reads a question in three steps:
//  1. Full team identities, from _shared/team-names.ts: a city plus nickname
//     that forms a real pro team ("St. Louis Cardinals" is MLB, "Arizona
//     Cardinals" the NFL, "San Francisco Giants" MLB, "Detroit Tigers" MLB),
//     or a school plus nickname that forms a college team ("Louisville
//     Cardinals", "LSU Tigers", "Miami RedHawks"). Identities win over every
//     keyword; two leagues named is no guess. An NHL team ("New York
//     Rangers") gets no league: the app has no NHL data.
//  2. Bare nicknames ("Cardinals odds"): the leagues every nickname can mean
//     (explicit league and sport words narrow them). One league: that league.
//     Several: the ones in season (all of them when none is), a league the
//     app covers over an NHL or college team (college teams go by their
//     school: "LSU", "Boise State"), then the league with a game in the
//     question's window (tonight or today, tomorrow, else the coming week).
//     Still more than one: no league, rather than a guess. Everyday-word
//     nicknames give way to the other teams named ("20 bucks on the Chiefs").
//  3. A city or school alone that a pro team plays in ("Houston odds",
//     "Boston odds tonight"): the teams there that are in season and play in
//     the question's window. One league: that league. Several ("Houston": the
//     Cougars, Texans and Astros) is no guess: no league, and the chat's
//     DraftKings block asks the model to ask which team (pulse-chat.ts). Two
//     such cities ("Cincinnati Pittsburgh"): the league where they play each
//     other in the window, else no league.
//  4. Otherwise detectLeague's keywords ("Kansas City" and "Oklahoma City"
//     masked: they are not Kansas or Oklahoma), with a college question
//     settled between college football and basketball by sport words, then
//     the sport with an upcoming game for those teams, then the calendar.
// Seasons: team-names.ts (inSeason), re-exported here.
// detectLeague is the chat's original keyword detection, moved here unchanged.
// Covered by src/test/leagueDetect.test.ts.

import { normalizeTeamName } from "../sync-betting-splits/match.ts";
import { lineOnlyGames, teamsNamed, type LineGameRow } from "./pulse-chat.ts";
import {
  inSeason,
  joinSportsbooks,
  locationEndingAt,
  ncaabInSeason,
  ncaafInSeason,
  scanTeams,
  teamByName,
  TEAMS,
  type TeamEntry,
  type TeamLeague,
  type TeamMention,
} from "./team-names.ts";

export { inSeason, ncaabInSeason, ncaafInSeason } from "./team-names.ts";

// detectLeague's lists, verbatim
const NFL_RE = /\b(nfl|football|super\s*bowl|superbowl|chiefs|eagles|bills|ravens|cowboys|niners|packers|lions|texans|commanders|dolphins|broncos|raiders|jets|giants|bears|vikings|colts|jaguars|titans|bengals|browns|steelers|saints|buccaneers|panthers|falcons|cardinals|seahawks|rams|chargers)\b/;
const NBA_RE = /\b(nba|lakers|celtics|warriors|bucks|heat|nuggets|suns|clippers|sixers|knicks|nets|bulls|mavericks|grizzlies|kings|pelicans|timberwolves|thunder|rockets|spurs|magic|hawks|hornets|pistons|pacers|wizards|blazers|jazz|raptors|cavaliers)\b/;
const NCAAB_RE = /\b(ncaab|ncaamb|college basketball|march madness|duke|kentucky|kansas|gonzaga|purdue|uconn|houston|tennessee|auburn|alabama|arizona|baylor|creighton|marquette|illinois|illini|michigan state|michigan|ohio state|iowa state|iowa|wisconsin|badgers|minnesota|indiana|hoosiers|penn state|maryland|terps|rutgers|nebraska|northwestern|oregon|washington|ucla|usc|florida|gators|georgia|lsu|ole miss|mississippi state|arkansas|razorbacks|missouri|texas a&m|a&m|south carolina|vanderbilt|oklahoma|texas|iowa state|cyclones|texas tech|tcu|cincinnati|bearcats|ucf|byu|west virginia|oklahoma state|colorado|arizona state|utah|kansas state|north carolina|unc|tar heels|virginia tech|virginia|wake forest|clemson|louisville|pitt|pittsburgh|syracuse|notre dame|boston college|georgia tech|stanford|smu|villanova|seton hall|xavier|butler|depaul|georgetown|hoyas|providence|st johns|dayton|memphis|san diego state|wichita state)\b/;
const NCAAF_RE = /\b(ncaaf|college football|cfb|playoff|buckeyes|crimson tide|bulldogs|wolverines|longhorns|gators|seminoles|tigers|sooners)\b/;
const MLB_RE = /\b(mlb|baseball|yankees|dodgers|braves|astros|phillies|padres|mets|orioles|guardians|rangers|mariners|twins|rays|diamondbacks|cubs|cardinals|red sox|giants|angels|athletics|royals|brewers|pirates|reds|tigers|nationals|rockies|marlins|white sox)\b/;

export function detectLeague(message: string): string | null {
  const m = message.toLowerCase();
  if (NFL_RE.test(m)) return "NFL";
  if (NBA_RE.test(m)) return "NBA";
  if (NCAAB_RE.test(m)) return "NCAAB";
  if (NCAAF_RE.test(m)) return "NCAAF";
  if (MLB_RE.test(m)) return "MLB";
  return null; // No sport keyword detected - will query user's active sports
}

// Keyword fallback (step 3): a pro team or pro league named by keyword, and a
// college team named by keyword (detectLeague's lists without league words)
const NFL_PRO_RE = /\b(nfl|super\s*bowl|superbowl|chiefs|eagles|bills|ravens|cowboys|niners|packers|lions|texans|commanders|dolphins|broncos|raiders|jets|giants|bears|vikings|colts|jaguars|titans|bengals|browns|steelers|saints|buccaneers|panthers|falcons|cardinals|seahawks|rams|chargers)\b/;
const MLB_PRO_RE = /\b(mlb|baseball|yankees|dodgers|braves|astros|phillies|padres|mets|orioles|guardians|rangers|mariners|twins|rays|diamondbacks|cubs|red sox|angels|athletics|royals|brewers|pirates|reds|nationals|rockies|marlins|white sox)\b/;
const COLLEGE_TEAM_RE = /\b(duke|kentucky|kansas|gonzaga|purdue|uconn|houston|tennessee|auburn|alabama|arizona|baylor|creighton|marquette|illinois|illini|michigan state|michigan|ohio state|iowa state|iowa|wisconsin|badgers|minnesota|indiana|hoosiers|penn state|maryland|terps|rutgers|nebraska|northwestern|oregon|washington|ucla|usc|florida|gators|georgia|lsu|ole miss|mississippi state|arkansas|razorbacks|missouri|texas a&m|a&m|south carolina|vanderbilt|oklahoma|texas|iowa state|cyclones|texas tech|tcu|cincinnati|bearcats|ucf|byu|west virginia|oklahoma state|colorado|arizona state|utah|kansas state|north carolina|unc|tar heels|virginia tech|virginia|wake forest|clemson|louisville|pitt|pittsburgh|syracuse|notre dame|boston college|georgia tech|stanford|smu|villanova|seton hall|xavier|butler|depaul|georgetown|hoyas|providence|st johns|dayton|memphis|san diego state|wichita state|buckeyes|crimson tide|bulldogs|wolverines|longhorns|gators|seminoles|tigers|sooners)\b/;
// League and sport words
const COLLEGE_FOOTBALL_WORDS = /\b(college football|cfb|ncaaf)\b/;
const COLLEGE_BASKETBALL_WORDS = /\b(college basketball|ncaab|ncaamb|march madness)\b/;
// College football's postseason ("Rose Bowl", "bowl game", "CFP", "playoff", "SEC championship game", "national title"): football while its season is on
const COLLEGE_FOOTBALL_EVENTS = /\b((?<!super\s)bowls?|cfp|college football playoff|playoffs?|postseason|semi-?finals?|quarter-?finals?|championships?|title games?|national title)\b/;
const FOOTBALL_WORDS = /\b(football|cfb|ncaaf)\b/;
const BASKETBALL_WORDS = /\b(basketball|hoops|ncaab|ncaamb)\b/;
const BASEBALL_WORDS = /\b(baseball|mlb|world series)\b/;
const HOCKEY_WORDS = /\b(hockey|nhl|stanley\s*cup)\b/;
const EXPLICIT_PRO: Array<["NFL" | "NBA" | "MLB" | "NHL", RegExp]> = [
  ["NFL", /\b(nfl|super\s*bowl|superbowl)\b/],
  ["NBA", /\bnba\b/],
  ["MLB", /\b(mlb|baseball|world series)\b/],
  ["NHL", HOCKEY_WORDS],
];

// Everyday words that are also nicknames ("20 bucks on the Chiefs"): when
// the teams named share no league, these give way to the others
const EVERYDAY_NICKNAMES = new Set(["bucks", "heat", "magic", "thunder", "jazz", "nets", "suns", "bills"]);

// A college school named right before a nickname that is not its own team's
// ("Seton Hall Pirates"): detectLeague's college list, normalized like a question
const COLLEGE_SCHOOL_BEFORE = new RegExp(
  `(^| )(${COLLEGE_TEAM_RE.source.slice(3, -3).split("|").map(normalizeTeamName).join("|")})$`,
);

/** The pro leagues the app covers (the NHL is not one) */
type ProLeague = "NFL" | "MLB" | "NBA";
const PRO_LEAGUES: ProLeague[] = ["NFL", "MLB", "NBA"];

/**
 * What the database can settle: how many named teams an upcoming NCAAF /
 * NCAAB game covers, which leagues have a game for the nickname, and which of
 * a place's teams play in the window (and the college sports they play)
 */
export interface LeagueData {
  football?: number;
  basketball?: number;
  /** The named team's football game is a postseason event (a conference title game, a bowl, the CFP): it wins a tie with basketball */
  footballEvent?: boolean;
  withGames?: string[];
  playing?: string[];
  playingCollege?: Array<"NCAAF" | "NCAAB">;
  /** Games in the window between two of those teams, by league (college as NCAAF or NCAAB) */
  matchups?: Array<{ league: string; teams: [string, string] }>;
}

interface Decision {
  league: string | null;
  /** Reads that could settle an undecided question */
  wants?: {
    college?: boolean;
    leagues?: ProLeague[];
    nicknames?: string[];
    place?: { leagues: Array<ProLeague | "COLLEGE">; teams: string[] };
  };
}

/** College football or basketball: sport words, then the data, then the calendar */
function collegeSport(m: string, now: Date, data: LeagueData | undefined): Decision & { league: "NCAAF" | "NCAAB" | null } {
  if (BASKETBALL_WORDS.test(m) || COLLEGE_BASKETBALL_WORDS.test(m)) return { league: "NCAAB" };
  if (FOOTBALL_WORDS.test(m) || COLLEGE_FOOTBALL_WORDS.test(m)) return { league: "NCAAF" };
  const football = ncaafInSeason(now);
  const basketball = ncaabInSeason(now);
  if (football && COLLEGE_FOOTBALL_EVENTS.test(m)) return { league: "NCAAF" };
  if (football && basketball) {
    if (!data) return { league: null, wants: { college: true } };
    const fb = data.football ?? 0;
    const bb = data.basketball ?? 0;
    if (fb !== bb) return { league: fb > bb ? "NCAAF" : "NCAAB" };
    // Both play: a conference title game, bowl or CFP game outweighs a basketball game
    if (fb > 0 && data.footballEvent) return { league: "NCAAF" };
    return { league: null };
  }
  if (football) return { league: "NCAAF" };
  if (basketball) return { league: "NCAAB" };
  return { league: null };
}

// Pro cities with a college keyword inside ("Kansas City odds" is not Kansas)
const PRO_CITIES = /\b(kansas|oklahoma) city\b/g;

/** Step 3: detectLeague's keywords, a college question settled by collegeSport */
function keywordLeague(message: string, now: Date, data: LeagueData | undefined): Decision {
  const m = message.toLowerCase().replace(PRO_CITIES, " ");
  const detected = detectLeague(m);
  if (detected === "NBA" || detected === "MLB") return { league: detected };
  if (detected === "NFL" && NFL_PRO_RE.test(m)) return { league: detected };
  const proNamed = NFL_PRO_RE.test(m) || NBA_RE.test(m) || MLB_PRO_RE.test(m);
  if (!proNamed) {
    if (COLLEGE_BASKETBALL_WORDS.test(m)) return { league: "NCAAB" };
    if (COLLEGE_FOOTBALL_WORDS.test(m)) return { league: "NCAAF" };
  }
  if (proNamed || !COLLEGE_TEAM_RE.test(m)) return { league: detected };
  const college = collegeSport(m, now, data);
  return { league: college.league ?? detected, wants: college.wants };
}

/**
 * The leagues a bare nickname can mean. A pro nickname counts college only
 * when an FBS team shares it ("Tigers": LSU, Auburn), since a bare nickname
 * never means an FCS team a pro team shares it with ("Lakers" is not
 * Mercyhurst); a nickname only college teams have is college. A college
 * school right before it ("Seton Hall Pirates") makes it that school's team.
 */
function nicknameLeagues(tokens: string[], start: number, teams: typeof TEAMS): Set<TeamLeague> {
  const before = tokens.slice(0, start).join(" ");
  const loc = locationEndingAt(tokens, start);
  if (COLLEGE_SCHOOL_BEFORE.test(before) || (loc && loc.teams.every((t) => t.league === "COLLEGE"))) return new Set(["COLLEGE"]);
  const pro = new Set(teams.filter((t) => t.league !== "COLLEGE").map((t) => t.league));
  if (!pro.size) return new Set(["COLLEGE"]);
  if (teams.some((t) => t.league === "COLLEGE" && t.fbs)) pro.add("COLLEGE");
  return pro;
}

function decide(question: string, now: Date, data?: LeagueData): Decision {
  // "Draft Kings" is the sportsbook: its "Kings" names no NBA or NHL team
  const message = joinSportsbooks(question);
  const m = message.toLowerCase();
  const scanned = scanTeams(message);
  const tokens = scanned.tokens;
  // A name-like place with nothing saying it's the team ("Troy Franklin props") names none
  const mentions = scanned.mentions.filter((x) => !x.weak);

  // 1) Full identities win; an NHL team gets no league (no NHL data)
  const identities = new Set(mentions.filter((x) => x.kind === "identity").flatMap((x) => x.teams.map((t) => t.league)));
  if (identities.size > 1) return { league: null };
  if (identities.size === 1) {
    const league = [...identities][0];
    if (league === "NHL") return { league: null };
    if (league !== "COLLEGE") return { league };
    const college = collegeSport(m, now, data);
    const detected = detectLeague(message);
    return { league: college.league ?? (detected === "NCAAF" || detected === "NCAAB" ? detected : null), wants: college.wants };
  }

  const explicitPro = EXPLICIT_PRO.find(([, re]) => re.test(m))?.[0] ?? null;
  const explicitCollege = COLLEGE_BASKETBALL_WORDS.test(m) ? "NCAAB" : COLLEGE_FOOTBALL_WORDS.test(m) ? "NCAAF" : null;

  // 2) Bare nicknames
  const nicknames = mentions.filter((x) => x.kind === "nickname");
  if (nicknames.length) {
    const shared = (xs: typeof nicknames) =>
      xs.reduce<Set<TeamLeague> | null>((acc, x) => {
        const each = nicknameLeagues(tokens, x.start, x.teams);
        return acc ? new Set([...acc].filter((l) => each.has(l))) : each;
      }, null) ?? new Set<TeamLeague>();
    let used = nicknames;
    let leagues = shared(used);
    const named = nicknames.filter((x) => !EVERYDAY_NICKNAMES.has(x.text));
    if (!leagues.size && named.length && named.length < nicknames.length) leagues = shared((used = named));
    let cands = [...leagues];
    if (explicitPro) cands = cands.filter((l) => l === explicitPro);
    else if (explicitCollege) cands = cands.filter((l) => l === "COLLEGE");
    if (FOOTBALL_WORDS.test(m)) cands = cands.filter((l) => l === "NFL" || l === "COLLEGE");
    if (BASKETBALL_WORDS.test(m)) cands = cands.filter((l) => l === "NBA" || l === "COLLEGE");
    if (BASEBALL_WORDS.test(m)) cands = cands.filter((l) => l === "MLB");
    if (HOCKEY_WORDS.test(m)) cands = cands.filter((l) => l === "NHL");
    const pick = (l: TeamLeague): Decision =>
      l === "COLLEGE" ? collegeSport(m, now, data) : l === "NHL" ? { league: null } : { league: l };
    if (cands.length === 0) return { league: null };
    // The ones in season; with none in season, every league it can mean
    const live = cands.filter((l) => inSeason(l, now));
    const pool = live.length ? live : cands;
    if (pool.length === 1) return pick(pool[0]);
    // A league the app covers over an NHL or college team
    const pro = PRO_LEAGUES.filter((l) => pool.includes(l));
    if (pro.length === 1) return { league: pro[0] };
    if (pro.length > 1) {
      if (!data?.withGames) return { league: null, wants: { leagues: pro, nicknames: used.map((x) => x.text) } };
      const withGames = pro.filter((l) => data.withGames!.includes(l));
      return { league: withGames.length === 1 ? withGames[0] : null };
    }
    return { league: null };
  }

  // 3) A city or school alone that a pro team plays in; or cities pro teams
  // share on every side ("Cincinnati Pittsburgh"): where they meet
  const places = mentions.filter((x) => x.kind === "place");
  const proPlaces = places.filter((p) => p.teams.some((t) => t.league !== "COLLEGE"));
  if (places.length === 1 && proPlaces.length === 1) {
    const decided = placeLeague(places[0].teams, m, now, data, explicitPro, explicitCollege);
    if (decided) return decided;
  } else if (places.length >= 2 && proPlaces.length === places.length) {
    const decided = matchupLeague(places, m, now, data, explicitPro, explicitCollege);
    if (decided) return decided;
  }

  // 4) Otherwise an explicit league word, else the keywords
  if (explicitPro) return { league: explicitPro === "NHL" ? null : explicitPro };
  return keywordLeague(withoutPeople(message, scanned.people), now, data);
}

/** The question without the people in it ("Justin Houston sacks" is not about Houston) */
function withoutPeople(message: string, people: TeamMention[]): string {
  return people.reduce((m, p) => m.replace(new RegExp(`\\b${p.text.split(" ").join("[^a-z0-9]+")}\\b`, "gi"), " "), message);
}

/**
 * Step 3: the league of the teams a place names that are in season (and, once
 * read, play in the question's window), narrowed by league and sport words.
 * One league: that league. Several: none (the chat asks which team). Nobody
 * playing: null, so the keywords decide.
 */
function placeLeague(
  teams: TeamEntry[],
  m: string,
  now: Date,
  data: LeagueData | undefined,
  explicitPro: string | null,
  explicitCollege: string | null,
): Decision | null {
  let live = narrow(teams, m, explicitPro, explicitCollege).filter((t) => inSeason(t.league, now));
  // Several leagues in season: who actually plays in the window (the NHL has no games table)
  if (new Set(live.map((t) => t.league)).size > 1) {
    const readable = live.filter((t) => t.league !== "NHL");
    if (!data?.playing) {
      if (!readable.length) return { league: null };
      const leagues = [...new Set(readable.map((t) => t.league as ProLeague | "COLLEGE"))];
      return { league: null, wants: { place: { leagues, teams: readable.map((t) => t.name) } } };
    }
    live = live.filter((t) => t.league === "NHL" || data.playing!.includes(t.name));
  }
  if (!live.length) return null;
  const leagues = [...new Set(live.map((t) => t.league))];
  if (leagues.length > 1) return { league: null };
  if (leagues[0] === "NHL") return { league: null };
  if (leagues[0] !== "COLLEGE") return { league: leagues[0] };
  const played = data?.playingCollege ?? [];
  if (ncaafInSeason(now) && ncaabInSeason(now) && played.length === 1 && !BASKETBALL_WORDS.test(m) && !FOOTBALL_WORDS.test(m)) {
    return { league: played[0] };
  }
  const college = collegeSport(m, now, data);
  return college.league || college.wants ? college : null;
}

/** A place's teams narrowed by league and sport words ("Houston NFL", "Houston baseball") */
function narrow(teams: TeamEntry[], m: string, explicitPro: string | null, explicitCollege: string | null): TeamEntry[] {
  let cands = teams;
  if (explicitPro) cands = cands.filter((t) => t.league === explicitPro);
  else if (explicitCollege) cands = cands.filter((t) => t.league === "COLLEGE");
  if (FOOTBALL_WORDS.test(m)) cands = cands.filter((t) => t.league === "NFL" || t.league === "COLLEGE");
  if (BASKETBALL_WORDS.test(m)) cands = cands.filter((t) => t.league === "NBA" || t.league === "COLLEGE");
  if (BASEBALL_WORDS.test(m)) cands = cands.filter((t) => t.league === "MLB");
  if (HOCKEY_WORDS.test(m)) cands = cands.filter((t) => t.league === "NHL");
  return cands;
}

/**
 * Cities pro teams share on every side ("Cincinnati Pittsburgh", "Minnesota
 * vs Washington"): the league where two of them meet in the window (read).
 * One league: that league; none or several: no league (the DraftKings block
 * still finds the game from both names).
 */
function matchupLeague(
  places: TeamMention[],
  m: string,
  now: Date,
  data: LeagueData | undefined,
  explicitPro: string | null,
  explicitCollege: string | null,
): Decision | null {
  const teams = [...new Set(places.flatMap((p) => narrow(p.teams, m, explicitPro, explicitCollege)))].filter(
    (t) => t.league !== "NHL" && inSeason(t.league, now),
  );
  if (!teams.length) return null;
  const single = [...new Set(teams.map((t) => t.league))];
  if (single.length === 1) return single[0] === "COLLEGE" ? collegeSport(m, now, data) : { league: single[0] };
  if (!data?.matchups) {
    const leagues = [...new Set(teams.map((t) => t.league as ProLeague | "COLLEGE"))];
    return { league: null, wants: { place: { leagues, teams: teams.map((t) => t.name) } } };
  }
  const met = new Set(
    data.matchups
      .filter((g) => places.filter((p) => p.teams.some((t) => g.teams.includes(t.name))).length >= 2)
      .map((g) => g.league),
  );
  return { league: met.size === 1 ? [...met][0] : null };
}

/** The league a question is about (see the header), given what the database said */
export function leagueFor(message: string, now: Date, data?: LeagueData): string | null {
  return decide(message, now, data ?? {}).league;
}

/** Whether leagueFor needs the NCAAF and NCAAB games: a college question with both college sports in season and no sport word */
export function needsCollegeGames(message: string, now: Date): boolean {
  return decide(message, now).wants?.college === true;
}

/**
 * The question's time window for a nickname's games: tonight or today,
 * tomorrow, else the coming week (an NFL week: its lines are up all week, so
 * "Cardinals odds" on a Thursday is still about Sunday's game as much as
 * tonight's baseball)
 */
function nicknameWindow(m: string, now: Date): [string, string] {
  const at = (h: number) => new Date(now.getTime() + h * 3600_000).toISOString();
  if (/\b(tonight|today|todays)\b/.test(m)) return [at(-3), at(18)];
  if (/\btomorrow\b/.test(m)) return [at(12), at(42)];
  return [at(-3), at(7 * 24)];
}

const GAME_TABLES: Record<ProLeague, string> = { NFL: "games", MLB: "mlb_games", NBA: "nba_games" };

/**
 * leagueFor with the data: reads only what can settle an undecided question
 * (the next eight days of NCAAF and NCAAB games for a college question in
 * both seasons; each candidate league's games in the question's window for a
 * nickname two pro leagues share, or for a place several leagues' teams
 * share). A failed read keeps the undecided answer.
 */
// deno-lint-ignore no-explicit-any
export async function resolveLeague(client: any, message: string, now: Date = new Date()): Promise<string | null> {
  const first = decide(message, now);
  if (!first.wants) return first.league;
  const data: LeagueData = {};
  try {
    if (first.wants.college) {
      const from = new Date(now.getTime() - 6 * 3600_000).toISOString();
      const to = new Date(now.getTime() + 8 * 24 * 3600_000).toISOString();
      const [fb, bb] = await Promise.all([
        client
          .from("ncaaf_games")
          .select("id, date, status, home_team_name, visitor_team_name, venue, home_team_rank, visitor_team_rank")
          .gte("date", from)
          .lte("date", to)
          .limit(1000),
        client.from("ncaab_games").select("id, date, status, home_team_name, visitor_team_name").gte("date", from).lte("date", to).limit(1000),
      ]);
      if (fb.error || bb.error) throw fb.error ?? bb.error;
      const footballGames = lineOnlyGames("NCAAF", (fb.data ?? []) as LineGameRow[]);
      data.football = teamsNamed(message, footballGames, now, { league: "NCAAF" });
      data.basketball = teamsNamed(message, lineOnlyGames("NCAAB", (bb.data ?? []) as LineGameRow[]), now, { league: "NCAAB" });
      // The named team's football game is a postseason event (game-events.ts): it names the team as well as any game does
      const events = footballGames.filter((g) => g.event);
      data.footballEvent = data.football > 0 && teamsNamed(message, events, now, { league: "NCAAF" }) >= data.football;
    }
    if (first.wants.leagues?.length) {
      const [from, to] = nicknameWindow(message.toLowerCase(), now);
      const nicknames = first.wants.nicknames ?? [];
      data.withGames = [];
      for (const league of first.wants.leagues) {
        let q = client.from(GAME_TABLES[league]).select("home_team_name, visitor_team_name, date").gte("date", from).lte("date", to);
        if (league === "NFL") q = q.eq("league", "NFL");
        const { data: rows, error } = await q.limit(500);
        if (error) throw error;
        const plays = ((rows ?? []) as Array<{ home_team_name: string; visitor_team_name: string }>).some((g) =>
          [g.home_team_name, g.visitor_team_name].some((name) => {
            const team = teamByName(name, league);
            const n = normalizeTeamName(name);
            return nicknames.some((nick) => (team ? team.nicknames.includes(nick) : n.endsWith(` ${nick}`)));
          }),
        );
        if (plays) data.withGames.push(league);
      }
    }
    if (first.wants.place) {
      // Which of the place's teams play in the question's window
      const [from, to] = nicknameWindow(message.toLowerCase(), now);
      const { leagues, teams } = first.wants.place;
      data.playing = [];
      data.playingCollege = [];
      data.matchups = [];
      const reads: Array<[string, TeamLeague, "NCAAF" | "NCAAB" | null]> = [];
      for (const league of leagues) {
        if (league !== "COLLEGE") reads.push([GAME_TABLES[league], league, null]);
        else {
          if (ncaafInSeason(now)) reads.push(["ncaaf_games", "COLLEGE", "NCAAF"]);
          if (ncaabInSeason(now)) reads.push(["ncaab_games", "COLLEGE", "NCAAB"]);
        }
      }
      for (const [table, league, sport] of reads) {
        let q = client.from(table).select("home_team_name, visitor_team_name, date").gte("date", from).lte("date", to);
        if (table === "games") q = q.eq("league", "NFL");
        const { data: rows, error } = await q.limit(1000);
        if (error) throw error;
        for (const g of (rows ?? []) as Array<{ home_team_name: string; visitor_team_name: string }>) {
          const both = [g.home_team_name, g.visitor_team_name].map((name) => teamByName(name, league)).filter((t) => t && teams.includes(t.name));
          for (const team of both) {
            data.playing.push(team!.name);
            if (sport && !data.playingCollege.includes(sport)) data.playingCollege.push(sport);
          }
          if (both.length === 2) data.matchups.push({ league: sport ?? league, teams: [both[0]!.name, both[1]!.name] });
        }
      }
    }
  } catch (e) {
    console.error("[league-detect] games read failed; leaving the league undecided", e);
    return first.league;
  }
  return decide(message, now, data).league;
}
