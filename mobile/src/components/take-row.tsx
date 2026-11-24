/**
 * One pick from an outside show (D-060, D-065, D-066, D-071): logo, the pick and price in
 * bold, the credit in the detail font, Why and Risks Flagged collapsed.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, Logo, Mono, T } from '@/components/night';
import { useTheme } from '@/hooks/use-theme';
import type { Take } from '@/lib/feed';

const LOGOS: Record<string, string> = {
  'early-edge': 'https://www.mgp-analytics.com/takes/sportsline.png',
  'bear-bets': 'https://www.mgp-analytics.com/takes/bear-bets.png',
  'hold-the-phone': 'https://www.mgp-analytics.com/takes/hold-the-phone.png',
};

export function pickLabel(t: Take): string {
  const legs = t.legs ?? [];
  if (legs.length > 1) return `${t.pick}${t.price ? ` ${t.price}` : ''} (${legs.length} Legs)`;
  return t.price ? `${t.pick} (${t.price})` : t.pick;
}

export function TakeRow({ take: t }: { take: Take }) {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  const details = Boolean(t.why || t.risks);
  const credit = t.person ? `${t.person} · ${t.show_name}` : t.show_name;
  return (
    <View style={{ marginHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.border, gap: 10 }}>
      <Pressable onPress={() => details && setOpen(!open)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
        accessibilityRole={details ? 'button' : undefined} accessibilityState={{ expanded: open }}>
        <Logo uri={LOGOS[t.show]} size={38} />
        <View style={{ flex: 1, gap: 4 }}>
          <T size={17} weight="bold">{pickLabel(t)}</T>
          <Mono>{credit}</Mono>
        </View>
        {details ? <Icon name={open ? 'chevron.up' : 'chevron.down'} size={16} /> : null}
      </Pressable>
      {(t.legs ?? []).length > 1 ? (
        <View style={{ marginLeft: 50, gap: 7 }}>
          {(t.legs ?? []).map((leg, i) => (
            <View key={leg} style={{ flexDirection: 'row', gap: 12 }}>
              <Mono style={{ width: 14 }}>{String(i + 1)}</Mono>
              <T size={15} weight="medium">{leg}</T>
            </View>
          ))}
        </View>
      ) : null}
      {open ? (
        <View style={{ marginLeft: 50, gap: 10 }}>
          {t.why ? (<View style={{ gap: 3 }}><Mono>Why</Mono><T size={15} style={{ lineHeight: 21 }}>{t.why}</T></View>) : null}
          {t.risks ? (<View style={{ gap: 3 }}><Mono>Risks Flagged</Mono><T size={15} style={{ lineHeight: 21 }}>{t.risks}</T></View>) : null}
        </View>
      ) : null}
    </View>
  );
}
