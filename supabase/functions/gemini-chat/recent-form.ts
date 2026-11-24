// Recent form for the Analyst: "last 5 games", "this season", "lately".
// Finds the player (or team) a question names, gives MGP's newest game logs
// (or scores), and lists every game that kicked off after the newest one MGP
// has, by date, so a game that ended after the last sync gets searched and
// counted instead of silently dropped. Asked for Ja'Marr Chase's last 5 games
// right after Bengals at Commanders went final (Mon Nov 23 2026), the
// Analyst answered from logs that ended Nov 15 and left that game out.
// Pure apart from the Supabase reads (client passed in), so
// src/test/analystRecentForm.test.ts pins the rules.

import { isCalledOffStatus } from "../_shared/game-status.ts";

export const GAME_TABLES: Record<string, string> = {
  NFL: "games",
  NBA: "nba_games",
  MLB: "mlb_games",
  NCAAF: "ncaaf_games",
  NCAAB: "ncaab_games",
};

/** Sports with player game logs in MGP */
export const LOG_SPORTS = ["NFL", "NBA", "MLB"];

export const DEFAULT_GAMES = 5;
export const MAX_GAMES = 15;
const MAX_ENTITIES = 2;

// ============================================================
// QUESTION
// ============================================================
export interface RecentFormAsk {
  /** games wanted (last N), DEFAULT_GAMES when the question gives none */
  count: number;
  /** "this season", "season so far" */
  season: boolean;
}

const COUNT_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  couple: 2, "couple of": 2, few: 3,
};
const LAST_N_RE =
  /\b(?:last|past|previous|prior|recent)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|couple(?:\s+of)?|few)\s+(?:games?|starts?|outings?|weeks?|matchups?|contests?|appearances?)\b/i;
const LAST_ONE_RE =
  /\b(?:last|latest|most\s+recent|previous)\s+(?:game|start|outing|week|matchup|appearance)\b|\blast\s+night\b|\byesterday\b/i;
const SEASON_RE =
  /\b(?:this|current)\s+(?:season|year)\b|\bseason\s+(?:so\s+far|totals?|stats|averages?|long)\b|\bon\s+the\s+season\b/i;
const RECENT_RE = /\b(?:recent(?:ly)?|lately|game\s*logs?|form|trending|slump|hot\s+streak|cold\s+streak)\b/i;

/** What a recent-form question asks for, or null when it isn't one. */
export function recentFormAsk(message: string): RecentFormAsk | null {
  const n = LAST_N_RE.exec(message);
  if (n) {
    const raw = n[1].toLowerCase().replace(/\s+/g, " ");
    const v = /^\d+$/.test(raw) ? Number(raw) : (COUNT_WORDS[raw] ?? DEFAULT_GAMES);
    return { count: Math.min(Math.max(v, 1), MAX_GAMES), season: false };
  }
  if (LAST_ONE_RE.test(message)) return { count: 1, season: false };
  if (SEASON_RE.test(message)) return { count: DEFAULT_GAMES, season: true };
  if (RECENT_RE.test(message)) return { count: DEFAULT_GAMES, season: false };
  return null;
}

// ============================================================
// NAMES
// ============================================================
export interface PlayerRow {
  id: string;
  name: string;
  sport: string;
  team_name: string | null;
  team_abbr?: string | null;
  position?: string | null;
}

/** Lowercase ASCII words; apostrophes and periods dropped, hyphens dropped or spaced. */
function words(s: string, hyphen: "" | " "): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`.]/g, "")
    .replace(/-/g, hyphen)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "Ja'Marr Chase" -> ["jamarr chase"]; "Amon-Ra St. Brown" -> ["amonra st brown", "amon ra st brown"]; suffixes dropped. */
function nameForms(name: string): string[] {
  const forms = new Set<string>();
  for (const h of ["", " "] as const) {
    const w = words(name, h).replace(/\s+(jr|sr|ii|iii|iv|v)$/, "");
    if (w) forms.add(w);
  }
  return [...forms];
}

// Words that only narrow the players query (a name still matches on its full
// spelling in the question). Not a list of names: "will" and "chase" stay out
// so Will Levis and Chase Brown are still found through their other name.
const STOPWORDS = new Set(
  (
    "the and for has had have his her him how what whats when where which who why with was were are been being " +
    "did does doing done dont this that these those than then them they their there here from into over under " +
    "about after before since against versus last past previous prior recent recently lately latest most game " +
    "games start starts week weeks season seasons year years night yesterday today tonight form stats stat " +
    "statistics numbers line lines log logs show give tell pull get got look looking looked like play played " +
    "playing plays team teams points yards rec receiving rushing passing pass rush catches receptions targets " +
    "touchdowns tds rebounds assists threes hits runs homers average averages per can you your please could " +
    "would should just also any all some many much more less few couple one two three four five six seven " +
    "eight nine ten nfl nba mlb football basketball baseball odds spread total prop props bet bets betting " +
    "doing performed perform trending slump streak hot cold"
  ).split(" "),
);

/** Words of the question worth searching player names for (at most 10). */
export function nameSearchTokens(message: string): string[] {
  const out: string[] = [];
  for (const w of words(message, " ").split(" ")) {
    if (w.length < 3 || /^\d+$/.test(w) || STOPWORDS.has(w) || out.includes(w)) continue;
    out.push(w);
  }
  return out.slice(0, 10);
}

/**
 * The players the question names. A full name anywhere in the question
 * matches ("jamarr chase", "Ja'Marr Chase", "Marvin Harrison Jr."). Failing
 * that, a capitalized last name that belongs to exactly one candidate
 * ("How has Burrow looked lately?"). Ordered by the sports list, at most two.
 */
export function playersNamedIn(message: string, rows: PlayerRow[], sports: string[] = LOG_SPORTS): PlayerRow[] {
  const msgs = [words(message, ""), words(message, " ")].map((m) => ` ${m} `);
  let found = rows.filter((r) => nameForms(r.name).some((n) => msgs.some((m) => m.includes(` ${n} `))));

  if (!found.length) {
    const capitalized = new Set(
      (message.match(/\b[A-Z][A-Za-z'’.-]*/g) ?? [])
        .map((w) => words(w, ""))
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
    );
    const byLast = new Map<string, PlayerRow[]>();
    for (const r of rows) {
      const parts = (nameForms(r.name)[0] ?? "").split(" ");
      const last = parts[parts.length - 1];
      if (!last || !capitalized.has(last)) continue;
      byLast.set(last, [...(byLast.get(last) ?? []), r]);
    }
    found = [...byLast.values()].filter((list) => list.length === 1).map((list) => list[0]);
  }

  const seen = new Set<string>();
  const rank = (s: string) => {
    const i = sports.indexOf(s);
    return i === -1 ? sports.length : i;
  };
  return found
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => rank(a.sport) - rank(b.sport))
    .slice(0, MAX_ENTITIES);
}

// ============================================================
// DATES
// ============================================================
const ET_YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
});

/** Eastern calendar date, "2026-11-23" */
export function etYmd(when: string | number | Date): string {
  return ET_YMD.format(new Date(when));
}

/**
 * "2026-11-15" -> "Sun, Nov 15". Another calendar year, or more than about
 * six months back (last NBA season seen in November), adds the year:
 * "Sun, Apr 12 '26".
 */
export function dayLabel(ymd: string, now: Date): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const sameYear = ymd.slice(0, 4) === etYmd(now).slice(0, 4);
  const recent = now.getTime() - d.getTime() < 180 * 24 * 3600_000;
  return sameYear && recent ? label : `${label} '${ymd.slice(2, 4)}`;
}

/** "Mon, Nov 23, 8:15 PM ET" */
export function kickoffLabel(iso: string): string {
  return `${new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
  })} ET`;
}

/** The season a log row of this sport belongs to today (NFL seasons run into February). */
export function currentSeason(sport: string, now: Date): number {
  const [y, m] = etYmd(now).split("-").map(Number);
  if (sport === "NFL") return m <= 2 ? y - 1 : y;
  if (sport === "NBA") return m >= 10 ? y + 1 : y;
  return y;
}

// ============================================================
// FORMATTING
// ============================================================
export interface LogRow {
  game_date: string;
  season?: number | null;
  week?: number | null;
  opponent_abbr?: string | null;
  opponent_name?: string | null;
  home_away?: string | null;
  result?: string | null;
  team_score?: number | null;
  opponent_score?: number | null;
  [stat: string]: unknown;
}

export interface GameRow {
  date: string;
  status?: string | null;
  is_final?: boolean | null;
  home_team_name: string;
  visitor_team_name: string;
  home_score?: number | null;
  away_score?: number | null;
}

/** "Cincinnati Bengals'" / "Orlando Magic's" */
const possessive = (team: string): string => (team.endsWith("s") ? `${team}'` : `${team}'s`);

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

function sumLogs(logs: LogRow[]): LogRow {
  const total: LogRow = { game_date: "" };
  for (const l of logs) {
    for (const [k, v] of Object.entries(l)) {
      if (typeof v === "number") total[k] = num(total[k]) + v;
    }
  }
  return total;
}

function nflGroups(l: LogRow, position: string | null | undefined): string[] {
  const pass = num(l.pass_attempts) > 0
    ? `${num(l.pass_completions)}/${num(l.pass_attempts)}, ${num(l.pass_yards)} pass yds, ${num(l.pass_td)} pass TD, ${num(l.pass_int)} INT`
    : "";
  const rush = num(l.rush_attempts) > 0 || num(l.rush_yards) !== 0
    ? `${num(l.rush_attempts)} rush, ${num(l.rush_yards)} rush yds, ${num(l.rush_td)} rush TD`
    : "";
  const rec = num(l.targets) > 0 || num(l.receptions) > 0
    ? `${num(l.receptions)} rec (${num(l.targets)} tgt), ${num(l.rec_yards)} rec yds, ${num(l.rec_td)} rec TD`
    : "";
  const pos = (position ?? "").toLowerCase();
  const order = /quarterback|^qb$/.test(pos)
    ? [pass, rush, rec]
    : /running back|^rb$|fullback|^fb$/.test(pos) ? [rush, rec, pass] : [rec, rush, pass];
  return order.filter(Boolean);
}

function nbaLine(l: LogRow): string {
  if (num(l.minutes) === 0) return "0 min (DNP)";
  return `${num(l.points)} pts, ${num(l.rebounds)} reb, ${num(l.assists)} ast, ${num(l.three_made)}/${num(l.three_attempted)} 3PT, ${num(l.fg_made)}/${num(l.fg_attempted)} FG, ${num(l.minutes)} min`;
}

function mlbLine(l: LogRow): string {
  const parts = [`${num(l.hits)} for ${num(l.at_bats)}`];
  if (num(l.doubles)) parts.push(`${num(l.doubles)} 2B`);
  if (num(l.triples)) parts.push(`${num(l.triples)} 3B`);
  parts.push(`${num(l.home_runs)} HR`, `${num(l.rbi)} RBI`, `${num(l.walks)} BB`, `${num(l.strikeouts)} K`);
  if (num(l.stolen_bases)) parts.push(`${num(l.stolen_bases)} SB`);
  return parts.join(", ");
}

/** One game's line in the sport's sportsbook terms. */
export function statLine(sport: string, l: LogRow, position?: string | null): string {
  if (sport === "NBA") return nbaLine(l);
  if (sport === "MLB") return mlbLine(l);
  const groups = nflGroups(l, position);
  return groups.length ? groups.join("; ") : "no offensive stats recorded";
}

/** Totals (NFL, MLB) or per-game averages (NBA, played games only) over these logs. */
export function totalsLine(sport: string, logs: LogRow[], position?: string | null): string {
  if (logs.length < 2) return "";
  if (sport === "NBA") {
    const played = logs.filter((l) => num(l.minutes) > 0);
    if (!played.length) return "";
    const t = sumLogs(played);
    const avg = (k: string) => (num(t[k]) / played.length).toFixed(1);
    const dnp = logs.length - played.length;
    return `Averages, these ${played.length} games played${dnp ? ` (${dnp} DNP left out)` : ""}: ${avg("points")} pts, ${avg("rebounds")} reb, ${avg("assists")} ast, ${avg("minutes")} min`;
  }
  return `Totals, these ${logs.length} games: ${statLine(sport, sumLogs(logs), position)}`;
}

function logRow(sport: string, l: LogRow, position: string | null | undefined, now: Date): string {
  const wk = sport === "NFL" && l.week != null ? ` (Wk ${l.week})` : "";
  const opp = l.opponent_abbr || l.opponent_name;
  const where = opp ? ` ${l.home_away === "away" ? "at" : "vs"} ${opp}` : "";
  const score = l.result && l.team_score != null && l.opponent_score != null
    ? `, ${l.result} ${l.team_score}-${l.opponent_score}`
    : l.result ? `, ${l.result}` : "";
  return `• ${dayLabel(l.game_date, now)}${wk}${where}${score}: ${statLine(sport, l, position)}`;
}

function gapRow(g: GameRow, forPlayer: boolean): string {
  const status = g.is_final
    ? g.home_score != null && g.away_score != null
      ? `final in MGP scores, ${g.visitor_team_name} ${g.away_score}, ${g.home_team_name} ${g.home_score}${forPlayer ? "; his stats for it aren't in the logs yet" : ""}`
      : `final${forPlayer ? "; his stats for it aren't in the logs yet" : ""}`
    : "kicked off; no final in MGP data yet";
  return `• ${kickoffLabel(g.date)}: ${g.visitor_team_name} at ${g.home_team_name} (${status})`;
}

/** The team's games after the newest logged game day: kicked off, not called off, newest last. */
export function gamesAfter(games: GameRow[], afterYmd: string | null, now: Date): GameRow[] {
  return games
    .filter((g) => new Date(g.date).getTime() < now.getTime())
    .filter((g) => !isCalledOffStatus(g.status))
    .filter((g) => afterYmd == null || etYmd(g.date) > afterYmd)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/** The [MGP DATA] block for one player. logs newest first; schedule = the team's kicked-off games. */
export function playerFormBlock(
  p: PlayerRow,
  logs: LogRow[],
  schedule: GameRow[],
  ask: RecentFormAsk,
  now: Date,
): string {
  const team = p.team_name ?? "his team";
  const latest = logs[0]?.game_date ?? null;
  const gapAll = gamesAfter(schedule, latest, now);
  const shown = gapAll.slice(-Math.max(ask.count, 1));
  const scope = ask.season && p.sport === "NFL" ? "this season" : `newest ${logs.length}`;
  const pos = p.position ? `, ${p.position}` : "";

  const out: string[] = [];
  if (logs.length) {
    out.push(`📒 ${p.name} (${team}${pos}), MGP game logs, ${scope}, newest first:`);
    for (const l of logs) out.push(logRow(p.sport, l, p.position, now));
    const totals = totalsLine(p.sport, logs, p.position);
    if (totals) out.push(totals);
  } else {
    out.push(`📒 ${p.name} (${team}${pos}): MGP has no game logs for him${ask.season ? " this season" : ""}.`);
  }

  const today = dayLabel(etYmd(now), now);
  const n = ask.count;
  const counting = n === 1
    ? "it is his most recent game"
    : `a "last ${n}" answer is then his ${n} most recent completed games, this one included`;
  // A healthy schedule read holds at least the newest logged game, so an
  // empty one is a failed read, never proof the logs are current.
  if (!schedule.length) {
    out.push(
      latest
        ? `FRESHNESS: today is ${today}. These logs run through ${dayLabel(latest, now)}. The ${possessive(team)} schedule since then couldn't be checked: if they could have played after that date, web search ${p.name}'s newest games before answering and say which games your answer covers.`
        : `FRESHNESS: today is ${today}. Web search ${p.name}'s recent game log before answering and say which games your answer covers.`,
    );
    return out.join("\n");
  }
  if (!gapAll.length) {
    if (latest) {
      out.push(`FRESHNESS: today is ${today}. These logs run through ${dayLabel(latest, now)}, and the ${team} have not played since then (per the schedule), so they are current.`);
    }
    return out.join("\n");
  }

  out.push(
    latest
      ? `FRESHNESS: today is ${today}. These logs run through ${dayLabel(latest, now)}. ${team} games since then that the logs don't include yet${gapAll.length > shown.length ? ` (${gapAll.length} games; the newest ${shown.length})` : ""}:`
      : `FRESHNESS: today is ${today}. The ${possessive(team)} most recent games${gapAll.length > shown.length ? ` (the newest ${shown.length})` : ""}:`,
  );
  for (const g of shown) out.push(gapRow(g, true));
  out.push(
    `For each game just listed, web search the final and ${p.name}'s stat line. If it's final and he played, count it as his newest game, ahead of the logs (${counting}), name the source, and recompute any totals with it. If it's still in progress, he didn't play, or you can't confirm his line, say so in one short clause. Say which games your answer covers (dates and opponents).`,
  );
  return out.join("\n");
}

/** The [MGP DATA] block for one team: its newest finals and the games after them with no final yet. */
export function teamFormBlock(team: string, games: GameRow[], ask: RecentFormAsk, now: Date): string {
  const played = gamesAfter(games, null, now).reverse(); // newest first
  const finals = played.filter((g) => g.is_final);
  const newestFinal = finals[0] ?? null;
  const gap = played
    .filter((g) => !g.is_final)
    .filter((g) => !newestFinal || new Date(g.date).getTime() > new Date(newestFinal.date).getTime())
    .reverse();

  const out: string[] = [];
  const shownFinals = finals.slice(0, ask.count);
  if (shownFinals.length) {
    out.push(`📒 ${team}, MGP final scores, newest ${shownFinals.length}, newest first:`);
    for (const g of shownFinals) {
      const home = g.home_team_name === team;
      const ts = home ? g.home_score : g.away_score;
      const os = home ? g.away_score : g.home_score;
      const res = ts == null || os == null ? "final" : ts > os ? `W ${ts}-${os}` : ts < os ? `L ${ts}-${os}` : `T ${ts}-${os}`;
      out.push(`• ${dayLabel(etYmd(g.date), now)}: ${home ? "vs" : "at"} ${home ? g.visitor_team_name : g.home_team_name}, ${res}`);
    }
  } else {
    out.push(`📒 ${team}: no final scores in MGP data yet.`);
  }

  const today = dayLabel(etYmd(now), now);
  if (!gap.length) {
    if (newestFinal) out.push(`FRESHNESS: today is ${today}. The ${team} have not played since ${dayLabel(etYmd(newestFinal.date), now)} (per the schedule), so these are current.`);
    return out.join("\n");
  }
  out.push(`FRESHNESS: today is ${today}. ${team} games that kicked off after the newest final above, with no final in MGP data yet:`);
  for (const g of gap) out.push(gapRow(g, false));
  out.push(
    `For each game just listed, web search the final score. If it's final, count it as the ${possessive(team)} newest result, ahead of the scores above, and name the source. If it's still in progress or you can't confirm it, say so in one short clause. Say which games your answer covers.`,
  );
  return out.join("\n");
}

// ============================================================
// READS
// ============================================================
const LOG_COLUMNS =
  "game_date, season, week, opponent_abbr, opponent_name, home_away, result, team_score, opponent_score, " +
  "pass_attempts, pass_completions, pass_yards, pass_td, pass_int, rush_attempts, rush_yards, rush_td, " +
  "targets, receptions, rec_yards, rec_td, points, rebounds, assists, minutes, fg_made, fg_attempted, " +
  "three_made, three_attempted, at_bats, hits, doubles, triples, home_runs, rbi, walks, strikeouts, stolen_bases";
const GAME_COLUMNS = "date, status, is_final, home_team_name, visitor_team_name, home_score, away_score";

// deno-lint-ignore no-explicit-any
type Db = any;

/** Active players whose names start a word with one of the question's words. */
async function playerCandidates(db: Db, message: string, sports: string[]): Promise<PlayerRow[]> {
  const tokens = nameSearchTokens(message);
  if (!tokens.length || !sports.length) return [];
  const or = tokens.flatMap((t) => [`name.ilike.${t}*`, `name.ilike.* ${t}*`]).join(",");
  const { data, error } = await db
    .from("players")
    .select("id, name, sport, team_name, team_abbr, position")
    .in("sport", sports)
    .eq("status", "active")
    .not("team_name", "is", null)
    .or(or)
    .limit(300);
  if (error) throw error;
  return (data ?? []) as PlayerRow[];
}

/** A team's games before now (optionally from a date on), newest first. Two reads, no or-filter on names. */
async function teamSchedule(db: Db, sport: string, team: string, now: Date, sinceIso: string | null, limit: number): Promise<GameRow[]> {
  const table = GAME_TABLES[sport];
  if (!table) return [];
  const side = (col: string) => {
    let q = db.from(table).select(GAME_COLUMNS).eq(col, team).lt("date", now.toISOString());
    if (sinceIso) q = q.gte("date", sinceIso);
    if (sport === "NFL") q = q.eq("league", "NFL");
    return q.order("date", { ascending: false }).limit(limit);
  };
  const [home, away] = await Promise.all([side("home_team_name"), side("visitor_team_name")]);
  if (home.error || away.error) throw home.error ?? away.error;
  return [...(home.data ?? []), ...(away.data ?? [])].sort(
    (a: GameRow, b: GameRow) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

async function playerBlock(db: Db, p: PlayerRow, ask: RecentFormAsk, now: Date): Promise<string> {
  const nflSeason = ask.season && p.sport === "NFL";
  const limit = nflSeason ? 25 : ask.season ? 10 : ask.count;
  const { data, error } = await db
    .from("player_game_logs")
    .select(LOG_COLUMNS)
    .eq("player_id", p.id)
    .order("game_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  let logs = (data ?? []) as LogRow[];
  if (nflSeason) logs = logs.filter((l) => l.season === currentSeason("NFL", now));
  const latest = logs[0]?.game_date ?? null;
  const schedule = p.team_name
    ? await teamSchedule(db, p.sport, p.team_name, now, latest ? `${latest}T00:00:00Z` : null, latest ? 40 : ask.count)
    : [];
  return playerFormBlock(p, logs, schedule, ask, now);
}

async function teamBlock(db: Db, sport: string, team: string, ask: RecentFormAsk, now: Date): Promise<string> {
  const games = await teamSchedule(db, sport, team, now, null, ask.count + 6);
  return teamFormBlock(team, games, ask, now);
}

/**
 * The RECENT FORM block for a recent-form question, or "" for any other
 * question. Players named in the question come first; with none, the teams
 * passed in (named teams of the detected league). A failed read for one
 * player or team leaves that one out.
 */
export async function recentFormBlock(
  db: Db,
  opts: { message: string; league: string | null; teams: string[]; now: Date },
): Promise<string> {
  const ask = recentFormAsk(opts.message);
  if (!ask) return "";
  const sports = opts.league ? LOG_SPORTS.filter((s) => s === opts.league) : LOG_SPORTS;
  const players = playersNamedIn(opts.message, await playerCandidates(db, opts.message, sports), sports);

  const settle = async (p: Promise<string>, what: string) => {
    try {
      return await p;
    } catch (e) {
      console.error(`Recent form unavailable for ${what}:`, e);
      return "";
    }
  };
  const blocks = players.length
    ? await Promise.all(players.map((p) => settle(playerBlock(db, p, ask, opts.now), p.name)))
    : opts.league && GAME_TABLES[opts.league]
      ? await Promise.all(opts.teams.slice(0, MAX_ENTITIES).map((t) => settle(teamBlock(db, opts.league!, t, ask, opts.now), t)))
      : [];
  const body = blocks.filter(Boolean).join("\n\n");
  return body
    ? `[MGP DATA: RECENT FORM]\n(Game logs and scores as MGP has them. The FRESHNESS lines list, by date, games that kicked off after the newest one MGP has.)\n${body}`
    : "";
}
