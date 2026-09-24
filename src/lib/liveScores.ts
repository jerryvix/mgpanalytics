// Live scores straight from ESPN's public scoreboard (CORS-open, no key).
// Fetched client-side on demand - no cron, no schema, no backend changes.
// The batch syncs still own persistence; this layer is display-only.

export type LiveSport = "NFL" | "NBA" | "MLB" | "NCAAF" | "NCAAB";

const ESPN_PATH: Record<LiveSport, string> = {
  NFL: "football/nfl",
  NBA: "basketball/nba",
  MLB: "baseball/mlb",
  NCAAF: "football/college-football",
  NCAAB: "basketball/mens-college-basketball",
};

export interface LiveGame {
  espnId: string;
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  state: "pre" | "in" | "post";
  detail: string; // e.g. "10:23 - 3rd", "Bot 7th", "Final", "Postponed"
  period: number | null;
  clock: string | null;
  /** Scheduled start, ISO - ESPN's own clock for this specific game. */
  startTime: string | null;
}

/** Postponed/canceled/suspended report state "post" but are not finals. */
export function isCalledOff(g: Pick<LiveGame, "state" | "detail">): boolean {
  return g.state === "post" && /postpon|cancel|susp/i.test(g.detail);
}

/** Stable matchup key: away @ home, lowercased. */
export function liveKey(awayName: string, homeName: string): string {
  return `${(awayName || "").trim().toLowerCase()}@${(homeName || "").trim().toLowerCase()}`;
}

/** Pure - parse an ESPN scoreboard payload into LiveGames (testable). */
export function normalizeScoreboard(json: unknown): LiveGame[] {
  const events = (json as { events?: unknown[] })?.events;
  if (!Array.isArray(events)) return [];
  const games: LiveGame[] = [];
  for (const ev of events as any[]) {
    const comp = ev?.competitions?.[0];
    const competitors: any[] = comp?.competitors || [];
    const home = competitors.find((c) => c.homeAway === "home");
    const away = competitors.find((c) => c.homeAway === "away");
    if (!home || !away) continue;
    const status = ev?.status || comp?.status || {};
    const state = status?.type?.state;
    if (state !== "pre" && state !== "in" && state !== "post") continue;
    const score = (c: any) => {
      const n = Number(c?.score);
      return Number.isFinite(n) ? n : null;
    };
    games.push({
      espnId: String(ev.id ?? ""),
      homeName: home?.team?.displayName || "",
      awayName: away?.team?.displayName || "",
      homeScore: score(home),
      awayScore: score(away),
      state,
      detail: status?.type?.shortDetail || status?.type?.description || "",
      period: typeof status?.period === "number" ? status.period : null,
      clock: status?.displayClock ?? null,
      startTime: typeof ev?.date === "string" ? ev.date : null,
    });
  }
  return games;
}

/**
 * Key games by matchup. Doubleheaders produce two events with the same
 * key - keep the actionable one: a live game always wins, and a still-
 * upcoming game beats a finished one (it's the matchup someone can still
 * bet), finished/called-off games rank last.
 */
export function toScoreboardMap(games: LiveGame[]): Map<string, LiveGame> {
  const rank: Record<LiveGame["state"], number> = { in: 3, pre: 2, post: 1 };
  const map = new Map<string, LiveGame>();
  for (const g of games) {
    const key = liveKey(g.awayName, g.homeName);
    const existing = map.get(key);
    if (!existing || rank[g.state] > rank[existing.state]) map.set(key, g);
  }
  return map;
}

/** Every game per away@home matchup (a doubleheader has two). */
export function toScoreboardIndex(games: LiveGame[]): Map<string, LiveGame[]> {
  const index = new Map<string, LiveGame[]>();
  for (const g of games) {
    const key = liveKey(g.awayName, g.homeName);
    if (!index.has(key)) index.set(key, []);
    index.get(key)!.push(g);
  }
  return index;
}

/** A row's scheduled start, so a live event can be tied to THAT game. */
export interface LiveMatchWhen {
  /** The row's first pitch / kickoff / tip, ISO. */
  start?: string | null;
  /** Kickoff not set (NCAAF time_tbd): the start is a date placeholder, so match the Eastern calendar day. */
  timeTbd?: boolean | null;
}

/**
 * Sep 24 2026: ESPN's default scoreboard still showed Sep 23 at 10:36 UTC, and
 * matching by team names alone put yesterday's final ("Cardinals 5 Pirates 1")
 * on 10 of today's 12 series rows. An event only counts as the row's game when
 * it starts within this window of the row's own start.
 */
export const LIVE_MATCH_WINDOW_MS = 6 * 3600_000;

const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });

/** Is this ESPN event the row's game, and not another game in the same series? */
export function sameScheduledGame(live: Pick<LiveGame, "startTime">, when?: LiveMatchWhen | null): boolean {
  if (!when?.start || !live.startTime) return true; // nothing to compare: trust the matchup
  const a = Date.parse(live.startTime);
  const b = Date.parse(when.start);
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  if (when.timeTbd) return ET_DAY.format(new Date(a)) === ET_DAY.format(new Date(b));
  return Math.abs(a - b) <= LIVE_MATCH_WINDOW_MS;
}

/**
 * The live game for a row. With the row's start: the matchup's event closest
 * to it inside the window (never yesterday's final in a series, and the right
 * half of a doubleheader). Without one: the most actionable event, as before.
 */
export function pickLiveGame(
  index: Map<string, LiveGame[]>,
  awayName: string,
  homeName: string,
  when?: LiveMatchWhen | null
): LiveGame | undefined {
  const key = liveKey(awayName, homeName);
  const list = index.get(key);
  if (!list?.length) return undefined;
  if (!when?.start) return toScoreboardMap(list).get(key);
  const matches = list.filter((g) => sameScheduledGame(g, when));
  if (matches.length <= 1) return matches[0];
  const t = Date.parse(when.start);
  const gap = (g: LiveGame) => Math.abs(Date.parse(g.startTime ?? "") - t);
  return [...matches].sort((x, y) => gap(x) - gap(y))[0];
}

/**
 * ESPN's default scoreboard is not "every game today". Sep 24 2026: college
 * football's default is its Top 25 view (18 of the week's 71 FBS games, so the
 * other 53 never went LIVE, scored or Final here until the daily sync), and
 * MLB's still showed Sep 23 at 12:44 UTC on the 24th. So every request names
 * the Eastern day, and college asks for the whole FBS / Division I group.
 */
const SCOREBOARD_GROUP: Partial<Record<LiveSport, string>> = {
  NCAAF: "80", // FBS
  NCAAB: "50", // Division I
};

/** Until this Eastern hour, yesterday's board is fetched too: a game past midnight keeps its live score. */
export const LATE_GAMES_UNTIL_ET_HOUR = 6;

const ET_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

/** ESPN `dates` value (YYYYMMDD) for the Eastern calendar day at `at`, and the Eastern hour. */
function easternDay(at: Date): { ymd: string; hour: number } {
  const p = Object.fromEntries(ET_CLOCK.formatToParts(at).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}${p.month}${p.day}`, hour: Number(p.hour) % 24 };
}

/** The calendar day before a YYYYMMDD (by the calendar, so DST days are safe). */
function dayBefore(ymd: string): string {
  const d = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)) - 1));
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Eastern days to poll: today, plus yesterday from midnight until 6 AM ET. */
export function scoreboardDays(now: Date = new Date()): string[] {
  const { ymd, hour } = easternDay(now);
  return hour < LATE_GAMES_UNTIL_ET_HOUR ? [dayBefore(ymd), ymd] : [ymd];
}

/** ESPN's public scoreboard for one Eastern day (NFL too: a single day works there). */
export function scoreboardUrl(sport: LiveSport, ymd: string): string {
  const q = new URLSearchParams();
  const group = SCOREBOARD_GROUP[sport];
  if (group) {
    q.set("groups", group);
    q.set("limit", "500");
  }
  q.set("dates", ymd);
  return `https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH[sport]}/scoreboard?${q}`;
}

/** Several days' boards as one list; an event listed on two boards counts once. */
export function mergeBoards(boards: LiveGame[][]): LiveGame[] {
  const byId = new Map<string, LiveGame>();
  const noId: LiveGame[] = [];
  for (const board of boards) {
    for (const g of board) {
      if (g.espnId) byId.set(g.espnId, g);
      else noId.push(g);
    }
  }
  return [...byId.values(), ...noId];
}

/** Fetch the Eastern day's scoreboard (and yesterday's, late at night): every event, indexed by away@home matchup. */
export async function fetchLiveScores(sport: LiveSport, now: Date = new Date()): Promise<Map<string, LiveGame[]>> {
  const boards = await Promise.all(
    scoreboardDays(now).map(async (ymd) => {
      const res = await fetch(scoreboardUrl(sport, ymd));
      if (!res.ok) throw new Error(`ESPN scoreboard ${sport} ${ymd}: ${res.status}`);
      return normalizeScoreboard(await res.json());
    })
  );
  return toScoreboardIndex(mergeBoards(boards));
}
