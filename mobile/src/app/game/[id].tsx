/** The game page (D-055, D-075, D-076): Betting Splits first, the one line, the shows' Takes. */
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { matchupLabel, winnerOf } from '@/components/game-row';
import { Empty, Icon, Logo, Mono, OneLineText, SectionTitle, T } from '@/components/night';
import { SplitsBlock } from '@/components/splits';
import { TakeRow } from '@/components/take-row';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useFeed, type Game } from '@/lib/feed';
import { clock, whenLabel } from '@/lib/time';

export default function GameScreen() {
  const c = useTheme();
  const { id, sport } = useLocalSearchParams<{ id: string; sport: string }>();
  const { data, loading, error, reload } = useFeed<{ game?: Game }>({ view: 'game', id: id ?? '', sport: sport ?? 'NFL' });
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
        {error || (data && !g) ? <Empty>{"This game couldn't load. Pull down to try again"}</Empty> : null}
        {g ? (
          <>
            <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 8 }}>
              {(['away', 'home'] as const).map((side) => {
                const t = g[side];
                const r = result(side);
                return (
                  <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
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
            {g.splitsAsOf ? <Mono style={{ paddingHorizontal: 16, paddingTop: 12 }}>DraftKings · Updated {clock(g.splitsAsOf)}</Mono> : null}
            {g.takes && g.takes.length ? (
              <>
                <SectionTitle sub="Real Picks from Betting Experts">Takes</SectionTitle>
                {g.takes.map((t) => <TakeRow key={`${t.show}-${t.pick}`} take={t} />)}
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
