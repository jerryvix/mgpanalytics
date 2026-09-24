// Maps DraftKings splits matchups ("Away @ Home" + Eastern kickoff) onto our
// own game rows. Pure, vitest-covered (src/test/bettingSplitsMatch.test.ts).
//
// Our game rows carry ESPN display names ("Miami (OH) RedHawks", "Hawai'i
// Rainbow Warriors", "UL Monroe Warhawks"); DK prints short school names
// ("Miami OH", "Hawaii", "UL Monroe") in NCAAF and city-abbreviation +
// mascot in the NFL ("LA Chargers", "SF 49ers"). A game matches only when
// BOTH teams match and the kickoffs sit within MATCH_WINDOW_HOURS (our rows
// still hold midnight-Eastern placeholders for TBD kickoffs, so exact times
// cannot be required). Nothing is guessed: a DK matchup that fits no game,
// or fits two equally well, is returned unmatched with the reason.

export type MatchSport = "NCAAF" | "NFL";

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
}

export const MATCH_WINDOW_HOURS = 36;

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

/** DK's label as the school name ESPN's display name begins with ("Kent St." reads as Kent State). */
function dkSchool(dk: string): string {
  const aliased = DK_NCAAF_ALIASES[dk];
  if (aliased) return aliased;
  const spelledOut = dk.replace(/ st$/, " state");
  return DK_NCAAF_ALIASES[spelledOut] ?? spelledOut;
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

/** 2 = exact school (or NFL mascot) match, 1 = token-prefix fallback, 0 = no match. */
export function teamMatchScore(sport: MatchSport, dkName: string, ourDisplayName: string): number {
  const ours = normalizeTeamName(ourDisplayName);
  const dk = normalizeTeamName(dkName);
  if (!dk || !ours) return 0;
  if (sport === "NFL") {
    // Every NFL nickname is unique ("LA Chargers" vs "Los Angeles Chargers")
    const lastDk = dk.split(" ").pop();
    const lastOurs = ours.split(" ").pop();
    return lastDk && lastDk === lastOurs ? 2 : 0;
  }
  const school = dkSchool(dk);
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
  const windowMs = MATCH_WINDOW_HOURS * 3600_000;
  const proposals: EventMatch<E>[] = [];
  const unmatched: UnmatchedEvent<E>[] = [];

  for (const event of events) {
    let best: EventMatch<E>[] = [];
    for (const game of games) {
      const gameMs = new Date(game.date).getTime();
      if (!Number.isFinite(gameMs) || Math.abs(gameMs - event.kickoffUtc.getTime()) > windowMs) continue;
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
    else if (best.length === 0) unmatched.push({ event, reason: "no game row with both teams within 36h" });
    else {
      unmatched.push({
        event,
        reason: `ambiguous: ${best.map((b) => `${b.game.visitor_team_name} @ ${b.game.home_team_name}`).join(" | ")}`,
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
      unmatched.push({ event: c.event, reason: `game ${c.game.id} claimed by ${claims.length} DK events` });
    }
  }
  return { matched, unmatched };
}
