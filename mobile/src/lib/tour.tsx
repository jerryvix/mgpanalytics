/**
 * The first-run tour (D-124, owner Nov 25: "I want people to know where to put their eyes"):
 * five quick steps, each an arrow at one thing with a line of text, Next and Skip. Shown once
 * per phone, the first time Today opens; Profile has Show Me Around to see it again.
 *
 * Steps point either at a measured target (the first game on Today, the Profile button) or at a
 * tab in the tab bar. The tab bar is native, so its items can't be measured: the tour lights up
 * the whole bar and the arrow points at where the tab sits (four equal slots).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, type Href } from 'expo-router';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { View } from 'react-native';

import { TourOverlay } from '@/components/tour-overlay';

const TOUR_KEY = 'tour-v1';

export type TourTargetId = 'game' | 'profile';

export type ViewHandle = ComponentRef<typeof View>;

export type TourStep = {
  title: string;
  body: string;
  route: Href;
  /** A measured target, or a tab slot (0 to 3) */
  target: TourTargetId | number;
  /** When the target isn't on screen (no games today, say) */
  fallback?: { tab: number; title: string; body: string };
};

export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Tap a Game',
    body: 'Betting Splits, trends and Capper Picks for every matchup',
    route: '/',
    target: 'game',
    fallback: { tab: 0, title: 'Today', body: 'Your games today, with Betting Splits and a stat for each' },
  },
  { title: 'Games', body: 'Any game this week, by sport and day', route: '/games', target: 1 },
  { title: 'Pulse', body: 'Betting Splits, Takes and trends across every game', route: '/pulse', target: 2 },
  { title: 'The Analyst', body: "Ask anything about tonight's games", route: '/analyst', target: 3 },
  { title: 'Profile', body: 'Your account, support and this tour again', route: '/', target: 'profile' },
];

type Tour = {
  /** Shows the tour if this phone hasn't seen it */
  maybeStart: () => void;
  /** Shows the tour from the first step */
  start: () => void;
  register: (id: TourTargetId, view: ViewHandle | null) => void;
};

const TourContext = createContext<Tour>({ maybeStart: () => undefined, start: () => undefined, register: () => undefined });

export const useTour = () => useContext(TourContext);

export function TourProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<number | null>(null);
  const targets = useRef(new Map<TourTargetId, ViewHandle>());
  const checked = useRef(false);

  const go = useCallback((i: number) => {
    router.navigate(TOUR_STEPS[i].route);
    setStep(i);
  }, []);

  const start = useCallback(() => go(0), [go]);

  const maybeStart = useCallback(() => {
    if (checked.current) return;
    checked.current = true;
    AsyncStorage.getItem(TOUR_KEY).then((v) => {
      if (v !== 'done') go(0);
    }, () => undefined);
  }, [go]);

  const end = useCallback(() => {
    AsyncStorage.setItem(TOUR_KEY, 'done').catch(() => undefined);
    setStep(null);
    router.navigate('/');
  }, []);

  const next = useCallback(() => {
    if (step === null) return;
    if (step + 1 >= TOUR_STEPS.length) end();
    else go(step + 1);
  }, [step, end, go]);

  const register = useCallback((id: TourTargetId, view: ViewHandle | null) => {
    if (view) targets.current.set(id, view);
    else targets.current.delete(id);
  }, []);

  // Read when a step is measured, not while rendering
  const getTarget = useCallback((id: TourTargetId) => targets.current.get(id), []);

  const value = useMemo(() => ({ maybeStart, start, register }), [maybeStart, start, register]);

  return (
    <TourContext value={value}>
      {children}
      {step !== null ? (
        <TourOverlay step={step} total={TOUR_STEPS.length} info={TOUR_STEPS[step]} getTarget={getTarget} onNext={next} onSkip={end} />
      ) : null}
    </TourContext>
  );
}

/** Marks a view the tour can point at. */
export function TourTarget({ id, children }: { id: TourTargetId; children: ReactNode }) {
  const { register } = useTour();
  return (
    <View ref={(v) => register(id, v)} collapsable={false}>
      {children}
    </View>
  );
}
