// The chat's DraftKings read: which NCAAF or NFL game a question names, and
// that game's public betting split and line, built with the Market Pulse rules
// (./market-pulse.ts) the app renders, so a chat answer and Game Insights can
// never disagree. Shared by the app's stored-splits answer
// (src/services/chatbot/storedSplits.ts re-exports the matcher) and the live
// chat edge function (gemini-chat builds its prompt block with pulseBlock).
// Pure apart from marketPulseBlock's reads (any client with the supabase-js
// query API); covered by src/test/storedSplitsChat.test.ts, chatLines.test.ts
// and pulseChat.test.ts.

import { DK_NCAAF_ALIASES, normalizeTeamName, teamMatchScore } from "../sync-betting-splits/match.ts";
import { fetchDkLines, fmtAmerican, LINE_SPORTS, type LineRowLike, type OddsRowLike } from "./dk-line.ts";
import {
  agoLabel,
  buildMarketPulse,
  fmtSpread,
  openToNow,
  PUBLIC_BETS_PCT,
  PULSE_MARKETS,
  SHARP_EDGE_PTS,
  splitAsOf,
  type PulseMarket,
  type PulseMarketView,
  type PulseSideView,
} from "./market-pulse.ts";
import { earlyTitleGame, eventFits, eventsAsked, EVENT_WORDS, gameEvent, NEW_YEARS_SIX_BOWLS, TITLE_GAME, type GameEvent } from "./game-events.ts";
import { cachedPlayerNames, loadPlayerNames, playerSpans, type PlayerNames } from "./player-names.ts";
import { selectAll } from "./select-all.ts";
import {
  conferenceSpans,
  CONFERENCE_TEAMS,
  displayNickname,
  GENERIC_WORDS,
  inSeason,
  ncaabInSeason,
  scanTeams,
  teamByName,
  type TeamEntry,
  type TeamMention,
} from "./team-names.ts";

/** A betting_splits row with its game's names: bets % and money % only. */
export interface StoredSplitRow {
  sport: string;
  game_id: string;
  source_matchup: string;
  away_team: string;
  home_team: string;
  event_start: string | null;
  market: string;
  side: string;
  bets_pct: number;
  handle_pct: number;
  captured_at: string;
  /** DK's page freshness (sync-betting-splits freshness.ts) */
  source_as_of?: string | null;
}

/** A betting_lines row: DraftKings' current and opening number, the one line every surface shows. */
export interface StoredLineRow extends LineRowLike {
  sport: string;
  game_id: string;
}

export interface SplitsGame {
  sport: string;
  gameId: string;
  away: string;
  home: string;
  start: string | null;
  /** Kickoff not set yet: start is a midnight-Eastern placeholder */
  startTbd?: boolean;
  /** DK's split rows; empty for a game DK posted no split for (lines only) */
  rows: StoredSplitRow[];
  /** DraftKings' line for the game (filled once the game is picked) */
  lines: LineRowLike[];
  /** The game's DraftKings odds-table row: its number shows when it is the fresher capture (chooseLine) */
  odds?: OddsRowLike | null;
  /** Normalized names a question might use for each team */
  labels: { away: string[]; home: string[] };
  /** The postseason event it is (the Super Bowl, a bowl, a conference title game), from its games-table row (game-events.ts) */
  event?: GameEvent | null;
}

/** A games-table row (ncaaf_games or the NFL rows of games) */
export interface LineGameRow {
  id: string | number;
  date: string;
  status?: string | null;
  home_team_name: string;
  visitor_team_name: string;
  time_tbd?: boolean | null;
  /** ncaaf_games: the stadium ESPN lists (names a New Year's Six bowl), and the teams' ranks (the CFP's first round) */
  venue?: string | null;
  home_team_rank?: number | null;
  visitor_team_rank?: number | null;
  /** games (NFL): the postseason flag and week (the round, the Super Bowl) */
  postseason?: boolean | null;
  week?: number | null;
}

const uniq = (xs: string[]) => [...new Set(xs.filter((x) => x.length >= 3))];

/** A game's team in the name table (_shared/team-names.ts): NFL rows are NFL teams, the rest college */
function teamOf(sport: string, name: string): TeamEntry | null {
  return teamByName(name, sport === "NFL" ? "NFL" : "COLLEGE");
}

/**
 * Names a game's team is matched by beyond the name table (which holds every
 * NFL and FBS/FCS team's real names: city or school + nickname, the school
 * alone, official short names like "UCF", nicknames): our full ESPN name,
 * DK's short label ("Miami FL", "KC Chiefs") and its alias target. A team the
 * table lacks also gets its school: the display name minus a one-word mascot
 * ("Toledo", "New Mexico"), or minus a two-word mascot when two words remain
 * ("North Texas"). Never a generic word alone ("New", "West", "Central").
 */
function teamLabels(sport: string, fullName: string, dkLabel: string | null): string[] {
  const full = normalizeTeamName(fullName);
  const out = [full];
  if (!teamOf(sport, fullName)) {
    const words = full.split(" ");
    if (sport === "NFL") out.push(words[words.length - 1]);
    else {
      if (words.length >= 2) out.push(words.slice(0, -1).join(" "));
      if (words.length >= 4) out.push(words.slice(0, -2).join(" "));
    }
  }
  if (dkLabel) {
    const dk = normalizeTeamName(dkLabel);
    out.push(dk);
    if (DK_NCAAF_ALIASES[dk]) out.push(DK_NCAAF_ALIASES[dk]);
  }
  return uniq(out).filter((l) => !GENERIC_WORDS.has(l));
}

export function groupSplitGames(rows: StoredSplitRow[]): SplitsGame[] {
  const byGame = new Map<string, StoredSplitRow[]>();
  for (const r of rows) {
    const key = `${r.sport}|${r.game_id}`;
    byGame.set(key, [...(byGame.get(key) ?? []), r]);
  }
  return [...byGame.values()].map((gameRows) => {
    const first = gameRows[0];
    const sport = first.sport === "NFL" ? "NFL" : "NCAAF";
    // DK may list a neutral-site game the other way round from our row
    const [dkA, dkH] = first.source_matchup.split(" @ ");
    const dkAwayIsOurs = !dkA || teamMatchScore(sport, dkA, first.away_team) > 0;
    const dkAway = dkAwayIsOurs ? dkA ?? null : dkH ?? null;
    const dkHome = dkAwayIsOurs ? dkH ?? null : dkA ?? null;
    return {
      sport: first.sport,
      gameId: first.game_id,
      away: first.away_team,
      home: first.home_team,
      start: first.event_start,
      rows: gameRows,
      lines: [],
      labels: {
        away: teamLabels(sport, first.away_team, dkAway),
        home: teamLabels(sport, first.home_team, dkHome),
      },
    };
  });
}

/** ESPN writes "STATUS_FINAL", BDL "Final": the same test as src/lib/gameStatus isFinalStatus */
const isFinal = (status: string | null | undefined) => (status || "").toLowerCase().includes("final");

/**
 * Games a question can name that DK posted no split for: their line still
 * answers. Also the NCAAB games the chat's league resolution weighs against
 * NCAAF ones (_shared/league-detect.ts).
 */
export function lineOnlyGames(sport: "NCAAF" | "NFL" | "NCAAB", rows: LineGameRow[]): SplitsGame[] {
  return rows
    .filter((g) => !isFinal(g.status))
    .map((g) => ({
      sport,
      gameId: String(g.id),
      away: g.visitor_team_name,
      home: g.home_team_name,
      start: g.date,
      startTbd: g.time_tbd === true,
      rows: [],
      lines: [],
      labels: { away: teamLabels(sport, g.visitor_team_name, null), home: teamLabels(sport, g.home_team_name, null) },
      event: gameEvent(sport, g),
    }));
}

/**
 * The games a question is matched against: DK's split games, each with its
 * games-table row's event, then the games in the window DK posted no split
 * for. The chat's block and the app's pick both build them here.
 */
export function candidateGames(splitGames: SplitsGame[], lineGames: SplitsGame[]): SplitsGame[] {
  const key = (g: SplitsGame) => `${g.sport}|${g.gameId}`;
  const rows = new Map(lineGames.map((g) => [key(g), g]));
  const withSplit = new Set(splitGames.map(key));
  const games = [
    ...splitGames.map((g) => ({ ...g, event: rows.get(key(g))?.event ?? g.event ?? null })),
    ...lineGames.filter((g) => !withSplit.has(key(g))),
  ];
  // A title game before Jan 14, a week or more after the semifinals (game-events.ts earlyTitleGame)
  const title = earlyTitleGame(games);
  return title ? games.map((g) => (g === title ? { ...g, event: TITLE_GAME } : g)) : games;
}

// A school name inside a LONGER school name is a different school: "Texas"
// in "North Texas" or "Texas State", "Michigan" in "Eastern Michigan",
// "Alabama" in "Alabama State". A hit flanked by one of these words is not
// a hit, so an unstored school never borrows a stored one's split.
const SCHOOL_PREFIXES = new Set(["north", "south", "east", "west", "northern", "southern", "eastern", "western", "central", "middle", "new", "ul", "ut"]);
const SCHOOL_SUFFIXES = new Set([
  "state", "states", "st", "tech", "southern", "christian", "international", "atlantic", "central",
  "monroe", "lafayette", "poly", "a", "gulf", "valley", "baptist", "methodist",
]);

// Leagues with no games among the splits candidates: with no league resolved
// and no football word, an in-season team there still claims its city
// ("Houston odds" may mean the Astros), as does a college team in
// basketball season
const OTHER_LEAGUES: ReadonlySet<string> = new Set(["MLB", "NBA", "NHL"]);
const FOOTBALL_QUESTION = /\b(nfl|ncaaf|cfb|college|ncaa|football)\b/i;
const NOT_FOOTBALL_QUESTION = /\b(basketball|hoops|ncaab|ncaamb|nba|baseball|mlb|hockey|nhl)\b/i;
const FOOTBALL_WORD = /\b(nfl|ncaaf|cfb|football)\b/i;

/** How the matcher reads a question beyond its words */
export interface MatchOptions {
  /** The league the chat resolved: only its teams then claim a place */
  league?: string | null;
  /** Known players' names (player-names.ts): their words name no team, and a school or city beside one needs a game cue */
  players?: PlayerNames | null;
}

interface MatchContext {
  tokens: string[];
  /** A known player is named ("jalen hurts alabama"): a place counts only with a strong game cue */
  playerNamed: boolean;
  /** The team phrases the question uses: identities, nicknames and places (team-names scanTeams) */
  refs: TeamMention[];
  /** School or city words that are part of a person's name ("Rashee Rice"): no team, and no label lands on them */
  people: TeamMention[];
  /** Whether a team plays in the window: a game among the candidates, or an in-season team the candidates can't show */
  live: (t: TeamEntry) => boolean;
}

function matchContext(query: string, games: SplitsGame[], now: Date, opts: MatchOptions = {}): MatchContext {
  const scanned = scanTeams(query);
  const tokens = scanned.tokens;
  // A known player's full name ("jalen hurts", "rashee rice", "bryce young"): none of its words is a team
  const spans = playerSpans(tokens, opts.players);
  const inName = (r: { start: number; end: number }) => spans.some(([start, end]) => r.start < end && start < r.end);
  const refs = scanned.mentions.filter((r) => !inName(r));
  const people: TeamMention[] = [
    ...scanned.people,
    ...spans.map(([start, end]) => ({ kind: "place" as const, teams: [], start, end, text: tokens.slice(start, end).join(" ") })),
  ];
  const league = opts.league;
  const playing = new Set<TeamEntry>();
  for (const g of games) {
    for (const name of [g.away, g.home]) {
      const team = teamOf(g.sport, name);
      if (team) playing.add(team);
    }
  }
  const others = !league && !FOOTBALL_QUESTION.test(query);
  const elsewhere = (t: TeamEntry) =>
    (OTHER_LEAGUES.has(t.league) && inSeason(t.league, now)) || (t.league === "COLLEGE" && ncaabInSeason(now));
  return { tokens, playerNamed: spans.length > 0, refs, people, live: (t) => playing.has(t) || (others && elsewhere(t)) };
}

// Game words right after a school or city: with a player named, the cue that
// it is the team's game ("alabama game", "alabama vs", "alabama spread").
// Not "at alabama" ("was bryce young better at alabama"): a matchup names
// both teams, and the opponent settles that one
const GAME_WORD_AFTER = new Set(
  "game games vs versus v spread spreads odds line lines total totals moneyline ml ats over under public sharp sharps split splits matchup pick picks cover".split(" "),
);

/** With a player named, a place is the team only right before a game word, or with the team's nickname in the question too */
function strongCue(ctx: MatchContext, r: TeamMention, team: TeamEntry): boolean {
  if (GAME_WORD_AFTER.has(ctx.tokens[r.end] ?? "")) return true;
  return ctx.refs.some((x) => x !== r && x.kind === "nickname" && x.teams.includes(team));
}

/** A place the question uses on its own: not part of a longer school name ("north", "state"), and not a city whose nickname is another team's */
function placeAlone(ctx: MatchContext, r: TeamMention, team: TeamEntry): boolean {
  if (SCHOOL_PREFIXES.has(ctx.tokens[r.start - 1] ?? "") || SCHOOL_SUFFIXES.has(ctx.tokens[r.end] ?? "")) return false;
  const next = ctx.refs.find((x) => x.start === r.end && x.kind === "nickname");
  return !next || next.teams.includes(team);
}

/** A label the question uses where no team phrase or person's name sits, and not inside a longer school name */
function labelAlone(ctx: MatchContext, label: string): boolean {
  if (GENERIC_WORDS.has(label)) return false;
  const want = label.split(" ");
  for (let i = 0; i + want.length <= ctx.tokens.length; i++) {
    if (want.some((w, k) => ctx.tokens[i + k] !== w)) continue;
    const end = i + want.length;
    if (SCHOOL_PREFIXES.has(ctx.tokens[i - 1] ?? "") || SCHOOL_SUFFIXES.has(ctx.tokens[end] ?? "")) continue;
    if ([...ctx.refs, ...ctx.people].some((r) => r.start < end && i < r.end)) continue;
    return true;
  }
  return false;
}

/**
 * How the question names a team: the length of the longest phrase that is
 * one of ITS real names, 0 if none. An identity of that team ("st louis
 * cardinals"); its nickname (a college team's only when no other school has
 * it, "sooners" but not "tigers"; never right after another team's city,
 * "phoenix cardinals"); its city or school alone when no other team there
 * plays in the window ("alabama", "central florida"; not "houston" while the
 * Texans and Astros play too). `shared` also takes a place other teams
 * share, for a game whose other team the question names too ("houston
 * cincinnati"). Then a label the name table doesn't know (a DK short name)
 * where no team phrase sits.
 */
function nameHit(ctx: MatchContext, sport: string, teamName: string, labels: string[], shared = false): number {
  const team = teamOf(sport, teamName);
  let best = 0;
  if (team) {
    for (const r of ctx.refs) {
      if (!r.teams.includes(team)) continue;
      let named = r.kind === "identity";
      if (r.kind === "nickname") {
        const city = ctx.refs.find((x) => x.end === r.start && x.kind === "place");
        const schools = r.teams.filter((t) => t.league === "COLLEGE");
        named = (!city || city.teams.includes(team)) && (team.league !== "COLLEGE" || schools.length === 1 || shared);
      } else if (r.kind === "place") {
        // A name-like place alone ("Troy Franklin"), or any place beside a
        // player's name ("jalen hurts alabama"), only with the opponent named
        // or (the player case) a game word beside it
        named =
          (shared || !r.weak) &&
          (shared || !ctx.playerNamed || strongCue(ctx, r, team)) &&
          ctx.live(team) &&
          placeAlone(ctx, r, team) &&
          (shared || !r.teams.some((t) => t !== team && ctx.live(t)));
      }
      if (named) best = Math.max(best, r.text.length);
    }
  }
  for (const label of labels) if (labelAlone(ctx, label)) best = Math.max(best, label.length);
  return best;
}

/** Each game a question names, best first: more teams named, then the longer names, then the nearer kickoff. */
function scoreGames(query: string, games: SplitsGame[], now: Date, opts: MatchOptions = {}) {
  const ctx = matchContext(query, games, now, opts);
  const refs = ctx.refs.length;
  return games
    .map((g) => {
      let a = nameHit(ctx, g.sport, g.away, g.labels.away);
      let h = nameHit(ctx, g.sport, g.home, g.labels.home);
      if ((!a || !h) && refs >= 2) {
        // Both teams named, one by a place others share or a name-like word: the matchup settles it
        const sa = nameHit(ctx, g.sport, g.away, g.labels.away, true);
        const sh = nameHit(ctx, g.sport, g.home, g.labels.home, true);
        if (sa && sh) [a, h] = [sa, sh];
      }
      const soon = g.start ? Math.abs(new Date(g.start).getTime() - now.getTime()) : Number.MAX_SAFE_INTEGER;
      const named = [a > 0 ? g.away : "", h > 0 ? g.home : ""].filter(Boolean);
      return { g, teams: named.length, len: a + h, soon, named };
    })
    .filter((s) => s.teams > 0)
    .sort((x, y) => y.teams - x.teams || y.len - x.len || x.soon - y.soon);
}

/**
 * The games a question names: the matchup when it names both teams of one;
 * else the nearest game of each team it names ("Georgia vs Tennessee" when
 * they don't meet: Georgia's game and Tennessee's). A dead heat, or a
 * basketball, baseball or hockey question, names none.
 */
function namedGames(query: string, games: SplitsGame[], now: Date, opts: MatchOptions & { matchupOnly?: boolean } = {}): SplitsGame[] {
  const league = opts.league;
  // "Duke basketball public betting" is not about Duke's football game
  if (NOT_FOOTBALL_QUESTION.test(query) && !FOOTBALL_WORD.test(query)) return [];
  const wantsNfl = /\bnfl\b/i.test(query);
  const wantsCollege = /\b(college|ncaaf|cfb|ncaa)\b/i.test(query);
  const scored = scoreGames(
    query,
    games.filter((g) => (league ? g.sport === league : wantsNfl ? g.sport === "NFL" : wantsCollege ? g.sport === "NCAAF" : true)),
    now,
    opts,
  );
  if (scored.length === 0) return [];
  const [top, next] = scored;
  if (next && next.teams === top.teams && next.len === top.len && next.soon === top.soon) return [];
  if (top.teams === 2) return [top.g];
  // Two teams named with no betting word: only a game between them
  if (opts.matchupOnly) return [];
  const seen = new Set<string>();
  return [...scored]
    .sort((x, y) => x.soon - y.soon)
    .filter((x) => !seen.has(x.named[0]) && seen.add(x.named[0]))
    .map((x) => x.g);
}

/** How many teams of the best-matching game a question names: 2 (the matchup), 1 (a team), or 0. */
export function teamsNamed(query: string, games: SplitsGame[], now: Date = new Date(), opts: MatchOptions = {}): number {
  return scoreGames(query, games, now, opts)[0]?.teams ?? 0;
}

/**
 * The stored game a question is about, matched only through its teams' real
 * names (nameHit); more teams named beats fewer, then the longer name
 * ("Georgia State" over "Georgia"), then the nearer kickoff. A dead heat,
 * teams of different games, or a city or school several teams playing in the
 * window share returns null so the handler falls back instead of guessing.
 * A school or city beside a known player's name ("sharp money jalen hurts
 * alabama") needs a game cue. See MatchOptions.
 */
export function findSplitsGame(
  query: string,
  games: SplitsGame[],
  now: Date = new Date(),
  opts: MatchOptions & { matchupOnly?: boolean } = {},
): SplitsGame | null {
  const named = namedGames(query, games, now, opts);
  return named.length === 1 ? named[0] : null;
}

/**
 * The app's stored-splits pick (src/services/chatbot/storedSplits.ts): the
 * chat's guards (outsideFootball, with the league the caller resolved) and
 * intent and history rules (gameIntent), then the game, so both paths answer
 * alike. Null for a history or futures question, for a question with no
 * betting word unless it names both teams of a game, for a postseason event
 * with no single scheduled game (eventGames), and whenever findSplitsGame is.
 */
export function storedSplitsGame(
  query: string,
  games: SplitsGame[],
  now: Date = new Date(),
  players: PlayerNames | null = null,
  league: string | null = null,
): SplitsGame | null {
  if (outsideFootball(query, league)) return null;
  const intent = gameIntent(query, players, now);
  if (intent === "no") return null;
  if (intent === "event") {
    const scheduled = eventPick(query, games, now, league, players);
    return scheduled !== "both" && scheduled.length === 1 ? scheduled[0] : null;
  }
  return findSplitsGame(query, games, now, { league, players, matchupOnly: intent === "matchup" });
}

/**
 * A playoff question naming no team, person, league or round ("playoff odds",
 * "public betting on the playoffs"): the leagues with playoff games in the
 * window (both in January, the NFL's and the CFP's; the NFL's alone in
 * February), null for any other question
 */
export function openPlayoffLeagues(question: string, candidates: SplitsGame[], players?: PlayerNames | null): string[] | null {
  const scan = scanTeams(question);
  if (scan.mentions.length || scan.people.length || playerSpans(scan.tokens, players).length) return null;
  if (/\b(nfl|pro|college|ncaaf|cfb|ncaa)\b/.test(scan.tokens.join(" "))) return null;
  const ask = eventsAsked(scan.tokens);
  const onlyPlayoff =
    ask?.playoff === "any" &&
    !ask.superBowl &&
    !ask.national &&
    !ask.bowls.length &&
    !ask.otherBowl &&
    !ask.bowl &&
    !ask.rounds.length &&
    !ask.cfpRounds.length &&
    ask.championships === null;
  return onlyPlayoff ? [...new Set(candidates.filter((g) => g.event?.playoff).map((g) => g.sport))].sort() : null;
}

/** The model's cue for a playoff question when both leagues' playoffs are in the window */
export const PLAYOFF_HINT =
  "Ambiguous 'playoffs': ask whether they mean the NFL playoffs or the College Football Playoff. Ignore this line if the question is not about betting on an upcoming game.";

/**
 * A postseason event's games, with the league a bare "playoff" question's
 * window settles (openPlayoffLeagues): "both" when both leagues' playoffs are
 * in it (the caller asks which), else eventGames over that league's games
 */
function eventPick(question: string, candidates: SplitsGame[], now: Date, league: string | null, players?: PlayerNames | null): SplitsGame[] | "both" {
  const open = openPlayoffLeagues(question, candidates, players);
  if (open && open.length > 1) return "both";
  const eventLeague = open?.length === 1 ? open[0] : league;
  return eventGames(question, eventLeague ? candidates.filter((g) => g.sport === eventLeague) : candidates, now, { league: eventLeague, players });
}

/** A team phrase that is a New Year's Six bowl's name ("Orange Bowl": no Syracuse question) */
function bowlName(tokens: string[], x: TeamMention): boolean {
  return x.end - x.start === 1 && tokens[x.end] === "bowl" && NEW_YEARS_SIX_BOWLS[x.text] !== undefined;
}

// Words a question about an event may use beyond the list words ("who wins the Rose Bowl", "who is favored in the Super Bowl")
const EVENT_LIST_WORDS = new Set(
  "win wins winner winners prediction predictions preview previews pick picks favored favorite favorites underdog underdogs".split(" "),
);

/**
 * The scheduled postseason games a question's event words name ("Super Bowl
 * odds", "Rose Bowl public betting", "SEC championship game spread", "Ohio
 * State playoff odds"): the games in the window whose event (game-events.ts)
 * fits; the named teams' among them when it names a team or a person; else
 * all of them (at most 5, by kickoff) for a question made only of event,
 * list and scope words (listScope). None when no such game is scheduled: the
 * question is about futures.
 */
export function eventGames(question: string, candidates: SplitsGame[], now: Date = new Date(), opts: MatchOptions = {}): SplitsGame[] {
  const scan = scanTeams(question);
  const tokens = scan.tokens;
  const spans = playerSpans(tokens, opts.players);
  const teams = scan.mentions.filter((x) => !x.weak && !spans.some(([start, end]) => x.start < end && start < x.end) && !bowlName(tokens, x));
  const ask = eventsAsked(tokens, (i) => teams.some((x) => x.start <= i && i < x.end));
  if (!ask) return [];
  const pool = candidates.filter((g) => g.event && (!opts.league || g.sport === opts.league) && eventFits(g.event, ask, teams.length > 0));
  if (!pool.length) return [];
  // The event's league settles a place other leagues share ("Utah bowl game": the Utes, not the Jazz)
  const leagues = [...new Set(pool.map((g) => g.sport))];
  const league = opts.league ?? (leagues.length === 1 ? leagues[0] : null);
  if (teams.length || scan.people.length || spans.length) return namedGames(question, pool, now, { ...opts, league }).slice(0, 5);
  // No team: the event's games, scoped by the question's other words ("bowl games public betting this weekend");
  // who wins it, and a numeral after it ("Super Bowl LXI"), are about the event too
  const numeral = (t: string, i: number) => tokens[i - 1] === "bowl" && /^([ivxlc]+|\d+)$/.test(t);
  const scope = listScope(
    tokens.filter((t, i) => !EVENT_WORDS.has(t) && !EVENT_LIST_WORDS.has(t) && !numeral(t, i)).join(" "),
    now,
    opts.players,
  );
  if (!scope) return [];
  const when = (g: SplitsGame) => (g.start ? Date.parse(g.start) : Number.MAX_SAFE_INTEGER);
  return pool.filter(scope.includes).sort((x, y) => when(x) - when(y)).slice(0, 5);
}

/** The places a question uses alone that several teams playing in the window share ("houston": the Cougars, Texans and Astros) */
export function ambiguousPlaces(
  query: string,
  games: SplitsGame[],
  now: Date = new Date(),
  opts: MatchOptions = {},
): Array<{ place: string; teams: TeamEntry[] }> {
  const ctx = matchContext(query, games, now, opts);
  const out: Array<{ place: string; teams: TeamEntry[] }> = [];
  for (const r of ctx.refs) {
    if (r.kind !== "place" || r.weak) continue;
    // Beside a player's name with no game cue it is where the player went, not a team asked about
    if (ctx.playerNamed && !r.teams.some((t) => strongCue(ctx, r, t))) continue;
    const teams = r.teams.filter((t) => ctx.live(t) && placeAlone(ctx, r, t));
    if (teams.length > 1) out.push({ place: r.text, teams });
  }
  return out;
}

const LEAGUE_ORDER = ["COLLEGE", "NFL", "MLB", "NBA", "NHL"];

/** The place as the question wrote it ("New York", "LA"), else title case */
function asWritten(question: string, place: string): string {
  const words = place.split(" ").map((w) => w.replace(/[^a-z0-9]/g, ""));
  const hit = question.match(new RegExp(`\\b${words.join("[^a-z0-9]+")}\\b`, "i"));
  return hit ? hit[0] : words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/**
 * The model's cue for a place several teams share, one line each:
 * "Ambiguous team 'Houston': ask whether they mean the Cougars (NCAAF),
 * Texans (NFL) or Astros (MLB)."
 */
export function ambiguityHint(question: string, places: Array<{ place: string; teams: TeamEntry[] }>, games: SplitsGame[], now: Date = new Date()): string {
  const collegeSport = (t: TeamEntry) =>
    games.some((g) => g.sport === "NCAAF" && [g.away, g.home].some((n) => teamOf("NCAAF", n) === t)) || !ncaabInSeason(now) ? "NCAAF" : "NCAAB";
  return places
    .map(({ place, teams }) => {
      const names = [...teams]
        .sort((x, y) => LEAGUE_ORDER.indexOf(x.league) - LEAGUE_ORDER.indexOf(y.league) || displayNickname(x).localeCompare(displayNickname(y)))
        .map((t) => `${displayNickname(t)} (${t.league === "COLLEGE" ? collegeSport(t) : t.league})`);
      const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : names[0];
      return `Ambiguous team '${asWritten(question, place)}': ask whether they mean the ${list}. Ignore this line if the question is not about betting on an upcoming game.`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// The live chat's prompt block
// ---------------------------------------------------------------------------

/** A question about where the bets and money sit: the public, sharps, splits, handle, tickets, steam, reverse moves */
export const PULSE_QUESTION =
  /\b(public|sharps?|splits?|handle|tickets?|betting\s+percentages?|bet\s+percentages?|money\s+percentages?|steam(ed|ing)?|reverse\s+line|rlm|where(\s+is|'s)\s+the\s+money|percent\s+of\s+(the\s+)?(bets|money))\b|%\s*of\s+(the\s+)?(bets|money)/i;

export function isPulseQuestion(question: string): boolean {
  return PULSE_QUESTION.test(question);
}

// Betting words: always intent, and a history question that has them is still about the bet
const BETTING_WORDS = new Set(
  (
    "odds line lines spread spreads over under moneyline moneylines ml favored favoured favorite favorites favourite favourites " +
    "underdog underdogs ats cover covers covering public sharp sharps split splits handle bet bets betting wager wagers parlay " +
    "parlays lean leans units bucks kickoff"
  ).split(" "),
);
// A price or a spread written out ("Chiefs -3", "+150", "o/u 45.5", "$20")
const BETTING_MARKS = /\bo\/u\b|\$|(^|\s)[+-]\d+(\.\d+)?\b/;
// Words about now: intent, and they keep a question current
const NOW_WORDS = /\b(tonight|today|tomorrow|this\s+week(end)?|next\s+week|saturday|sunday|monday|tuesday|wednesday|thursday|friday|upcoming|tnf|snf|mnf)\b/;
// Futures and season-long markets no single game settles (a title, a
// champion, "win it all", making the playoffs, a win total), awards, the
// draft and other leagues: nothing on the DraftKings board answers them.
// The postseason's own games ("Super Bowl", "playoff", "bowl", "title game",
// "national championship") are events instead: a game when one is scheduled
// (gameIntent "event"). "Draft Kings" written as two words is the sportsbook
const NOT_SERVED =
  /\b((?<!(national|cfp|playoffs?)\s)titles?(?!\s+games?\b)|champ(ion)?s?|win\s+totals?|season\s+wins|(win|wins|winning)\s+it\s+all|make\s+the\s+playoffs?|mvp|heisman|division\s+winner|conference\s+winner|(division|conference)\s+odds|futures?|of\s+the\s+year|awards?|draft(?![\s-]*kings?\b)|cfl|ufl|xfl)\b/;
// "win the division", "to win the conference": a title market
const WIN_THE = /\b(win|wins|winning)\s+the\s+(division|conference|league|east|west|north|south)\b/;
// A conference or division's own market: "to win the SEC", "SEC champion", "Big Ten title", "NFC East odds"
const WIN_WORDS = new Set(["win", "wins", "winning"]);
const CONFERENCE_MARKET_WORDS = new Set("odds futures future title titles champion champions champ champs crown winner winners race".split(" "));
// A time in the past ("last season", "last year", "last Saturday", "two years
// ago"): history even with a betting word, unless the question also says now
const PAST_TIME =
  /\b(last|previous|prior)\s+(season|seasons|year|years|week|weekend|night|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(years?|weeks?|days?|seasons?)\s+ago\b/g;
// A year ("2020", "the 2013 Iron Bowl"): the past when it is before this one
const YEAR = /\b(19|20)\d{2}\b/g;
// Forward-looking words: intent, but they don't outweigh a history marker
const PREDICT_WORDS = /\b(predictions?|previews?|predict|wins?|winner|who\s+wins|who\s+will\s+win)\b/;
// About a game only right beside a team ("Alabama total", "Georgia vs Oklahoma") or with a word about now
const NEAR_TEAM_WORDS = new Set("play plays game games pick picks money total totals vs versus v matchup matchups".split(" "));
// History: a year, a career, a record, the past at a school ("Alabama 2020 championship", "was Bryce Young better at Alabama");
// a bowl or a championship is an event instead (eventGames)
const HISTORY_WORDS = /\b(19|20)\d{2}\b|\b(career|all[\s-]time|records?|legacy|back\s+then|best\s+plays|scandals?|draft\s+picks?|drafted)\b/;
const PAST_WORDS = new Set(["did", "was", "were", "has", "had"]);

/**
 * What a question asks of the DraftKings block:
 * - "yes": betting words (odds, spread, public, sharp, a written line, $,
 *   bucks, units, parlay...), words about now (tonight, this week,
 *   Saturday...), forward-looking words (prediction, preview, who wins),
 *   "take the <team>", "at" or "@" between two teams, or play, game, pick,
 *   money, total or vs right beside a team;
 * - "matchup": none of that, but two teams named ("Oklahoma Georgia"): a
 *   block only for a game between them;
 * - "event": either of those about a postseason event ("Super Bowl odds",
 *   "Rose Bowl public betting", "Ohio State playoff odds", "SEC championship
 *   game spread"): the scheduled game it names (eventGames), none when the
 *   games tables hold no such game (then it is futures);
 * - "no": neither; futures and season-long markets (a title, a champion,
 *   "win it all", "to win the SEC", "NFC East odds", making the playoffs, a
 *   win total, an award, the draft); a conference beside one team with no
 *   betting word ("Georgia SEC"); a time in the past ("last season", "last
 *   year", "two weeks ago", a year before `now`'s) with no word about now;
 *   or history with no betting or current word (a year, a career, a record,
 *   "was ... at <school>", "out of <school>", best plays, a scandal, a draft
 *   pick).
 * Teams inside a known player's name don't count ("jalen hurts alabama").
 */
export function gameIntent(question: string, players?: PlayerNames | null, now: Date = new Date()): "yes" | "matchup" | "event" | "no" {
  const raw = question.toLowerCase();
  // Futures and season-long markets ("Ohio State win total", "Alabama to win it all", "Heisman odds"), awards, the draft, the CFL
  if (NOT_SERVED.test(raw) || WIN_THE.test(raw)) return "no";
  const { tokens, mentions } = scanTeams(question);
  const spans = playerSpans(tokens, players);
  const inName = (x: { start: number; end: number }) => spans.some(([start, end]) => x.start < end && start < x.end);
  const teams = mentions.filter((x) => !x.weak && !inName(x) && !bowlName(tokens, x));
  const teamAt = (i: number) => teams.some((x) => x.start <= i && i < x.end);
  const besideTeam = (i: number) => teams.some((x) => x.end === i || x.start === i + 1);
  const betting = tokens.some((t) => BETTING_WORDS.has(t)) || isPulseQuestion(question) || BETTING_MARKS.test(raw);
  // A conference or division's market ("Georgia to win the SEC", "Ohio State Big Ten title", "NFC East odds"), or a
  // conference beside one team with no betting word ("Georgia SEC"): that team's title race, not a game. With a
  // betting word it is the team's game ("Big Ten public betting Ohio State", "SEC sharp money Alabama"); its
  // championship game is an event ("who wins the SEC championship")
  const conferences = conferenceSpans(tokens).filter((c) => !inName(c));
  const championshipGame = (end: number) => /^championships?$/.test(tokens[end] ?? "") || (/^titles?$/.test(tokens[end] ?? "") && /^games?$/.test(tokens[end + 1] ?? ""));
  const conferenceMarket = conferences.some(
    ({ start, end }) =>
      (tokens[start - 1] === "the" && WIN_WORDS.has(tokens[start - 2] ?? "") && !championshipGame(end)) ||
      (CONFERENCE_MARKET_WORDS.has(tokens[end] ?? "") && !championshipGame(end)),
  );
  if (conferenceMarket || (conferences.length > 0 && teams.length === 1 && !betting)) return "no";
  // A bare "championship" ("Alabama championship odds", "public betting on Alabama for the championship"): the title
  // market, unless a conference, "national" or "conference" names it or "game" follows (an event)
  const bareChampionship = tokens.some(
    (t, i) =>
      /^championships?$/.test(t) &&
      !/^games?$/.test(tokens[i + 1] ?? "") &&
      !conferences.some((c) => c.end === i) &&
      !["national", "cfp", "playoff", "playoffs", "conference"].includes(tokens[i - 1] ?? ""),
  );
  if (bareChampionship) return "no";
  // "Alabama ATS last season", "Georgia odds last year", "Alabama odds in 2020": the past, unless the question also
  // asks about now ("this week, after last season")
  const past = raw.replace(PAST_TIME, " ") !== raw || (raw.match(YEAR) ?? []).some((y) => Number(y) < now.getUTCFullYear());
  const current = NOW_WORDS.test(raw.replace(PAST_TIME, " "));
  if (past && !current) return "no";
  const pastAtSchool = tokens.some((t, i) => PAST_WORDS.has(t) && tokens.some((u, k) => k > i && u === "at" && teamAt(k + 1)));
  const outOfSchool = tokens.some((t, i) => t === "out" && tokens[i + 1] === "of" && teamAt(i + 2));
  if ((HISTORY_WORDS.test(raw) || pastAtSchool || outOfSchool) && !betting && !current) return "no";
  const intent = ((): "yes" | "matchup" | "no" => {
    if (betting || current || PREDICT_WORDS.test(raw) || raw.includes("@")) return "yes";
    if (tokens.some((t, i) => t === "take" && tokens[i + 1] === "the" && teamAt(i + 2))) return "yes";
    if (tokens.some((t, i) => NEAR_TEAM_WORDS.has(t) && besideTeam(i))) return "yes";
    if (tokens.some((t, i) => t === "at" && teams.some((x) => x.end === i) && teams.some((x) => x.start === i + 1))) return "yes";
    return teams.length >= 2 ? "matchup" : "no";
  })();
  if (intent === "no") return "no";
  // A postseason event: its scheduled game, or nothing
  return eventsAsked(tokens, teamAt) ? "event" : intent;
}

// Everyday and betting words: a question made only of these (after dropping
// words under 3 letters) names no team, so the chat skips the splits read.
const COMMON_WORDS = new Set(
  (
    "the and for are any all who whos what whats when where wheres which why how was were will would could should can cant does did " +
    "this that these those with from into onto about around than then there here now just like also only even still really please " +
    "you your our they them their its his her him she get got give show tell find see look looking want need know think help " +
    "today tonight tomorrow yesterday week weeks weekend weekends weekday day days night nights morning afternoon evening time times " +
    "game games matchup matchups slate schedule schedules upcoming next last this coming current latest live new " +
    "odds line lines spread spreads total totals over under moneyline moneylines money point points cover covers covering " +
    "favored favorite favorites favourite underdog underdogs dog dogs pick picks best bet bets betting bettor value play plays playing " +
    "win wins won winning lose losses lost score scores final finals result results sports sport team teams player players " +
    "stats stat season seasons record records start starts kickoff kick top big biggest most more less good great bad worst " +
    "nfl ncaaf cfb college football pro basketball hoops nba ncaab mlb baseball hockey nhl league leagues conference division " +
    "home away road hosts host versus against vs at on in of to it is be not but out off up down"
  ).split(/\s+/),
);

/**
 * Whether a question might name a team: a team phrase ("UK", "VT", "BC"
 * count), or a word (3+ letters) that is not everyday or betting vocabulary.
 * Conservative: only a question made entirely of such words skips the splits
 * read, so no team is ever missed.
 */
export function mayNameTeam(question: string): boolean {
  if (scanTeams(question).mentions.some((x) => !x.weak)) return true;
  return normalizeTeamName(question)
    .split(" ")
    .some((w) => w.length >= 3 && !COMMON_WORDS.has(w));
}

/**
 * Whether DraftKings' football splits have nothing for a question: its league
 * resolved to one they don't cover ("Duke basketball tonight"), a bare
 * nickname the league resolver couldn't place ("Cardinals odds" with the NFL
 * and MLB both playing: no guess), or only baseball, basketball or hockey
 * teams named ("St. Louis Cardinals", "New York Rangers"). The chat's block
 * and the app's pick both use it.
 */
export function outsideFootball(message: string, league: string | null): boolean {
  if (league && !LINE_SPORTS.has(league)) return true;
  const teams = scanTeams(message).mentions.filter((x) => !x.weak);
  if (!league && teams.some((x) => x.kind === "nickname") && !teams.some((x) => x.kind === "identity")) return true;
  return teams.length > 0 && teams.every((x) => x.teams.every((t) => t.league === "MLB" || t.league === "NBA" || t.league === "NHL"));
}

const markerCount = (g: SplitsGame): number => {
  const pulse = buildMarketPulse({ splits: g.rows, lines: [], odds: null });
  return PULSE_MARKETS.reduce(
    (n, m) => n + (pulse[m]?.sides.filter((s) => s.sharp || s.publicSide).length ?? 0),
    0,
  );
};

/**
 * The games a question's DraftKings block covers: the NCAAF or NFL game it
 * names, split or not (each named team's game when it names teams of
 * different games). Else the generic list, only for a question made
 * entirely of pulse, scope and filler words (listScope): for a
 * public/sharp/splits question, the games in its scope DK posted a split for
 * (in `sport` when given), the ones with sharp or public markers first, then
 * the nearest kickoffs, at most `limit`; for a question naming an NFL
 * prime-time slot ("thursday night football odds", "MNF line"), that slot's
 * games, split or not. Anything else (a named team with no game here
 * included): none.
 */
export function pickPulseGames(
  question: string,
  candidates: SplitsGame[],
  opts: { sport?: string | null; limit?: number; players?: PlayerNames | null; matchupOnly?: boolean } = {},
  now: Date = new Date(),
): SplitsGame[] {
  const named = namedGames(question, candidates, now, { league: opts.sport, players: opts.players, matchupOnly: opts.matchupOnly });
  if (named.length) return named.slice(0, opts.limit ?? 5);
  if (opts.matchupOnly) return [];
  const scope = listScope(question, now, opts.players);
  if (!scope || (!isPulseQuestion(question) && !scope.slot)) return [];
  const pool = candidates.filter((g) => (g.rows.length > 0 || scope.slot) && (!opts.sport || g.sport === opts.sport) && scope.includes(g));
  const when = (g: SplitsGame) => (g.start ? Date.parse(g.start) : Number.MAX_SAFE_INTEGER);
  return pool
    .map((g) => ({ g, markers: markerCount(g) }))
    .sort((x, y) => y.markers - x.markers || when(x.g) - when(y.g))
    .slice(0, opts.limit ?? 5)
    .map((x) => x.g);
}

// Eastern-time day and hour of a kickoff: "tonight", "Saturday" and "TNF" are Eastern
const ET_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  hourCycle: "h23",
});
function etOf(t: number): { day: string; weekday: string; hour: number } {
  const p = Object.fromEntries(ET_PARTS.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday, hour: Number(p.hour) };
}
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The words a question may use and still get the generic list (the games DK
 * posted a split for, in the question's scope): pulse and market words,
 * time and league words, and filler. Scope phrases are read first: a
 * conference or division ("SEC", "Big Ten", "AFC East"), "<weekday> night",
 * "prime time". Any other word (a team or school of any strength, a person,
 * a scope the list can't filter by like "top 25", "HBCU" or "late games", a
 * qualifier like "to cover", "side", "win" or "biggest") means no list.
 */
export const LIST_WORDS: ReadonlySet<string> = new Set(
  (
    // Pulse words
    "public sharp sharps money split splits betting bet bets bettors handle handles percentage percentages percent pct " +
    "ticket tickets steam steamed steaming reverse rlm action " +
    // Market words
    "odds line lines spread spreads total totals moneyline moneylines ml over under movement move moves moving " +
    // Time words
    "tonight tonights today todays tomorrow this week weekend tnf snf mnf primetime " +
    "monday tuesday wednesday thursday friday saturday sunday " +
    // League words
    "nfl college ncaaf cfb ncaa football " +
    // Filler
    "who whos what whats where wheres which how is are the a an on in of for to at and or with " +
    "me show give tell get see look looking like can you please any all some there right now currently current latest " +
    "going leaning lean much do does have has games game teams team matchups slate board card numbers data draftkings dk " +
    "i im id we us my want need know it be will would should from about sportsbook sportsbooks update updates updated"
  ).split(/\s+/),
);

// NFL prime time: its three nights' abbreviations, weekdays and Eastern-time weekday labels
const PRIME_TIME_SLOTS: Array<[abbr: string, weekday: string, short: string]> = [
  ["tnf", "thursday", "Thu"],
  ["snf", "sunday", "Sun"],
  ["mnf", "monday", "Mon"],
];

/**
 * The generic list's scope for a question that names no game, or null when
 * any of its words is outside LIST_WORDS, or it names a team (any strength,
 * weak included) or a person. The scope, all Eastern: tonight / today,
 * tomorrow, this weekend, a weekday (that date), "<weekday> night" (that date,
 * kickoff 7 PM or later), the NFL's prime-time slots (TNF, SNF and MNF and
 * their spelled-out names, "primetime" for all three: NFL games that night),
 * league words (NFL, college, NCAAF, CFB) and conferences or divisions
 * (team-names.ts CONFERENCE_TEAMS). A game fits each kind the question uses:
 * any of its days, nights or slots, inside its range (tonight, tomorrow, this
 * weekend) when it names one. `slot`: an NFL prime-time slot is named, scope
 * enough without a pulse word ("thursday night football odds").
 */
export function listScope(
  question: string,
  now: Date = new Date(),
  players?: PlayerNames | null,
): { slot: boolean; includes: (g: SplitsGame) => boolean } | null {
  const scan = scanTeams(question);
  const tokens = scan.tokens;
  const covered = tokens.map(() => false);
  const cover = (start: number, end: number) => {
    for (let i = start; i < end; i++) covered[i] = true;
  };
  const conferences = conferenceSpans(tokens);
  for (const c of conferences) cover(c.start, c.end);
  tokens.forEach((t, i) => {
    if ((WEEKDAYS.includes(t) && tokens[i + 1] === "night") || (t === "prime" && tokens[i + 1] === "time")) cover(i, i + 2);
  });
  if (tokens.some((t, i) => !covered[i] && !LIST_WORDS.has(t))) return null;
  const outside = (x: { start: number; end: number }) => covered.slice(x.start, x.end).some((c) => !c);
  if ([...scan.mentions, ...scan.people].some(outside) || playerSpans(tokens, players).length) return null;

  const m = tokens.join(" ");
  const days = Array.from({ length: 8 }, (_, i) => etOf(now.getTime() + i * 24 * 3600_000));
  const dayOf = (short: string) => days.find((d) => d.weekday === short)?.day;
  const at = (g: SplitsGame) => (g.start ? etOf(Date.parse(g.start)) : null);
  const evening = (short: string, nfl: boolean) => {
    const date = dayOf(short);
    return (g: SplitsGame) => {
      const d = at(g);
      return (!nfl || g.sport === "NFL") && !!d && d.day === date && d.hour >= 19;
    };
  };
  // Slots, days and nights ("SNF", "Saturday", "friday night"): a game fits any
  // of them. Ranges ("tonight", "tomorrow", "this weekend") narrow them:
  // "primetime tonight" is tonight's TNF game
  const slots: Array<(g: SplitsGame) => boolean> = [];
  const ranges: Array<(g: SplitsGame) => boolean> = [];
  let sports: Set<string> | null = null;
  const addSport = (s: string) => (sports = new Set([...(sports ?? []), s]));
  // NFL prime time: TNF / SNF / MNF or their names, "primetime" all three
  const primetime = /\b(primetime|prime time)\b/.test(m);
  let slot = false;
  for (const [abbr, weekday, short] of PRIME_TIME_SLOTS) {
    if (!primetime && !new RegExp(`\\b(${abbr}|${weekday} night football)\\b`).test(m)) continue;
    slots.push(evening(short, true));
    addSport("NFL");
    slot = true;
  }
  WEEKDAYS.forEach((w, i) => {
    const short = WEEKDAY_SHORT[i];
    const nflNight = PRIME_TIME_SLOTS.some(([, weekday]) => weekday === w) && new RegExp(`\\b${w} night football\\b`).test(m);
    // "<weekday> night": any game that evening ("thursday night football" is the NFL slot above)
    if (new RegExp(`\\b${w} night\\b`).test(m)) {
      if (!nflNight) slots.push(evening(short, false));
    } else if (new RegExp(`\\b${w}\\b`).test(m)) {
      const date = dayOf(short);
      slots.push((g) => at(g)?.day === date);
    }
  });
  if (/\b(tonight|tonights|today|todays)\b/.test(m)) ranges.push((g) => at(g)?.day === days[0].day);
  if (/\btomorrow\b/.test(m)) ranges.push((g) => at(g)?.day === days[1].day);
  if (/\bweekend\b/.test(m)) {
    const weekend = new Set(days.filter((d) => ["Fri", "Sat", "Sun"].includes(d.weekday)).slice(0, 3).map((d) => d.day));
    ranges.push((g) => weekend.has(at(g)?.day ?? ""));
  }
  // League words
  if (/\bnfl\b/.test(m)) addSport("NFL");
  if (/\b(college|ncaaf|cfb|ncaa)\b/.test(m)) addSport("NCAAF");
  // Conferences and divisions
  const confs = conferences.flatMap((c) => c.confs);
  const teams = confs.length ? new Set(confs.flatMap((c) => CONFERENCE_TEAMS[c] ?? []).map(normalizeTeamName)) : null;
  const leagues = sports as Set<string> | null;
  return {
    slot,
    includes: (g) =>
      (!leagues || leagues.has(g.sport)) &&
      (!teams || teams.has(normalizeTeamName(g.away)) || teams.has(normalizeTeamName(g.home))) &&
      (!slots.length || slots.some((t) => t(g))) &&
      (!ranges.length || ranges.some((t) => t(g))),
  };
}

const KICKOFF = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});
const GAME_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
});

/** "Sat 3:30 PM ET", or "Sat Oct 3, kickoff time TBD" for a midnight-Eastern placeholder */
export function kickoffEt(start: string | null, tbd = false): string | null {
  if (!start) return null;
  const d = new Date(start);
  if (!Number.isFinite(d.getTime())) return null;
  if (!tbd) return `${KICKOFF.format(d)} ET`;
  // "Sat Oct 3": Intl puts a comma after the weekday, so assemble the parts
  const part = Object.fromEntries(GAME_DAY.formatToParts(d).map((p) => [p.type, p.value]));
  return `${part.weekday} ${part.month} ${part.day}, kickoff time TBD`;
}

function sideText(market: PulseMarket, s: PulseSideView, name: string, pricedPair: boolean): string {
  const number =
    market === "moneyline"
      ? fmtAmerican(s.price)
      : market === "spread"
        ? `${fmtSpread(s.line)}${pricedPair ? ` (${fmtAmerican(s.price)})` : ""}`
        : pricedPair
          ? `(${fmtAmerican(s.price)})`
          : "";
  const head = `${name}${number ? ` ${number}` : ""}`;
  if (s.betsPct === null || s.handlePct === null) return head;
  const tags = [s.sharp && "sharp money", s.publicSide && "public side", s.reverseMove && "reverse line move"].filter(Boolean);
  return `${head}: ${s.betsPct}% of bets, ${s.handlePct}% of money${tags.length ? ` [${tags.join(", ")}]` : ""}`;
}

function marketLine(view: PulseMarketView, away: string, home: string): string {
  const names = view.market === "total" ? ["Over", "Under"] : [away, home];
  const pricedPair = view.sides.every((s) => s.price !== null);
  const label =
    view.market === "spread" ? "Spread" : view.market === "moneyline" ? "Moneyline" : `Total${view.sides[0].line !== null ? ` ${view.sides[0].line}` : ""}`;
  const parts = view.sides.map((s, i) => sideText(view.market, s, names[i], pricedPair));
  const move = openToNow(view);
  if (move) parts.push(`${move}${view.market === "spread" ? ` (${away})` : view.market === "moneyline" ? " (away / home)" : ""}`);
  if (view.thin) parts.push("light, one-sided action: no signal read");
  return `- ${label}: ${parts.join(" | ")}`;
}

/**
 * One game for the chat's prompt: kickoff, the split's DraftKings page time
 * ("split updated X ago") or a plain "no split posted", the line's age, then
 * each market's number, both sides' bets and money, the markers that fire and
 * Open → Now. Same numbers and markers as Market Pulse.
 */
export function pulseBrief(game: SplitsGame, now: Date = new Date()): string {
  const pulse = buildMarketPulse({ splits: game.rows, lines: game.lines, odds: game.odds ?? null });
  const shown = PULSE_MARKETS.filter((m) => pulse[m]?.hasSplits || (pulse[m] && pulse[m]!.lineSource !== null));
  const hasSplits = shown.some((m) => pulse[m]!.hasSplits);
  const lineAt =
    shown
      .map((m) => pulse[m]!.lineAsOf)
      .filter((t): t is string => t !== null)
      .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
  const splitAt = game.rows.map(splitAsOf).sort().pop() ?? null;
  const when = kickoffEt(game.start, game.startTbd === true);
  const head = [
    `${game.away} @ ${game.home} (${game.sport}${when ? `, ${when}` : ""})`,
    hasSplits ? `DraftKings split updated ${agoLabel(splitAt, now)}` : "no DraftKings public split posted for this game",
    lineAt ? `line updated ${agoLabel(lineAt, now)}` : shown.length ? null : "no DraftKings line stored yet",
  ].filter(Boolean);
  return [head.join(" · "), ...shown.map((m) => marketLine(pulse[m]!, game.away, game.home))].join("\n");
}

/**
 * The prompt block for the games a question is about (pickPulseGames, with
 * lines and odds attached): how to answer from it, the marker definitions,
 * and each game's brief. Empty when there are no games.
 */
export function pulseBlock(games: SplitsGame[], now: Date = new Date()): string {
  if (!games.length) return "";
  return [
    "[DRAFTKINGS MARKET PULSE]",
    "Current DraftKings data for the upcoming game(s) below: the public betting split (% of bets and % of money on each side) and the line, exactly as the MGP app shows them. " +
      "If the user is asking about the betting on, or the outlook for, the upcoming games listed below, use these exact numbers and never alter them: " +
      "give the bets % and money % for BOTH sides of each market asked about, name the markers exactly as given, and quote the line with its Open → Now and the updated times. " +
      "For a game with no DraftKings public split, say DraftKings hasn't posted one and give its line. " +
      "If the question is about something else (history, a different game, a player's past, futures or season-long markets), ignore this block. " +
      "This ignore rule takes precedence over the general directives to ALWAYS lead with whatever data IS available and to use [MGP DATA] alongside search results.",
    `Markers: sharp money = under half the bets but over half the money, money share ${SHARP_EDGE_PTS}+ points above bet share. ` +
      `Public side = ${PUBLIC_BETS_PCT}%+ of bets. Reverse line move = the line moved toward a side since DraftKings opened it while ${PUBLIC_BETS_PCT}%+ of bets sat on the other side. ` +
      "A side at 0% of bets or money is light, one-sided action and fires no marker.",
    ...games.map((g) => `\n${pulseBrief(g, now)}`),
  ].join("\n");
}

/**
 * The live chat's DraftKings block for a question (gemini-chat): the NCAAF or
 * NFL game(s) it is about (pickPulseGames over the splits and the games in
 * the window), each with the app's line (betting_lines plus the game's
 * DraftKings odds row, chooseLine), as pulseBlock text. The game is found by
 * the teams the question names, within the league the chat resolved
 * (_shared/league-detect.ts resolveLeague; both football leagues when it
 * found none). Empty for a basketball or baseball question, outside football
 * season, for questions that are neither about a game nor about splits, and
 * when no game applies; a question that names no team (mayNameTeam) and is
 * not about splits reads nothing. A city or school alone that several teams
 * playing in the window share ("Houston odds") gets no game, only a one-line
 * hint telling the model to ask which team (ambiguityHint). A postseason
 * event ("Super Bowl odds", "Rose Bowl spread") gets its scheduled game
 * (eventGames), nothing when the window holds none.
 */
// deno-lint-ignore no-explicit-any
export async function marketPulseBlock(client: any, message: string, intent: string, league: string | null, now: Date = new Date()): Promise<string> {
  const month = now.getUTCMonth();
  if (!(month >= 7 || month <= 1)) return "";
  if (outsideFootball(message, league)) return "";
  // Only a question about a game's number, the betting on it, or a matchup
  // (not "Jalen Hurts stats", "was Bryce Young better at Alabama", "Alabama
  // 2020 championship"). The chat's intent label is not consulted: it calls
  // almost everything "general"
  const pulseQuestion = isPulseQuestion(message);
  if (gameIntent(message, cachedPlayerNames(now), now) === "no") return "";
  // Names no team and is not about splits: nothing to find, so no reads
  if (!pulseQuestion && !mayNameTeam(message)) return "";
  const since = new Date(now.getTime() - 6 * 3600_000).toISOString();
  const until = new Date(now.getTime() + 8 * 24 * 3600_000).toISOString();
  const [splitRows, ncaafGames, nflGames, players] = await Promise.all([
    selectAll<StoredSplitRow>(
      () =>
        client
          .from("betting_splits")
          .select("sport, game_id, source_matchup, away_team, home_team, event_start, market, side, bets_pct, handle_pct, captured_at, source_as_of")
          .eq("source", "draftkings")
          .gte("event_start", since)
          .order("id"),
      { label: "betting_splits for chat" },
    ),
    client
      .from("ncaaf_games")
      .select("id, date, status, home_team_name, visitor_team_name, time_tbd, venue, home_team_rank, visitor_team_rank")
      .gte("date", since)
      .lte("date", until)
      .limit(400),
    client
      .from("games")
      .select("id, date, status, home_team_name, visitor_team_name, postseason, week")
      .eq("league", "NFL")
      .gte("date", since)
      .lte("date", until)
      .limit(100),
    loadPlayerNames(client, now),
  ]);
  const candidates = candidateGames(groupSplitGames(splitRows), [
    ...lineOnlyGames("NCAAF", (ncaafGames.data ?? []) as LineGameRow[]),
    ...lineOnlyGames("NFL", (nflGames.data ?? []) as LineGameRow[]),
  ]);
  // Again with the players' names read: their words name no team
  const intentNow = gameIntent(message, players, now);
  if (intentNow === "no") return "";
  const pool = league ? candidates.filter((g) => g.sport === league) : candidates;
  // A postseason event: only the scheduled game it names ("Super Bowl odds"), nothing when none is (futures); a bare
  // "playoff" question with both leagues' playoffs in the window gets a line asking which
  const event = intentNow === "event" ? eventPick(message, candidates, now, league, players) : null;
  if (event === "both") return PLAYOFF_HINT;
  const picked = event ?? pickPulseGames(message, pool, { sport: league, players, matchupOnly: intentNow === "matchup" }, now);
  if (!picked.length) {
    if (intentNow !== "yes") return "";
    // A city or school several teams playing in the window share, and no
    // game named: no guess, the model asks which team
    const places = ambiguousPlaces(message, pool, now, { league, players });
    return places.length ? ambiguityHint(message, places, pool, now) : "";
  }
  for (const sport of [...new Set(picked.map((g) => g.sport))]) {
    const games = picked.filter((g) => g.sport === sport);
    const ids = games.map((g) => g.gameId);
    const [lines, odds] = await Promise.all([
      fetchDkLines(client, sport, ids),
      client
        .from(sport === "NFL" ? "odds" : "ncaaf_odds")
        .select("game_id, spread_value, spread_odds, moneyline_home, moneyline_away, total_value, total_over_odds, total_under_odds, updated_at")
        .in("game_id", ids)
        .ilike("sportsbook", "%draftkings%"),
    ]);
    for (const g of games) {
      g.lines = lines.get(g.gameId) ?? [];
      g.odds = ((odds.data ?? []) as Array<OddsRowLike & { game_id: string | number }>).find((o) => String(o.game_id) === g.gameId) ?? null;
    }
  }
  return pulseBlock(picked, now);
}
