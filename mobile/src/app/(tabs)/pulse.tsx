/** Pulse (D-059, D-067, D-068): Betting Splits boards, the shows' Takes, and Trends. */
import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Divider, Empty, Footer, Logo, Mono, OneLineText, SectionTitle, Segs, T, TopBar, SourceNote } from '@/components/night';
import { TakeRow } from '@/components/take-row';
import { TAB_BAR_SPACE } from '@/constants/layout';
import { useTheme } from '@/hooks/use-theme';
import { gameHref, useFeed, type BoardSide, type Pulse, type Take } from '@/lib/feed';
import { fmtLine, whenLabel } from '@/lib/time';

type View_ = 'splits' | 'takes' | 'trends';

function BoardRow({ n, s, big, small }: { n: number; s: BoardSide; big: string; small: string }) {
  return (
    <Link href={gameHref(s.gameId, s.sport, s.start)} asChild>
      <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 9 }}>
        <Mono style={{ width: 14 }}>{String(n)}</Mono>
        <Logo uri={s.logo} size={32} />
        <View style={{ flex: 1, gap: 1 }}>
          <T size={16.5}>{s.team} {fmtLine(s.line)}</T>
          <T size={13.5}>{[`${s.home ? 'vs' : 'at'} ${s.opponent}`, whenLabel(s.start)].filter(Boolean).join(' · ')}</T>
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
      {rows.map((s, i) => (<View key={`${s.sport}-${s.gameId}-${s.home ? 'home' : 'away'}-${i}`}>{i > 0 ? <Divider /> : null}<BoardRow n={i + 1} s={s} big={big(s)} small={small(s)} /></View>))}
    </View>
  );
}

/** "NFL · Final · WSH 22, CIN 20", "NBA · Live", "NFL · Tonight 8:15 PM"; parts with no value drop out. */
function takesHeader(t: Take): string {
  const when = t.final ? `Final · ${t.final}` : t.state === 'in' ? 'Live' : whenLabel(t.starts_at);
  return [t.sport, when].filter(Boolean).join(' · ');
}

function TakesByGame({ takes }: { takes: Take[] }) {
  const games = new Map<string, Take[]>();
  for (const t of takes) {
    const k = t.espn_event_id ?? t.matchup ?? '';
    games.set(k, [...(games.get(k) ?? []), t]);
  }
  if (!games.size) return <Empty>New picks land here around noon and 6 PM Eastern</Empty>;
  return (
    <View>
      {[...games.entries()].map(([k, list]) => (
        <View key={k || 'game'}>
          <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 5 }}>
            <Mono>{takesHeader(list[0])}</Mono>
            {list[0].matchup ? <T size={19} weight="semibold" style={{ letterSpacing: -0.3 }}>{list[0].matchup}</T> : null}
          </View>
          {list.map((t, i) => <TakeRow key={t.id ?? `${i}-${t.show}-${t.pick}`} take={t} />)}
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
      <ScrollView refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={c.text} />} contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE }}>
        <TopBar />
        <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 6 }}>
          <T size={34} weight="medium" style={{ letterSpacing: -0.8 }}>Pulse</T>
          <Mono>{view === 'takes' ? 'Expert Picks' : 'The next three days'}</Mono>
        </View>
        <Segs items={[{ key: 'splits', label: 'Betting Splits' }, { key: 'takes', label: 'Takes' }, { key: 'trends', label: 'Trends' }]} active={view} onChange={setView} />
        {loading && !data ? <ActivityIndicator color={c.text} style={{ paddingVertical: 32 }} /> : null}
        {error && !loading ? <Empty>{"Pulse couldn't load. Pull down to try again"}</Empty> : null}
        {data && view === 'splits' ? (
          <>
            {!data.mostMoney.length && !data.biggestSplits.length && !data.mostBets.length ? (
              <Empty>{"Betting Splits show up here once the public starts betting today's games"}</Empty>
            ) : null}
            <Board title="Most Money" rows={data.mostMoney} big={(s) => `${s.money}%`} small={() => 'Of Money'} />
            <Board title="Money Ahead of Bets" rows={data.biggestSplits} big={(s) => `${s.money}% Money`} small={(s) => `${s.bets}% Of Bets`} />
            <Board title="Most Bets" rows={data.mostBets} big={(s) => `${s.bets}%`} small={() => 'Of Bets'} />
            <SourceNote />
          </>
        ) : null}
        {data && view === 'takes' ? <TakesByGame takes={data.takes} /> : null}
        {data && view === 'trends' ? (
          data.lines.length ? data.lines.map((l, i) => (
            <Link key={`${l.sport}-${l.gameId}-${i}`} href={gameHref(l.gameId, l.sport, l.start)} asChild>
              <Pressable style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 6, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <Mono>{[l.sport, l.matchup, whenLabel(l.start)].filter(Boolean).join(' · ')}</Mono>
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
