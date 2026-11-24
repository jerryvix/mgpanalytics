/** The game page (D-055, D-075, D-076, D-105): Betting Splits first, the one line and the player line, the shows' Takes. */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { matchupLabel, winnerOf } from '@/components/game-row';
import { Empty, Icon, Logo, OneLineText, SectionTitle, SourceNote, T } from '@/components/night';
import { SplitsBlock } from '@/components/splits';
import { MarketNotes } from '@/components/market-notes';
import { TakeRow } from '@/components/take-row';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useFeed, type Game, type PlayerLine } from '@/lib/feed';
import { formatPropBet } from '@shared/odds/format';
import { whenLabel } from '@/lib/time';

export default function GameScreen() {
  const c = useTheme();
  const { id, sport, date } = useLocalSearchParams<{ id: string; sport: string; date?: string }>();
  // The game's Eastern date (from the link) lets the feed read one scoreboard instead of nine
  const dated = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const [anyDate, setAnyDate] = useState(false);
  const { data, loading, error, reload } = useFeed<{ game?: Game }>({
    view: 'game', id: id ?? '', sport: sport ?? 'NFL', ...(dated && !anyDate ? { date } : {}),
  });
  // A late game can sit on ESPN's previous day: if the dated lookup misses, look across the week
  if (dated && !anyDate && data && !data.game) setAnyDate(true);
  const g = data?.game;
  const w = g ? winnerOf(g) : null;
  // D-087: final games bold the winner's name and score and gray the loser's
  const result = (side: 'away' | 'home') => (!w ? undefined : side === w ? { fontFamily: Font.semibold } : { color: c.textTertiary });
  const circle = { width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 6 }}>
        <Pressable accessibilityLabel="Back" onPress={() => router.back()} style={circle}><Icon name="chevron.left" size={18} /></Pressable>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable accessibilityLabel="Share" style={circle} onPress={() => g && Share.share({ message: `${matchupLabel(g)} on MGP Analytics: https://www.mgp-analytics.com` })}>
            <Icon name="square.and.arrow.up" size={18} />
          </Pressable>
        </View>
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={c.text} />} contentContainerStyle={{ paddingBottom: 48 }}>
        {loading && !data ? <ActivityIndicator color={c.text} style={{ paddingVertical: 32 }} /> : null}
        {!loading && (error || (data && !g)) ? <Empty>{"This game couldn't load. Pull down to try again"}</Empty> : null}
        {g ? (
          <>
            <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 8 }}>
              {(['away', 'home'] as const).map((side) => {
                const t = g[side];
                const r = result(side);
                return (
                  <View key={side} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Logo uri={t.logo} size={38} />
                    <T size={28} weight="medium" style={[{ flex: 1, letterSpacing: -0.6 }, r ?? {}]}>{t.rank ? `#${t.rank} ` : ''}{t.name}</T>
                    <T size={15} style={r ?? {}}>{g.state === 'pre' ? t.record ?? '' : t.score ?? ''}</T>
                  </View>
                );
              })}
              <T size={15}>{[g.state === 'pre' ? whenLabel(g.start) : g.status, g.state === 'post' ? null : g.tv, g.line, g.total ? `O/U ${g.total}` : null].filter(Boolean).join(' · ')}</T>
            </View>
            <SplitsBlock game={g} />
            {g.oneLine ? <View style={{ paddingHorizontal: 16, paddingTop: 14 }}><OneLineText line={g.oneLine} size={18} /></View> : null}
            {g.playerLine ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
                <OneLineText line={g.playerLine} size={18} note={propBet(g.playerLine)} />
              </View>
            ) : null}
            {g.splits && !g.splitsPending ? <SourceNote /> : null}
            <MarketNotes notes={g.notes} />
            {g.takes && g.takes.length ? (
              <>
                <SectionTitle tag="EXPERT">Expert Picks</SectionTitle>
                {g.takes.map((t, i) => <TakeRow key={t.id ?? `${i}-${t.show}-${t.pick}`} take={t} />)}
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** The prop a player line is measured against: "J. Allen O 240.5 Pass Yds -110" (price dropped when missing). */
function propBet(l: PlayerLine): string {
  return formatPropBet({ shortName: l.short_name, side: l.side, line: l.line, market: l.market_short, price: l.price });
}
