/** Today (D-070, D-077): your sports' games today, splits and the one line on each row. */
import { useEffect } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GameRow } from '@/components/game-row';
import { Divider, Empty, Footer, SectionTitle, SourceNote, T, TopBar } from '@/components/night';
import { TAB_BAR_SPACE } from '@/constants/layout';
import { useTheme } from '@/hooks/use-theme';
import { useToday } from '@/hooks/use-today';
import { SPORT_LABEL, sportsSentence, useFeed, useSports, type Game } from '@/lib/feed';
import { TourTarget, useTour } from '@/lib/tour';
import { longDate, ymd } from '@/lib/time';

export default function TodayScreen() {
  const c = useTheme();
  const today = useToday();
  const sports = useSports();
  const { data, loading, error, reload } = useFeed<{ games: Game[] }>({ view: 'day', date: ymd(today) });
  const games = data?.games ?? [];
  const asOf = games.map((g) => g.splitsAsOf).filter(Boolean).sort().pop();
  const tour = useTour();
  // The first-run tour (D-124) starts once today's games have loaded, so it can point at one
  const settled = !loading || !!error;
  useEffect(() => {
    if (settled) tour.maybeStart();
  }, [settled, tour]);
  const firstSport = sports.find((s) => games.some((g) => g.sport === s));
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={c.text} />} contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE }}>
        <TopBar profileRef={(v) => tour.register('profile', v)} />
        <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 6 }}>
          <T size={34} weight="medium" style={{ letterSpacing: -0.8 }}>Today</T>
          <T size={15}>{longDate(today)}</T>
        </View>
        {loading && !data ? <ActivityIndicator color={c.text} style={{ paddingVertical: 32 }} /> : null}
        {error && !loading ? <Empty>{"Today couldn't load. Pull down to try again"}</Empty> : null}
        {!loading && !error && games.length === 0 ? <Empty>{`No ${sportsSentence(sports)} games today`}</Empty> : null}
        {sports.map((sport) => {
          const list = games.filter((g) => g.sport === sport);
          if (!list.length) return null;
          return (
            <View key={sport}>
              <SectionTitle>{SPORT_LABEL[sport]}</SectionTitle>
              {list.map((g, i) => (
                <View key={g.id}>
                  {i > 0 ? <Divider /> : null}
                  {i === 0 && sport === firstSport ? <TourTarget id="game"><GameRow game={g} /></TourTarget> : <GameRow game={g} />}
                </View>
              ))}
            </View>
          );
        })}
        {asOf ? <SourceNote /> : null}
        <Footer />
      </ScrollView>
    </SafeAreaView>
  );
}
