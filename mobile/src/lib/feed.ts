/**
 * The app's data: one read-only endpoint, `app-feed` (supabase/functions/app-feed),
 * which joins ESPN's schedule and DraftKings line, the latest DraftKings Betting Splits,
 * the one line per game (D-075) and the shows' Takes (D-074). Public data, no sign-in.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const FEED_URL = 'https://vwezujtftfccamoduglp.supabase.co/functions/v1/app-feed';

export type Sport = 'NFL' | 'NCAAF' | 'NBA';
export const SPORTS: Sport[] = ['NFL', 'NCAAF', 'NBA'];
export const SPORT_LABEL: Record<Sport, string> = { NFL: 'NFL', NCAAF: 'College Football', NBA: 'NBA' };

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
  /** D-093: picks stay up all day; graded once the game is final */
  state?: 'pre' | 'in' | 'post';
  result?: 'hit' | 'miss' | 'push' | null;
  final?: string | null;
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
  takesCount?: number;
  takes?: Take[];
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

/** Fetch a feed view; refetch on demand (pull to refresh) and whenever the params change. */
export function useFeed<T>(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  // Results are kept with the query they answer, so a screen never shows the previous day's games.
  const [state, setState] = useState<{ query: string; data: T | null; error: string | null }>({ query: '', data: null, error: null });
  const [loading, setLoading] = useState(true);
  const live = useRef(query);
  live.current = query;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${FEED_URL}?${query}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as T;
      if (live.current === query) setState({ query, data: body, error: null });
    } catch (e) {
      if (live.current === query) setState((s) => ({ query, data: s.query === query ? s.data : null, error: (e as Error).message }));
    } finally {
      if (live.current === query) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const current = state.query === query;
  return { data: current ? state.data : null, error: current ? state.error : null, loading: loading || !current, reload: load };
}
