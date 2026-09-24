// Pure helpers shared by the NFL sync edge functions. No Deno globals and no
// network calls, so vitest exercises them directly (src/test/nflSync.test.ts).
//
// Source shapes are BALLDONTLIE (BDL) NFL v1 objects. Verified against live
// responses Sep 2026:
//   - /games carries home_team_score / visitor_team_score plus status_state
//     ("scheduled" | "final" | in-progress values) and status ("Final",
//     "Final/OT", or a kickoff string like "9/27 - 1:00 PM EDT").
//   - /games?seasons[]=Y returns regular season + postseason only, while
//     /stats?seasons[]=Y ALSO returns preseason box scores (Aug games labeled
//     weeks 1-4). Anything keyed off /stats must be filtered to /games ids.
//   - /stats has no working weeks[] filter (it is silently ignored), so week
//     scoping has to go through game_ids[].
//   - Game stats carry both qbr (ESPN QBR, 0-100) and qb_rating (NFL passer
//     rating, 0-158.3); season_stats carries only qbr.

export interface BdlTeam {
  id: number;
  abbreviation?: string | null;
  full_name?: string | null;
  name?: string | null;
}

export interface BdlGame {
  id: number;
  date: string;
  week?: number | null;
  season?: number | null;
  postseason?: boolean | null;
  status?: string | null;
  status_state?: string | null;
  home_team?: BdlTeam | null;
  visitor_team?: BdlTeam | null;
  home_team_score?: number | null;
  visitor_team_score?: number | null;
}

// Loose on purpose: BDL adds fields freely and we store the raw object too.
// deno-lint-ignore no-explicit-any
export type BdlStat = Record<string, any>;

/** Season label in use (start-year convention): Jan/Feb belong to the prior season. */
export function currentNflSeason(now: Date = new Date()): number {
  return now.getMonth() <= 1 ? now.getFullYear() - 1 : now.getFullYear();
}

export function isFinalGame(g: Pick<BdlGame, "status" | "status_state">): boolean {
  if ((g.status_state ?? "").toLowerCase() === "final") return true;
  return /^final/i.test(g.status ?? "");
}

/**
 * Has the game kicked off (in progress or final)? Falls back to the clock when
 * BDL omits status_state, so a stale "scheduled" row never hides a real score.
 */
export function hasStarted(g: BdlGame, now: Date = new Date()): boolean {
  if (isFinalGame(g)) return true;
  const state = (g.status_state ?? "").toLowerCase();
  if (state && state !== "scheduled" && state !== "pre") return true;
  if (!state) return Date.parse(g.date) <= now.getTime();
  return false;
}

/** games table row, including the scores and is_final flag the chat reads. */
export function nflGameRow(g: BdlGame, fallbackSeason: number) {
  const started = hasStarted(g);
  return {
    id: g.id,
    league: "NFL",
    season: g.season ?? fallbackSeason,
    week: g.week || null,
    date: g.date,
    status: g.status ?? "",
    postseason: g.postseason ?? false,
    home_team_name: g.home_team?.full_name || "Unknown",
    visitor_team_name: g.visitor_team?.full_name || "Unknown",
    external_id: `nfl_${g.id}`,
    home_score: started ? (g.home_team_score ?? null) : null,
    away_score: started ? (g.visitor_team_score ?? null) : null,
    is_final: isFinalGame(g),
  };
}

const ET_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Calendar date of kickoff in US Eastern time ("2026-09-17" for Thursday
 * Night Football at 00:15Z on the 18th). NFL game days are Eastern dates;
 * the UTC date put every night game on the following day.
 */
export function nflGameDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : ET_DATE.format(new Date(t));
}

/** "R3" / "P1": postseason weeks restart at 1 in BDL, so the flag is part of the key. */
export function weekKey(g: Pick<BdlGame, "postseason" | "week">): string {
  return `${g.postseason ? "P" : "R"}${g.week ?? 0}`;
}

/**
 * The most recent `count` weeks that have at least one game under way or
 * done, oldest first. Two weeks by default covers Monday night finishing
 * after the week rolls over plus next-day stat corrections.
 */
export function selectRecentWeeks(games: BdlGame[], count: number, now: Date = new Date()): string[] {
  const firstKickoff = new Map<string, number>();
  for (const g of games) {
    if (!hasStarted(g, now)) continue;
    const k = weekKey(g);
    const t = Date.parse(g.date);
    if (!firstKickoff.has(k) || t < (firstKickoff.get(k) as number)) firstKickoff.set(k, t);
  }
  return [...firstKickoff.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(-Math.max(1, count))
    .map(([k]) => k);
}

/** NFL passer rating from raw components; null without attempts. */
export function passerRating(
  completions: number,
  attempts: number,
  yards: number,
  touchdowns: number,
  interceptions: number,
): number | null {
  if (!attempts || attempts <= 0) return null;
  const clamp = (v: number) => Math.max(0, Math.min(2.375, v));
  const a = clamp((completions / attempts - 0.3) * 5);
  const b = clamp((yards / attempts - 3) * 0.25);
  const c = clamp((touchdowns / attempts) * 20);
  const d = clamp(2.375 - (interceptions / attempts) * 25);
  return Math.round(((a + b + c + d) / 6) * 1000) / 10;
}

/** Standard + PPR points: same formula the syncs have always used (no fumbles/2pt). */
export function fantasyPoints(stat: BdlStat): { fantasy_points: number; fantasy_points_ppr: number } {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const pts =
    n(stat.passing_yards) * 0.04 +
    n(stat.passing_touchdowns) * 4 -
    n(stat.passing_interceptions) * 2 +
    n(stat.rushing_yards) * 0.1 +
    n(stat.rushing_touchdowns) * 6 +
    n(stat.receiving_yards) * 0.1 +
    n(stat.receiving_touchdowns) * 6;
  const round = (v: number) => Math.round(v * 100) / 100;
  return { fantasy_points: round(pts), fantasy_points_ppr: round(pts + n(stat.receptions)) };
}

/**
 * player_game_logs row for one BDL box-score line. Home/away and the opponent
 * come from the team the player suited up for IN THAT GAME (stat.team), not
 * the roster team we have today, so traded players keep correct history.
 * Returns null when the game cannot be placed (missing teams).
 */
export function gameLogRow(stat: BdlStat, game: BdlGame, playerId: string, fallbackSeason: number) {
  const home = game.home_team;
  const away = game.visitor_team;
  if (!home || !away) return null;

  const teamId = stat.team?.id;
  const teamAbbr = String(stat.team?.abbreviation ?? "").toUpperCase();
  let isHome: boolean;
  if (teamId != null && (teamId === home.id || teamId === away.id)) {
    isHome = teamId === home.id;
  } else if (teamAbbr && (teamAbbr === home.abbreviation || teamAbbr === away.abbreviation)) {
    isHome = teamAbbr === home.abbreviation;
  } else {
    return null;
  }

  const opponent = isHome ? away : home;
  const started = hasStarted(game);
  const final = isFinalGame(game);
  const teamScore = started ? (isHome ? game.home_team_score : game.visitor_team_score) ?? null : null;
  const oppScore = started ? (isHome ? game.visitor_team_score : game.home_team_score) ?? null : null;
  const result =
    final && teamScore != null && oppScore != null
      ? teamScore > oppScore ? "W" : teamScore < oppScore ? "L" : "T"
      : null;

  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const fp = fantasyPoints(stat);
  const rating =
    typeof stat.qb_rating === "number"
      ? stat.qb_rating
      : passerRating(
          n(stat.passing_completions),
          n(stat.passing_attempts),
          n(stat.passing_yards),
          n(stat.passing_touchdowns),
          n(stat.passing_interceptions),
        );

  return {
    player_id: playerId,
    sport: "NFL",
    season: game.season ?? fallbackSeason,
    week: game.week ?? null,
    game_date: nflGameDate(game.date),
    game_id: `nfl_game_${game.id}`,
    opponent_abbr: opponent.abbreviation || "UNK",
    opponent_name: opponent.full_name || "Unknown",
    home_away: isHome ? "home" : "away",
    result,
    team_score: teamScore,
    opponent_score: oppScore,
    pass_attempts: n(stat.passing_attempts),
    pass_completions: n(stat.passing_completions),
    pass_yards: n(stat.passing_yards),
    pass_td: n(stat.passing_touchdowns),
    pass_int: n(stat.passing_interceptions),
    passer_rating: rating,
    rush_attempts: n(stat.rushing_attempts),
    rush_yards: n(stat.rushing_yards),
    rush_td: n(stat.rushing_touchdowns),
    targets: n(stat.receiving_targets),
    receptions: n(stat.receptions),
    rec_yards: n(stat.receiving_yards),
    rec_td: n(stat.receiving_touchdowns),
    fantasy_points: fp.fantasy_points,
    fantasy_points_ppr: fp.fantasy_points_ppr,
    raw_data: stat,
  };
}

const SUMMED_STAT_FIELDS = [
  "passing_attempts", "passing_completions", "passing_yards", "passing_touchdowns", "passing_interceptions",
  "rushing_attempts", "rushing_yards", "rushing_touchdowns",
  "receptions", "receiving_yards", "receiving_touchdowns", "receiving_targets",
] as const;

/**
 * Regular-season lines = summed game logs for every counting stat (the logs
 * are BDL's box scores after the ESPN phantom guard), so a season row always
 * equals the sum of that player's game logs. BDL's own /season_stats drifts
 * from its box scores (Sep 2026: receiving_targets off for 23 of 421 players,
 * Travis Kelce 17 vs 5 + 11 = 16). From BDL's season line we keep only what
 * the logs cannot give: official games played (it counts appearances with no
 * stat line, which have no log) and extras like QBR. Players with a season
 * line but no logs keep the season line unchanged.
 */
export function mergeSeasonLines(
  boxTotals: BdlStat[],
  seasonLines: BdlStat[],
): { lines: BdlStat[]; boxOnly: number; seasonOnly: number } {
  const byId = (rows: BdlStat[]) => {
    const m = new Map<string, BdlStat>();
    for (const r of rows) if (r.player?.id != null) m.set(String(r.player.id), r);
    return m;
  };
  const box = byId(boxTotals);
  const season = byId(seasonLines);
  const lines: BdlStat[] = [];
  let boxOnly = 0;
  let seasonOnly = 0;
  for (const key of new Set([...box.keys(), ...season.keys()])) {
    const b = box.get(key);
    const s = season.get(key);
    if (b && s) {
      const sums = Object.fromEntries(SUMMED_STAT_FIELDS.map((f) => [f, b[f]]));
      const officialGp = typeof s.games_played === "number" ? s.games_played : 0;
      lines.push({
        ...s,
        ...sums,
        games_played: Math.max(officialGp, b.games_played ?? 0),
        source: b.source ?? "summed_from_game_logs",
        game_ids: b.game_ids,
      });
    } else if (b) {
      boxOnly++;
      lines.push(b);
    } else if (s) {
      seasonOnly++;
      lines.push(s);
    }
  }
  return { lines, boxOnly, seasonOnly };
}

/** The player_game_logs columns a season total is summed from. */
export interface SeasonLogRow {
  player_id: string;
  game_id: string | null;
  pass_attempts: number | null;
  pass_completions: number | null;
  pass_yards: number | null;
  pass_td: number | null;
  pass_int: number | null;
  rush_attempts: number | null;
  rush_yards: number | null;
  rush_td: number | null;
  targets: number | null;
  receptions: number | null;
  rec_yards: number | null;
  rec_td: number | null;
  postseason?: string | null;
  // Identity for the postseason games-played lookup (the BDL line's team and name)
  team?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

const LOG_TO_BDL: Array<[keyof SeasonLogRow, string]> = [
  ["pass_attempts", "passing_attempts"],
  ["pass_completions", "passing_completions"],
  ["pass_yards", "passing_yards"],
  ["pass_td", "passing_touchdowns"],
  ["pass_int", "passing_interceptions"],
  ["rush_attempts", "rushing_attempts"],
  ["rush_yards", "rushing_yards"],
  ["rush_td", "rushing_touchdowns"],
  ["targets", "receiving_targets"],
  ["receptions", "receptions"],
  ["rec_yards", "receiving_yards"],
  ["rec_td", "receiving_touchdowns"],
];

/**
 * Stored game logs -> one season line per player in BDL's field names (keyed
 * by BDL player id, which mergeSeasonLines matches on). games_played is the
 * number of logged games. Players we cannot map back to a BDL id are skipped.
 */
export function logRowsToSeasonLines(rows: SeasonLogRow[], bdlIdOf: Map<string, string>, season: number): BdlStat[] {
  const byPlayer = new Map<string, { line: BdlStat; games: Set<string> }>();
  for (const r of rows) {
    const bdlId = bdlIdOf.get(r.player_id);
    if (!bdlId) continue;
    let entry = byPlayer.get(r.player_id);
    if (!entry) {
      entry = { line: { player: { id: Number(bdlId) }, season, source: "summed_from_game_logs" }, games: new Set() };
      for (const [, f] of LOG_TO_BDL) entry.line[f] = 0;
      byPlayer.set(r.player_id, entry);
    }
    entry.games.add(r.game_id ?? `row${entry.games.size}`);
    for (const [col, f] of LOG_TO_BDL) {
      const v = r[col];
      if (typeof v === "number" && Number.isFinite(v)) entry.line[f] += v;
    }
  }
  return [...byPlayer.values()].map(({ line, games }) => ({ ...line, games_played: games.size }));
}

// ---------------------------------------------------------------------------
// Phantom-line guard. BDL's /stats occasionally credits a stat to a player who
// is not in the game's box score at all: 14 such lines in 2025 (Grant
// Calcaterra, 1 target in NYG @ PHI Week 8; Tanner McKee, 1/1 for 6 yards in
// PHI @ GB Week 10), found by checking all 285 2025 games against ESPN. ESPN's
// box lists every player with a pass, rush, target or catch (it lists 0-catch
// targets too), so a stat-carrying BDL line for a player ESPN does not list
// is a phantom. Lines with nothing we store (special-teams-only appearances,
// all zeros in our columns) cannot move any total and match official games
// played, so they are kept.
// ---------------------------------------------------------------------------

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** "Ray-Ray McCloud III" -> "ray ray mccloud"; accents, periods, apostrophes and suffixes dropped. */
export function normalizePersonName(name: string | null | undefined): string {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.'\u2019]/g, "")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter((t) => t && !NAME_SUFFIXES.has(t))
    .join(" ");
}

/** ESPN box score -> normalized team display name -> normalized last names with any stat. */
export type BoxParticipants = Map<string, Set<string>>;

// deno-lint-ignore no-explicit-any
export function boxParticipants(boxscore: any): BoxParticipants {
  const teams: BoxParticipants = new Map();
  for (const t of boxscore?.players ?? []) {
    const names = new Set<string>();
    for (const category of t.statistics ?? []) {
      for (const a of category.athletes ?? []) {
        const athlete = a.athlete ?? {};
        const last = athlete.lastName ?? String(athlete.displayName ?? "").split(" ").slice(1).join(" ");
        if (last) names.add(normalizePersonName(last));
      }
    }
    teams.set(normalizePersonName(t.team?.displayName), names);
  }
  return teams;
}

const STORED_STAT_FIELDS = [
  "passing_attempts", "passing_completions", "passing_yards", "passing_touchdowns", "passing_interceptions",
  "rushing_attempts", "rushing_yards", "rushing_touchdowns",
  "receiving_targets", "receptions", "receiving_yards", "receiving_touchdowns",
] as const;

/** Does this BDL line carry anything our game-log columns store? */
export function hasStoredStats(stat: BdlStat): boolean {
  return STORED_STAT_FIELDS.some((f) => typeof stat[f] === "number" && stat[f] !== 0);
}

/**
 * True when ESPN's box for the game lists the player's team but not the
 * player, and the line carries a stat we would store. Conservative by
 * design: matched on last name within the team (so "Hollywood" vs
 * "Marquise" Brown still matches), and never true when ESPN's box does not
 * cover the team, so a thin ESPN payload can only let a line through, never
 * drop a real one.
 */
export function isPhantomLine(stat: BdlStat, participants: BoxParticipants): boolean {
  if (!hasStoredStats(stat)) return false;
  const teamNames = participants.get(normalizePersonName(stat.team?.full_name));
  if (!teamNames || teamNames.size === 0) return false;
  return !teamNames.has(normalizePersonName(stat.player?.last_name));
}

// ---------------------------------------------------------------------------
// Official postseason games played. A box-score line exists only when a player
// records a stat, so special-teams and backup appearances never reach the
// logs: Jack Westover's 2025 playoffs counted 1 game from box lines, 4
// officially. ESPN's per-game rosters carry a stat record for every player who
// appeared; counting those reproduces ESPN's official postseason games played
// for all 170 players of the 2025 playoffs, and NFL.com's game logs agree.
// ---------------------------------------------------------------------------

export interface RosterAppearance {
  espnId: string;
  // ESPN game rosters name players by last name ("Hooper"); fullName is
  // filled in only where two teammates share one (see espnPlayoffRosters)
  name: string;
  fullName?: string;
  appeared: boolean;
}

export interface PlayoffRoster {
  team: string;
  entries: RosterAppearance[];
}

/** ESPN core game roster -> entries; appeared = has a game stat record and no did-not-play flag. */
// deno-lint-ignore no-explicit-any
export function rosterAppearances(roster: any): RosterAppearance[] {
  // deno-lint-ignore no-explicit-any
  return (roster?.entries ?? []).map((e: any) => ({
    espnId: String(e.playerId),
    name: String(e.displayName ?? ""),
    appeared: Boolean(e.statistics?.$ref) && e.didNotPlay !== true,
  }));
}

export interface PostseasonPlayer {
  key: string;
  team: string | null | undefined;
  first: string | null | undefined;
  last: string | null | undefined;
}

/** Roster ids of teammates sharing a last name, i.e. the entries that need a full name to match. */
export function sharedLastNameIds(rosters: PlayoffRoster[]): Set<string> {
  const idsByTeamLast = new Map<string, Set<string>>();
  for (const r of rosters) {
    for (const e of r.entries) {
      const k = `${normalizePersonName(r.team)}|${lastWord(e.name)}`;
      const ids = idsByTeamLast.get(k) ?? new Set<string>();
      ids.add(e.espnId);
      idsByTeamLast.set(k, ids);
    }
  }
  const out = new Set<string>();
  for (const ids of idsByTeamLast.values()) if (ids.size > 1) for (const id of ids) out.add(id);
  return out;
}

// Last-name key: the normalized name minus given names, so "Hooper",
// "Austin Hooper" and "St. Brown" / "Amon-Ra St. Brown" line up.
function lastWord(name: string | null | undefined): string {
  const parts = normalizePersonName(name).split(" ");
  return parts[parts.length - 1] ?? "";
}

/**
 * Official postseason games played per player: playoff games whose ESPN roster
 * shows him appearing. Matched to an ESPN athlete within his own team: by
 * full name where ESPN gives one, else by last name when no teammate shares
 * it, else by last name plus first initial. Unmatched players are left out,
 * so callers keep their box-score count.
 */
export function officialGamesPlayed(rosters: PlayoffRoster[], players: PostseasonPlayer[]): Map<string, number> {
  const appearances = new Map<string, number>();
  const byTeam = new Map<string, RosterAppearance[]>();
  for (const r of rosters) {
    const team = normalizePersonName(r.team);
    const list = byTeam.get(team) ?? [];
    for (const e of r.entries) {
      list.push(e);
      if (e.appeared) appearances.set(e.espnId, (appearances.get(e.espnId) ?? 0) + 1);
    }
    byTeam.set(team, list);
  }
  const idsWhere = (entries: RosterAppearance[], test: (e: RosterAppearance) => boolean) =>
    new Set(entries.filter(test).map((e) => e.espnId));
  const out = new Map<string, number>();
  for (const p of players) {
    const entries = byTeam.get(normalizePersonName(p.team)) ?? [];
    const full = normalizePersonName(`${p.first ?? ""} ${p.last ?? ""}`);
    const last = lastWord(p.last);
    const initial = normalizePersonName(p.first).charAt(0);
    if (!last) continue;
    let ids = idsWhere(entries, (e) => normalizePersonName(e.fullName ?? e.name) === full);
    if (ids.size !== 1) ids = idsWhere(entries, (e) => lastWord(e.fullName ?? e.name) === last);
    if (ids.size > 1 && initial) {
      ids = idsWhere(entries, (e) => lastWord(e.fullName ?? e.name) === last && normalizePersonName(e.fullName).charAt(0) === initial);
    }
    if (ids.size === 1) out.set(p.key, appearances.get([...ids][0]) ?? 0);
  }
  return out;
}

/** Split an array into fixed-size chunks. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Rows present in the table but absent from what the source just returned.
 * Used to prune stale season rows, e.g. the Sep 7-8 2026 BDL glitch that wrote
 * prior-season totals (Tua Tagovailoa 2,660 yds, 14 GP) under season 2026
 * before a snap was played. Those rows never get overwritten because the
 * player has no 2026 line yet, so an upsert-only sync keeps them forever.
 */
export function staleRows<T extends { id: string }>(
  existing: T[],
  keyOf: (row: T) => string,
  freshKeys: Set<string>,
): T[] {
  return existing.filter((row) => !freshKeys.has(keyOf(row)));
}
