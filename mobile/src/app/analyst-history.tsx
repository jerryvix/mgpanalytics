/**
 * Analyst History (D-094): your saved chats, newest first, shared with the website. Tap to
 * reopen; swipe-free delete from the row's menu button so nothing deletes by accident.
 */
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Divider, Empty, Icon, Mono, T } from '@/components/night';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { deleteConversation, listConversations, type Conversation } from '@/lib/chat-store';
import { clock, daysAgo, toDate } from '@/lib/time';

/** By calendar day: the time today, "Yesterday", the weekday this past week, else "Nov 20". */
function when(iso: string): string {
  const d = toDate(iso);
  if (!d) return '';
  const now = new Date();
  const days = daysAgo(d, now);
  if (days <= 0) return clock(iso);
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', d.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AnalystHistory() {
  const c = useTheme();
  // History is for accounts; a guest reaching this screen sees a note instead
  const { signedIn, ready } = useAuth();
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() =>
    listConversations().then(
      (rows) => { setItems(rows); setFailed(false); },
      () => setFailed(true),
    ), []);

  useEffect(() => {
    if (signedIn) load();
  }, [load, signedIn]);

  const refresh = async () => {
    if (!signedIn) return;
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const confirmDelete = (conv: Conversation) => {
    const go = async () => {
      // The row stays until the delete goes through
      if (await deleteConversation(conv.id)) setItems((cur) => (cur ?? []).filter((x) => x.id !== conv.id));
      else Alert.alert("Couldn't delete that chat", 'Check your connection and try again');
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Delete Chat', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1, title: conv.title },
        (i) => { if (i === 0) go(); },
      );
    } else {
      Alert.alert('Delete this chat?', conv.title, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
        <T size={28} weight="medium" style={{ letterSpacing: -0.6 }}>History</T>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close"
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="xmark" size={15} weight="semibold" />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.text} />}>
        {ready && !signedIn ? <Empty>Sign in to see your chats with the Analyst, on the app and on mgp-analytics.com</Empty> : null}
        {signedIn && items === null && !failed ? <View style={{ padding: 24 }}><ActivityIndicator color={c.text} /></View> : null}
        {signedIn && failed ? <Empty>{"Couldn't load your chats. Pull down to try again"}</Empty> : null}
        {signedIn && !failed && items && !items.length ? <Empty>Your chats with the Analyst show up here, on the app and on mgp-analytics.com</Empty> : null}
        {(signedIn ? items ?? [] : []).map((conv, i) => (
          <View key={conv.id}>
            {i > 0 ? <Divider /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
              <Pressable style={{ flex: 1, paddingVertical: 14, gap: 4 }} accessibilityRole="button"
                onPress={() => { router.back(); router.navigate({ pathname: '/analyst', params: { c: conv.id } }); }}>
                <T size={16} numberOfLines={2}>{conv.title}</T>
                <Mono>{when(conv.updated_at)}</Mono>
              </Pressable>
              <Pressable onPress={() => confirmDelete(conv)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`More for ${conv.title}`}
                style={{ paddingLeft: 12, paddingVertical: 14 }}>
                <Icon name="ellipsis" size={18} />
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
