/**
 * One game on Today and Games (D-070, D-077): matchup and line, time and total,
 * Public Bets and Public Money on one line, then the game's one line (D-075).
 */
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, Text, View, type TextStyle } from 'react-native';

import { B, OneLineText, T, TeamPair } from '@/components/night';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Game } from '@/lib/feed';
import { clock } from '@/lib/time';

/** Final games (D-087): which side won, or null while live, before the start, or on a tie. */
export function winnerOf(g: Game): 'away' | 'home' | null {
  if (g.state !== 'post') return null;
  const a = Number(g.away.score), h = Number(g.home.score);
  if (!Number.isFinite(a) || !Number.isFinite(h) || a === h) return null;
  return a > h ? 'away' : 'home';
}

/** Bold for the winner, gray for the loser, plain otherwise (D-087). */
export function useResultStyle(g: Game) {
  const c = useTheme();
  const w = winnerOf(g);
  return (side: 'away' | 'home'): TextStyle | undefined =>
    !w ? undefined : side === w ? { fontFamily: Font.semibold } : { color: c.textTertiary };
}

/** Team logos stand in for abbreviations on the splits line (owner, Nov 24). */
function logoFor(g: Game, abbr: string) {
  return abbr === g.home.abbr ? g.home.logo : g.away.logo;
}

export function matchupLabel(g: Game) {
  return `${teamLabel(g.away)} ${g.neutral ? 'vs' : 'at'} ${teamLabel(g.home)}`;
}

function teamLabel(t: Game['home']) {
  return t.rank ? `#${t.rank} ${t.name}` : t.name;
}

function StatusLine({ g }: { g: Game }) {
  const style = useResultStyle(g);
  if (g.state === 'pre') return <T size={14}>{[clock(g.start), g.tv].filter(Boolean).join(' · ')}</T>;
  return (
    <T size={14}>
      {g.state === 'in' ? 'Live · ' : 'Final · '}
      <Text style={style('away')}>{`${g.away.abbr} ${g.away.score ?? 0}`}</Text>
      {', '}
      <Text style={style('home')}>{`${g.home.abbr} ${g.home.score ?? 0}`}</Text>
    </T>
  );
}

export function GameRow({ game: g }: { game: Game }) {
  const bets = g.publicBets;
  const money = g.publicMoney;
  const style = useResultStyle(g);
  return (
    <Link href={{ pathname: '/game/[id]', params: { id: g.id, sport: g.sport } }} asChild>
      <Pressable style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 11 }} accessibilityRole="button" accessibilityLabel={matchupLabel(g)}>
        <TeamPair away={g.away.logo} home={g.home.logo} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <T size={16.5} numberOfLines={1} style={{ flex: 1, letterSpacing: -0.2 }}>
              <Text style={style('away')}>{teamLabel(g.away)}</Text>
              {g.neutral ? ' vs ' : ' at '}
              <Text style={style('home')}>{teamLabel(g.home)}</Text>
            </T>
            {g.line ? <T size={16.5} weight="medium">{g.line}</T> : null}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <StatusLine g={g} />
            {g.total ? <T size={14}>O/U {g.total}</T> : null}
          </View>
          {bets && money ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Image source={logoFor(g, bets.team)} style={{ width: 16, height: 16 }} contentFit="contain" accessibilityLabel={bets.team} />
              <T size={13.5}><B>{bets.pct}%</B> Public Bets · </T>
              <Image source={logoFor(g, money.team)} style={{ width: 16, height: 16 }} contentFit="contain" accessibilityLabel={money.team} />
              <T size={13.5}><B>{money.pct}%</B> Public Money</T>
            </View>
          ) : null}
          {g.oneLine ? <OneLineText line={g.oneLine} /> : null}
        </View>
      </Pressable>
    </Link>
  );
}
