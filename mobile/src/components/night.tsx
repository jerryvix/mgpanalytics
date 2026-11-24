/**
 * Direction I, Night List (D-050, D-064): one text color, hierarchy from type.
 * Geist for content, Geist Mono uppercase for small labels and sources, MGP green only
 * for the pulse mark and the one line. These are the building blocks every screen uses.
 */
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';

import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { OneLine } from '@/lib/feed';

export function T({ children, style, weight = 'regular', size = 16, numberOfLines }: {
  children: ReactNode;
  style?: TextStyle | TextStyle[];
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  size?: number;
  numberOfLines?: number;
}) {
  const c = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: c.text, fontFamily: Font[weight], fontSize: size, fontVariant: ['tabular-nums'] }, style]}>
      {children}
    </Text>
  );
}

/** Bold inline run inside a T. */
export function B({ children }: { children: ReactNode }) {
  return <Text style={{ fontFamily: Font.semibold }}>{children}</Text>;
}

/** Small uppercase detail label (D-064). */
export function Mono({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const c = useTheme();
  return (
    <Text style={[{ color: c.text, fontFamily: Font.mono, fontSize: 11.5, letterSpacing: 0.7, textTransform: 'uppercase' }, style]}>
      {children}
    </Text>
  );
}

export function Icon({ name, size = 20, color, weight = 'regular' }: { name: SymbolViewProps['name']; size?: number; color?: string; weight?: SymbolViewProps['weight'] }) {
  const c = useTheme();
  return <SymbolView name={name} size={size} tintColor={color ?? c.text} weight={weight} />;
}

/** Two team logos, away over home, slightly offset. */
export function TeamPair({ away, home, size = 32 }: { away?: string; home?: string; size?: number }) {
  const c = useTheme();
  const ring = { width: size, height: size, borderRadius: size / 2, backgroundColor: c.surface, borderWidth: 2, borderColor: c.bg };
  return (
    <View style={{ width: size + 10, height: size + 10 }}>
      <View style={[ring, { position: 'absolute', left: 0, top: 0 }]}>
        {away ? <Image source={away} style={{ width: size - 8, height: size - 8, margin: 2 }} contentFit="contain" /> : null}
      </View>
      <View style={[ring, { position: 'absolute', left: 10, top: 10 }]}>
        {home ? <Image source={home} style={{ width: size - 8, height: size - 8, margin: 2 }} contentFit="contain" /> : null}
      </View>
    </View>
  );
}

export function Logo({ uri, size = 34 }: { uri?: string; size?: number }) {
  const c = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
      {uri ? <Image source={uri} style={{ width: size * 0.72, height: size * 0.72 }} contentFit="contain" /> : null}
    </View>
  );
}

/** The one line per game (D-075), marked with the green pulse. Bolds the record. */
export function OneLineText({ line, size = 14 }: { line: OneLine; size?: number }) {
  const c = useTheme();
  const i = line.text.indexOf(line.record);
  const parts = i >= 0 ? [line.text.slice(0, i), line.record, line.text.slice(i + line.record.length)] : [line.text, '', ''];
  const ats = parts[2].startsWith(' ATS') ? ' ATS' : '';
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
      <View style={{ marginTop: 2 }}>
        <Icon name="waveform.path.ecg" size={size} color={c.brand} weight="semibold" />
      </View>
      <T size={size} style={{ flex: 1, lineHeight: size * 1.35 }}>
        {parts[0]}
        <B>{parts[1] + ats}</B>
        {parts[2].slice(ats.length)}
      </T>
    </View>
  );
}

/** Pill tabs used for Pulse views and the game page sections. */
export function Segs<K extends string>({ items, active, onChange }: { items: { key: K; label: string }[]; active: K; onChange: (k: K) => void }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingVertical: 8, flexWrap: 'wrap' }}>
      {items.map((it) => {
        const on = it.key === active;
        return (
          <Pressable key={it.key} onPress={() => onChange(it.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: on ? c.surfaceRaised : 'transparent' }}>
            <T size={15} weight={on ? 'semibold' : 'regular'}>{it.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionTitle({ children, sub, style }: { children: ReactNode; sub?: string; style?: ViewStyle }) {
  return (
    <View style={[{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4, gap: 4 }, style]}>
      <T size={20} weight="medium" style={{ letterSpacing: -0.3 }}>{children}</T>
      {sub ? <Mono>{sub}</Mono> : null}
    </View>
  );
}

/** Top bar: MGP mark, profile button. */
export function TopBar() {
  const c = useTheme();
  return (
    <View style={styles.topbar}>
      <View style={[styles.mark, { backgroundColor: c.surface }]}>
        <Icon name="waveform.path.ecg" size={18} color={c.brand} weight="bold" />
      </View>
      <Link href="/profile" asChild>
        <Pressable accessibilityLabel="Profile" style={StyleSheet.flatten([styles.avatar, { backgroundColor: c.surfaceRaised }])}>
          <Icon name="person.fill" size={16} />
        </Pressable>
      </Link>
    </View>
  );
}

export function Divider() {
  const c = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: 16 }} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <View style={{ padding: 24 }}>
      <T size={15} style={{ lineHeight: 21 }}>{children}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4 },
  mark: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
