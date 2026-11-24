/**
 * Betting Splits as skinny bars (D-093, owner's pick Nov 24): white for the first side
 * (away, Over), gray for the second (home, Under). Every bar names its sides: on the game
 * page each market starts with the two sides' logos and bets ("MEM -2.5", "O 212.5") above the
 * matching ends of its Bets and Money bars; on game rows each bar carries a logo at each end.
 */
import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { Icon, Mono, SectionTitle, T } from '@/components/night';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Game, SideSplit } from '@/lib/feed';
import { fmtLine } from '@/lib/time';

/** DraftKings shows 100% / 0% before real betting comes in; those markets stay hidden (D-071, D-088). */
export const realSplit = (m?: SideSplit): m is SideSplit => !!m && m.bets > 2 && m.bets < 98 && m.money > 2 && m.money < 98;

type SideMark = { logo?: string; icon?: 'arrow.up' | 'arrow.down' };

function Mark({ side, size }: { side: SideMark; size: number }) {
  if (side.logo) return <Image source={side.logo} style={{ width: size, height: size }} contentFit="contain" />;
  if (side.icon) return <Icon name={side.icon} size={size - 4} weight="bold" />;
  return null;
}

/** One skinny bar: share, bar, share. The bigger share is bold. */
function Bar({ left, right, height = 6 }: { left: number; right: number; height?: number }) {
  const c = useTheme();
  return (
    <View style={{ flex: 1, flexDirection: 'row', height, borderRadius: height / 2, overflow: 'hidden', gap: 2 }}>
      <View style={{ flex: left, backgroundColor: c.text }} />
      <View style={{ flex: right, backgroundColor: c.surfaceRaised }} />
    </View>
  );
}

const pctStyle = (bold: boolean) => ({ fontFamily: bold ? Font.semibold : Font.regular });

// ---------- game rows (Today, Games): the spread, logos at the ends

export function RowSplits({ game: g }: { game: Game }) {
  const sp = g.splits?.spread;
  if (g.splitsPending || !realSplit(sp?.away) || !realSplit(sp?.home)) return null;
  const a = sp.away, h = sp.home;
  const line = (label: string, l: number, r: number) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
      accessible accessibilityLabel={`${label}: ${g.away.abbr} ${fmtLine(a.line)} ${l}%, ${g.home.abbr} ${fmtLine(h.line)} ${r}%`}>
      <View style={{ width: 46 }}><Mono style={{ fontSize: 10.5 }}>{label}</Mono></View>
      <Mark side={{ logo: g.away.logo }} size={14} />
      <T size={13} style={[{ width: 32, textAlign: 'right' }, pctStyle(l > r)]}>{l}%</T>
      <Bar left={l} right={r} height={5} />
      <T size={13} style={[{ width: 32 }, pctStyle(r > l)]}>{r}%</T>
      <Mark side={{ logo: g.home.logo }} size={14} />
    </View>
  );
  return (
    <View style={{ gap: 5, paddingTop: 2 }}>
      {line('Bets', a.bets, h.bets)}
      {line('Money', a.money, h.money)}
    </View>
  );
}

// ---------- game page: every market, sides named above the bar ends

type Side = SideMark & { label: string; split: SideSplit };

function Market({ name, left, right }: { name: string; left: Side; right: Side }) {
  const c = useTheme();
  const row = (label: string, l: number, r: number) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
      accessible accessibilityLabel={`${label}: ${left.label} ${l}%, ${right.label} ${r}%`}>
      <View style={{ width: 52 }}><Mono>{label}</Mono></View>
      <T size={14} style={[{ width: 38, textAlign: 'right' }, pctStyle(l > r)]}>{l}%</T>
      <Bar left={l} right={r} height={8} />
      <T size={14} style={[{ width: 38 }, pctStyle(r > l)]}>{r}%</T>
    </View>
  );
  return (
    <View style={{ gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <T size={15} weight="semibold">{name}</T>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          <Mark side={left} size={18} />
          <Text numberOfLines={1} style={{ color: c.text, fontFamily: Font.medium, fontSize: 15 }}>{left.label}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          <Text numberOfLines={1} style={{ color: c.text, fontFamily: Font.medium, fontSize: 15 }}>{right.label}</Text>
          <Mark side={right} size={18} />
        </View>
      </View>
      {row('Bets', left.split.bets, right.split.bets)}
      {row('Money', left.split.money, right.split.money)}
    </View>
  );
}

const price = (p: number | null) => (p === null ? '' : p > 0 ? `+${p}` : `${p}`);

export function SplitsBlock({ game: g }: { game: Game }) {
  const s = g.splits;
  if (!s || g.splitsPending) return null;
  const sp = s.spread, tot = s.total, ml = s.moneyline;
  const markets: { name: string; left: Side; right: Side }[] = [];
  if (realSplit(sp?.away) && realSplit(sp?.home)) {
    markets.push({ name: 'Spread',
      left: { label: `${g.away.abbr} ${fmtLine(sp.away.line)}`, logo: g.away.logo, split: sp.away },
      right: { label: `${g.home.abbr} ${fmtLine(sp.home.line)}`, logo: g.home.logo, split: sp.home } });
  }
  if (realSplit(tot?.over) && realSplit(tot?.under)) {
    markets.push({ name: 'Total',
      left: { label: `O ${tot.over.line ?? ''}`.trim(), icon: 'arrow.up', split: tot.over },
      right: { label: `U ${tot.under.line ?? ''}`.trim(), icon: 'arrow.down', split: tot.under } });
  }
  if (realSplit(ml?.away) && realSplit(ml?.home)) {
    markets.push({ name: 'Moneyline',
      left: { label: `${g.away.abbr} ${price(ml.away.price)}`.trim(), logo: g.away.logo, split: ml.away },
      right: { label: `${g.home.abbr} ${price(ml.home.price)}`.trim(), logo: g.home.logo, split: ml.home } });
  }
  if (!markets.length) return null;
  return (
    <>
      <SectionTitle>Betting Splits</SectionTitle>
      <View style={{ paddingHorizontal: 16 }}>
        {markets.map((m) => <Market key={m.name} name={m.name} left={m.left} right={m.right} />)}
      </View>
    </>
  );
}
