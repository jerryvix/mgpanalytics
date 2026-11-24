/**
 * Profile (D-077): reached from the top-right button. Your account (sign in or out, delete
 * it), support, the privacy policy and terms, and the responsible gaming line.
 */
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, T } from '@/components/night';
import { GAMBLER_LABEL, GAMBLER_TEL, PRIVACY_URL, SUPPORT_EMAIL, TERMS_URL } from '@/constants/links';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { PUBLISHABLE_KEY, SUPABASE_URL, supabase } from '@/lib/supabase';

function Row({ label, desc, icon, onPress, busy }: { label: string; desc?: string; icon: 'chevron.right' | 'arrow.up.right'; onPress: () => void; busy?: boolean }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <View style={{ flex: 1, gap: 3 }}>
        <T size={17} weight="semibold">{label}</T>
        {desc ? <T size={14}>{desc}</T> : null}
      </View>
      {busy ? <ActivityIndicator color={c.text} /> : <Icon name={icon} size={14} />}
    </Pressable>
  );
}

const openPage = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => undefined);

export default function ProfileScreen() {
  const c = useTheme();
  const { session } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const deletingNow = useRef(false);

  const contactSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => Alert.alert('Contact Support', `Email us at ${SUPPORT_EMAIL}`));
  };

  const callHelpline = () => {
    Linking.openURL(GAMBLER_TEL).catch(() => Alert.alert(`Call ${GAMBLER_LABEL}`));
  };

  const deleteAccount = async () => {
    if (deletingNow.current) return;
    deletingNow.current = true;
    setDeleting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('no session');
      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: PUBLISHABLE_KEY },
      });
      if (res.status !== 200) throw new Error(`http ${res.status}`);
      // The account is gone on the server; clear it from this phone
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      Alert.alert('Your account was deleted');
    } catch {
      Alert.alert("Couldn't delete your account", `Try again or contact support at ${SUPPORT_EMAIL}`);
    } finally {
      deletingNow.current = false;
      setDeleting(false);
    }
  };

  // Two steps, so it never happens by accident
  const confirmDelete = () => {
    Alert.alert('Delete Account?', 'This permanently deletes your MGP account and your saved chats with the Analyst', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: () => Alert.alert('Delete for Good?', "Your account and saved chats can't be brought back", [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete Account', style: 'destructive', onPress: deleteAccount },
        ]),
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
        <Pressable accessibilityLabel="Back" onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevron.left" size={18} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40 }}>
        <T size={26} weight="semibold" style={{ letterSpacing: -0.5 }}>Profile</T>
        <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <View style={{ flex: 1, gap: 3 }}>
            <T size={17} weight="semibold">Account</T>
            <T size={14}>{session?.user.email ?? 'Sign in to ask The Analyst'}</T>
          </View>
          <Pressable onPress={() => (session ? supabase.auth.signOut() : router.push('/sign-in'))} disabled={deleting} accessibilityRole="button"
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: c.surfaceRaised }}>
            <T size={15} weight="semibold">{session ? 'Sign Out' : 'Sign In'}</T>
          </Pressable>
        </View>
        <Row label="Contact Support" desc={SUPPORT_EMAIL} icon="arrow.up.right" onPress={contactSupport} />
        <Row label="Privacy Policy" icon="arrow.up.right" onPress={() => openPage(PRIVACY_URL)} />
        <Row label="Terms of Use" icon="arrow.up.right" onPress={() => openPage(TERMS_URL)} />
        {session ? <Row label="Delete Account" icon="chevron.right" onPress={confirmDelete} busy={deleting} /> : null}
        <T size={14} style={{ marginTop: 22, lineHeight: 20 }}>{"MGP shows data and what betting shows are saying, never its own picks"}</T>
        <Pressable onPress={callHelpline} accessibilityRole="link" accessibilityLabel={`Gambling problem? Call ${GAMBLER_LABEL}`} style={{ marginTop: 10, alignSelf: 'flex-start' }}>
          <T size={14} style={{ lineHeight: 20 }}>Gambling problem? Call <T size={14} weight="semibold" style={{ textDecorationLine: 'underline' }}>{GAMBLER_LABEL}</T></T>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
