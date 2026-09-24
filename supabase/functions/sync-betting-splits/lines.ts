// DraftKings' current + opening line for every game in the window, read from
// ESPN's core odds API (which relays DK). Pure, vitest-covered: index.ts does
// the fetching and writing.
import { matchEventsToGames, type GameRow, type MatchSport } from "./match.ts";
import { buildLineRows, orientQuote, type DkEventQuote, type LineRow } from "./rows.ts";

export interface LinesGame extends GameRow {
  external_id: string | null;
  /** NCAAF: kickoff time not set, `date` is a midnight-Eastern placeholder */
  time_tbd?: boolean | null;
}

export interface EspnScheduleEvent {
  eventId: string;
  away: string;
  home: string;
  kickoffUtc: Date;
}

export interface EspnEventRef {
  eventId: string;
  /** ESPN lists our home team as the away side (neutral site) */
  swapped: boolean;
}

const HOUR_MS = 3600_000;

/**
 * Games still to kick off. A TBD kickoff's placeholder is midnight Eastern
 * of game day, so it stays capturable through that day. Games under way keep
 * their last pre-kickoff line (the close) instead of taking live numbers.
 */
export function upcomingGames<G extends LinesGame>(games: G[], now: Date): G[] {
  return games.filter((g) => {
    const start = new Date(g.date).getTime();
    if (!Number.isFinite(start)) return false;
    return g.time_tbd ? start + 20 * HOUR_MS > now.getTime() : start > now.getTime();
  });
}

/** Unfinished events from an ESPN scoreboard payload (site.api shape; espnFetch unwraps the CDN mirror). */
export function parseEspnScoreboard(payload: unknown): EspnScheduleEvent[] {
  const events = (payload as { events?: unknown[] })?.events ?? [];
  const out: EspnScheduleEvent[] = [];
  for (const raw of events) {
    const ev = raw as {
      id?: string | number;
      date?: string;
      status?: { type?: { completed?: boolean } };
      competitions?: Array<{ competitors?: Array<{ homeAway?: string; team?: { displayName?: string } }> }>;
    };
    if (!ev.id || !ev.date || ev.status?.type?.completed === true) continue;
    const teams = ev.competitions?.[0]?.competitors ?? [];
    const home = teams.find((c) => c.homeAway === "home")?.team?.displayName;
    const away = teams.find((c) => c.homeAway === "away")?.team?.displayName;
    const kickoffUtc = new Date(ev.date);
    if (!home || !away || !Number.isFinite(kickoffUtc.getTime())) continue;
    out.push({ eventId: String(ev.id), away, home, kickoffUtc });
  }
  return out;
}

/**
 * Scoreboard events still to kick off inside the games window. The CDN mirror
 * serves football a week at a time, so the window's last dates also return
 * the following week's games, which have no row in the window to pair with
 * and would only be reported as unmatched (15 NFL Week 5 events on Sep 24 2026).
 */
export function eventsInWindow(events: EspnScheduleEvent[], now: Date, until: Date): EspnScheduleEvent[] {
  return events.filter((e) => e.kickoffUtc.getTime() > now.getTime() && e.kickoffUtc.getTime() <= until.getTime());
}

/**
 * Our games' ESPN event ids. Rows that ARE ESPN events carry the id in
 * external_id ("espn_ncaaf_401869941"); the NFL games table is BDL-keyed, so
 * its games are matched to ESPN's scoreboard on both teams + kickoff, the
 * way sync-nfl-games pairs them.
 */
export function resolveEspnEvents(
  sport: MatchSport,
  games: LinesGame[],
  source: { idPrefix: string } | { events: EspnScheduleEvent[] },
): { byGame: Map<string, EspnEventRef>; unmatchedEvents: string[] } {
  const byGame = new Map<string, EspnEventRef>();
  if ("idPrefix" in source) {
    for (const g of games) {
      if (g.external_id?.startsWith(source.idPrefix)) {
        byGame.set(String(g.id), { eventId: g.external_id.slice(source.idPrefix.length), swapped: false });
      }
    }
    return { byGame, unmatchedEvents: [] };
  }
  const { matched, unmatched } = matchEventsToGames(sport, source.events, games);
  for (const m of matched) byGame.set(String(m.game.id), { eventId: m.event.eventId, swapped: m.swapped });
  return {
    byGame,
    unmatchedEvents: unmatched.map((u) => `${u.event.away} @ ${u.event.home}: ${u.reason}`),
  };
}

/**
 * betting_lines rows plus each game's quote in OUR orientation (the splits
 * step takes DraftKings' opening numbers from it). Only DraftKings quotes
 * count: ESPN falls back to another provider when DK has none.
 */
export function linesFromQuotes(
  sport: string,
  byGame: Map<string, EspnEventRef>,
  quotes: Map<string, DkEventQuote & { sportsbook: string }>,
  capturedAt: string,
): { rows: LineRow[]; quotesByGame: Map<string, DkEventQuote> } {
  const rows: LineRow[] = [];
  const quotesByGame = new Map<string, DkEventQuote>();
  for (const [gameId, ref] of byGame) {
    const q = quotes.get(ref.eventId);
    if (!q || q.sportsbook !== "draftkings") continue;
    const oriented = orientQuote(q, ref.swapped);
    quotesByGame.set(gameId, oriented);
    rows.push(...buildLineRows(sport, gameId, ref.eventId, oriented, capturedAt));
  }
  return { rows, quotesByGame };
}
