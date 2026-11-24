/**
 * Betting Splits on the game page (D-055, D-067, D-089): each side gets its own row with
 * its logo and line, then its share of bets and its share of money, so every number sits
 * next to the side it belongs to. The bigger share in each column is bold.
 */
import { Image } from 'expo-image';
import { View } from 'react-native';

import { Icon, Mono, SectionTitle, T } from '@/components/night';
import { useTheme } from '@/hooks/use-theme';
import type { Game, SideSplit } from '@/lib/feed';
import { fmtLine } from '@/lib/time';

/** DraftKings shows 100% / 0% before real betting comes in; those markets stay hidden (D-071, D-088). */
const real = (m?: SideSplit): m is SideSplit => !!m && m.bets > 2 && m.bets < 98 && m.money > 2 && m.money < 98;

type Row = { key: string; label: string; logo?: string; icon?: 'arrow.up' | 'arrow.down'; split: SideSplit };

const BETS_W = 60;
const MONEY_W = 70;

function Market({ name, rows }: { name: string; rows: [Row, Row] }) {
  const c = useTheme();
  return (
    <View style={{ paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <T size={15} weight="semibold" style={{ flex: 1 }}>{name}</T>
        <View style={{ width: BETS_W, alignItems: 'flex-end' }}><Mono>Bets</Mono></View>
        <View style={{ width: MONEY_W, alignItems: 'flex-end' }}><Mono>Money</Mono></View>
      </View>
      {rows.map((r, i) => {
        const other = rows[1 - i].split;
        return (
          <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            accessible accessibilityLabel={`${r.label}: ${r.split.bets}% of bets, ${r.split.money}% of money`}>
            <View style={{ width: 22, alignItems: 'center' }}>
              {r.logo ? <Image source={r.logo} style={{ width: 22, height: 22 }} contentFit="contain" /> : r.icon ? <Icon name={r.icon} size={14} weight="semibold" /> : null}
            </View>
            <T size={16} numberOfLines={1} style={{ flex: 1 }}>{r.label}</T>
            <T size={16} weight={r.split.bets > other.bets ? 'semibold' : 'regular'} style={{ width: BETS_W, textAlign: 'right' }}>{r.split.bets}%</T>
            <T size={16} weight={r.split.money > other.money ? 'semibold' : 'regular'} style={{ width: MONEY_W, textAlign: 'right' }}>{r.split.money}%</T>
          </View>
        );
      })}
    </View>
  );
}

const price = (p: number | null) => (p === null ? '' : p > 0 ? `+${p}` : `${p}`);

export function SplitsBlock({ game: g }: { game: Game }) {
  const s = g.splits;
  if (!s || g.splitsPending) return null;
  const markets: { name: string; rows: [Row, Row] }[] = [];
  const sp = s.spread, tot = s.total, ml = s.moneyline;
  if (real(sp?.away) && real(sp?.home)) {
    markets.push({ name: 'Spread', rows: [
      { key: 'away', label: `${g.away.name} ${fmtLine(sp.away.line)}`, logo: g.away.logo, split: sp.away },
      { key: 'home', label: `${g.home.name} ${fmtLine(sp.home.line)}`, logo: g.home.logo, split: sp.home },
    ] });
  }
  if (real(tot?.over) && real(tot?.under)) {
    markets.push({ name: 'Total', rows: [
      { key: 'over', label: `Over ${tot.over.line ?? ''}`.trim(), icon: 'arrow.up', split: tot.over },
      { key: 'under', label: `Under ${tot.under.line ?? ''}`.trim(), icon: 'arrow.down', split: tot.under },
    ] });
  }
  if (real(ml?.away) && real(ml?.home)) {
    markets.push({ name: 'Moneyline', rows: [
      { key: 'away', label: `${g.away.name} ${price(ml.away.price)}`.trim(), logo: g.away.logo, split: ml.away },
      { key: 'home', label: `${g.home.name} ${price(ml.home.price)}`.trim(), logo: g.home.logo, split: ml.home },
    ] });
  }
  if (!markets.length) return null;
  return (
    <>
      <SectionTitle>Betting Splits</SectionTitle>
      <View style={{ paddingHorizontal: 16 }}>
        {markets.map((m) => <Market key={m.name} name={m.name} rows={m.rows} />)}
      </View>
    </>
  );
}
