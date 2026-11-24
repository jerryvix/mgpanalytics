/** Betting Splits on the game page (D-055, D-067): a bets bar and a money bar per market. */
import { View } from 'react-native';

import { Mono, T } from '@/components/night';
import { useTheme } from '@/hooks/use-theme';
import type { Game, SideSplit } from '@/lib/feed';
import { fmtLine } from '@/lib/time';

function Bar({ label, left, right }: { label: string; left: number; right: number }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 52 }}><Mono>{label}</Mono></View>
      <T size={14} weight="semibold" style={{ width: 38, textAlign: 'right' }}>{left}%</T>
      <View style={{ flex: 1, flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
        <View style={{ width: `${left}%`, backgroundColor: c.text }} />
        <View style={{ flex: 1, backgroundColor: c.surfaceRaised }} />
      </View>
      <T size={14} style={{ width: 38 }}>{right}%</T>
    </View>
  );
}

function Market({ name, leftLabel, rightLabel, left, right }: { name: string; leftLabel: string; rightLabel: string; left: SideSplit; right: SideSplit }) {
  const c = useTheme();
  return (
    <View style={{ gap: 7, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T size={15} weight="semibold">{name}</T>
        <T size={15}>{leftLabel} · {rightLabel}</T>
      </View>
      <Bar label="Bets" left={left.bets} right={right.bets} />
      <Bar label="Money" left={left.money} right={right.money} />
    </View>
  );
}

const price = (p: number | null) => (p === null ? '' : p > 0 ? `+${p}` : `${p}`);

export function SplitsBlock({ game: g }: { game: Game }) {
  const s = g.splits;
  if (!s || g.splitsPending) return null;
  return (
    <View style={{ paddingHorizontal: 16 }}>
      {s.spread?.away && s.spread?.home ? (
        <Market name="Spread" leftLabel={`${g.away.abbr} ${fmtLine(s.spread.away.line)}`} rightLabel={`${g.home.abbr} ${fmtLine(s.spread.home.line)}`} left={s.spread.away} right={s.spread.home} />
      ) : null}
      {s.total?.over && s.total?.under ? (
        <Market name="Total" leftLabel={`O ${s.total.over.line ?? ''}`} rightLabel={`U ${s.total.under.line ?? ''}`} left={s.total.over} right={s.total.under} />
      ) : null}
      {s.moneyline?.away && s.moneyline?.home ? (
        <Market name="Moneyline" leftLabel={`${g.away.abbr} ${price(s.moneyline.away.price)}`} rightLabel={`${g.home.abbr} ${price(s.moneyline.home.price)}`} left={s.moneyline.away} right={s.moneyline.home} />
      ) : null}
    </View>
  );
}
