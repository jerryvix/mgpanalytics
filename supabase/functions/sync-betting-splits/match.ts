// Maps DraftKings splits matchups ("Away @ Home" + Eastern kickoff) onto our
// own game rows. Pure, vitest-covered (src/test/bettingSplitsMatch.test.ts).
//
// Our game rows carry ESPN display names ("Miami (OH) RedHawks", "Hawai'i
// Rainbow Warriors", "UL Monroe Warhawks"); DK prints short school names
// ("Miami OH", "Hawaii", "UL Monroe") in NCAAF and NCAAB and
// city-abbreviation + nickname in the NFL and NBA ("LA Chargers", "SF
// 49ers", "PHO Suns", "POR Trail Blazers"). A game matches only when BOTH
// teams match and the kickoffs sit within the sport's match window
// (matchWindowHours: college rows can hold midnight-Eastern placeholders for
// TBD kickoffs, so exact times cannot be required). Nothing is guessed: a DK
// matchup that fits no game, or fits two equally well, is returned unmatched
// with the reason.

export type MatchSport = "NCAAF" | "NFL" | "NBA" | "NCAAB";

export interface GameRow {
  id: string | number;
  date: string;
  home_team_name: string;
  visitor_team_name: string;
}

export interface MatchableEvent {
  eventId: string;
  away: string;
  home: string;
  /** Kickoff resolved to UTC */
  kickoffUtc: Date;
}

export interface EventMatch<E extends MatchableEvent> {
  event: E;
  game: GameRow;
  /** DK lists the teams the other way round from our row (neutral site) */
  swapped: boolean;
  /** 4 = both names exact; lower means a prefix fallback carried a side */
  score: number;
}

export interface UnmatchedEvent<E extends MatchableEvent> {
  event: E;
  reason: string;
  /**
   * Neither DK team is on any of our game rows inside the match window. For
   * a games table that keeps only some games (triageUnmatched), that is a
   * game we do not store, not a name to fix.
   */
  neitherTeamSeen: boolean;
}

/** Football: college rows hold midnight-Eastern placeholders for TBD kickoffs */
export const MATCH_WINDOW_HOURS = 36;
/** Basketball: our rows carry ESPN's exact tip (DK prints the 7:10 tip of a 7:00 NBA game) */
export const BASKETBALL_MATCH_WINDOW_HOURS = 12;

/**
 * How far DK's kickoff may sit from our row's. No basketball team plays
 * twice in 12 hours, so the tight window keeps a DK event off the same two
 * teams' other game (an NBA rematch the next night) and lets "neither team
 * on our rows" mean we do not store the game: a team that played last night
 * is outside it.
 */
export function matchWindowHours(sport: MatchSport): number {
  return sport === "NBA" || sport === "NCAAB" ? BASKETBALL_MATCH_WINDOW_HOURS : MATCH_WINDOW_HOURS;
}

/**
 * Lowercase, accents dropped, "&" spelled out, a possessive dropped ("Ohio
 * State's" is Ohio State, "Titans'" is Titans), then the other apostrophes
 * ("Hawai'i" is Hawaii) and punctuation to spaces.
 */
export function normalizeTeamName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/(\w)['‘’ʼ]s\b/g, "$1")
    .replace(/(\w)s['‘’ʼ](?!\w)/g, "$1s")
    .replace(/['‘’ʻʼ.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// DK's NCAAF school labels whose normalized form is not how ESPN's display
// name begins. Keys and values are normalized. Most DK labels need nothing
// ("Coastal Carolina", "Southern Miss", "UConn", "UTSA", "Ole Miss", "Miami
// OH" and "Hawaii" already line up after normalizing).
export const DK_NCAAF_ALIASES: Record<string, string> = {
  "miami fl": "miami",
  "miami florida": "miami",
  "miami ohio": "miami oh",
  umass: "massachusetts",
  "appalachian state": "app state",
  "appalachian st": "app state",
  "louisiana monroe": "ul monroe",
  ulm: "ul monroe",
  "louisiana lafayette": "louisiana",
  "ul lafayette": "louisiana",
  fiu: "florida international",
  fau: "florida atlantic",
  usf: "south florida",
  pitt: "pittsburgh",
  "southern mississippi": "southern miss",
  "sam houston state": "sam houston",
  "north carolina state": "nc state",
  mississippi: "ole miss",
  connecticut: "uconn",
  "central florida": "ucf",
  "southern california": "usc",
  "brigham young": "byu",
  "southern methodist": "smu",
  "texas christian": "tcu",
  "louisiana state": "lsu",
  "nevada las vegas": "unlv",
  "texas el paso": "utep",
  "texas san antonio": "utsa",
  "alabama birmingham": "uab",
  "middle tennessee state": "middle tennessee",
  // Abbreviations for schools ESPN spells out (FBS and FCS). Deliberately
  // absent: SDSU, TSU, NSU, MSU, USD and the like, which name two schools.
  liu: "long island university",
  "long island": "long island university",
  uiw: "incarnate word",
  etsu: "east tennessee state",
  utrgv: "ut rio grande valley",
  "texas rio grande valley": "ut rio grande valley",
  uapb: "arkansas pine bluff",
  mvsu: "mississippi valley state",
  "miss valley state": "mississippi valley state",
  nccu: "north carolina central",
  "nc central": "north carolina central",
  "nc a and t": "north carolina a and t",
  ncat: "north carolina a and t",
  "sc state": "south carolina state",
  semo: "southeast missouri state",
  "se missouri state": "southeast missouri state",
  uni: "northern iowa",
  siu: "southern illinois",
  ndsu: "north dakota state",
  und: "north dakota",
  ewu: "eastern washington",
  nau: "northern arizona",
  acu: "abilene christian",
  uca: "central arkansas",
  eku: "eastern kentucky",
  una: "north alabama",
  utm: "ut martin",
  "tennessee martin": "ut martin",
  ccsu: "central connecticut",
  "central connecticut state": "central connecticut",
  unh: "new hampshire",
  uri: "rhode island",
  suu: "southern utah",
  albany: "ualbany",
  hcu: "houston christian",
  "houston baptist": "houston christian",
  "texas a and m commerce": "east texas a and m",
  "southeastern louisiana": "se louisiana",
  "mcneese state": "mcneese",
  "nicholls state": "nicholls",
  "grambling state": "grambling",
  citadel: "the citadel",
  tarleton: "tarleton state",
  "prairie view": "prairie view a and m",
  shsu: "sam houston",
  ecu: "east carolina",
  jmu: "james madison",
  odu: "old dominion",
  wku: "western kentucky",
  mtsu: "middle tennessee",
  niu: "northern illinois",
  wmu: "western michigan",
  cmu: "central michigan",
  emu: "eastern michigan",
  bgsu: "bowling green",
  "jax state": "jacksonville state",
  "sac state": "sacramento state",
  cal: "california",
};

// DK's college basketball labels that the football map does not cover, each
// seen failing on DK's Nov 23 2026 NCAAB pages against ESPN's display names
// (src/test/fixtures/dk-splits-basketball-2026-11-23-matchups.json). Schools
// without FBS football, so the football map stays as it is. NCAAB reads both
// maps, this one winning.
export const DK_NCAAB_ALIASES: Record<string, string> = {
  // ESPN "St. Bonaventure Bonnies"
  "saint bonaventure": "st bonaventure",
  // ESPN "St. John's Red Storm": the possessive drops, so the school reads "st john"
  "st johns": "st john",
  // ESPN "Maryland Eastern Shore Hawks"
  "md eastern shore": "maryland eastern shore",
  // ESPN "Texas A&M-Corpus Christi Islanders"
  "a and m corpus christi": "texas a and m corpus christi",
};

const NCAAB_ALIASES: Record<string, string> = { ...DK_NCAAF_ALIASES, ...DK_NCAAB_ALIASES };

/** DK's label as the school name ESPN's display name begins with ("Kent St." reads as Kent State). */
function dkSchool(dk: string, sport: MatchSport): string {
  const aliases = sport === "NCAAB" ? NCAAB_ALIASES : DK_NCAAF_ALIASES;
  const aliased = aliases[dk];
  if (aliased) return aliased;
  const spelledOut = dk.replace(/ st$/, " state");
  return aliases[spelledOut] ?? spelledOut;
}

// Penultimate words that belong to the school, not the mascot ("Georgia
// State Panthers" is Georgia State, never Georgia). Mirrors the qualifier
// rule in src/utils/cfbdSchools.ts (Deno cannot import from src/).
const SCHOOL_QUALIFIERS = new Set(["state", "tech", "a&m", "a&t", "christian", "southern", "central"]);

/**
 * School-name candidates for an ESPN display name: drop a one-word mascot,
 * then a two-word mascot ("Rainbow Warriors", "Golden Eagles") unless the
 * word before the mascot is a school qualifier or a parenthetical "(OH)".
 */
export function schoolCandidates(displayName: string): string[] {
  const words = displayName.trim().split(/\s+/);
  const out: string[] = [];
  if (words.length >= 2) out.push(words.slice(0, -1).join(" "));
  if (words.length >= 3) {
    const penult = words[words.length - 2];
    if (!SCHOOL_QUALIFIERS.has(penult.toLowerCase()) && !/^\(.*\)$/.test(penult)) {
      out.push(words.slice(0, -2).join(" "));
    }
  }
  if (out.length === 0) out.push(displayName);
  return out.map(normalizeTeamName);
}

/** 2 = exact school (or pro nickname) match, 1 = token-prefix fallback, 0 = no match. */
export function teamMatchScore(sport: MatchSport, dkName: string, ourDisplayName: string): number {
  const ours = normalizeTeamName(ourDisplayName);
  const dk = normalizeTeamName(dkName);
  if (!dk || !ours) return 0;
  if (sport === "NFL" || sport === "NBA") {
    // Every NFL and NBA nickname is unique, and so is its last word ("LA
    // Chargers" vs "Los Angeles Chargers", "POR Trail Blazers" vs "Portland
    // Trail Blazers", "PHI 76ers")
    const lastDk = dk.split(" ").pop();
    const lastOurs = ours.split(" ").pop();
    return lastDk && lastDk === lastOurs ? 2 : 0;
  }
  const school = dkSchool(dk, sport);
  if (schoolCandidates(ourDisplayName).includes(school)) return 2;
  if (ours === school || ours.startsWith(`${school} `)) return 1;
  return 0;
}

function pairScore(sport: MatchSport, awayDk: string, homeDk: string, visitor: string, home: string): number {
  const a = teamMatchScore(sport, awayDk, visitor);
  const h = teamMatchScore(sport, homeDk, home);
  return a > 0 && h > 0 ? a + h : 0;
}

export function matchEventsToGames<E extends MatchableEvent>(
  sport: MatchSport,
  events: E[],
  games: GameRow[],
): { matched: EventMatch<E>[]; unmatched: UnmatchedEvent<E>[] } {
  const hours = matchWindowHours(sport);
  const windowMs = hours * 3600_000;
  const proposals: EventMatch<E>[] = [];
  const unmatched: UnmatchedEvent<E>[] = [];

  for (const event of events) {
    let best: EventMatch<E>[] = [];
    // Whether each DK team is on any row in the window, for the reason
    let awaySeen = false;
    let homeSeen = false;
    for (const game of games) {
      const gameMs = new Date(game.date).getTime();
      if (!Number.isFinite(gameMs) || Math.abs(gameMs - event.kickoffUtc.getTime()) > windowMs) continue;
      const onRow = (dk: string) =>
        teamMatchScore(sport, dk, game.visitor_team_name) > 0 || teamMatchScore(sport, dk, game.home_team_name) > 0;
      awaySeen ||= onRow(event.away);
      homeSeen ||= onRow(event.home);
      const straight = pairScore(sport, event.away, event.home, game.visitor_team_name, game.home_team_name);
      const swapped = pairScore(sport, event.away, event.home, game.home_team_name, game.visitor_team_name);
      // Prefer DK's orientation when both read the same
      const candidate: EventMatch<E> | null =
        straight >= swapped && straight > 0
          ? { event, game, swapped: false, score: straight }
          : swapped > 0
            ? { event, game, swapped: true, score: swapped }
            : null;
      if (!candidate) continue;
      if (best.length === 0 || candidate.score > best[0].score) best = [candidate];
      else if (candidate.score === best[0].score) best.push(candidate);
    }
    if (best.length === 1) proposals.push(best[0]);
    else if (best.length === 0) {
      const missing = [!awaySeen && event.away, !homeSeen && event.home].filter(Boolean);
      unmatched.push({
        event,
        reason:
          missing.length === 2
            ? `no game row with either team within ${hours}h`
            : `no game row with both teams within ${hours}h${missing.length ? `; no row has ${missing[0]}` : ""}`,
        neitherTeamSeen: missing.length === 2,
      });
    } else {
      unmatched.push({
        event,
        reason: `ambiguous: ${best.map((b) => `${b.game.visitor_team_name} @ ${b.game.home_team_name}`).join(" | ")}`,
        neitherTeamSeen: false,
      });
    }
  }

  // One DK event per game: if two claim the same row, neither is trusted
  const byGame = new Map<string, EventMatch<E>[]>();
  for (const p of proposals) {
    const key = String(p.game.id);
    byGame.set(key, [...(byGame.get(key) ?? []), p]);
  }
  const matched: EventMatch<E>[] = [];
  for (const claims of byGame.values()) {
    if (claims.length === 1) {
      matched.push(claims[0]);
      continue;
    }
    for (const c of claims) {
      unmatched.push({ event: c.event, reason: `game ${c.game.id} claimed by ${claims.length} DK events`, neitherTeamSeen: false });
    }
  }
  return { matched, unmatched };
}

/**
 * How much of DK's list a sport's games table holds. "all": every game DK
 * lists has a row (ncaaf_games, the NFL rows in games). "subset": the table
 * keeps only some (ncaab_games: ranked games in the next 24 hours; nba_games:
 * about 48 hours ahead).
 */
export type GamesCoverage = "all" | "subset";

/**
 * Our games still to start inside DK's kickoff range (an hour either side).
 * DK lists nearly every game in its range (Nov 23 2026: every Division I
 * matchup but two late West Coast games; none against non-Division I
 * schools), so when there are some, a run should match at least one.
 */
export function ourGamesInRange(games: GameRow[], events: MatchableEvent[], now: Date): number {
  if (events.length === 0) return 0;
  const times = events.map((e) => e.kickoffUtc.getTime());
  const from = Math.min(...times) - 3600_000;
  const to = Math.max(...times) + 3600_000;
  return games.filter((g) => {
    const t = new Date(g.date).getTime();
    return Number.isFinite(t) && t > now.getTime() && t >= from && t <= to;
  }).length;
}

/**
 * Splits unmatched DK matchups into misses (a name or a row to fix, which
 * make the run partial) and games our table does not store. Only a
 * "subset" table has the second kind: a matchup with neither team on our
 * rows in the match window. Both are logged and counted; nothing is
 * written for either. When nothing matched although our table holds games
 * inside DK's kickoff range, every matchup is a miss: the names or our
 * games sync broke, and that must not read as "not stored".
 */
export function triageUnmatched<E extends MatchableEvent>(
  coverage: GamesCoverage,
  unmatched: UnmatchedEvent<E>[],
  ctx: { matched: number; ourGamesInRange: number },
): { misses: UnmatchedEvent<E>[]; notInOurGames: UnmatchedEvent<E>[] } {
  if (coverage === "all" || (ctx.matched === 0 && ctx.ourGamesInRange > 0)) return { misses: unmatched, notInOurGames: [] };
  return {
    misses: unmatched.filter((u) => !u.neitherTeamSeen),
    notInOurGames: unmatched.filter((u) => u.neitherTeamSeen),
  };
}
