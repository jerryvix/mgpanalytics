/**
 * The Analyst (D-030, D-080, D-094): an AI model answering like a general assistant and a
 * thought partner for bettors, MGP's data first and live web search for the rest, no picks.
 * Needs an account. A one-time notice says questions go to an outside AI partner (App Store
 * guideline 5.1.2) without naming it (D-085). Works like a normal iOS chat: selectable and
 * copyable answers, swipe the keyboard away, attach or paste images, New Chat and History
 * (saved to the same tables as the website).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActionSheetIOS, ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnswerFeedback } from '@/components/answer-feedback';
import { Icon, Mono, T, TopBar } from '@/components/night';
import { TAB_BAR_SPACE } from '@/constants/layout';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { askAnalyst } from '@/lib/analyst-api';
import { clipboardHasImage, pasteImage, pickImages, type Attachment } from '@/lib/attachments';
import { useAuth } from '@/lib/auth';
import { addMessage, createConversation, loadMessages } from '@/lib/chat-store';
import { plainDashes } from '@/lib/plain-dashes';

type Msg = { role: 'user' | 'assistant'; content: string; sources?: { title: string; url: string }[]; failed?: boolean; reason?: string; images?: Attachment[] };

const STARTERS = ["Where's the money tonight?", 'Any injuries to know for tonight?', 'How are the Bills ATS this season?'];
const CONSENT_KEY = 'analyst-ai-notice-v2'; // v2: D-085 wording, shown again once
const MAX_IMAGES = 4;

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel="Copy answer"
      onPress={async () => { await Clipboard.setStringAsync(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      <Icon name={done ? 'checkmark' : 'doc.on.doc'} size={16} />
    </Pressable>
  );
}

export default function AnalystScreen() {
  const c = useTheme();
  const { session, ready } = useAuth();
  const { c: openId } = useLocalSearchParams<{ c?: string }>();
  const [consented, setConsented] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [images, setImages] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    AsyncStorage.getItem(CONSENT_KEY).then((v) => setConsented(v === 'yes')).catch(() => setConsented(false));
  }, []);

  // Opening a chat from History
  useEffect(() => {
    if (!openId || openId === conversationId) return;
    let live = true;
    loadMessages(openId).then((rows) => {
      if (!live) return;
      setConversationId(openId);
      setMessages(rows.map((r) => ({ ...r, content: r.role === 'assistant' ? plainDashes(r.content) : r.content })));
    });
    return () => { live = false; };
  }, [openId, conversationId]);

  const newChat = () => {
    setMessages([]);
    setConversationId(null);
    setDraft('');
    setImages([]);
    router.setParams({ c: undefined });
  };

  const attach = async () => {
    const room = MAX_IMAGES - images.length;
    if (room <= 0) return;
    const add = (more: Attachment[]) => setImages((cur) => [...cur, ...more].slice(0, MAX_IMAGES));
    const canPaste = await clipboardHasImage();
    if (Platform.OS !== 'ios') return add(await pickImages(room));
    ActionSheetIOS.showActionSheetWithOptions(
      { options: canPaste ? ['Photo Library', 'Paste Image', 'Cancel'] : ['Photo Library', 'Cancel'], cancelButtonIndex: canPaste ? 2 : 1 },
      async (i) => {
        if (i === 0) add(await pickImages(room));
        if (canPaste && i === 1) { const img = await pasteImage(); if (img) add([img]); }
      },
    );
  };

  const ask = async (text: string) => {
    const q = text.trim() || (images.length ? 'Take a look at this' : '');
    if (!q || busy) return;
    const sent: Msg = { role: 'user', content: q, images: images.length ? images : undefined };
    const next: Msg[] = [...messages, sent];
    setMessages(next);
    setDraft('');
    setImages([]);
    setBusy(true);
    // Only real exchanges go back as context; failed replies stay on screen but not in the chat history.
    const history = next.filter((m) => !m.failed).map(({ role, content, images: imgs }) => ({
      role, content, ...(imgs?.length ? { images: imgs.map(({ mediaType, data }) => ({ mediaType, data })) } : {}),
    }));
    const reply = await askAnalyst(history);
    setBusy(false);
    if (!reply.ok) {
      const msg = reply.busy ? 'Lots of questions at once. Give it a minute and ask again' : "That one didn't go through. Try asking again";
      setMessages([...next, { role: 'assistant', content: msg, failed: true, reason: reply.reason }]);
      return;
    }
    const answer: Msg = { role: 'assistant', content: plainDashes(reply.content), sources: reply.sources };
    setMessages([...next, answer]);
    // Save to History (same tables as the website); a failure here never blocks the chat
    const uid = session?.user.id;
    if (!uid) return;
    let id = conversationId;
    if (!id) {
      id = await createConversation(uid, q);
      if (id) { setConversationId(id); router.setParams({ c: id }); }
    }
    if (id) {
      await addMessage(id, { role: 'user', content: sent.images?.length ? `${q} [image]` : q });
      await addMessage(id, { role: 'assistant', content: answer.content, sources: answer.sources });
    }
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
  // Answers select and copy like any iOS text
  const mdRules = {
    textgroup: (node: { key: string }, children: React.ReactNode, _parent: unknown, styles: { textgroup: object }) => (
      <Text key={node.key} style={styles.textgroup} selectable>{children}</Text>
    ),
  };

  const header = (
    <>
      <TopBar />
      <View style={{ paddingHorizontal: 16, paddingTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T size={34} weight="medium" style={{ letterSpacing: -0.8 }}>The Analyst</T>
        {session && consented ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => router.push('/analyst-history')} accessibilityRole="button" accessibilityLabel="Chat history"
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="clock.arrow.circlepath" size={18} />
            </Pressable>
            <Pressable onPress={newChat} disabled={!messages.length && !draft && !images.length} accessibilityRole="button" accessibilityLabel="New chat"
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', opacity: messages.length || draft || images.length ? 1 : 0.4 }}>
              <Icon name="square.and.pencil" size={18} />
            </Pressable>
          </View>
        ) : null}
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

  const canSend = (!!draft.trim() || images.length > 0) && !busy;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      {/* The composer keeps TAB_BAR_SPACE below it so it clears the floating tab bar; the negative
          offset lets it sit right on the keyboard when typing (D-090). */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={-TAB_BAR_SPACE}>
        <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} contentContainerStyle={{ paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
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
            <View key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%', marginHorizontal: 16, marginTop: 14, gap: 6, alignItems: 'flex-end' }}>
              {m.images?.length ? (
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {m.images.map((img) => <Image key={img.uri} source={img.uri} style={{ width: 96, height: 96, borderRadius: 12 }} contentFit="cover" />)}
                </View>
              ) : null}
              <View style={{ padding: 12, borderRadius: 18, backgroundColor: c.surfaceRaised }}>
                <T size={16} style={{ lineHeight: 22 }} selectable>{m.content}</T>
              </View>
            </View>
          ) : (
            <View key={i} style={{ marginHorizontal: 16, marginTop: 14, gap: 8 }}>
              <Markdown style={md} rules={mdRules as never}>{m.content}</Markdown>
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
              {m.failed && m.reason ? <Mono>{`Code: ${m.reason}`}</Mono> : null}
              {!m.failed ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
                  <View style={{ paddingTop: 6 }}><CopyButton text={m.content} /></View>
                  <View style={{ flex: 1 }}><AnswerFeedback question={messages[i - 1]?.content ?? ''} answer={m.content} sources={m.sources} /></View>
                </View>
              ) : null}
            </View>
          ))}
          {busy ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginHorizontal: 16, marginTop: 14 }}>
              <ActivityIndicator color={c.text} />
              <Mono>Working on it</Mono>
            </View>
          ) : null}
        </ScrollView>
        <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: TAB_BAR_SPACE + 8, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg, gap: 8 }}>
          {images.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingLeft: 44 }}>
              {images.map((img, i) => (
                <View key={img.uri}>
                  <Image source={img.uri} style={{ width: 64, height: 64, borderRadius: 10 }} contentFit="cover" />
                  <Pressable onPress={() => setImages(images.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel="Remove image"
                    style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: c.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="xmark" size={11} weight="bold" />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <Pressable onPress={attach} disabled={images.length >= MAX_IMAGES} accessibilityRole="button" accessibilityLabel="Add a photo"
              style={{ width: 36, height: 40, alignItems: 'center', justifyContent: 'center', opacity: images.length >= MAX_IMAGES ? 0.4 : 1 }}>
              <Icon name="plus.circle" size={24} />
            </Pressable>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: 20, backgroundColor: c.surface }}>
              <TextInput ref={input} value={draft} onChangeText={setDraft} placeholder="What can I dig into for you?" placeholderTextColor={c.textTertiary} multiline
                style={{ flex: 1, maxHeight: 140, color: c.text, fontFamily: Font.regular, fontSize: 16, paddingLeft: 14, paddingRight: draft ? 4 : 14, paddingVertical: 10 }} />
              {draft ? (
                <Pressable onPress={() => { setDraft(''); input.current?.focus(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear"
                  style={{ paddingHorizontal: 10, height: 40, justifyContent: 'center' }}>
                  <Icon name="xmark.circle.fill" size={17} color={c.textTertiary} />
                </Pressable>
              ) : null}
            </View>
            <Pressable onPress={() => ask(draft)} disabled={!canSend} accessibilityLabel="Send"
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.brand, opacity: canSend ? 1 : 0.4, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="arrow.up" size={17} color={c.onBrand} weight="bold" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
