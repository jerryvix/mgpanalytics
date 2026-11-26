/**
 * One tour step (D-124): the screen dimmed except the thing it's about, a bouncing arrow at it,
 * and a card with the title, one line, Skip and Next. See lib/tour.tsx for the steps.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, useColorScheme, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mono, T } from '@/components/night';
import { useTheme } from '@/hooks/use-theme';
import type { TourStep, TourTargetId, ViewHandle } from '@/lib/tour';

type Frame = { x: number; y: number; width: number; height: number };

const SCRIM = 'rgba(0,0,0,0.62)';
const ARROW = 34;
// On iOS 26 the tab bar floats a little in from the screen edges
const TAB_INSET = Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 26 ? 20 : 0;

function measure(view: ViewHandle | undefined): Promise<Frame | null> {
  return new Promise((resolve) => {
    if (!view) return resolve(null);
    view.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
  });
}

export function TourOverlay({ step, total, info, getTarget, onNext, onSkip }: {
  step: number;
  total: number;
  info: TourStep;
  getTarget: (id: TourTargetId) => ViewHandle | undefined;
  onNext: () => void;
  onSkip: () => void;
}) {
  const c = useTheme();
  const dark = useColorScheme() === 'dark';
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Where the current step points; a spot left from the last step isn't shown
  const [measured, setSpot] = useState<{ step: number; frame: Frame; tab: number | null; title: string; body: string } | null>(null);
  const spot = measured?.step === step ? measured : null;
  const [bounce] = useState(() => new Animated.Value(0));

  // The tab bar: its height from the bottom of the screen, and the middle of each of its four slots
  const barHeight = insets.bottom + 49;
  const tabX = (i: number) => TAB_INSET + ((i + 0.5) * (W - 2 * TAB_INSET)) / 4;

  useEffect(() => {
    let live = true;
    const bar = { x: 0, y: H - barHeight, width: W, height: barHeight };
    // Give the tab switch a moment to land before measuring
    const timer = setTimeout(async () => {
      if (typeof info.target === 'number') {
        if (live) setSpot({ step, frame: bar, tab: info.target, title: info.title, body: info.body });
        return;
      }
      const f = await measure(getTarget(info.target));
      if (!live) return;
      const onScreen = f && f.y >= insets.top && f.y + f.height <= H - barHeight;
      if (onScreen) setSpot({ step, frame: f, tab: null, title: info.title, body: info.body });
      else if (info.fallback) setSpot({ step, frame: bar, tab: info.fallback.tab, title: info.fallback.title, body: info.fallback.body });
      else onNext();
    }, 280);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [step, info, getTarget, W, H, barHeight, insets.top, onNext]);

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(bounce, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(bounce, { toValue: 0, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [bounce]);

  const last = step + 1 >= total;
  const pad = 6;
  const f = spot?.frame;
  // The lit area: a little bigger than the target, or the whole tab bar
  // (kept 3 points inside the screen edges, so the ring shows all the way around)
  const lit = (r: Frame) => {
    const x = Math.max(3, r.x - pad);
    const right = Math.min(W - 3, r.x + r.width + pad);
    return { x, y: r.y - pad, width: right - x, height: r.height + pad * 2 };
  };
  const hole = f ? (spot.tab !== null ? f : lit(f)) : null;
  // The card goes on the roomier side of the target, and the arrow between them points at it
  const below = hole ? hole.y + hole.height / 2 < H / 2 : false;
  const pointX = hole ? (spot?.tab !== null && spot ? tabX(spot.tab) : hole.x + hole.width / 2) : W / 2;
  const nudge = bounce.interpolate({ inputRange: [0, 1], outputRange: [0, below ? -8 : 8] });

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onSkip}>
      <View style={{ flex: 1 }} accessibilityViewIsModal>
        {hole ? (
          <>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(0, hole.y), backgroundColor: SCRIM }} />
            <View style={{ position: 'absolute', left: 0, right: 0, top: hole.y + hole.height, bottom: 0, backgroundColor: SCRIM }} />
            <View style={{ position: 'absolute', left: 0, width: Math.max(0, hole.x), top: hole.y, height: hole.height, backgroundColor: SCRIM }} />
            <View style={{ position: 'absolute', left: hole.x + hole.width, right: 0, top: hole.y, height: hole.height, backgroundColor: SCRIM }} />
            {spot?.tab === null ? (
              <View pointerEvents="none" style={{ position: 'absolute', left: hole.x, top: hole.y, width: hole.width, height: hole.height,
                borderRadius: 16, borderWidth: 2, borderColor: c.brand }} />
            ) : null}
          </>
        ) : (
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: SCRIM }} />
        )}

        {hole && spot ? (
          <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, ...(below ? { top: hole.y + hole.height + 8 } : { bottom: H - hole.y + 8 }) }}>
            {below ? <Arrow x={pointX - 16} up nudge={nudge} color={c.brand} /> : null}
            <View accessibilityLiveRegion="polite"
              style={{ backgroundColor: dark ? c.surfaceRaised : c.bg, borderRadius: 20, padding: 18, gap: 8, marginVertical: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <T size={20} weight="semibold" style={{ letterSpacing: -0.3 }}>{spot.title}</T>
                <Mono>{`${step + 1} of ${total}`}</Mono>
              </View>
              <T size={16} style={{ lineHeight: 22 }}>{spot.body}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                {last ? <View /> : (
                  <Pressable onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip the tour" hitSlop={10} style={{ paddingVertical: 10, paddingRight: 16 }}>
                    <T size={16} weight="semibold" style={{ opacity: 0.7 }}>Skip</T>
                  </Pressable>
                )}
                <Pressable onPress={onNext} accessibilityRole="button"
                  style={{ paddingHorizontal: 22, height: 44, borderRadius: 999, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' }}>
                  <T size={16} weight="bold" style={{ color: c.onBrand }}>{last ? 'Done' : 'Next'}</T>
                </Pressable>
              </View>
            </View>
            {!below ? <Arrow x={pointX - 16} nudge={nudge} color={c.brand} /> : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function Arrow({ x, up, nudge, color }: { x: number; up?: boolean; nudge: Animated.AnimatedInterpolation<number>; color: string }) {
  // Drawn, not an icon, so it looks the same everywhere. x is in screen points; the card's box starts 16 points in
  const head = { width: 0, height: 0, borderLeftWidth: 11, borderRightWidth: 11, borderLeftColor: 'transparent', borderRightColor: 'transparent' };
  return (
    <Animated.View pointerEvents="none" style={{ marginLeft: Math.max(0, x - 16), width: 32, height: ARROW, alignItems: 'center', justifyContent: 'center', transform: [{ translateY: nudge }] }}>
      {up ? <View style={{ ...head, borderBottomWidth: 13, borderBottomColor: color }} /> : null}
      <View style={{ width: 5, height: ARROW - 15, borderRadius: 2.5, backgroundColor: color }} />
      {!up ? <View style={{ ...head, borderTopWidth: 13, borderTopColor: color }} /> : null}
    </Animated.View>
  );
}
