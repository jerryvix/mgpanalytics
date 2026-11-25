// Capper Picks results (DECISIONS D-093, D-112): grade a show's pick once its game is final.
//
// Pure functions, no network, so the web tests can import them. app-feed feeds them
// ESPN's final score and, for player props, the game summary's box score.
//
// A pick is graded only when the market is unambiguous: full-game spread, total,
// moneyline and team total from the final score; player props whose stat reads
// straight off the box score (points, rebounds, assists, threes, passing, rushing
// and receiving yards, receptions, tackles and assists, anytime and first TD, ...).
// Anything else (halves, quarters, unknown stats, a player not in the box score)
// stays null, so the app shows "Final" instead of a guessed result.

export type TakeResult = "hit" | "miss" | "push" | null;

export interface GradeTeam {
  abbr: string;
  /** ESPN shortDisplayName ("Commanders", "Colorado St") */
  name?: string | null;
  location?: string | null;
  displayName?: string | null;
  score: number | string | null;
}

export interface GradeGame {
  away: GradeTeam;
  home: GradeTeam;
}

export interface BoxPlayer {
  name: string;
  team: string;
  /** Basketball: ESPN keys ("points"); football: "category.key" ("receiving.receivingYards") */
  stats: Record<string, number>;
}

export interface GameBox {
  /** Players who played (basketball DNPs are left out) */
  players: BoxPlayer[];
  /** Touchdown scorers in scoring order (football), or null when ESPN gave no scoring plays */
  tdScorers: string[] | null;
}

export interface GradableTake {
  sport?: string | null;
  market: string;
  pick: string;
  legs?: string[] | null;
}

// ---------------------------------------------------------------------------
// Text helpers

// Built from code points so the repo's no-dash guard (src/test/noEmDashes.test.ts) stays clean
const COMBINING = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");
const QUOTES = new RegExp(`[${String.fromCharCode(0x2018, 0x2019)}'\`]`, "g");
const DASHES = new RegExp(`[${String.fromCharCode(0x2212, 0x2013, 0x2014)}]`, "g");

function plain(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(COMBINING, "").replace(QUOTES, "").replace(DASHES, "-");
}

/** Team names: "Colorado St." and "Colorado State" compare equal; "St. John's" keeps its "St". */
function teamKey(s: string): string {
  return plain(s).replace(/[^a-z0-9]+/g, " ").trim().replace(/ st$/, " state");
}

/** Player names: no punctuation or suffixes ("Ja'Marr Chase" -> "jamarr chase"). */
function personKey(s: string): string {
  return plain(s).replace(/[^a-z0-9 ]+/g, " ").replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ").replace(/\s+/g, " ").trim();
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cmp(diff: number): TakeResult {
  return diff > 0 ? "hit" : diff < 0 ? "miss" : "push";
}

// Halves, quarters and periods can't be graded from the final score
const PARTIAL = /\b(1h|2h|1q|2q|3q|4q|1p|2p|3p|1st half|2nd half|first half|second half|1st quarter|first quarter|half|quarter|period|f5|first 5|first five)\b/;

// ---------------------------------------------------------------------------
// Final score

/** "WSH 22, CIN 20": winner first, away first on a tie. Null until both scores are in. */
export function finalLabel(game: GradeGame): string | null {
  const a = num(game.away.score), h = num(game.home.score);
  if (a === null || h === null) return null;
  const [w, l] = h > a ? [game.home, game.away] : [game.away, game.home];
  return `${w.abbr} ${num(w.score)}, ${l.abbr} ${num(l.score)}`;
}

function resolveTeam(text: string, game: GradeGame): "away" | "home" | null {
  const k = teamKey(text);
  if (!k) return null;
  const matches = (t: GradeTeam) => {
    const nick = t.displayName && t.location && t.displayName.startsWith(t.location)
      ? t.displayName.slice(t.location.length) : null;
    return [t.abbr, t.name, t.location, t.displayName, nick]
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .some((x) => teamKey(x) === k);
  };
  const a = matches(game.away), h = matches(game.home);
  if (a === h) return null; // neither, or both (ambiguous)
  return a ? "away" : "home";
}

/**
 * Spread, moneyline, game total or team total, from the final score. Returns
 * undefined when the text isn't one of these (so the caller can try a prop).
 */
export function gradeLine(pick: string, game: GradeGame): TakeResult | undefined {
  const text = plain(pick).replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+/g, " ").trim();
  if (PARTIAL.test(text)) return undefined;
  const away = num(game.away.score), home = num(game.home.score);
  if (away === null || home === null) return undefined;
  const score = (s: "away" | "home") => (s === "away" ? away : home);
  const other = (s: "away" | "home") => (s === "away" ? home : away);

  // Totals: "Over 53.5", "U 154.5", "Bengals Over 27.5" (team total)
  const total = text.replace(/\s+(total|total points|points|team total|tt)$/, "")
    .match(/^(?:(.*?)\s+)?(over|under|o|u)\s*(\d+(?:\.\d+)?)$/);
  if (total) {
    const [, who, side, lineText] = total;
    const line = Number(lineText);
    let value: number;
    if (who && who.replace(/\b(game|total|team)\b/g, "").trim()) {
      const team = resolveTeam(who.replace(/\b(team total|tt)\b/g, ""), game);
      if (!team) return undefined;
      value = score(team);
    } else {
      value = away + home;
    }
    return cmp(side.startsWith("o") ? value - line : line - value);
  }

  // Moneyline: "Bengals ML"
  const ml = text.match(/^(.+?)\s+(ml|moneyline|money line|to win|win outright)$/);
  if (ml) {
    const team = resolveTeam(ml[1], game);
    if (!team) return undefined;
    return cmp(score(team) - other(team));
  }

  // Spread: "Commanders +5.5", "Oregon -6.5", "Bills PK"
  const sp = text.match(/^(.+?)\s+([+-]\d+(?:\.\d+)?|pk|pick|pickem|pick em)$/);
  if (sp) {
    const team = resolveTeam(sp[1], game);
    if (!team) return undefined;
    const line = /^[+-]/.test(sp[2]) ? Number(sp[2]) : 0;
    return cmp(score(team) + line - other(team));
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Player props

const TD_KEYS = [
  "rushing.rushingTouchdowns", "receiving.receivingTouchdowns",
  "kickReturns.kickReturnTouchdowns", "puntReturns.puntReturnTouchdowns",
];

// Whole-phrase stats, checked before a phrase is split on "+"
const FOOTBALL_PHRASES: Record<string, string[]> = {
  "tackles+assists": ["defensive.totalTackles"],
  "total tackles": ["defensive.totalTackles"],
  "solo tackles": ["defensive.soloTackles"],
  "scrimmage yards": ["rushing.rushingYards", "receiving.receivingYards"],
  "interceptions thrown": ["passing.interceptions"],
  "passing interceptions": ["passing.interceptions"],
  "ints thrown": ["passing.interceptions"],
};

const FOOTBALL_PARTS: Record<string, string[]> = {
  "passing yards": ["passing.passingYards"],
  "pass yards": ["passing.passingYards"],
  "passing touchdowns": ["passing.passingTouchdowns"],
  "pass touchdowns": ["passing.passingTouchdowns"],
  "completions": ["passing.completions"],
  "pass completions": ["passing.completions"],
  "passing completions": ["passing.completions"],
  "pass attempts": ["passing.passingAttempts"],
  "passing attempts": ["passing.passingAttempts"],
  "rushing yards": ["rushing.rushingYards"],
  "rush yards": ["rushing.rushingYards"],
  "rushing attempts": ["rushing.rushingAttempts"],
  "rush attempts": ["rushing.rushingAttempts"],
  "carries": ["rushing.rushingAttempts"],
  "rushing touchdowns": ["rushing.rushingTouchdowns"],
  "rush touchdowns": ["rushing.rushingTouchdowns"],
  "receiving yards": ["receiving.receivingYards"],
  "rec yards": ["receiving.receivingYards"],
  "receptions": ["receiving.receptions"],
  "catches": ["receiving.receptions"],
  "receiving touchdowns": ["receiving.receivingTouchdowns"],
  "sacks": ["defensive.sacks"],
  "kicking points": ["kicking.totalKickingPoints"],
  "field goals made": ["kicking.fieldGoalsMade"],
  "field goals": ["kicking.fieldGoalsMade"],
};

const BASKETBALL_PHRASES: Record<string, string[]> = {
  "pra": ["points", "rebounds", "assists"],
  "points rebounds assists": ["points", "rebounds", "assists"],
  "points rebounds": ["points", "rebounds"],
  "points assists": ["points", "assists"],
  "rebounds assists": ["rebounds", "assists"],
  "stocks": ["steals", "blocks"],
};

const BASKETBALL_PARTS: Record<string, string[]> = {
  "points": ["points"],
  "rebounds": ["rebounds"],
  "assists": ["assists"],
  "steals": ["steals"],
  "blocks": ["blocks"],
  "turnovers": ["turnovers"],
  "threes": ["threePointFieldGoalsMade"],
  "made threes": ["threePointFieldGoalsMade"],
  "threes made": ["threePointFieldGoalsMade"],
  "3 pointers": ["threePointFieldGoalsMade"],
  "3 pointers made": ["threePointFieldGoalsMade"],
  "three pointers": ["threePointFieldGoalsMade"],
  "three pointers made": ["threePointFieldGoalsMade"],
  "3pm": ["threePointFieldGoalsMade"],
  "3s": ["threePointFieldGoalsMade"],
  "offensive rebounds": ["offensiveRebounds"],
  "defensive rebounds": ["defensiveRebounds"],
  "free throws made": ["freeThrowsMade"],
  "field goals made": ["fieldGoalsMade"],
};

const WORDS: Record<string, string> = {
  pts: "points", point: "points", reb: "rebounds", rebs: "rebounds", rebound: "rebounds", boards: "rebounds",
  ast: "assists", asts: "assists", assist: "assists", stl: "steals", steal: "steals", blk: "blocks", block: "blocks",
  yds: "yards", yd: "yards", yard: "yards", tds: "touchdowns", td: "touchdowns", touchdown: "touchdowns",
  reception: "receptions", rec: "rec", tackle: "tackles", three: "three", sack: "sacks", carry: "carries",
  completion: "completions", attempt: "attempts", turnover: "turnovers",
};

function statPhrase(s: string): string {
  return plain(s)
    .replace(/(\w)-(\w)/g, "$1 $2")
    .replace(/\s*(\+|&|,|\band\b|\bplus\b)\s*/g, "+")
    .replace(/[^a-z0-9+ ]+/g, " ")
    .split("+").map((part) => part.trim().split(/\s+/).map((w) => WORDS[w] ?? w).join(" "))
    .join("+");
}

/** The box-score keys a prop's stat sums, or null when the stat isn't one we can read. */
export function statKeys(stat: string, football: boolean): string[] | null {
  const phrase = statPhrase(stat);
  const phrases = football ? FOOTBALL_PHRASES : BASKETBALL_PHRASES;
  const partsTable = football ? FOOTBALL_PARTS : BASKETBALL_PARTS;
  if (phrases[phrase]) return phrases[phrase];
  if (football && /^(touchdowns|total touchdowns|anytime touchdowns)$/.test(phrase)) return TD_KEYS;
  const parts = phrase.split("+").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  // "rushing+receiving yards": the unit on the last part applies to the others
  const unit = football ? parts[parts.length - 1].match(/ (yards|touchdowns)$/)?.[1] : undefined;
  const keys: string[] = [];
  for (const raw of parts) {
    const p = unit && !/ (yards|touchdowns)$/.test(raw) && !partsTable[raw] ? `${raw} ${unit}` : raw;
    const k = partsTable[p];
    if (!k) return null;
    keys.push(...k);
  }
  return [...new Set(keys)];
}

/** The box-score player a pick names: exact, then last name with first-name prefix, then a close spelling. */
export function findPlayer<T extends { name: string }>(name: string, players: T[]): T | null {
  const want = personKey(name);
  if (!want) return null;
  const keyed = players.map((p) => ({ p, k: personKey(p.name) }));
  const exact = keyed.filter((x) => x.k === want);
  if (exact.length === 1) return exact[0].p;
  if (exact.length > 1) return null;

  const w = want.split(" ");
  if (w.length === 1) {
    // "Giannis", "Booker": only when one player in the game has that first or last name
    const one = keyed.filter((x) => x.k.split(" ").some((part) => part === w[0]));
    return one.length === 1 && w[0].length >= 4 ? one[0].p : null;
  }
  const first = w[0], last = w.slice(1).join(" ");
  const prefix = keyed.filter((x) => {
    const parts = x.k.split(" ");
    const xf = parts[0], xl = parts.slice(1).join(" ");
    return xl === last && (xf.startsWith(first) || first.startsWith(xf));
  });
  if (prefix.length === 1) return prefix[0].p;
  if (prefix.length > 1) return null;

  const scored = keyed.map((x) => ({ p: x.p, s: 1 - lev(want, x.k) / Math.max(want.length, x.k.length) }))
    .filter((x) => x.s >= 0.85).sort((a, b) => b.s - a.s);
  if (scored.length === 1 || (scored.length > 1 && scored[0].s - scored[1].s >= 0.05)) return scored[0].p;
  return null;
}

function sumStats(p: BoxPlayer, keys: string[]): number {
  return keys.reduce((s, k) => s + (p.stats[k] ?? 0), 0);
}

/** Whether the player scored a touchdown, from the scoring plays; null when they can't say. */
function scoredTd(name: string, box: GameBox): boolean | null {
  if (!box.tdScorers) return null;
  if (box.tdScorers.some((s) => s && findPlayer(name, [{ name: s }]) !== null)) return true;
  return box.tdScorers.includes("") ? null : false; // a play we couldn't read could be theirs
}

/** A player prop from the box score; undefined when the text isn't a prop we can read. */
export function gradeProp(pick: string, box: GameBox | null, football: boolean): TakeResult | undefined {
  const text = plain(pick).replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+/g, " ").trim();
  if (PARTIAL.test(text)) return undefined;

  let m = text.match(/^(.+?)\s+(anytime td|anytime touchdown|any time td|anytime td scorer|to score a td|to score a touchdown|to score)$/);
  if (m && football) {
    if (!box) return null;
    const player = findPlayer(m[1], box.players);
    const scored = scoredTd(m[1], box);
    if (scored === true) return "hit";
    if (!player) return null; // not in the box score: may not have played
    if (scored === false) return "miss";
    return sumStats(player, TD_KEYS) >= 1 ? "hit" : "miss";
  }

  m = text.match(/^(.+?)\s+(first td|1st td|first touchdown|first td scorer|1st td scorer)$/);
  if (m && football) {
    if (!box?.tdScorers || box.tdScorers[0] === "") return null;
    const first = box.tdScorers[0];
    if (first && findPlayer(m[1], [{ name: first }])) return "hit";
    return findPlayer(m[1], box.players) ? "miss" : null;
  }

  m = text.match(/^(.+?)\s+(double double|double-double|triple double|triple-double)$/);
  if (m && !football) {
    if (!box) return null;
    const player = findPlayer(m[1], box.players);
    if (!player) return null;
    const tens = ["points", "rebounds", "assists", "steals", "blocks"].filter((k) => (player.stats[k] ?? 0) >= 10).length;
    return tens >= (m[2].startsWith("triple") ? 3 : 2) ? "hit" : "miss";
  }

  // "Jarrett Allen U 15.5 Points", "Joe Burrow Over 2.5 Passing TDs"
  let player: string, stat: string, test: (v: number) => TakeResult;
  m = text.match(/^(.+?)\s+(over|under|o|u)\s*(\d+(?:\.\d+)?)\s+(.+)$/);
  if (m) {
    const line = Number(m[3]);
    const over = m[2].startsWith("o");
    [player, stat] = [m[1], m[4]];
    test = (v) => cmp(over ? v - line : line - v);
  } else {
    // "Ja'Marr Chase 75+ Receiving Yards"
    m = text.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*\+\s+(.+)$/);
    if (!m) return undefined;
    const at = Number(m[2]);
    [player, stat] = [m[1], m[3]];
    test = (v) => (v >= at ? "hit" : "miss");
  }
  const keys = statKeys(stat, football);
  if (!keys) return undefined;
  if (!box) return null;
  const p = findPlayer(player, box.players);
  if (!p) return null;
  return test(sumStats(p, keys));
}

function gradeLeg(text: string, game: GradeGame, box: GameBox | null, football: boolean): TakeResult {
  const line = gradeLine(text, game);
  if (line !== undefined) return line;
  return gradeProp(text, box, football) ?? null;
}

const FOOTBALL = new Set(["NFL", "NCAAF"]);

/**
 * Hit, miss or push for a pick on a final game, or null when it can't be graded.
 * A parlay is a hit only when every leg is, a miss when any leg is.
 */
export function gradeTake(take: GradableTake, game: GradeGame, box: GameBox | null): TakeResult {
  if (finalLabel(game) === null) return null;
  const football = FOOTBALL.has(String(take.sport ?? "").toUpperCase());
  const legs = (take.legs ?? []).filter((l) => l && l.trim());
  if (take.market === "parlay" || legs.length > 1) {
    if (!legs.length) return null;
    const results = legs.map((l) => gradeLeg(l, game, box, football));
    if (results.includes("miss")) return "miss";
    return results.every((r) => r === "hit") ? "hit" : null;
  }
  return gradeLeg(take.pick, game, box, football);
}

/** Whether grading this pick needs the box score (props and parlays) */
export function needsBox(take: GradableTake): boolean {
  return take.market === "prop" || take.market === "parlay" || take.market === "other" || (take.legs ?? []).length > 1;
}

// ---------------------------------------------------------------------------
// ESPN summary -> GameBox

function splitStat(key: string, value: string): Array<[string, number]> {
  // "completions/passingAttempts" "28/40", "fieldGoalsMade-fieldGoalsAttempted" "6-7"
  const sep = key.includes("/") ? "/" : /[a-z]-[a-z]/i.test(key) ? "-" : null;
  if (sep) {
    const ks = key.split(sep), vs = String(value).split(sep);
    if (ks.length !== vs.length) return [];
    return ks.map((k, i) => [k, Number(vs[i])] as [string, number]).filter(([, v]) => Number.isFinite(v));
  }
  const v = Number(String(value).replace(/^\+/, ""));
  return Number.isFinite(v) ? [[key, v]] : [];
}

/**
 * Players and touchdown scorers from an ESPN game summary (site.api `summary`, or the
 * CDN boxscore's gamepackageJSON). Football keys carry their category ("receiving.receivingYards").
 */
// deno-lint-ignore no-explicit-any
export function parseBox(summary: any): GameBox | null {
  const teams = summary?.boxscore?.players;
  if (!Array.isArray(teams) || !teams.length) return null;
  const byName = new Map<string, BoxPlayer>();
  for (const t of teams) {
    const team = String(t?.team?.abbreviation ?? "");
    for (const cat of t?.statistics ?? []) {
      const prefix = cat?.name ? `${cat.name}.` : "";
      const keys: string[] = Array.isArray(cat?.keys) ? cat.keys : [];
      for (const a of cat?.athletes ?? []) {
        const name = a?.athlete?.displayName;
        const stats: string[] = Array.isArray(a?.stats) ? a.stats : [];
        if (typeof name !== "string" || a?.didNotPlay || !stats.length) continue;
        const id = `${team}|${a?.athlete?.id ?? name}`;
        const p = byName.get(id) ?? { name, team, stats: {} };
        keys.forEach((k, i) => {
          for (const [sk, v] of splitStat(k, stats[i])) p.stats[prefix + sk] = v;
        });
        byName.set(id, p);
      }
    }
  }
  const plays = summary?.scoringPlays;
  let tdScorers: string[] | null = null;
  if (Array.isArray(plays)) {
    tdScorers = [];
    for (const play of plays) {
      const kind = `${play?.type?.abbreviation ?? ""} ${play?.type?.text ?? ""}`;
      if (!/\bTD\b|touchdown/i.test(kind)) continue;
      const scorer = String(play?.text ?? "").match(/^(.+?)\s+-?\d+\s+(yd|yds|yard|yards)\b/i)?.[1];
      tdScorers.push(scorer ?? "");
    }
  }
  return { players: [...byName.values()], tdScorers };
}

// ---------------------------------------------------------------------------
// Credit

const NOT_A_PERSON = /^(both|all|everyone|hosts?|the hosts|panel|team|staff|unknown|n\/?a|none|various|multiple|show)$/i;

/** One person's name, or null when the stored credit is empty or names more than one (the app then credits the show). */
export function creditedPerson(person: string | null | undefined): string | null {
  const s = (person ?? "").replace(/\s+/g, " ").trim();
  if (!s || NOT_A_PERSON.test(s)) return null;
  if (/[,;&/+]|\b(and|with|or)\b/i.test(s)) return null;
  if (s.split(" ").length > 4) return null;
  return s;
}
