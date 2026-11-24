/**
 * One game on Today and Games (D-070, D-077): matchup and line, time and total,
 * Public Bets and Public Money on one line, then the game's one line (D-075).
 */
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import { B, Mono, OneLineText, T, TeamPair } from '@/components/night';
import type { Game } from '@/lib/feed';
import { clock } from '@/lib/time';

/** Team logos stand in for abbreviations on the splits line (owner, Nov 24). */
function logoFor(g: Game, abbr: string) {
  return abbr === g.home.abbr ? g.home.logo : g.away.logo;
}

export function matchupLabel(g: Game) {
  const away = g.away.rank ? `#${g.away.rank} ${g.away.name}` : g.away.name;
  const home = g.home.rank ? `#${g.home.rank} ${g.home.name}` : g.home.name;
  return `${away} ${g.neutral ? 'vs' : 'at'} ${home}`;
}

function statusLine(g: Game): string {
  if (g.state === 'in') return `Live · ${g.away.abbr} ${g.away.score ?? 0}, ${g.home.abbr} ${g.home.score ?? 0}`;
  if (g.state === 'post') return `Final · ${g.away.abbr} ${g.away.score ?? 0}, ${g.home.abbr} ${g.home.score ?? 0}`;
  return [clock(g.start), g.tv].filter(Boolean).join(' · ');
}

export function GameRow({ game: g }: { game: Game }) {
  const bets = g.publicBets;
  const money = g.publicMoney;
  return (
    <Link href={{ pathname: '/game/[id]', params: { id: g.id, sport: g.sport } }} asChild>
      <Pressable style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 11 }} accessibilityRole="button" accessibilityLabel={matchupLabel(g)}>
        <TeamPair away={g.away.logo} home={g.home.logo} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <T size={16.5} numberOfLines={1} style={{ flex: 1, letterSpacing: -0.2 }}>{matchupLabel(g)}</T>
            {g.line ? <T size={16.5} weight="medium">{g.line}</T> : null}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <T size={14}>{statusLine(g)}</T>
            {g.total ? <T size={14}>O/U {g.total}</T> : null}
          </View>
          {bets && money ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Image source={logoFor(g, bets.team)} style={{ width: 16, height: 16 }} contentFit="contain" accessibilityLabel={bets.team} />
              <T size={13.5}><B>{bets.pct}%</B> Public Bets · </T>
              <Image source={logoFor(g, money.team)} style={{ width: 16, height: 16 }} contentFit="contain" accessibilityLabel={money.team} />
              <T size={13.5}><B>{money.pct}%</B> Public Money</T>
            </View>
          ) : g.splitsPending ? (
            <Mono>Betting Splits once the public weighs in</Mono>
          ) : null}
          {g.oneLine ? <OneLineText line={g.oneLine} /> : null}
        </View>
      </Pressable>
    </Link>
  );
}
