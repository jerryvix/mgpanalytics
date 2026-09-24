// Postseason events: which scheduled games are the Super Bowl, an NFL playoff
// game, a conference championship game, a bowl, a CFP game (and its round),
// or the CFP national championship (gameEvent, from the games tables' own
// columns), and which events a question names (eventsAsked). A futures word
// ("playoff", "Super Bowl", "bowl", "title game", "semifinal") answers with a
// game only when the games tables hold that event in the window:
// pulse-chat.ts eventGames. Pure.
//
// NFL games carry BallDontLie's postseason flag and week (1 Wild Card, 2
// Divisional, 3 conference championships, 4 the Pro Bowl, 5 Super Bowl); an
// event needs two real NFL teams, so the Pro Bowl's "AFC @ NFC" never is one.
// College rows carry no event name, so their events come from the calendar
// ESPN's schedule follows:
// - conference title games on the first Saturday of December (and the Friday
//   before) between two teams of one conference (team-names.ts
//   CONFERENCE_TEAMS);
// - after that weekend (Army-Navy, a week later, is still the regular
//   season): the CFP's first round on campus through Dec 21 (two ranked
//   teams; an early bowl has at most one), the quarterfinals at the New
//   Year's Six stadiums Dec 30 to Jan 3, the semifinals there after that; the
//   title game, the last CFP game, by date: from Jan 14 wherever it is played
//   (Hard Rock in January 2026), or the window's latest game after Jan 7 a
//   week or more after the semifinals (earlyTitleGame); every other game is
//   a bowl.
// ESPN's event notes ("CFP Semifinal at the Goodyear Cotton Bowl Classic") on
// ncaaf_games would name every bowl and CFP round exactly.

import { normalizeTeamName } from "../sync-betting-splits/match.ts";
import { CONFERENCE_TEAMS, conferenceSpans } from "./team-names.ts";

export type EventKind = "super-bowl" | "nfl-playoff" | "conference-championship" | "bowl" | "cfp" | "national-championship";
export type CfpRound = "first round" | "quarterfinal" | "semifinal" | "final";

export interface GameEvent {
  kind: EventKind;
  league: "NFL" | "NCAAF";
  /** "Super Bowl", "Wild Card", "AFC Championship", "SEC Championship", "Rose Bowl", "CFP First Round", "National Championship"; null for a bowl the tables don't name */
  name: string | null;
  /** The conference a championship game decides ("SEC", "Big Ten", "AFC") */
  conference: string | null;
  /** An NFL playoff or CFP game */
  playoff: boolean;
  /** A CFP game's round */
  round: CfpRound | null;
}

/** The games-table columns an event comes from */
export interface EventRow {
  date: string;
  home_team_name: string;
  visitor_team_name: string;
  /** ncaaf_games: the stadium ESPN lists, and the teams' ranks */
  venue?: string | null;
  home_team_rank?: number | null;
  visitor_team_rank?: number | null;
  /** games (NFL): BallDontLie's postseason flag and week */
  postseason?: boolean | null;
  week?: number | null;
}

const ET_DATE = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric" });

/** A kickoff's Eastern calendar date, as a day count (UTC arithmetic on that date) and its parts */
function etDay(iso: string): { day: number; year: number; month: number; date: number } | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const p = Object.fromEntries(ET_DATE.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const year = Number(p.year);
  const month = Number(p.month);
  const date = Number(p.day);
  return { day: dayOf(year, month, date), year, month, date };
}
const dayOf = (year: number, month: number, date: number) => Math.floor(Date.UTC(year, month - 1, date) / 86_400_000);

/** The first Saturday of December: conference championship Saturday */
function championshipSaturday(year: number): number {
  const dec1 = dayOf(year, 12, 1);
  const weekday = new Date(dec1 * 86_400_000).getUTCDay();
  return dec1 + ((6 - weekday + 7) % 7);
}

const normalizedMembers = (conference: string) => new Set((CONFERENCE_TEAMS[conference] ?? []).map(normalizeTeamName));
const NFL_CONFERENCE_OF = new Map<string, string>();
const COLLEGE_CONFERENCE_OF = new Map<string, string>();
for (const conference of Object.keys(CONFERENCE_TEAMS)) {
  const nfl = /^(AFC|NFC) /.exec(conference);
  for (const team of normalizedMembers(conference)) {
    if (nfl) NFL_CONFERENCE_OF.set(team, nfl[1]);
    else if (conference !== "Independents") COLLEGE_CONFERENCE_OF.set(team, conference);
  }
}

// The New Year's Six bowls by their stadiums (ESPN's venue names), every one a CFP game since the 12-team playoff
const NEW_YEARS_SIX: Record<string, string> = Object.fromEntries(
  [
    ["Rose Bowl", "Rose Bowl"],
    ["Caesars Superdome", "Sugar Bowl"],
    ["Hard Rock Stadium", "Orange Bowl"],
    ["AT&T Stadium", "Cotton Bowl"],
    ["State Farm Stadium", "Fiesta Bowl"],
    ["Mercedes-Benz Stadium", "Peach Bowl"],
  ].map(([venue, bowl]) => [normalizeTeamName(venue), bowl]),
);
/** The bowl names a question can use for a New Year's Six game, by their first word */
export const NEW_YEARS_SIX_BOWLS: Record<string, string> = Object.fromEntries(
  Object.values(NEW_YEARS_SIX).map((bowl) => [bowl.split(" ")[0].toLowerCase(), bowl]),
);

/** An NFL game's event from its postseason flag and week: two real NFL teams, never the Pro Bowl (week 4) */
export function nflEvent(row: EventRow): GameEvent | null {
  if (!row.postseason || row.week === 4) return null;
  const home = NFL_CONFERENCE_OF.get(normalizeTeamName(row.home_team_name));
  const away = NFL_CONFERENCE_OF.get(normalizeTeamName(row.visitor_team_name));
  if (!home || !away) return null;
  const base = { league: "NFL" as const, conference: null, playoff: true, round: null };
  if (row.week === 5 || etDay(row.date)?.month === 2) return { ...base, kind: "super-bowl", name: "Super Bowl" };
  if (row.week === 3) return { ...base, kind: "conference-championship", name: `${home} Championship`, conference: home };
  return { ...base, kind: "nfl-playoff", name: row.week === 1 ? "Wild Card" : row.week === 2 ? "Divisional Round" : null };
}

/** A college game's event from its date, teams, ranks and stadium (see the header) */
export function collegeEvent(row: EventRow): GameEvent | null {
  const d = etDay(row.date);
  if (!d) return null;
  const season = d.month >= 7 ? d.year : d.year - 1;
  const saturday = championshipSaturday(season);
  const home = normalizeTeamName(row.home_team_name);
  const away = normalizeTeamName(row.visitor_team_name);
  const base = { league: "NCAAF" as const, conference: null, round: null };
  if (d.day === saturday || d.day === saturday - 1) {
    const conference = COLLEGE_CONFERENCE_OF.get(home);
    if (!conference || COLLEGE_CONFERENCE_OF.get(away) !== conference) return null;
    return { ...base, kind: "conference-championship", name: `${conference} Championship`, conference, playoff: false };
  }
  if (d.day <= saturday) return null;
  // Army-Navy, the second Saturday of December, is still the regular season
  if ([home, away].includes("army black knights") && [home, away].includes("navy midshipmen")) return null;
  const bowl = NEW_YEARS_SIX[normalizeTeamName(row.venue ?? "")] ?? null;
  const january = d.year === season + 1;
  // The title game, the last CFP game, from about Jan 14 wherever it is played (Hard Rock in January 2026); a
  // window with an earlier one settles it by the week's gap after the semifinals (settleTitleGame)
  if (january && d.date >= TITLE_GAME_FROM) return { ...base, kind: "national-championship", name: "National Championship", playoff: true, round: "final" };
  // Before it, the New Year's Six by date: quarterfinals through Jan 3, semifinals after
  if (january && d.date > 3) {
    if (bowl) return { ...base, kind: "bowl", name: bowl, playoff: true, round: "semifinal" };
    return { ...base, kind: "bowl", name: null, playoff: false };
  }
  if (bowl && d.day >= dayOf(season, 12, 30)) return { ...base, kind: "bowl", name: bowl, playoff: true, round: "quarterfinal" };
  if (d.day <= dayOf(season, 12, 21)) {
    // The first round, on campus: two ranked teams; an early bowl has at most one
    const ranked = [row.home_team_rank, row.visitor_team_rank].filter((r) => typeof r === "number").length;
    if (ranked === 2) return { ...base, kind: "cfp", name: "CFP First Round", playoff: true, round: "first round" };
  }
  return { ...base, kind: "bowl", name: null, playoff: false };
}

/** The January date from which a CFP game is the title game */
const TITLE_GAME_FROM = 14;

/** The title game as a national championship event */
export const TITLE_GAME: Readonly<GameEvent> = {
  kind: "national-championship",
  league: "NCAAF",
  name: "National Championship",
  conference: null,
  playoff: true,
  round: "final",
};

/**
 * The window's title game when it comes before Jan 14: the latest college game
 * after Jan 7, played a week or more after the CFP game before it (the
 * semifinals); null for none.
 */
export function earlyTitleGame<G extends { sport: string; start: string | null; event?: GameEvent | null }>(games: G[]): G | null {
  const at = (g: G) => (g.start ? Date.parse(g.start) : NaN);
  const college = games.filter((g) => g.sport === "NCAAF" && Number.isFinite(at(g))).sort((x, y) => at(x) - at(y));
  const last = college[college.length - 1];
  if (!last || last.event?.kind === "national-championship") return null;
  const d = etDay(last.start!);
  if (!d || d.month !== 1 || d.date <= 7) return null;
  const before = college.filter((g) => g !== last && g.event?.playoff && at(g) < at(last));
  const previous = before[before.length - 1];
  return previous && at(last) - at(previous) >= 7 * 86_400_000 ? last : null;
}

/** The event of a games-table row in its league, if any */
export function gameEvent(sport: string, row: EventRow): GameEvent | null {
  return sport === "NFL" ? nflEvent(row) : sport === "NCAAF" ? collegeEvent(row) : null;
}

/** The postseason events a question names */
export interface EventAsk {
  superBowl: boolean;
  national: boolean;
  /** New Year's Six bowls by name ("Rose Bowl") */
  bowls: string[];
  /** A bowl by a name the tables don't carry ("Pinstripe Bowl"): only the named team's bowl */
  otherBowl: boolean;
  /** Any bowl ("bowl game", "bowls") */
  bowl: boolean;
  /** Playoff games: the NFL's or the CFP's ("playoff", "postseason"), or the CFP's alone ("CFP"); null for none */
  playoff: "any" | "college" | null;
  /** CFP rounds by name ("first round", "quarterfinal", "semifinal") */
  cfpRounds: CfpRound[];
  /** NFL rounds by name ("Wild Card", "Divisional Round") */
  rounds: string[];
  /** Conference championship games: the conferences ("SEC", "AFC"), or [] for any; null for none */
  championships: string[] | null;
}

// Words of the events a question can name; with the list and scope words, the only ones a question naming no team may use
export const EVENT_WORDS: ReadonlySet<string> = new Set(
  (
    "super superbowl bowl bowls national championship championships title titles natty playoff playoffs cfp postseason " +
    "semifinal semifinals semi semis final finals quarterfinal quarterfinals quarter first round wild card wildcard divisional conference " +
    Object.keys(NEW_YEARS_SIX_BOWLS).join(" ")
  ).split(/\s+/),
);

// Words for the title game after "national", "CFP" or "playoff"
const TITLE_WORDS = new Set(["championship", "championships", "title", "titles", "final", "finals"]);

// Words before "bowl" that make it any bowl ("a bowl game", "public betting bowl games"), not one by name ("Pinstripe Bowl")
const ANY_BOWL_BEFORE = new Set(
  (
    "a an the their its his her our my your any every each which what whats this that these those next first all some of for in on at " +
    "to and or with odds public betting bet bets sharp money spread spreads line lines total totals splits handle best"
  ).split(" "),
);

/**
 * The events a question names (its normalized words, "Draft Kings" joined, as
 * scanTeams gives them), null for none. `teamAt`: whether a word is part of a
 * team the question names ("Alabama bowl game" is Alabama's bowl, not one
 * called the Alabama Bowl).
 */
export function eventsAsked(tokens: string[], teamAt: (i: number) => boolean = () => false): EventAsk | null {
  const text = ` ${tokens.join(" ")} `;
  const has = (re: RegExp) => re.test(text);
  const ask: EventAsk = {
    superBowl: false,
    national: false,
    bowls: [],
    otherBowl: false,
    bowl: false,
    playoff: null,
    cfpRounds: [],
    rounds: [],
    championships: null,
  };
  ask.superBowl = has(/ (super bowl|superbowl) /);
  // The CFP's title game: "national championship", "natty", "CFP championship", "CFP final", "college football
  // playoff title game". It asks for that game alone, never the CFP's other rounds
  tokens.forEach((t, i) => {
    const before = tokens[i - 1] ?? "";
    const cfp = before === "national" || before === "cfp" || ((before === "playoff" || before === "playoffs") && tokens[i - 2] !== "nfl");
    if (t === "natty" || (cfp && TITLE_WORDS.has(t))) ask.national = true;
  });
  tokens.forEach((t, i) => {
    if (t !== "bowl" && t !== "bowls") return;
    const before = tokens[i - 1];
    if (before === "super") return;
    if (before !== undefined && NEW_YEARS_SIX_BOWLS[before]) ask.bowls.push(NEW_YEARS_SIX_BOWLS[before]);
    else if (before === undefined || ANY_BOWL_BEFORE.has(before) || teamAt(i - 1) || /^\d+$/.test(before)) ask.bowl = true;
    else ask.otherBowl = true;
  });
  // CFP rounds by name; the CFP or "college football playoff" alone is any CFP game
  if (has(/ first round /)) ask.cfpRounds.push("first round");
  if (has(/ quarter ?finals? /)) ask.cfpRounds.push("quarterfinal");
  if (has(/ (semi ?finals?|semis) /)) ask.cfpRounds.push("semifinal");
  // (a title-game question is about that game alone: no other CFP or NFL playoff game)
  if (ask.cfpRounds.length || (has(/ (cfp|college football playoff) /) && !ask.national)) ask.playoff = "college";
  else if (has(/ (playoffs?|postseason) /) && !ask.national) ask.playoff = "any";
  if (has(/ (wild ?card) /)) ask.rounds.push("Wild Card");
  if (has(/ divisional /)) ask.rounds.push("Divisional Round");
  // Championship games: a conference's ("SEC championship", "AFC title game"), any conference's, or the national title game
  const spans = conferenceSpans(tokens);
  tokens.forEach((t, i) => {
    const titleGame = t === "title" && (tokens[i + 1] === "game" || tokens[i + 1] === "games");
    if (t !== "championship" && t !== "championships" && !titleGame) return;
    const span = spans.find((s) => s.end === i);
    if (span) {
      const conferences = [...new Set(span.confs.map((c) => (/^(AFC|NFC) /.test(c) ? c.slice(0, 3) : c)))];
      ask.championships = [...new Set([...(ask.championships ?? []), ...conferences])];
    } else if (tokens[i - 1] === "conference") {
      ask.championships ??= [];
    } else if (!["national", "cfp", "playoff", "playoffs"].includes(tokens[i - 1] ?? "") && (titleGame || tokens[i + 1] === "game" || tokens[i + 1] === "games")) {
      // "championship game", "title game": a conference's or the national one
      ask.championships ??= [];
      ask.national = true;
    }
  });
  const any =
    ask.superBowl ||
    ask.national ||
    ask.bowls.length > 0 ||
    ask.otherBowl ||
    ask.bowl ||
    ask.playoff !== null ||
    ask.rounds.length > 0 ||
    ask.championships !== null;
  return any ? ask : null;
}

/** Whether a game's event is one the question asks about; `teamNamed`: the question names a team, whose game settles what the tables can't */
export function eventFits(event: GameEvent, ask: EventAsk, teamNamed: boolean): boolean {
  if (ask.superBowl && event.kind === "super-bowl") return true;
  if (ask.national && event.kind === "national-championship") return true;
  if (ask.championships && event.kind === "conference-championship" && (ask.championships.length === 0 || ask.championships.includes(event.conference ?? ""))) return true;
  if (ask.bowls.length && event.kind === "bowl" && (event.name ? ask.bowls.includes(event.name) : teamNamed)) return true;
  if (ask.otherBowl && teamNamed && event.kind === "bowl" && event.name === null) return true;
  if (ask.bowl && (event.kind === "bowl" || event.kind === "national-championship")) return true;
  if (ask.rounds.length && event.kind === "nfl-playoff" && ask.rounds.includes(event.name ?? "")) return true;
  // A CFP round by name ("semifinal"): only that round's games
  if (ask.cfpRounds.length) return event.round !== null && ask.cfpRounds.includes(event.round);
  if (ask.playoff && !ask.rounds.length && (ask.playoff === "any" || event.league === "NCAAF") && event.playoff) return true;
  return false;
}
