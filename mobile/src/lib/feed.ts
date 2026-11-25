/**
 * The app's data: one read-only endpoint, `app-feed` (supabase/functions/app-feed),
 * which joins ESPN's schedule and DraftKings line, the latest DraftKings Betting Splits,
 * the one line per game (D-075), the game page's player line (D-105) and the shows' Takes
 * (D-074). Public data, no sign-in.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { easternDate } from '@/lib/time';

export const FEED_URL = 'https://vwezujtftfccamoduglp.supabase.co/functions/v1/app-feed';

export type Sport = 'NFL' | 'NCAAF' | 'NBA' | 'NCAAB';
/** The sports until the feed says otherwise (D-116): what the app has always shown. */
export const SPORTS: Sport[] = ['NFL', 'NCAAF', 'NBA'];
export const SPORT_LABEL: Record<Sport, string> = { NFL: 'NFL', NCAAF: 'College Football', NBA: 'NBA', NCAAB: 'College Basketball' };
/** Sports named inside a sentence ("No NFL, college football or NBA games today"). */
const SPORT_IN_SENTENCE: Record<Sport, string> = { NFL: 'NFL', NCAAF: 'college football', NBA: 'NBA', NCAAB: 'college basketball' };

/**
 * The sports the feed serves (D-116). app-feed's day and pulse views carry `sports`; the app shows those,
 * in that order, so a sport turned on in the feed (college basketball, behind ENABLE_NCAAB) appears without
 * an app update. Keys the app doesn't know are left out. Until a response says otherwise: SPORTS.
 */
let feedSports: Sport[] = SPORTS;
const sportListeners = new Set<() => void>();

function rememberSports(list: unknown) {
  if (!Array.isArray(list)) return;
  const keys = list
    .map((s) => (s && typeof s === 'object' ? (s as { key?: unknown }).key : s))
    .filter((k): k is Sport => typeof k === 'string' && k in SPORT_LABEL);
  if (!keys.length || keys.join() === feedSports.join()) return;
  feedSports = keys;
  sportListeners.forEach((l) => l());
}

export function useSports(): Sport[] {
  return useSyncExternalStore(
    (l) => {
      sportListeners.add(l);
      return () => sportListeners.delete(l);
    },
    () => feedSports,
  );
}

/** "NFL, college football or NBA" */
export function sportsSentence(list: Sport[]): string {
  const names = list.map((s) => SPORT_IN_SENTENCE[s]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : (names[0] ?? '');
}

export type Team = {
  id: string;
  abbr: string;
  name: string;
  location: string;
  displayName: string;
  logo?: string;
  color?: string | null;
  altColor?: string | null;
  record?: string | null;
  rank?: number | null;
  score?: string | null;
};

export type SideSplit = { bets: number; money: number; line: number | null; price: number | null };
export type Splits = {
  spread?: { away?: SideSplit; home?: SideSplit };
  total?: { over?: SideSplit; under?: SideSplit };
  moneyline?: { away?: SideSplit; home?: SideSplit };
};

export type OneLine = { text: string; record: string; supports: string; market: 'spread' | 'total'; tier: string };

/**
 * The game's strongest player line (D-105): a fact measured against the game's DraftKings prop,
 * "Dak Prescott has gone over 263.5 Pass Yds in 5 of his last 6 Thanksgiving games". `record` is the
 * run of `text` that's bolded; under it, `ticker` (tonight's opponent's rank, when the line needs it)
 * and the prop (`short_name`, `side`, `line`, `market_short`, `price`). `price` is null when the feed
 * has none (D-106).
 */
export type PlayerLine = {
  text: string;
  record: string;
  player_name: string;
  short_name: string;
  espn_athlete_id: string;
  team: string;
  sport: Sport;
  market: string;
  market_short: string;
  line: number;
  side: 'over' | 'under';
  price: string | null;
  hits: number;
  games: number;
  tier: 'strong' | 'fallback';
  ticker?: string | null;
};

export type Take = {
  id?: string;
  show: string;
  show_name: string;
  person: string | null;
  sport?: string;
  espn_event_id?: string;
  matchup?: string;
  starts_at?: string;
  market: string;
  pick: string;
  price: string | null;
  legs: string[] | null;
  why: string | null;
  risks: string | null;
  /** Stake, when the post named one ("5u") */
  units?: number | null;
  /** Original post, for X picks */
  url?: string | null;
  source?: string | null;
  /** D-093: picks stay up all day; graded once the game is final */
  state?: 'pre' | 'in' | 'post';
  result?: 'hit' | 'miss' | 'push' | null;
  final?: string | null;
};

/** A credited public post beside Betting Splits, shown as a post from an industry insider. Not a pick. */
export type MarketNote = {
  id: string;
  credit: string;
  body: string;
  url: string;
  market?: string | null;
  handle?: string;
  name?: string;
  avatar_url?: string | null;
  verified?: boolean;
  source?: string | null;
  posted_at?: string;
};

export type Game = {
  id: string;
  sport: Sport;
  start: string;
  state: 'pre' | 'in' | 'post';
  status: string;
  neutral: boolean;
  venue: string | null;
  tv: string | null;
  home: Team;
  away: Team;
  line?: string;
  total?: number;
  splits?: Splits;
  splitsAsOf?: string;
  splitsPending?: boolean;
  publicBets?: { pct: number; team: string };
  publicMoney?: { pct: number; team: string };
  oneLine?: OneLine;
  /** Game view only (D-105) */
  playerLine?: PlayerLine;
  takesCount?: number;
  takes?: Take[];
  notes?: MarketNote[];
};

export type BoardSide = {
  gameId: string;
  sport: Sport;
  start: string;
  team: string;
  abbr: string;
  logo?: string;
  opponent: string;
  home: boolean;
  line: number | null;
  bets: number;
  money: number;
};

export type Pulse = {
  mostMoney: BoardSide[];
  biggestSplits: BoardSide[];
  mostBets: BoardSide[];
  takes: Take[];
  lines: (OneLine & { gameId: string; sport: Sport; start: string; matchup: string; logo?: string })[];
};

/** True when the data holds a game (or a pick on a game) that's being played right now. */
function hasLiveGame(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as { games?: { state?: string }[]; game?: { state?: string }; takes?: { state?: string }[] };
  return (d.games ?? []).some((g) => g?.state === 'in') || d.game?.state === 'in' || (d.takes ?? []).some((t) => t?.state === 'in');
}

const LIVE_REFRESH_MS = 60_000;
/** Coming back to the app within this long of the last fetch doesn't fetch again. */
const FOREGROUND_GAP_MS = 15_000;

/**
 * Fetch a feed view. Refetches on demand (pull to refresh), whenever the params change, when
 * the app comes back to the foreground, and every minute while a game in it is live. The
 * background refetches are silent: they keep what's on screen and never show an error over it.
 */
export function useFeed<T>(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  // Results are kept with the query they answer, so a screen never shows the previous day's games.
  const [state, setState] = useState<{ query: string; data: T | null; error: string | null }>({ query: '', data: null, error: null });
  const [loading, setLoading] = useState(true);
  const latest = useRef(query);
  latest.current = query;
  const lastFetch = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    lastFetch.current = Date.now();
    try {
      const res = await fetch(`${FEED_URL}?${query}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as T;
      rememberSports((body as { sports?: unknown } | null)?.sports);
      if (latest.current === query) setState({ query, data: body, error: null });
    } catch (e) {
      if (latest.current === query && !silent) setState((s) => ({ query, data: s.query === query ? s.data : null, error: (e as Error).message }));
    } finally {
      if (latest.current === query && !silent) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  // Back in the foreground: pick up new scores, splits and picks
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && Date.now() - lastFetch.current > FOREGROUND_GAP_MS) load(true);
    });
    return () => sub.remove();
  }, [load]);

  const current = state.query === query;
  const data = current ? state.data : null;
  const live = hasLiveGame(data);

  // Live games: refresh every minute while the app is open
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') load(true);
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, load]);

  return { data, error: current ? state.error : null, loading: loading || !current, reload: () => load() };
}

/** Link to a game page with its Eastern date, so the feed looks up one scoreboard instead of nine. */
export function gameHref(id: string, sport: Sport, start?: string | null) {
  const date = easternDate(start);
  return { pathname: '/game/[id]' as const, params: date ? { id, sport, date } : { id, sport } };
}
