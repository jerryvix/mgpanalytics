/**
 * The Analyst (D-030, D-080, D-094): an AI model answering like a general assistant and a
 * thought partner for bettors, MGP's data first and live web search for the rest, no picks.
 * Needs an account. A one-time notice says questions go to an outside AI partner (App Store
 * guideline 5.1.2) without naming it (D-085). Works like a normal iOS chat: selectable and
 * copyable answers, swipe the keyboard away, attach or paste images, New Chat and History
 * (saved to the same tables as the website).
 *
 * Each chat on screen has a token. New Chat, opening a chat from History and a change of
 * account move to a new token, so a reply or save still on its way never lands in the wrong
 * chat, and message keys change with it so nothing (like an answer's feedback) carries over.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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
/** Images go with the latest 2 questions only; older questions send their text (D-097). */
const IMAGE_TURNS = 2;
/** Messages sent per question: the server reads the latest 20 and refuses more than 200 (D-099). */
const MAX_SENT = 40;
/** The server refuses a question longer than this. */
const MAX_QUESTION = 4000;

/** Links in answers and sources: https opens in the in-app browser, anything else is ignored. */
function openLink(url: string): boolean {
  const u = url.trim();
  if (/^https:\/\//i.test(u)) WebBrowser.openBrowserAsync(u).catch(() => undefined);
  return false; // never let the Markdown view open it on its own
}

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
  const { user, signedIn, ready } = useAuth();
  // Guests have a session too (auth.tsx); only an account can chat, so a guest counts as no one here
  const uid = signedIn && user ? user.id : null;
  const { c: openId } = useLocalSearchParams<{ c?: string }>();
  const [consented, setConsented] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [images, setImages] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  // New with every chat on screen; message keys start with it
  const [chatKey, setChatKey] = useState(0);
  const [owner, setOwner] = useState(uid);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const chatToken = useRef(0);
  // The saved conversation behind each chat token
  const savedIds = useRef(new Map<number, string>());
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const sending = useRef(false);
  const stickToEnd = useRef(false);
  const lastUid = useRef(uid);

  // Signed out, or another account signed in: the chat on screen isn't theirs
  if (uid !== owner) {
    setOwner(uid);
    if (owner !== null) {
      setMessages([]);
      setConversationId(null);
      setDraft('');
      setImages([]);
      setBusy(false);
      setOpenFailed(false);
      setChatKey((k) => k + 1);
    }
  }
  useEffect(() => {
    if (lastUid.current === uid) return;
    const had = lastUid.current;
    lastUid.current = uid;
    chatToken.current += 1;
    sending.current = false;
    if (had !== null) router.setParams({ c: undefined });
  }, [uid]);

  useEffect(() => {
    AsyncStorage.getItem(CONSENT_KEY).then((v) => setConsented(v === 'yes')).catch(() => setConsented(false));
  }, []);

  // Opening a chat from History
  useEffect(() => {
    if (!uid || !openId || openId === conversationId) return;
    // Already on screen: the chat this screen just saved
    if (savedIds.current.get(chatToken.current) === openId) return;
    const startToken = chatToken.current;
    let live = true;
    loadMessages(openId).then(
      (rows) => {
        // Dropped if New Chat or another chat came first
        if (!live || chatToken.current !== startToken) return;
        const token = (chatToken.current += 1);
        sending.current = false;
        savedIds.current.set(token, openId);
        stickToEnd.current = true;
        setConversationId(openId);
        setMessages(rows.map((r) => ({ ...r, content: r.role === 'assistant' ? plainDashes(r.content) : r.content })));
        setBusy(false);
        setOpenFailed(false);
        setChatKey((k) => k + 1);
      },
      () => {
        if (!live || chatToken.current !== startToken) return;
        // Not tied to the chat that didn't load: questions from here start a new one
        chatToken.current += 1;
        sending.current = false;
        setConversationId(null);
        setMessages([]);
        setBusy(false);
        setOpenFailed(true);
        setChatKey((k) => k + 1);
        router.setParams({ c: undefined });
      },
    );
    return () => { live = false; };
  }, [openId, conversationId, uid]);

  const newChat = () => {
    chatToken.current += 1;
    sending.current = false;
    setMessages([]);
    setConversationId(null);
    setDraft('');
    setImages([]);
    setBusy(false);
    setOpenFailed(false);
    setChatKey((k) => k + 1);
    router.setParams({ c: undefined });
  };

  const attach = async () => {
    const room = MAX_IMAGES - images.length;
    if (room <= 0) return;
    const add = (more: Attachment[]) => setImages((cur) => [...cur, ...more].slice(0, MAX_IMAGES));
    const failed = () => Alert.alert("Couldn't attach that image");
    const fromPhotos = async () => {
      try {
        const got = await pickImages(room);
        add(got.images);
        if (got.failed) failed();
      } catch {
        failed();
      }
    };
    const fromClipboard = async () => {
      try {
        add([await pasteImage()]);
      } catch {
        failed();
      }
    };
    const canPaste = await clipboardHasImage();
    if (Platform.OS !== 'ios') return fromPhotos();
    ActionSheetIOS.showActionSheetWithOptions(
      { options: canPaste ? ['Photo Library', 'Paste Image', 'Cancel'] : ['Photo Library', 'Cancel'], cancelButtonIndex: canPaste ? 2 : 1 },
      (i) => {
        if (i === 0) fromPhotos();
        if (canPaste && i === 1) fromClipboard();
      },
    );
  };

  /** Save one exchange to History (same tables as the website); a failure here never blocks the chat. */
  const saveExchange = (token: number, userId: string, q: string, sent: Msg, answer: Msg) => {
    const userRow = { role: 'user' as const, content: sent.images?.length ? `${q} [image]` : q };
    const answerRow = { role: 'assistant' as const, content: answer.content, sources: answer.sources };
    // One exchange at a time, in order, so a quick second question never starts a second saved chat
    saveQueue.current = saveQueue.current.then(async () => {
      const start = async () => {
        const id = await createConversation(userId, q);
        if (!id) return null;
        savedIds.current.set(token, id);
        if (chatToken.current === token) {
          setConversationId(id);
          router.setParams({ c: id });
        }
        return id;
      };
      let id = savedIds.current.get(token) ?? (await start());
      if (!id) return;
      if (!(await addMessage(id, userRow))) {
        // The saved chat is gone (deleted from History, say): keep this exchange in a new one
        id = await start();
        if (!id || !(await addMessage(id, userRow))) return;
      }
      await addMessage(id, answerRow);
    }).catch(() => undefined);
  };

  const ask = async (text: string) => {
    const q = text.trim() || (images.length ? 'Take a look at this' : '');
    if (!q || busy || sending.current) return;
    sending.current = true;
    const token = chatToken.current;
    const sent: Msg = { role: 'user', content: q, images: images.length ? images : undefined };
    const next: Msg[] = [...messages, sent];
    stickToEnd.current = true;
    setMessages(next);
    setDraft('');
    setImages([]);
    setBusy(true);
    setOpenFailed(false);
    // Only real exchanges go back as context; failed replies stay on screen but not in the chat history.
    const real = next.filter((m) => !m.failed).slice(-MAX_SENT);
    while (real.length > 1 && real[0].role !== 'user') real.shift();
    const withImages = new Set(real.flatMap((m, i) => (m.role === 'user' ? [i] : [])).slice(-IMAGE_TURNS));
    const history = real.map(({ role, content, images: imgs }, i) => ({
      role, content, ...(imgs?.length && withImages.has(i) ? { images: imgs.map(({ mediaType, data }) => ({ mediaType, data })) } : {}),
    }));
    const reply = await askAnalyst(history);
    // The chat changed while this was on its way (New Chat, History, another account): drop it
    if (chatToken.current !== token) return;
    sending.current = false;
    setBusy(false);
    stickToEnd.current = true;
    if (!reply.ok) {
      if (reply.daily) {
        // The 50 a day cap: a plain note, no failure code
        setMessages([...next, { role: 'assistant', content: "You've reached today's 50 questions. Ask again after midnight Eastern", failed: true }]);
        return;
      }
      if (reply.paused) {
        // The overall daily ceiling (D-109): not this person's doing, so no failure code
        setMessages([...next, { role: 'assistant', content: 'The Analyst is taking a break for the rest of today. Ask again after midnight Eastern', failed: true }]);
        return;
      }
      const msg = reply.busy ? 'Lots of questions at once. Give it a minute and ask again' : "That one didn't go through. Try asking again";
      setMessages([...next, { role: 'assistant', content: msg, failed: true, reason: reply.reason }]);
      return;
    }
    const answer: Msg = { role: 'assistant', content: plainDashes(reply.content), sources: reply.sources };
    setMessages([...next, answer]);
    if (uid) saveExchange(token, uid, q, sent, answer);
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
    textgroup: (node: { key: string }, children: ReactNode, _parent: unknown, styles: { textgroup: object }) => (
      <Text key={node.key} style={styles.textgroup} selectable>{children}</Text>
    ),
  };

  const canStartOver = !busy && (messages.length > 0 || !!draft || images.length > 0 || openFailed);

  const header = (
    <>
      <TopBar />
      <View style={{ paddingHorizontal: 16, paddingTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T size={34} weight="medium" style={{ letterSpacing: -0.8 }}>The Analyst</T>
        {signedIn && consented ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => router.push('/analyst-history')} disabled={busy} accessibilityRole="button" accessibilityLabel="Chat history"
              accessibilityState={{ disabled: busy }}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.4 : 1 }}>
              <Icon name="clock.arrow.circlepath" size={18} />
            </Pressable>
            <Pressable onPress={newChat} disabled={!canStartOver} accessibilityRole="button" accessibilityLabel="New chat"
              accessibilityState={{ disabled: !canStartOver }}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', opacity: canStartOver ? 1 : 0.4 }}>
              <Icon name="square.and.pencil" size={18} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </>
  );

  if (!ready || consented === null) return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>{header}</SafeAreaView>;

  if (!signedIn) {
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
        {/* Follows the conversation only when a message lands or while a reply is on its way, so
            opening an answer's feedback form never jumps the page */}
        <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: 16 }}
          onContentSizeChange={() => {
            if (!stickToEnd.current && !busy) return;
            stickToEnd.current = false;
            scroll.current?.scrollToEnd({ animated: true });
          }}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          {header}
          {openFailed ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
              <T size={15} style={{ lineHeight: 21 }}>{"Couldn't open that chat. Try again from History"}</T>
            </View>
          ) : null}
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
            <View key={`${chatKey}-${i}`} style={{ alignSelf: 'flex-end', maxWidth: '85%', marginHorizontal: 16, marginTop: 14, gap: 6, alignItems: 'flex-end' }}>
              {m.images?.length ? (
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {m.images.map((img, j) => <Image key={`${j}-${img.uri}`} source={img.uri} style={{ width: 96, height: 96, borderRadius: 12 }} contentFit="cover" />)}
                </View>
              ) : null}
              <View style={{ padding: 12, borderRadius: 18, backgroundColor: c.surfaceRaised }}>
                <T size={16} style={{ lineHeight: 22 }} selectable>{m.content}</T>
              </View>
            </View>
          ) : (
            <View key={`${chatKey}-${i}`} style={{ marginHorizontal: 16, marginTop: 14, gap: 8 }}>
              <Markdown style={md} rules={mdRules as never} onLinkPress={openLink}>{m.content}</Markdown>
              {m.sources && m.sources.length ? (
                <View style={{ gap: 6 }}>
                  <Mono>Sources</Mono>
                  {m.sources.slice(0, 5).map((s, j) => (
                    <Pressable key={`${j}-${s.url}`} onPress={() => openLink(s.url)} accessibilityRole="link">
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
                <View key={`${i}-${img.uri}`}>
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
              <TextInput ref={input} value={draft} onChangeText={setDraft} placeholder="What can I dig into for you?" placeholderTextColor={c.textTertiary} multiline maxLength={MAX_QUESTION}
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
