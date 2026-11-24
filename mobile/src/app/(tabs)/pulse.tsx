/** Pulse (D-059, D-067, D-068): Betting Splits boards, the shows' Takes, and Trends. */
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Divider, Empty, Footer, Logo, Mono, OneLineText, SectionTitle, Segs, T, TopBar } from '@/components/night';
import { TakeRow } from '@/components/take-row';
import { useTheme } from '@/hooks/use-theme';
import { useFeed, type BoardSide, type Pulse, type Take } from '@/lib/feed';
import { fmtLine, whenLabel } from '@/lib/time';

type View_ = 'splits' | 'takes' | 'trends';

function BoardRow({ n, s, big, small }: { n: number; s: BoardSide; big: string; small: string }) {
  return (
    <Link href={{ pathname: '/game/[id]', params: { id: s.gameId, sport: s.sport } }} asChild>
      <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 9 }}>
        <Mono style={{ width: 14 }}>{String(n)}</Mono>
        <Logo uri={s.logo} size={32} />
        <View style={{ flex: 1, gap: 1 }}>
          <T size={16.5}>{s.team} {fmtLine(s.line)}</T>
          <T size={13.5}>{s.home ? 'vs' : 'at'} {s.opponent} · {whenLabel(s.start)}</T>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <T size={17} weight="semibold">{big}</T>
          <Mono>{small}</Mono>
        </View>
      </Pressable>
    </Link>
  );
}

function Board({ title, sub, rows, big, small }: { title: string; sub?: string; rows: BoardSide[]; big: (s: BoardSide) => string; small: (s: BoardSide) => string }) {
  if (!rows.length) return null;
  return (
    <View>
      <SectionTitle sub={sub}>{title}</SectionTitle>
      {rows.map((s, i) => (<View key={`${s.gameId}-${s.abbr}`}>{i > 0 ? <Divider /> : null}<BoardRow n={i + 1} s={s} big={big(s)} small={small(s)} /></View>))}
    </View>
  );
}

function TakesByGame({ takes }: { takes: Take[] }) {
  const games = new Map<string, Take[]>();
  for (const t of takes) {
    const k = t.espn_event_id ?? t.matchup ?? '';
    games.set(k, [...(games.get(k) ?? []), t]);
  }
  if (!games.size) return <Empty>New picks from the shows land here around noon and 6 PM Eastern</Empty>;
  return (
    <View>
      {[...games.values()].map((list) => (
        <View key={list[0].espn_event_id ?? list[0].matchup}>
          <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 5 }}>
            <Mono>{list[0].sport} · {whenLabel(list[0].starts_at ?? '')}</Mono>
            <T size={19} weight="semibold" style={{ letterSpacing: -0.3 }}>{list[0].matchup}</T>
          </View>
          {list.map((t) => <TakeRow key={t.id ?? `${t.show}-${t.pick}`} take={t} />)}
        </View>
      ))}
    </View>
  );
}

export default function PulseScreen() {
  const c = useTheme();
  const [view, setView] = useState<View_>('splits');
  const { data, loading, error, reload } = useFeed<Pulse>({ view: 'pulse' });
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={c.text} />} contentContainerStyle={{ paddingBottom: 8 }}>
        <TopBar />
        <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 6 }}>
          <T size={34} weight="medium" style={{ letterSpacing: -0.8 }}>Pulse</T>
          <Mono>{view === 'takes' ? 'Real Picks from Betting Experts' : 'The next three days'}</Mono>
        </View>
        <Segs items={[{ key: 'splits', label: 'Betting Splits' }, { key: 'takes', label: 'Takes' }, { key: 'trends', label: 'Trends' }]} active={view} onChange={setView} />
        {error ? <Empty>{"Pulse couldn't load. Pull down to try again"}</Empty> : null}
        {data && view === 'splits' ? (
          <>
            <Board title="Most Money" rows={data.mostMoney} big={(s) => `${s.money}%`} small={() => 'Of Money'} />
            <Board title="Money Ahead of Bets" rows={data.biggestSplits} big={(s) => `${s.money}% Money`} small={(s) => `${s.bets}% Of Bets`} />
            <Board title="Most Bets" rows={data.mostBets} big={(s) => `${s.bets}%`} small={() => 'Of Bets'} />
            <Mono style={{ paddingHorizontal: 16, paddingTop: 16 }}>Betting Splits from DraftKings, spread</Mono>
          </>
        ) : null}
        {data && view === 'takes' ? <TakesByGame takes={data.takes} /> : null}
        {data && view === 'trends' ? (
          data.lines.length ? data.lines.map((l) => (
            <Link key={l.gameId} href={{ pathname: '/game/[id]', params: { id: l.gameId, sport: l.sport } }} asChild>
              <Pressable style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 6, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <Mono>{l.sport} · {l.matchup} · {whenLabel(l.start)}</Mono>
                <OneLineText line={l} size={17} />
              </Pressable>
            </Link>
          )) : <Empty>The strongest trends for the next three days show up here each morning</Empty>
        ) : null}
        <Footer />
      </ScrollView>
    </SafeAreaView>
  );
}
