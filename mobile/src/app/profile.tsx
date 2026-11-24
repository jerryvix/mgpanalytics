/** Profile (D-077): reached from the top-right button. Alerts and sign-in land with the next build. */
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, Mono, T } from '@/components/night';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';

const ROWS: { label: string; desc: string }[] = [
  { label: 'Alerts', desc: 'Before Kickoff, Money Moves, New Takes, Final Score' },
  { label: 'Your Teams', desc: 'Pick teams to pin to Today' },
  { label: 'Your Sports', desc: 'NFL, College Football, NBA' },
  { label: 'Help and Feedback', desc: 'support@mgp-analytics.com' },
];

export default function ProfileScreen() {
  const c = useTheme();
  const { session } = useAuth();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
        <Pressable accessibilityLabel="Back" onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevron.left" size={18} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40 }}>
        <T size={26} weight="semibold" style={{ letterSpacing: -0.5 }}>Profile</T>
        <Mono style={{ marginTop: 6 }}>Preview Build</Mono>
        <View style={{ marginTop: 14 }}>
          {ROWS.map((r) => (
            <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <View style={{ flex: 1, gap: 3 }}>
                <T size={17} weight="semibold">{r.label}</T>
                <T size={14}>{r.desc}</T>
              </View>
              <Icon name="chevron.right" size={14} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <View style={{ flex: 1, gap: 3 }}>
            <T size={17} weight="semibold">Account</T>
            <T size={14}>{session?.user.email ?? 'Sign in to ask The Analyst'}</T>
          </View>
          <Pressable onPress={() => (session ? supabase.auth.signOut() : router.push('/sign-in'))} accessibilityRole="button"
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: c.surfaceRaised }}>
            <T size={15} weight="semibold">{session ? 'Sign Out' : 'Sign In'}</T>
          </Pressable>
        </View>
        <T size={14} style={{ marginTop: 22, lineHeight: 20 }}>MGP shows information, not picks. If gambling stops being fun, call 1-800-GAMBLER</T>
      </ScrollView>
    </SafeAreaView>
  );
}
