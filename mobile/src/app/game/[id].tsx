/** The game page (D-055, D-075, D-076, D-105): Betting Splits first, the one line and the player line, the shows' Takes. */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { matchupLabel, winnerOf } from '@/components/game-row';
import { Empty, Icon, Logo, OneLineText, SectionTitle, T, Wordmark } from '@/components/night';
import { SplitsBlock } from '@/components/splits';
import { MarketNotes } from '@/components/market-notes';
import { TakeRow } from '@/components/take-row';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useFeed, type Game, type PlayerLine } from '@/lib/feed';
import { formatPropBet } from '@shared/odds/format';
import { easternDate, whenLabel } from '@/lib/time';

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
        {/* The MGP wordmark, centered between the buttons, so a screenshot shows where it's from (D-113) */}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 6, height: 44, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <Wordmark />
        </View>
        <Pressable accessibilityLabel="Back" onPress={() => router.back()} style={circle}><Icon name="chevron.left" size={18} /></Pressable>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable accessibilityLabel="Share" style={circle} onPress={() => g && shareGame(g)}>
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
                <OneLineText line={g.playerLine} size={18} sub={playerLineSub(g.playerLine)} />
              </View>
            ) : null}
            <MarketNotes notes={g.notes} />
            {g.takes && g.takes.length ? (
              <>
                <SectionTitle>Capper Picks</SectionTitle>
                {g.takes.map((t, i) => <TakeRow key={t.id ?? `${i}-${t.show}-${t.pick}`} take={t} />)}
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * The gray line under a player line (D-106): tonight's opponent's rank when the line needs it, then the
 * prop: "CHI DEF 7th in Rush YPG Allowed · J. Gibbs Anytime TD", or just "D. Prescott O 263.5 Pass Yds".
 */
function playerLineSub(l: PlayerLine): string {
  const bet = formatPropBet({ shortName: l.short_name, side: l.side, line: l.line, market: l.market_short, price: l.price });
  return [l.ticker, bet].filter(Boolean).join(' · ');
}

/**
 * Share (D-128): the game's own link, mgp-analytics.com/g/<sport>/<id>. In iMessage, X and the rest it
 * shows a picture of the game card with MGP along the bottom; tapping it on an iPhone opens the download.
 */
function shareGame(g: Game) {
  const date = easternDate(g.start);
  const url = `https://www.mgp-analytics.com/g/${g.sport.toLowerCase()}/${g.id}${date ? `?d=${date}` : ''}`;
  Share.share({ message: `${matchupLabel(g)} on MGP`, url }).catch(() => undefined);
}
