/**
 * Word from the Window (D-102, D-104): credited public posts from people in the industry,
 * shown as posts, not game data. Each card: the author's X photo (initials if it fails), name
 * with a blue check when verified, "@handle · 2h", the X mark, the text as written, then
 * "via BetMGM" and View on X. No team or line chips, so a note never reads like a pick.
 * Hidden when the game has no notes.
 */
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon, SectionTitle } from '@/components/night';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MarketNote } from '@/lib/feed';

const CARD_BG = '#111111';
const CARD_BORDER = '#2a2a2a';
const VERIFIED_BLUE = '#1D9BF0';

/** "now", "12m", "2h", "3d", then "Nov 20" */
export function ago(iso?: string, now = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const m = Math.max(0, Math.floor((now - t) / 60000));
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

function Avatar({ uri, name }: { uri?: string | null; name: string }) {
  const c = useTheme();
  const [failed, setFailed] = useState(false);
  return (
    <View style={{ width: 32, height: 32, borderRadius: 16, overflow: 'hidden', backgroundColor: c.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}>
      {uri && !failed ? (
        <Image source={uri} style={{ width: 32, height: 32 }} contentFit="cover" onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
      ) : (
        <Text style={{ color: c.text, fontFamily: Font.semibold, fontSize: 12 }}>{initials(name)}</Text>
      )}
    </View>
  );
}

function NoteCard({ note: n }: { note: MarketNote }) {
  const c = useTheme();
  const name = n.name || n.credit;
  const handle = n.handle ? `@${n.handle.replace(/^@/, '')}` : '';
  const when = ago(n.posted_at);
  const muted = { color: c.textTertiary, fontFamily: Font.regular, fontSize: 13 };
  return (
    <View style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER, borderWidth: 1, borderRadius: 12, padding: 13, gap: 10 }}
      accessible accessibilityLabel={`Post from ${name}${n.source ? `, ${n.source}` : ''}: ${n.body}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar uri={n.avatar_url} name={name} />
        <View style={{ flex: 1, gap: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text numberOfLines={1} style={{ color: c.text, fontFamily: Font.bold, fontSize: 15, flexShrink: 1 }}>{name}</Text>
            {n.verified ? <Icon name="checkmark.seal.fill" size={15} color={VERIFIED_BLUE} /> : null}
          </View>
          <Text numberOfLines={1} style={muted}>{[handle, when].filter(Boolean).join(' · ')}</Text>
        </View>
        <Text style={{ color: c.text, fontSize: 17 }} accessibilityLabel="X">{'\u{1D54F}'}</Text>
      </View>
      <Text selectable style={{ color: c.text, fontFamily: Font.regular, fontSize: 15, lineHeight: 21 }}>{n.body}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={muted}>{n.source ? `via ${n.source}` : ''}</Text>
        <Pressable onPress={() => WebBrowser.openBrowserAsync(n.url).catch(() => undefined)} hitSlop={8} accessibilityRole="link" accessibilityLabel={`View ${name}'s post on X`}>
          <Text style={muted}>{'View on X ↗'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function MarketNotes({ notes }: { notes?: MarketNote[] | null }) {
  if (!notes?.length) return null;
  return (
    <View>
      <SectionTitle>Word from the Window</SectionTitle>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
        {notes.map((n) => <NoteCard key={n.id} note={n} />)}
      </View>
    </View>
  );
}
