/**
 * The Analyst (D-030, D-080): an AI model answering like a general assistant, MGP's data first
 * and live web search for the rest, no picks. Needs an account. A one-time notice says questions
 * go to an outside AI partner (App Store guideline 5.1.2) without naming it (D-085); the
 * privacy policy names the provider.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnswerFeedback } from '@/components/answer-feedback';
import { Icon, Mono, T, TopBar } from '@/components/night';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { plainDashes } from '@/lib/plain-dashes';
import { supabase } from '@/lib/supabase';

type Msg = { role: 'user' | 'assistant'; content: string; sources?: { title: string; url: string }[]; failed?: boolean };

const STARTERS = ["Where's the money tonight?", 'Any injuries to know for tonight?', 'How are the Bills ATS this season?'];
const CONSENT_KEY = 'analyst-ai-notice-v2'; // v2: D-085 wording, shown again once

export default function AnalystScreen() {
  const c = useTheme();
  const { session, ready } = useAuth();
  const [consented, setConsented] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    AsyncStorage.getItem(CONSENT_KEY).then((v) => setConsented(v === 'yes')).catch(() => setConsented(false));
  }, []);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setDraft('');
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('gemini-chat', {
      body: { messages: next.map(({ role, content }) => ({ role, content })) },
    });
    setBusy(false);
    if (error || !data?.content) {
      const status = (error as { context?: { status?: number } } | null)?.context?.status;
      const msg = status === 429 ? 'Lots of questions at once. Give it a minute and ask again' : "That one didn't go through. Try asking again";
      setMessages([...next, { role: 'assistant', content: msg, failed: true }]);
      return;
    }
    setMessages([...next, { role: 'assistant', content: plainDashes(data.content), sources: data.sources ?? [] }]);
  };

  const md = {
    body: { color: c.text, fontFamily: Font.regular, fontSize: 16, lineHeight: 23 },
    strong: { fontFamily: Font.semibold },
    heading1: { fontFamily: Font.semibold, fontSize: 20 },
    heading2: { fontFamily: Font.semibold, fontSize: 18 },
    heading3: { fontFamily: Font.semibold, fontSize: 16 },
    bullet_list: { marginVertical: 4 },
    table: { borderColor: c.border, borderRadius: 8 },
    th: { padding: 6 },
    td: { padding: 6 },
    tr: { borderColor: c.border },
    link: { color: c.text, textDecorationLine: 'underline' as const },
    code_inline: { backgroundColor: c.surface, color: c.text },
  };

  const header = (
    <>
      <TopBar />
      <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 6 }}>
        <T size={34} weight="medium" style={{ letterSpacing: -0.8 }}>The Analyst</T>
        <Mono>Splits, trends, matchups and the news</Mono>
      </View>
    </>
  );

  if (!ready || consented === null) return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>{header}</SafeAreaView>;

  if (!session) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
        {header}
        <View style={{ padding: 16, gap: 16 }}>
          <T size={17} style={{ lineHeight: 24 }}>{"Ask anything about tonight's games: where the money is, trends, injuries, matchups. Answers come from MGP's data and the web"}</T>
          <Pressable onPress={() => router.push('/sign-in')} accessibilityRole="button" style={{ height: 52, borderRadius: 999, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' }}>
            <T size={17} weight="bold" style={{ color: c.onBrand }}>Sign In to Ask</T>
          </Pressable>
          <T size={14}>Free with an MGP account</T>
        </View>
      </SafeAreaView>
    );
  }

  if (!consented) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
        {header}
        <View style={{ margin: 16, padding: 16, borderRadius: 16, backgroundColor: c.surface, gap: 12 }}>
          <T size={17} weight="semibold">Meet Your Analyst</T>
          <T size={15} style={{ lineHeight: 22 }}>Your AI-powered analyst, here to answer your questions on games, odds, splits and trends</T>
          <T size={13} style={{ lineHeight: 18 }}>{"Your questions go to our AI partner to answer, so leave out personal info"}</T>
          <Pressable onPress={() => { AsyncStorage.setItem(CONSENT_KEY, 'yes').catch(() => undefined); setConsented(true); }} accessibilityRole="button"
            style={{ alignSelf: 'flex-start', paddingHorizontal: 18, height: 44, borderRadius: 999, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' }}>
            <T size={15} weight="bold" style={{ color: c.onBrand }}>Got It</T>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={0}>
        <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          {header}
          {messages.length === 0 ? (
            <View style={{ padding: 16, gap: 10 }}>
              {STARTERS.map((s) => (
                <Pressable key={s} onPress={() => ask(s)} style={{ padding: 14, borderRadius: 14, backgroundColor: c.surface }}>
                  <T size={15}>{s}</T>
                </Pressable>
              ))}
            </View>
          ) : null}
          {messages.map((m, i) => m.role === 'user' ? (
            <View key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%', marginHorizontal: 16, marginTop: 14, padding: 12, borderRadius: 18, backgroundColor: c.surfaceRaised }}>
              <T size={16} style={{ lineHeight: 22 }}>{m.content}</T>
            </View>
          ) : (
            <View key={i} style={{ marginHorizontal: 16, marginTop: 14, gap: 8 }}>
              <Markdown style={md}>{m.content}</Markdown>
              {m.sources && m.sources.length ? (
                <View style={{ gap: 6 }}>
                  <Mono>Sources</Mono>
                  {m.sources.slice(0, 5).map((s) => (
                    <Pressable key={s.url} onPress={() => WebBrowser.openBrowserAsync(s.url)}>
                      <T size={14} numberOfLines={1} style={{ textDecorationLine: 'underline' }}>{s.title}</T>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {!m.failed ? <AnswerFeedback question={messages[i - 1]?.content ?? ''} answer={m.content} sources={m.sources} /> : null}
            </View>
          ))}
          {busy ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginHorizontal: 16, marginTop: 14 }}>
              <ActivityIndicator color={c.text} />
              <Mono>Working on it</Mono>
            </View>
          ) : null}
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg }}>
          <TextInput value={draft} onChangeText={setDraft} placeholder="Ask about any game" placeholderTextColor={c.textTertiary} multiline
            style={{ flex: 1, maxHeight: 120, color: c.text, fontFamily: Font.regular, fontSize: 16, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: c.surface }} />
          <Pressable onPress={() => ask(draft)} disabled={!draft.trim() || busy} accessibilityLabel="Send"
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.brand, opacity: !draft.trim() || busy ? 0.4 : 1, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="arrow.up" size={17} color={c.onBrand} weight="bold" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
