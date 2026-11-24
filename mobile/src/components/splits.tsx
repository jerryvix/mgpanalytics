/**
 * Betting Splits on the game page (D-055, D-092): for each market, a Bets bar and a Money bar.
 * Each bar is split into the two sides, the first in white and the second in gray (owner: no
 * team colors), and each side's segment carries its logo, its bet ("MEM -2.5", "O 212.5") and
 * its share, so the side is named right where the number is. Narrow segments drop the words,
 * then the logo, but always keep the share.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Icon, Mono, SectionTitle, T } from '@/components/night';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Game, SideSplit } from '@/lib/feed';
import { fmtLine } from '@/lib/time';

/** DraftKings shows 100% / 0% before real betting comes in; those markets stay hidden (D-071, D-088). */
const real = (m?: SideSplit): m is SideSplit => !!m && m.bets > 2 && m.bets < 98 && m.money > 2 && m.money < 98;

type Side = { label: string; pct: number; logo?: string; icon?: 'arrow.up' | 'arrow.down' };

const BAR_H = 34;
const GAP = 3;
const MIN_SEG = 44; // room for "4%"

function Segment({ side, width, end }: { side: Side; width: number; end: 'left' | 'right' }) {
  const c = useTheme();
  const bg = end === 'left' ? c.text : c.surfaceRaised;
  const fg = end === 'left' ? c.bg : c.text;
  // Rough text widths at these sizes, so each side shows as much as fits
  const pctW = String(side.pct).length * 9.5 + 12;
  const markW = side.logo ? 22 : side.icon ? 13 : 0;
  const labelW = side.label.length * 7.8;
  const pad = 16 + 6 + 8; // padding, gap, breathing room
  const showMark = markW > 0 && width >= markW + pctW + pad;
  const showLabel = width >= markW + 6 + labelW + pctW + pad;
  const outer = { left: end === 'left', right: end === 'right' };
  const mark = side.logo ? (
    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Image source={side.logo} style={{ width: 16, height: 16 }} contentFit="contain" />
    </View>
  ) : side.icon ? <Icon name={side.icon} size={13} color={fg} weight="bold" /> : null;
  return (
    <View style={{
      width, height: BAR_H, backgroundColor: bg, paddingHorizontal: 8,
      flexDirection: end === 'left' ? 'row' : 'row-reverse', alignItems: 'center', justifyContent: showMark || showLabel ? 'space-between' : 'center',
      borderTopLeftRadius: outer.left ? 10 : 3, borderBottomLeftRadius: outer.left ? 10 : 3,
      borderTopRightRadius: outer.right ? 10 : 3, borderBottomRightRadius: outer.right ? 10 : 3,
    }}>
      {showMark || showLabel ? (
        <View style={{ flexDirection: end === 'left' ? 'row' : 'row-reverse', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          {showMark ? mark : null}
          {showLabel ? <Text numberOfLines={1} style={{ color: fg, fontFamily: Font.medium, fontSize: 14, flexShrink: 1 }}>{side.label}</Text> : null}
        </View>
      ) : null}
      <Text style={{ color: fg, fontFamily: Font.semibold, fontSize: 15, fontVariant: ['tabular-nums'] }}>{side.pct}%</Text>
    </View>
  );
}

function SplitBar({ title, left, right }: { title: string; left: Side; right: Side }) {
  const [w, setW] = useState(0);
  const inner = Math.max(w - GAP, 0);
  const lw = inner ? Math.min(Math.max((inner * left.pct) / Math.max(left.pct + right.pct, 1), MIN_SEG), inner - MIN_SEG) : 0;
  return (
    <View style={{ gap: 6 }}>
      <Mono>{title}</Mono>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', gap: GAP, height: BAR_H }}
        accessible accessibilityLabel={`${title}: ${left.label} ${left.pct}%, ${right.label} ${right.pct}%`}>
        {w > 0 ? (
          <>
            <Segment side={left} width={lw} end="left" />
            <Segment side={right} width={inner - lw} end="right" />
          </>
        ) : null}
      </View>
    </View>
  );
}

function Market({ name, left, right }: { name: string; left: Omit<Side, 'pct'> & { split: SideSplit }; right: Omit<Side, 'pct'> & { split: SideSplit } }) {
  const c = useTheme();
  return (
    <View style={{ paddingVertical: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <T size={15} weight="semibold">{name}</T>
      <SplitBar title="Bets" left={{ ...left, pct: left.split.bets }} right={{ ...right, pct: right.split.bets }} />
      <SplitBar title="Money" left={{ ...left, pct: left.split.money }} right={{ ...right, pct: right.split.money }} />
    </View>
  );
}

const price = (p: number | null) => (p === null ? '' : p > 0 ? `+${p}` : `${p}`);

export function SplitsBlock({ game: g }: { game: Game }) {
  const s = g.splits;
  if (!s || g.splitsPending) return null;
  const sp = s.spread, tot = s.total, ml = s.moneyline;
  const markets: { name: string; left: Omit<Side, 'pct'> & { split: SideSplit }; right: Omit<Side, 'pct'> & { split: SideSplit } }[] = [];
  if (real(sp?.away) && real(sp?.home)) {
    markets.push({ name: 'Spread',
      left: { label: `${g.away.abbr} ${fmtLine(sp.away.line)}`, logo: g.away.logo, split: sp.away },
      right: { label: `${g.home.abbr} ${fmtLine(sp.home.line)}`, logo: g.home.logo, split: sp.home } });
  }
  if (real(tot?.over) && real(tot?.under)) {
    markets.push({ name: 'Total',
      left: { label: `O ${tot.over.line ?? ''}`.trim(), icon: 'arrow.up', split: tot.over },
      right: { label: `U ${tot.under.line ?? ''}`.trim(), icon: 'arrow.down', split: tot.under } });
  }
  if (real(ml?.away) && real(ml?.home)) {
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
