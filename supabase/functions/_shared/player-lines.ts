// Player lines (D-105, D-106): the pure part of the judge step. The engine
// (scripts/angles/player_angles.py) sends each game's verified candidates; the judge
// (player-judge.ts) picks one and may reword it. This module checks the judge's sentence
// against the candidate (every number, the player, the stat, the side, every proper noun),
// falls back to the engine's draft when it doesn't hold, and builds the rows to store.
// No I/O here, so it's tested with vitest (src/test/playerLines.test.ts).

export interface Candidate {
  id: string;
  player_name: string;
  short_name: string;
  espn_athlete_id: string;
  team: string;
  market: string;
  market_short: string;
  stat: string;
  stat_terms?: string[];
  line: number;
  side: "over" | "under";
  price: string | null;
  hits: number;
  games: number;
  record: string;
  sentence: string;
  window: string;
  conditions: string[];
  family: string;
  angle_type: string;
  ticker: string | null;
  tier: "strong" | "fallback";
  score?: number;
  stale?: boolean;
  /** D-119: the round number a milestone line names ("30 or more Pts"), above `line`, which stays the prop's number */
  milestone?: number | null;
}

export interface GamePayload {
  espn_event_id: string;
  sport: "NFL" | "NBA";
  starts_at: string;
  matchup?: string;
  context?: Record<string, unknown>;
  candidates?: Candidate[];
}

export interface JudgeChoice {
  candidate_id: string;
  sentence: string;
  show_ticker: boolean;
  reason: string;
}

export interface StoredLine {
  sport: string;
  starts_at: string;
  player_name: string;
  short_name: string;
  espn_athlete_id: string;
  team: string;
  market: string;
  market_short: string;
  line: number;
  side: "over" | "under";
  price: string | null;
  text: string;
  hits: number;
  games: number;
  record: string;
  tier: "strong" | "fallback";
  rank: number;
  ticker: string | null;
  family: string;
  angle_type: string;
  chosen_by: "judge" | "engine";
}

// Built from code points so the repo's no-dash guard stays clean
const DASHES = new RegExp(`[${String.fromCharCode(0x2012, 0x2013, 0x2014, 0x2015, 0x2212)}]`);
export const PICK_WORDS = /\b(bet|bets|betting|lock|locks|pick|picks|take|should|hammer|smash|fade|tail|play|value|edge|guarantee\w*)\b/i;
const OVER_WORDS = ["over", "cleared", "topped", "more than"];
const UNDER_WORDS = ["under", "held", "without", "fewer", "not "];

/** 263.5 -> "263.5", 4 -> "4" (the way the engine writes numbers). */
export function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

const count = (s: string, w: string) => s.toLowerCase().split(w.toLowerCase()).length - 1;
const numbers = (s: string) => s.match(/\d+(?:\.\d+)?/g) ?? [];
const properNouns = (s: string) => (s.match(/\b[A-Z][A-Za-z.'+]*/g) ?? []);

/** The run of the sentence the app bolds: "5 of his last 6", "16 straight", "all 5", "9 of his 11". */
export function recordRun(sentence: string, hits: number, games: number): string | null {
  const patterns = [
    new RegExp(`\\b${hits} of his last ${games}\\b`), new RegExp(`\\b${hits} of his ${games}\\b`),
    new RegExp(`\\b${hits} of (?:the )?last ${games}\\b`), new RegExp(`\\b${hits} of ${games}\\b`),
    ...(hits === games ? [new RegExp(`\\b${games} straight\\b`), new RegExp(`\\ball ${games}\\b`), new RegExp(`\\beach of his last ${games}\\b`)] : []),
  ];
  for (const p of patterns) {
    const m = sentence.match(p);
    if (m) return m[0];
  }
  return null;
}

// D-119: the words after the record say which games it covers ("since moving into the starting lineup", "home",
// "after a win", "prime-time"). Dropping one would claim a different sample, so each lowercase word of four or more
// letters there has to survive a rewording. "vs" and "against" are interchangeable (the rubric says so).
const SWAPPABLE = new Set(["against", "games", "game"]);

/** The condition words a rewording must keep: "since moving into the starting lineup" -> since, moving, into, starting, lineup. */
export function conditionWords(c: Candidate): string[] {
  const at = c.sentence.indexOf(c.record);
  const tail = at < 0 ? "" : c.sentence.slice(at + c.record.length);
  return [...new Set((tail.match(/\b[a-z][a-z-]{3,}\b/g) ?? []).filter((w) => !SWAPPABLE.has(w)))];
}

/** Why the judge's sentence can't be used for this candidate, or null when it holds. */
export function checkSentence(c: Candidate, raw: string): string | null {
  const s = raw.trim().replace(/\.+$/, "");
  if (!s) return "empty";
  if (DASHES.test(s)) return "dash";
  if (PICK_WORDS.test(s)) return "pick words";
  if (!s.includes(c.player_name)) return "player name missing";
  // D-117: the owner's sentence shape in every sport. Name first (no "Since 2021, ...", no "Teams facing ..."),
  // no percentages, no points a game against a line, no two splits in one sentence
  if (!s.startsWith(c.player_name)) return "player name not first";
  if (/\d%|percent/i.test(s)) return "percentage";
  if (/points? (?:a|per) game/i.test(s)) return "points a game";
  if (/\bat home\b.*\bon the road\b|\bon the road\b.*\bat home\b/i.test(s)) return "two splits";
  const terms = c.stat_terms?.length ? c.stat_terms : [c.stat];
  if (!terms.some((t) => s.toLowerCase().includes(t.toLowerCase()))) return "stat name missing";
  const allowed = new Set(numbers(c.sentence));
  const got = numbers(s);
  for (const n of got) if (!allowed.has(n)) return `number ${n} not in the candidate`;
  const need = [String(c.games), String(c.hits)];
  if (c.sentence.includes(fmtNum(c.line))) need.push(fmtNum(c.line));
  for (const n of need) if (!got.includes(n)) return `number ${n} missing`;
  // the side can't flip: no over words the draft didn't have on an under line, and the reverse
  for (const w of c.side === "over" ? UNDER_WORDS : OVER_WORDS) {
    if (count(s, w) > count(c.sentence, w)) return `side word "${w.trim()}"`;
  }
  for (const w of properNouns(c.sentence)) {
    if (!s.includes(w)) return `dropped "${w}"`;
  }
  const lower = s.toLowerCase();
  for (const w of conditionWords(c)) {
    if (!lower.includes(w)) return `dropped "${w}"`;
  }
  // a milestone ("has scored 30 or more Pts") can't lose its "or more": "scored 30 Pts" would say exactly 30
  const head = c.sentence.slice(0, Math.max(0, c.sentence.indexOf(c.record)));
  if (/\bor more\b/.test(head) && !/\bor more\b|\bat least\b/.test(s)) return 'dropped "or more"';
  // the record keeps its exact form: "5 straight" can't become "all 5 of his" (that claims a whole career,
  // and the data starts in 2018)
  if (!s.includes(c.record) || !recordRun(s, c.hits, c.games)) return "record changed";
  if (s.length > c.sentence.length + 40) return "too long";
  return null;
}

/** The line to show: the judge's sentence when it holds, else the engine's draft. */
export function finalLine(c: Candidate, choice: JudgeChoice | null): { text: string; record: string; ticker: string | null; by: "judge" | "engine"; why: string | null } {
  const why = choice ? checkSentence(c, choice.sentence) : "no judge";
  const useJudge = choice !== null && why === null;
  const text = useJudge ? choice!.sentence.trim().replace(/\.+$/, "") : c.sentence;
  const record = (useJudge ? recordRun(text, c.hits, c.games) : null) ?? c.record;
  // a class of opponents ("vs Top-10 run defenses") always carries tonight's opponent's rank
  const ticker = c.ticker && (c.family === "defense" || (choice?.show_ticker ?? false)) ? c.ticker : null;
  return { text, record, ticker, by: useJudge ? "judge" : "engine", why };
}

/**
 * The candidates the judge sees for one game: an angle type already shown on two other games is left out
 * (owner, Nov 24: "don't make every stat the same across the slate"), unless that leaves fewer than 3.
 */
export function forJudge(candidates: Candidate[], used: Record<string, number>): Candidate[] {
  const fresh = candidates.filter((c) => (used[c.angle_type] ?? 0) < 2);
  return fresh.length >= 3 ? fresh : candidates;
}

/** Rows to store for a game: the chosen line as rank 1, then the engine's next best (other players) as 2 and 3. */
export function buildRows(g: GamePayload, chosen: Candidate | null, line: ReturnType<typeof finalLine> | null): StoredLine[] {
  const cands = g.candidates ?? [];
  const order = chosen ? [chosen, ...cands.filter((c) => c.player_name !== chosen.player_name)] : cands;
  const rows: StoredLine[] = [];
  const players = new Set<string>();
  for (const c of order) {
    if (rows.length >= 3 || players.has(c.player_name)) continue;
    players.add(c.player_name);
    const first = rows.length === 0 && chosen && line;
    rows.push({
      sport: g.sport, starts_at: g.starts_at, player_name: c.player_name, short_name: c.short_name,
      espn_athlete_id: c.espn_athlete_id, team: c.team, market: c.market, market_short: c.market_short, line: c.line,
      side: c.side, price: c.price, text: first ? line!.text : c.sentence, hits: c.hits, games: c.games,
      record: first ? line!.record : c.record, tier: c.tier, rank: rows.length + 1,
      ticker: first ? line!.ticker : (c.family === "defense" ? c.ticker : null), family: c.family, angle_type: c.angle_type,
      chosen_by: first ? line!.by : "engine",
    });
  }
  return rows;
}
