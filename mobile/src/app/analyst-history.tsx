/**
 * Analyst History (D-094): your saved chats, newest first, shared with the website. Tap to
 * reopen; swipe-free delete from the row's menu button so nothing deletes by accident.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Divider, Empty, Icon, Mono, T } from '@/components/night';
import { useTheme } from '@/hooks/use-theme';
import { deleteConversation, listConversations, type Conversation } from '@/lib/chat-store';

function when(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days < 7) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function AnalystHistory() {
  const c = useTheme();
  const [items, setItems] = useState<Conversation[] | null>(null);

  useEffect(() => {
    listConversations().then(setItems);
  }, []);

  const confirmDelete = (conv: Conversation) => {
    const go = async () => {
      await deleteConversation(conv.id);
      setItems((cur) => (cur ?? []).filter((x) => x.id !== conv.id));
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
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {items === null ? <View style={{ padding: 24 }}><ActivityIndicator color={c.text} /></View> : null}
        {items && !items.length ? <Empty>Your chats with the Analyst show up here, on the app and on mgp-analytics.com</Empty> : null}
        {(items ?? []).map((conv, i) => (
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
