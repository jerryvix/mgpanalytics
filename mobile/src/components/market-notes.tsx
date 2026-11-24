/**
 * Credited public posts beside Betting Splits (D-102). A note is not a pick:
 * no price, no stake, a "Market Note" label, and a link to the post.
 */
import { Linking, Pressable, View } from 'react-native';

import { Mono, SectionTitle, T } from '@/components/night';
import { useTheme } from '@/hooks/use-theme';
import type { MarketNote } from '@/lib/feed';

export function MarketNotes({ notes }: { notes?: MarketNote[] | null }) {
  const c = useTheme();
  if (!notes?.length) return null;
  return (
    <View>
      <SectionTitle sub="From Public Posts">Market Notes</SectionTitle>
      {notes.map((n) => (
        <View key={n.id} style={{ marginHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border, gap: 6 }}>
          <Mono>Market Note</Mono>
          <T size={15} style={{ lineHeight: 21 }}>{n.body}</T>
          <Pressable onPress={() => Linking.openURL(n.url).catch(() => undefined)} accessibilityRole="link" accessibilityLabel={`Open the post from ${n.credit}`}>
            <Mono>{n.credit}</Mono>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
