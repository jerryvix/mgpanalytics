/**
 * Betting Splits (D-096): read in a glance which side the public is on and by how much,
 * with thin bars and no per-team colors. Three styles were built for the owner to compare:
 *   leader   each line names the side the bets (or money) are on, its share, then a thin bar
 *   ends     both sides at the ends of a thin bar, the bigger one bold
 *   callout  one sentence per market over two hairline bars (bets white, money green)
 * The app uses LEADER; the web preview can switch with ?splits=ends|callout.
 */
import { Image } from 'expo-image';
import { Platform, Text, View } from 'react-native';

import { Icon, Mono, SectionTitle, T } from '@/components/night';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Game, SideSplit } from '@/lib/feed';
import { fmtLine } from '@/lib/time';

type Style = 'leader' | 'ends' | 'callout';
const STYLE: Style = ((Platform.OS === 'web' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('splits')) || 'leader') as Style;

/** DraftKings shows 100% / 0% before real betting comes in; those markets stay hidden (D-071, D-088). */
export const realSplit = (m?: SideSplit): m is SideSplit => !!m && m.bets > 2 && m.bets < 98 && m.money > 2 && m.money < 98;

type Side = { label: string; short: string; logo?: string; icon?: 'arrow.up' | 'arrow.down'; split: SideSplit };
type Pair = { name: string; left: Side; right: Side };

function Mark({ side, size }: { side: Side; size: number }) {
  if (side.logo) return <Image source={side.logo} style={{ width: size, height: size }} contentFit="contain" />;
  if (side.icon) return <Icon name={side.icon} size={size - 4} weight="bold" />;
  return null;
}

/** A thin bar: the first share in `fill`, the rest in gray. */
function Thin({ share, height, fill }: { share: number; height: number; fill?: string }) {
  const c = useTheme();
  return (
    <View style={{ flex: 1, flexDirection: 'row', height, borderRadius: height / 2, overflow: 'hidden', gap: 2 }}>
      <View style={{ flex: share, backgroundColor: fill ?? c.text }} />
      <View style={{ flex: 100 - share, backgroundColor: c.surfaceRaised }} />
    </View>
  );
}

const lead = (p: Pair, key: 'bets' | 'money') => (p.left.split[key] >= p.right.split[key] ? p.left : p.right);

// ---------- leader: "BETS  ◉ MEM -2.5  71%  ━━━━━━━━━━━━━──────"
function LeaderLine({ title, side, share, compact }: { title: string; side: Side; share: number; compact: boolean }) {
  const size = compact ? 13 : 15;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }} accessible accessibilityLabel={`${title}: ${share}% on ${side.label}`}>
      <View style={{ width: compact ? 46 : 54 }}><Mono style={compact ? { fontSize: 10.5 } : undefined}>{title}</Mono></View>
      <Mark side={side} size={compact ? 14 : 18} />
      <T size={size} weight="medium" numberOfLines={1} style={{ minWidth: compact ? 62 : 92 }}>{side.label}</T>
      <T size={size} weight="semibold" style={{ width: compact ? 34 : 40, textAlign: 'right' }}>{share}%</T>
      <Thin share={share} height={compact ? 4 : 5} />
    </View>
  );
}

// ---------- ends: "◉ -2.5  71% ━━━━━━━━━━━━────── 29%  +2.5 ◉"
function EndsLine({ title, p, k, compact }: { title: string; p: Pair; k: 'bets' | 'money'; compact: boolean }) {
  const c = useTheme();
  const l = p.left.split[k], r = p.right.split[k];
  const size = compact ? 13 : 14.5;
  const tone = (on: boolean) => ({ color: on ? c.text : c.textTertiary, fontFamily: on ? Font.semibold : Font.regular, fontSize: size });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessible accessibilityLabel={`${title}: ${p.left.label} ${l}%, ${p.right.label} ${r}%`}>
      <View style={{ width: compact ? 46 : 54 }}><Mono style={compact ? { fontSize: 10.5 } : undefined}>{title}</Mono></View>
      <Mark side={p.left} size={compact ? 14 : 16} />
      <Text style={tone(l >= r)}>{p.left.short} {l}%</Text>
      <Thin share={l} height={compact ? 4 : 5} />
      <Text style={tone(r > l)}>{r}% {p.right.short}</Text>
      <Mark side={p.right} size={compact ? 14 : 16} />
    </View>
  );
}

// ---------- callout: "◉ MEM -2.5: 71% of bets · 80% of money" over two hairlines
function Callout({ p, compact }: { p: Pair; compact: boolean }) {
  const c = useTheme();
  const b = lead(p, 'bets'), m = lead(p, 'money');
  const size = compact ? 13.5 : 15;
  const bs = b.split.bets, ms = m.split.money;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {b === m ? (
          <>
            <Mark side={b} size={compact ? 14 : 18} />
            <T size={size}><Text style={{ fontFamily: Font.semibold }}>{b.label}</Text>{`: ${bs}% of bets · `}<Text style={{ color: c.brand }}>{`${ms}% of money`}</Text></T>
          </>
        ) : (
          <>
            <Mark side={b} size={compact ? 14 : 18} />
            <T size={size}><Text style={{ fontFamily: Font.semibold }}>{b.label}</Text>{`: ${bs}% of bets`}</T>
            <T size={size}>·</T>
            <Mark side={m} size={compact ? 14 : 18} />
            <T size={size}><Text style={{ fontFamily: Font.semibold }}>{m.label}</Text>{': '}<Text style={{ color: c.brand }}>{`${ms}% of money`}</Text></T>
          </>
        )}
      </View>
      <View style={{ gap: 3 }}>
        <View style={{ flexDirection: 'row' }}><Thin share={bs} height={3} /></View>
        <View style={{ flexDirection: 'row' }}><Thin share={ms} height={3} fill={c.brand} /></View>
      </View>
    </View>
  );
}

function PairLines({ p, compact }: { p: Pair; compact: boolean }) {
  if (STYLE === 'callout') return <Callout p={p} compact={compact} />;
  if (STYLE === 'ends') {
    return (
      <View style={{ gap: compact ? 5 : 8 }}>
        <EndsLine title="Bets" p={p} k="bets" compact={compact} />
        <EndsLine title="Money" p={p} k="money" compact={compact} />
      </View>
    );
  }
  const b = lead(p, 'bets'), m = lead(p, 'money');
  return (
    <View style={{ gap: compact ? 5 : 9 }}>
      <LeaderLine title="Bets" side={b} share={b.split.bets} compact={compact} />
      <LeaderLine title="Money" side={m} share={m.split.money} compact={compact} />
    </View>
  );
}

const price = (p: number | null) => (p === null ? '' : p > 0 ? `+${p}` : `${p}`);

function pairs(g: Game): Pair[] {
  const s = g.splits;
  if (!s || g.splitsPending) return [];
  const out: Pair[] = [];
  const sp = s.spread, tot = s.total, ml = s.moneyline;
  if (realSplit(sp?.away) && realSplit(sp?.home)) {
    out.push({ name: 'Spread',
      left: { label: `${g.away.abbr} ${fmtLine(sp.away.line)}`, short: fmtLine(sp.away.line), logo: g.away.logo, split: sp.away },
      right: { label: `${g.home.abbr} ${fmtLine(sp.home.line)}`, short: fmtLine(sp.home.line), logo: g.home.logo, split: sp.home } });
  }
  if (realSplit(tot?.over) && realSplit(tot?.under)) {
    out.push({ name: 'Total',
      left: { label: `Over ${tot.over.line ?? ''}`.trim(), short: `O ${tot.over.line ?? ''}`.trim(), icon: 'arrow.up', split: tot.over },
      right: { label: `Under ${tot.under.line ?? ''}`.trim(), short: `U ${tot.under.line ?? ''}`.trim(), icon: 'arrow.down', split: tot.under } });
  }
  if (realSplit(ml?.away) && realSplit(ml?.home)) {
    out.push({ name: 'Moneyline',
      left: { label: `${g.away.abbr} ${price(ml.away.price)}`.trim(), short: price(ml.away.price), logo: g.away.logo, split: ml.away },
      right: { label: `${g.home.abbr} ${price(ml.home.price)}`.trim(), short: price(ml.home.price), logo: g.home.logo, split: ml.home } });
  }
  return out;
}

/** Game rows (Today, Games): the spread only. */
export function RowSplits({ game: g }: { game: Game }) {
  const spread = pairs(g).find((p) => p.name === 'Spread');
  if (!spread) return null;
  return <View style={{ paddingTop: 2 }}><PairLines p={spread} compact /></View>;
}

/** Game page: every market with real numbers. */
export function SplitsBlock({ game: g }: { game: Game }) {
  const c = useTheme();
  const list = pairs(g);
  if (!list.length) return null;
  return (
    <>
      <SectionTitle>Betting Splits</SectionTitle>
      <View style={{ paddingHorizontal: 16 }}>
        {list.map((p) => (
          <View key={p.name} style={{ gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <T size={15} weight="semibold">{p.name}</T>
            <PairLines p={p} compact={false} />
          </View>
        ))}
      </View>
    </>
  );
}
