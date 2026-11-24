/**
 * Thumbs up or down on an Analyst answer (D-082). A thumbs down asks why in one tap, with an
 * optional note; both go to analyst_feedback with the question and answer.
 */
import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Icon, Mono, T } from '@/components/night';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

const REASONS: { key: string; label: string }[] = [
  { key: 'wrong', label: 'Wrong Number' },
  { key: 'outdated', label: 'Out of Date' },
  { key: 'missed', label: "Didn't Answer" },
  { key: 'too_long', label: 'Too Long' },
  { key: 'other', label: 'Something Else' },
];

type Props = { question: string; answer: string; sources?: { title: string; url: string }[] };

export function AnswerFeedback({ question, answer, sources }: Props) {
  const c = useTheme();
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  // Refs, not state, so a quick double tap sees them at once: one row per answer, saves in order
  const rowId = useRef<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const saved = useRef<'up' | 'down' | null>(null);

  const save = (r: 'up' | 'down', why: string | null = null, text = '') => {
    saved.current = r;
    const row = { source: 'app', rating: r, reason: why, note: text.trim() || null, question, answer, sources: sources ?? [] };
    queue.current = queue.current.then(async () => {
      try {
        if (rowId.current) {
          await supabase.from('analyst_feedback').update(row).eq('id', rowId.current);
        } else {
          const { data } = await supabase.from('analyst_feedback').insert(row).select('id').single();
          if (data?.id) rowId.current = data.id;
        }
      } catch {
        // Feedback never gets in the way of the chat
      }
    });
  };

  const thumb = (r: 'up' | 'down') => {
    if (r === 'up') {
      if (saved.current === 'up') return;
      setRating('up');
      setSent(true);
      save('up');
    } else {
      // The form opens; nothing is sent until Send. A thumbs up after this sends again.
      saved.current = null;
      setRating('down');
      setSent(false);
    }
  };

  const sendDown = () => {
    if (saved.current === 'down') return;
    save('down', reason, note);
    setSent(true);
  };

  const chip = (on: boolean) => ({ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? c.surfaceRaised : c.surface });

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Pressable onPress={() => thumb('up')} accessibilityLabel="Good answer" accessibilityState={{ selected: rating === 'up' }} hitSlop={8}>
          <Icon name={rating === 'up' ? 'hand.thumbsup.fill' : 'hand.thumbsup'} size={17} />
        </Pressable>
        <Pressable onPress={() => thumb('down')} accessibilityLabel="Bad answer" accessibilityState={{ selected: rating === 'down' }} hitSlop={8}>
          <Icon name={rating === 'down' ? 'hand.thumbsdown.fill' : 'hand.thumbsdown'} size={17} />
        </Pressable>
        {sent ? <Mono>Thanks, this helps</Mono> : null}
      </View>
      {rating === 'down' && !sent ? (
        <View style={{ gap: 10, padding: 12, borderRadius: 14, backgroundColor: c.surface }}>
          <T size={15} weight="semibold">What was off?</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {REASONS.map((r) => (
              <Pressable key={r.key} onPress={() => setReason(r.key)} style={chip(reason === r.key)} accessibilityState={{ selected: reason === r.key }}>
                <T size={14} weight={reason === r.key ? 'semibold' : 'regular'}>{r.label}</T>
              </Pressable>
            ))}
          </View>
          <TextInput value={note} onChangeText={setNote} placeholder="Anything else? (optional)" placeholderTextColor={c.textTertiary} multiline maxLength={1000}
            style={{ color: c.text, fontFamily: Font.regular, fontSize: 15, minHeight: 40, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: c.bg }} />
          <Pressable onPress={sendDown} accessibilityRole="button"
            style={{ alignSelf: 'flex-start', paddingHorizontal: 16, height: 38, borderRadius: 999, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' }}>
            <T size={14} weight="bold" style={{ color: c.onBrand }}>Send</T>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
