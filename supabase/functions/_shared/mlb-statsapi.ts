// MLB's public Stats API (statsapi.mlb.com): keyless, CORS-open, and unlike
// ESPN's site.api it does not block non-browser TLS clients. It is the official
// source for probable pitchers and for game-by-game hitting logs, so it backs
// up the ESPN scoreboard (sync-mlb-games), grounds hit streaks
// (sync-mlb-hitting), and feeds pitcher context to the slate, the hit streak
// table and the chat.
//
// Pure helpers only: global fetch, no runtime-specific imports. The same file
// serves Deno edge functions and the Vite frontend, which imports it directly
// (src/services/mlb/probablePitchers.ts), so the two can never disagree.

export const MLB_STATSAPI = "https://statsapi.mlb.com/api/v1";

// ---------------------------------------------------------------------------
// Dates and names
// ---------------------------------------------------------------------------

const ET_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Calendar day (YYYY-MM-DD) of an instant in US Eastern time. That is the
 * "scoreboard day" both MLB and ESPN file games under: a 7:10pm PT first pitch
 * is 02:10 UTC the next day but still belongs to today's slate.
 */
export function etDate(when: string | number | Date): string {
  const parts = ET_PARTS.formatToParts(new Date(when));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "2026-09-24" -> "20260924" (ESPN's dates= format). */
export const compactDate = (isoDate: string): string => isoDate.replace(/-/g, "");

/** Shift a YYYY-MM-DD calendar date by whole days. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Team-name key, accent, case and punctuation insensitive. ESPN and MLB spell all 30 teams alike. */
export function teamKey(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/** GET JSON from statsapi with a couple of retries on 5xx/429/network errors. */
export async function statsapiJson<T = unknown>(url: string, attempts = 3): Promise<T> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.ok) return (await res.json()) as T;
      lastErr = new Error(`statsapi ${res.status} for ${url}`);
      if (res.status < 500 && res.status !== 429) break; // a 4xx will not improve on retry
    } catch (err) {
      lastErr = err;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 300 * 3 ** i));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ---------------------------------------------------------------------------
// Schedule (games, scores, probable pitchers)
// ---------------------------------------------------------------------------

export interface ProbableRef {
  id: number;
  name: string;
}

export interface MlbTeamSide {
  id: number | null;
  name: string;
  score: number | null;
  probable: ProbableRef | null;
}

export interface MlbScheduleGame {
  gamePk: number;
  /** First pitch, UTC ISO. */
  gameDate: string;
  /** YYYY-MM-DD official game date (Eastern). */
  officialDate: string;
  /**
   * The schedule day the game is listed under. Usually officialDate, but a
   * postponed game's placeholder stays on its ORIGINAL day while carrying the
   * makeup's officialDate; keying on officialDate would pair it with the
   * makeup doubleheader and shift both games by one. Match games on this.
   */
  scheduleDay: string;
  /** Postponed or cancelled placeholder: no game is played on scheduleDay. */
  isPlaceholder: boolean;
  /** MLB has not set a first pitch; gameDate is then a placeholder, not a time. */
  startTimeTBD: boolean;
  gameNumber: number;
  gameType: string;
  detailedState: string;
  state: "pre" | "in" | "post";
  /** ESPN-style status, the vocabulary mlb_games already stores (src/lib/gameStatus.ts). */
  status: string;
  isFinal: boolean;
  venue: string | null;
  weather: string | null;
  away: MlbTeamSide;
  home: MlbTeamSide;
}

export function scheduleUrl(startDate: string, endDate: string, hydrate = "probablePitcher"): string {
  return `${MLB_STATSAPI}/schedule?sportId=1&startDate=${startDate}&endDate=${endDate}&hydrate=${hydrate}`;
}

/** Map statsapi's game state onto the ESPN status strings mlb_games uses. */
export function espnStyleStatus(
  abstractState: string | undefined,
  detailedState: string | undefined,
): { status: string; isFinal: boolean; state: "pre" | "in" | "post" } {
  const d = (detailedState ?? "").toLowerCase();
  // Postponed and cancelled games report abstractGameState "Final" too, but
  // they have no result, so they must never read as a final score.
  if (d.includes("postponed")) return { status: "STATUS_POSTPONED", isFinal: false, state: "post" };
  if (d.includes("cancel")) return { status: "STATUS_CANCELED", isFinal: false, state: "post" };
  if (d.includes("suspended")) return { status: "STATUS_SUSPENDED", isFinal: false, state: "post" };
  if (abstractState === "Final") return { status: "STATUS_FINAL", isFinal: true, state: "post" };
  if (abstractState === "Live") return { status: "STATUS_IN_PROGRESS", isFinal: false, state: "in" };
  return { status: "STATUS_SCHEDULED", isFinal: false, state: "pre" };
}

type Json = Record<string, any>;

function side(raw: Json | undefined): MlbTeamSide {
  const probable = raw?.probablePitcher;
  const score = raw?.score;
  return {
    id: typeof raw?.team?.id === "number" ? raw.team.id : null,
    name: String(raw?.team?.name ?? "TBD"),
    score: typeof score === "number" ? score : null,
    probable:
      probable && typeof probable.id === "number" && probable.fullName
        ? { id: probable.id, name: String(probable.fullName) }
        : null,
  };
}

export function parseSchedule(json: unknown): MlbScheduleGame[] {
  const out: MlbScheduleGame[] = [];
  for (const day of (json as Json)?.dates ?? []) {
    for (const g of day?.games ?? []) {
      if (typeof g?.gamePk !== "number" || !g.gameDate) continue;
      const st = espnStyleStatus(g.status?.abstractGameState, g.status?.detailedState);
      const wx = g.weather;
      const weather = wx?.condition
        ? `${wx.condition}${wx.temp ? `, ${wx.temp}°F` : ""}`
        : null;
      const officialDate = String(g.officialDate ?? day.date ?? etDate(g.gameDate));
      out.push({
        gamePk: g.gamePk,
        gameDate: String(g.gameDate),
        officialDate,
        scheduleDay: String(day.date ?? officialDate),
        isPlaceholder: st.status === "STATUS_POSTPONED" || st.status === "STATUS_CANCELED",
        startTimeTBD: g.status?.startTimeTBD === true,
        gameNumber: Number(g.gameNumber) || 1,
        gameType: String(g.gameType ?? "R"),
        detailedState: String(g.status?.detailedState ?? ""),
        state: st.state,
        status: st.status,
        isFinal: st.isFinal,
        venue: g.venue?.name ? String(g.venue.name) : null,
        weather,
        away: side(g.teams?.away),
        home: side(g.teams?.home),
      });
    }
  }
  return out;
}

/** Key a game by scoreboard day and matchup. Doubleheaders share a key; pair them by start order. */
export function matchupKey(day: string, away: string, home: string): string {
  return `${day}|${teamKey(away)}|${teamKey(home)}`;
}

// ---------------------------------------------------------------------------
// Pitcher lines (season + last three starts)
// ---------------------------------------------------------------------------

export interface PitcherStart {
  date: string;
  opponent: string | null;
  isHome: boolean | null;
  ip: string;
  outs: number;
  earnedRuns: number;
  strikeouts: number;
  walks: number;
  hits: number;
  decision: "W" | "L" | null;
}

export interface PitcherSeason {
  wins: number;
  losses: number;
  era: number | null;
  whip: number | null;
  strikeouts: number;
  walks: number;
  inningsPitched: string;
  gamesStarted: number;
  games: number;
}

export interface PitcherLine {
  id: number;
  name: string;
  /** Throwing hand, "R" or "L". */
  hand: string | null;
  season: PitcherSeason | null;
  /** Aggregate of the last three STARTS (relief outings excluded). */
  last3: {
    starts: PitcherStart[];
    ip: string;
    era: number | null;
    whip: number | null;
    strikeouts: number;
    walks: number;
  } | null;
  /**
   * True when MLB has not announced this starter and the name is ESPN's
   * projection (from mlb_games), resolved to a statsapi player by name and
   * team. Every surface labels these "Projected".
   */
  projected?: boolean;
}

// Only what parsePitcherLines reads. Untrimmed, a five-day window of probables
// (about 90 pitchers with full game logs) is 3.7 MB of JSON; trimmed, 0.8 MB.
// "team" stays so a traded pitcher's combined season split (the one WITHOUT a
// team) can still be told apart from his per-team splits.
const PITCHER_FIELDS = [
  "people", "id", "fullName", "pitchHand", "code", "stats", "type", "displayName", "splits", "team", "name",
  "date", "isHome", "opponent", "game", "gamePk", "gameNumber", "stat", "gamesStarted", "gamesPlayed",
  "gamesPitched", "inningsPitched", "outs", "earnedRuns", "strikeOuts", "baseOnBalls", "hits", "wins",
  "losses", "era", "whip",
].join(",");

export function pitcherStatsUrl(ids: number[], season: number): string {
  return `${MLB_STATSAPI}/people?personIds=${ids.join(",")}&hydrate=stats(group=[pitching],type=[season,gameLog],season=${season},gameType=R)&fields=${PITCHER_FIELDS}`;
}

const n0 = (v: unknown): number => {
  const x = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(x) ? x : 0;
};
const nOrNull = (v: unknown): number | null => {
  const x = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(x) ? x : null;
};

/** "5.1" innings -> 16 outs. */
export function ipToOuts(ip: unknown): number {
  const s = String(ip ?? "0");
  const [whole, frac] = s.split(".");
  return (parseInt(whole, 10) || 0) * 3 + (parseInt(frac ?? "0", 10) || 0);
}

/** 16 outs -> "5.1". */
export function outsToIp(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

function pickSeasonSplit(splits: Json[]): Json | null {
  if (!splits?.length) return null;
  if (splits.length === 1) return splits[0];
  // Traded pitchers get one split per team plus a combined one with no team.
  return splits.find((s) => !s.team) ?? splits[splits.length - 1];
}

export function parsePitcherLines(json: unknown): Map<number, PitcherLine> {
  const out = new Map<number, PitcherLine>();
  for (const p of (json as Json)?.people ?? []) {
    if (typeof p?.id !== "number") continue;
    const stats: Json[] = p.stats ?? [];
    const seasonBlock = stats.find((s) => s?.type?.displayName === "season");
    const logBlock = stats.find((s) => s?.type?.displayName === "gameLog");

    const ss = pickSeasonSplit(seasonBlock?.splits ?? [])?.stat;
    const season: PitcherSeason | null = ss
      ? {
          wins: n0(ss.wins),
          losses: n0(ss.losses),
          era: nOrNull(ss.era),
          whip: nOrNull(ss.whip),
          strikeouts: n0(ss.strikeOuts),
          walks: n0(ss.baseOnBalls),
          inningsPitched: String(ss.inningsPitched ?? "0.0"),
          gamesStarted: n0(ss.gamesStarted),
          games: n0(ss.gamesPlayed ?? ss.gamesPitched),
        }
      : null;

    const starts = ((logBlock?.splits ?? []) as Json[])
      .filter((sp) => n0(sp?.stat?.gamesStarted) >= 1)
      .sort((a, b) =>
        a.date === b.date ? n0(a.game?.gameNumber) - n0(b.game?.gameNumber) : a.date < b.date ? -1 : 1,
      )
      .slice(-3)
      .map((sp): PitcherStart => {
        const st = sp.stat ?? {};
        const outs = st.outs !== undefined ? n0(st.outs) : ipToOuts(st.inningsPitched);
        return {
          date: String(sp.date),
          opponent: sp.opponent?.name ? String(sp.opponent.name) : null,
          isHome: typeof sp.isHome === "boolean" ? sp.isHome : null,
          ip: outsToIp(outs),
          outs,
          earnedRuns: n0(st.earnedRuns),
          strikeouts: n0(st.strikeOuts),
          walks: n0(st.baseOnBalls),
          hits: n0(st.hits),
          decision: n0(st.wins) > 0 ? "W" : n0(st.losses) > 0 ? "L" : null,
        };
      });

    let last3: PitcherLine["last3"] = null;
    if (starts.length) {
      const outs = starts.reduce((a, s) => a + s.outs, 0);
      const er = starts.reduce((a, s) => a + s.earnedRuns, 0);
      const h = starts.reduce((a, s) => a + s.hits, 0);
      const bb = starts.reduce((a, s) => a + s.walks, 0);
      last3 = {
        starts,
        ip: outsToIp(outs),
        era: outs > 0 ? (er * 27) / outs : null,
        whip: outs > 0 ? ((h + bb) * 3) / outs : null,
        strikeouts: starts.reduce((a, s) => a + s.strikeouts, 0),
        walks: bb,
      };
    }

    out.set(p.id, {
      id: p.id,
      name: String(p.fullName ?? ""),
      hand: p.pitchHand?.code ? String(p.pitchHand.code) : null,
      season,
      last3,
    });
  }
  return out;
}

const fix2 = (v: number | null) => (v === null ? "-" : v.toFixed(2));

/** "10-11, 3.91 ERA, 1.13 WHIP, 192 K, 168.0 IP" */
export function formatPitcherSeason(line: PitcherLine | null | undefined): string | null {
  const s = line?.season;
  if (!s) return null;
  return `${s.wins}-${s.losses}, ${fix2(s.era)} ERA, ${fix2(s.whip)} WHIP, ${s.strikeouts} K, ${s.inningsPitched} IP`;
}

/** "last 3 starts: 17.1 IP, 3.63 ERA, 21 K" */
export function formatPitcherLast3(line: PitcherLine | null | undefined): string | null {
  const l = line?.last3;
  if (!l) return null;
  const label = l.starts.length === 1 ? "last start" : `last ${l.starts.length} starts`;
  return `${label}: ${l.ip} IP, ${fix2(l.era)} ERA, ${l.strikeouts} K`;
}

export interface ProbableMatchup {
  game: MlbScheduleGame;
  /** Official (MLB-announced), projected (line.projected), or null = TBD. */
  away: PitcherLine | null;
  home: PitcherLine | null;
}

// ---------------------------------------------------------------------------
// Rosters and projected starters
// ---------------------------------------------------------------------------

export interface RosterEntry {
  id: number;
  name: string;
  position: string | null;
  /** statsapi roster status code: "A" active, "RM" reassigned to minors, "D10" injured list... */
  status: string | null;
}

export function rosterUrl(teamId: number, rosterType: "active" | "40Man", season: number): string {
  return `${MLB_STATSAPI}/teams/${teamId}/roster?rosterType=${rosterType}&season=${season}`;
}

export function parseRoster(json: unknown): RosterEntry[] {
  return ((json as Json)?.roster ?? [])
    .filter((e: Json) => typeof e?.person?.id === "number")
    .map((e: Json) => ({
      id: e.person.id,
      name: String(e.person.fullName ?? ""),
      position: e.position?.abbreviation ? String(e.position.abbreviation) : null,
      status: e.status?.code ? String(e.status.code) : null,
    }));
}

/** Person-name key: accents, case, punctuation and generational suffixes ignored. */
export function personKey(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The roster player an ESPN projection names: exact name on that team, else
 * the only pitcher on the team with the same last name and first initial
 * ("Matt" vs "Matthew"). Null when it is not a confident single match.
 */
export function resolveRosterName(roster: RosterEntry[], name: string): RosterEntry | null {
  const want = personKey(name);
  if (!want) return null;
  const exact = roster.filter((r) => personKey(r.name) === want);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return exact.find((r) => r.position === "P") ?? null;
  const parts = want.split(" ");
  const last = parts[parts.length - 1];
  const initial = parts[0]?.[0];
  const loose = roster.filter((r) => {
    const p = personKey(r.name).split(" ");
    return r.position === "P" && p[p.length - 1] === last && p[0]?.[0] === initial;
  });
  return loose.length === 1 ? loose[0] : null;
}

/** An mlb_games row: its starter names are MLB's when announced, else ESPN's projection. */
export interface ProjectionRow {
  date: string;
  home_team_name: string;
  visitor_team_name: string;
  starting_pitcher_home: string | null;
  starting_pitcher_away: string | null;
}

/** Pair each statsapi game with its mlb_games row: same Eastern day and matchup, closest first pitch. */
export function matchProjectionRows(
  games: MlbScheduleGame[],
  rows: ProjectionRow[],
): Map<number, ProjectionRow> {
  const byKey = new Map<string, ProjectionRow[]>();
  for (const r of rows) {
    const k = matchupKey(etDate(r.date), r.visitor_team_name, r.home_team_name);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(r);
  }
  const out = new Map<number, ProjectionRow>();
  const used = new Set<ProjectionRow>();
  for (const g of games) {
    if (g.isPlaceholder) continue;
    const cands = (byKey.get(matchupKey(g.scheduleDay, g.away.name, g.home.name)) ?? []).filter((r) => !used.has(r));
    let best: ProjectionRow | null = null;
    let gap = Infinity;
    for (const r of cands) {
      const d = Math.abs(Date.parse(r.date) - Date.parse(g.gameDate));
      if (d < gap) {
        gap = d;
        best = r;
      }
    }
    if (best && gap <= 6 * 3600_000) {
      out.set(g.gamePk, best);
      used.add(best);
    }
  }
  return out;
}

/**
 * Schedule plus both starters' season and last-3-start lines.
 *
 * One rule for every surface (slate cards, game sheet, hit streak table, chat):
 * an MLB-announced probable is official; when MLB has not announced one, the
 * ESPN projection stored on the mlb_games row (pass `projections`) is looked
 * up on that team's 40-man roster and shown with `projected: true` and the
 * same stats; if that lookup fails the side is TBD (null), never a bare name.
 */
export async function fetchProbableMatchups(
  startDate: string,
  endDate: string,
  season: number,
  projections: ProjectionRow[] = [],
): Promise<ProbableMatchup[]> {
  const games = parseSchedule(await statsapiJson(scheduleUrl(startDate, endDate)));

  // Projected names for sides MLB has not announced
  type Want = { gamePk: number; side: "away" | "home"; teamId: number; name: string };
  const wants: Want[] = [];
  if (projections.length) {
    const rowFor = matchProjectionRows(games, projections);
    for (const g of games) {
      const row = rowFor.get(g.gamePk);
      if (!row || g.isFinal) continue;
      for (const s of ["away", "home"] as const) {
        const name = s === "away" ? row.starting_pitcher_away : row.starting_pitcher_home;
        const teamId = g[s].id;
        if (!g[s].probable && name && teamId) wants.push({ gamePk: g.gamePk, side: s, teamId, name });
      }
    }
  }

  // Resolve projections on each team's 40-man roster (one call per team involved)
  const projectedId = new Map<string, number>(); // `${gamePk}:${side}` -> person id
  if (wants.length) {
    const rosters = new Map<number, RosterEntry[]>();
    await Promise.all(
      [...new Set(wants.map((w) => w.teamId))].map(async (teamId) => {
        try {
          rosters.set(teamId, parseRoster(await statsapiJson(rosterUrl(teamId, "40Man", season))));
        } catch {
          // Unresolvable projections show TBD.
        }
      }),
    );
    for (const w of wants) {
      const hit = resolveRosterName(rosters.get(w.teamId) ?? [], w.name);
      if (hit) projectedId.set(`${w.gamePk}:${w.side}`, hit.id);
    }
  }

  const ids = [
    ...new Set([
      ...games.flatMap((g) => [g.away.probable?.id, g.home.probable?.id]).filter((x): x is number => !!x),
      ...projectedId.values(),
    ]),
  ];
  let lines = new Map<number, PitcherLine>();
  if (ids.length) {
    try {
      lines = parsePitcherLines(await statsapiJson(pitcherStatsUrl(ids, season)));
    } catch {
      // Official names without stats beat no probables at all.
    }
  }
  const lineFor = (g: MlbScheduleGame, s: "away" | "home"): PitcherLine | null => {
    const p = g[s].probable;
    if (p) return lines.get(p.id) ?? { id: p.id, name: p.name, hand: null, season: null, last3: null };
    const pid = projectedId.get(`${g.gamePk}:${s}`);
    const line = pid ? lines.get(pid) : undefined;
    // A projection we could not tie to MLB stats is TBD, not a bare name.
    return line ? { ...line, projected: true } : null;
  };
  return games.map((game) => ({ game, away: lineFor(game, "away"), home: lineFor(game, "home") }));
}

/**
 * A team's next game. Postponed and cancelled placeholders never count.
 *
 * - default: the next game not yet final (chat: "who does he face next").
 * - includeRecentFinal: a game that started within the last five hours still
 *   counts even once final (the streak table dims those rows until the next
 *   sync re-scores the streak), except that doubleheader game 2 wins over a
 *   finished game 1.
 */
export function nextMatchupForTeam(
  matchups: ProbableMatchup[],
  teamName: string,
  now: number = Date.now(),
  opts: { includeRecentFinal?: boolean } = {},
): { matchup: ProbableMatchup; isHome: boolean } | null {
  const key = teamKey(teamName);
  const candidates = matchups
    .filter((m) => teamKey(m.game.home.name) === key || teamKey(m.game.away.name) === key)
    .filter((m) => !m.game.isPlaceholder && m.game.status !== "STATUS_SUSPENDED")
    .filter((m) => (opts.includeRecentFinal ? true : !m.game.isFinal))
    .filter((m) => Date.parse(m.game.gameDate) >= now - 5 * 3600_000)
    .sort((a, b) => Date.parse(a.game.gameDate) - Date.parse(b.game.gameDate) || a.game.gameNumber - b.game.gameNumber);
  let m = candidates[0];
  if (!m) return null;
  const second = candidates[1];
  if (m.game.isFinal && second && !second.game.isFinal && second.game.scheduleDay === m.game.scheduleDay) m = second;
  return { matchup: m, isHome: teamKey(m.game.home.name) === key };
}

// ---------------------------------------------------------------------------
// Hit streaks
// ---------------------------------------------------------------------------

export interface HittingGame {
  date: string;
  gameNumber?: number | null;
  gamePk?: number | null;
  atBats: number;
  hits: number;
  sacFlies: number;
}

export interface HitStreak {
  /** Active streak as shown on the site (0 when the hitter has stopped playing). */
  streak: number;
  hits: number;
  atBats: number;
  /** Batting average during the streak. */
  avg: number;
  lastGameDate: string | null;
  /** True when the official streak is hidden because the last game is too old. */
  stale: boolean;
  /** The streak by the scoring rule alone, before the staleness guard. */
  officialStreak: number;
}

/** statsapi gameLog splits (hitting) -> the fields a streak needs. */
export function hittingGamesFromSplits(splits: unknown[]): HittingGame[] {
  return ((splits ?? []) as Json[])
    .filter((sp) => sp?.date)
    .map((sp) => ({
      date: String(sp.date),
      gameNumber: sp.game?.gameNumber ?? null,
      gamePk: sp.game?.gamePk ?? null,
      atBats: n0(sp.stat?.atBats),
      hits: n0(sp.stat?.hits),
      sacFlies: n0(sp.stat?.sacFlies),
    }));
}

/**
 * Current consecutive-game hitting streak under MLB Official Rule 9.23(b):
 * a game whose plate appearances were all walks, hit-by-pitches, sacrifice
 * bunts or interference neither extends nor ends the streak (and neither does
 * a game with no plate appearance at all, e.g. a pinch-runner), but a sacrifice
 * fly without a hit ends it.
 *
 * Staleness guard: a hitter whose last game is more than `staleDays` old
 * (injured list, demotion) shows 0. Officially his streak is intact, but it is
 * not a live angle for tonight, and a frozen number reads as current.
 */
export function computeHitStreak(
  games: HittingGame[],
  opts: { now?: number; staleDays?: number } = {},
): HitStreak {
  const now = opts.now ?? Date.now();
  const staleDays = opts.staleDays ?? 7;
  const chron = [...games].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const gn = (a.gameNumber ?? 1) - (b.gameNumber ?? 1);
    if (gn !== 0) return gn;
    return (a.gamePk ?? 0) - (b.gamePk ?? 0);
  });

  let streak = 0;
  let hits = 0;
  let atBats = 0;
  for (let i = chron.length - 1; i >= 0; i--) {
    const g = chron[i];
    if (g.hits > 0) {
      streak++;
      hits += g.hits;
      atBats += g.atBats;
    } else if (g.atBats > 0 || g.sacFlies > 0) {
      break;
    }
    // else: no official at-bat and no sacrifice fly, skip without breaking
  }

  const lastGameDate = chron.length ? chron[chron.length - 1].date : null;
  const daysSince = lastGameDate ? (now - Date.parse(`${lastGameDate}T00:00:00Z`)) / 86_400_000 : Infinity;
  const stale = streak > 0 && daysSince > staleDays;
  return {
    streak: stale ? 0 : streak,
    hits: stale ? 0 : hits,
    atBats: stale ? 0 : atBats,
    avg: !stale && atBats > 0 ? hits / atBats : 0,
    lastGameDate,
    stale,
    officialStreak: streak,
  };
}
