/** Games (PLAN v1 #3): any day this week, by sport. */
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GameRow } from '@/components/game-row';
import { Divider, Empty, Footer, Mono, SectionTitle, T, TopBar } from '@/components/night';
import { TAB_BAR_SPACE } from '@/constants/layout';
import { useTheme } from '@/hooks/use-theme';
import { SPORT_LABEL, SPORTS, useFeed, type Game, type Sport } from '@/lib/feed';
import { ymd } from '@/lib/time';

export default function GamesScreen() {
  const c = useTheme();
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
  const [day, setDay] = useState(0);
  const [sport, setSport] = useState<Sport | 'ALL'>('ALL');
  const { data, loading, error, reload } = useFeed<{ games: Game[] }>({ view: 'day', date: ymd(days[day]), ...(sport === 'ALL' ? {} : { sports: sport }) });
  const games = data?.games ?? [];
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={c.text} />} contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE }}>
        <TopBar />
        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <T size={34} weight="medium" style={{ letterSpacing: -0.8 }}>Games</T>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, gap: 4 }}>
          {days.map((d, i) => {
            const on = i === day;
            return (
              <Pressable key={i} onPress={() => setDay(i)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={{ alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: on ? c.surfaceRaised : 'transparent' }}>
                <Mono>{i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}</Mono>
                <T size={17} weight={on ? 'semibold' : 'regular'}>{String(d.getDate())}</T>
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, gap: 4 }}>
          {(['ALL', ...SPORTS] as const).map((s) => {
            const on = s === sport;
            return (
              <Pressable key={s} onPress={() => setSport(s)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? c.surfaceRaised : 'transparent' }}>
                <T size={15} weight={on ? 'semibold' : 'regular'}>{s === 'ALL' ? 'All Sports' : SPORT_LABEL[s]}</T>
              </Pressable>
            );
          })}
        </ScrollView>
        {error ? <Empty>{"Games couldn't load. Pull down to try again"}</Empty> : null}
        {!loading && !error && games.length === 0 ? <Empty>No games that day</Empty> : null}
        {SPORTS.map((s) => {
          const list = games.filter((g) => g.sport === s);
          if (!list.length) return null;
          return (
            <View key={s}>
              <SectionTitle>{SPORT_LABEL[s]}</SectionTitle>
              {list.map((g, i) => (<View key={g.id}>{i > 0 ? <Divider /> : null}<GameRow game={g} /></View>))}
            </View>
          );
        })}
        <Footer />
      </ScrollView>
    </SafeAreaView>
  );
}
