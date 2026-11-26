/**
 * Get Started (D-125): after the 18+ welcome, one screen to make a free account in a tap (Apple
 * or Google), use email, or skip with Not Now. Shown once per phone, and only to guests; the
 * first-run tour follows it (D-124).
 */
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, T } from '@/components/night';
import { SocialButtons } from '@/components/social-buttons';
import { useTheme } from '@/hooks/use-theme';
import { rememberGetStarted } from '@/lib/onboarding';

export default function GetStartedScreen() {
  const c = useTheme();
  const leave = () => {
    rememberGetStarted();
    router.back();
  };
  const email = () => {
    rememberGetStarted();
    router.replace('/sign-in');
  };
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 18 }}>
        <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}
          accessible accessibilityRole="image" accessibilityLabel="MGP Analytics">
          <Icon name="waveform.path.ecg" size={34} color={c.brand} weight="bold" />
        </View>
        <T size={34} weight="medium" style={{ letterSpacing: -0.8 }}>Join MGP Free</T>
        <T size={17} style={{ lineHeight: 24 }}>Ask the Analyst anything and keep your chats on every device</T>
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: 12, gap: 12 }}>
        <SocialButtons onDone={leave} />
        <Pressable onPress={email} accessibilityRole="button"
          style={{ height: 52, borderRadius: 26, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
          <T size={17} weight="semibold">Continue with Email</T>
        </Pressable>
        <Pressable onPress={leave} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 12 }}>
          <T size={16} weight="semibold" style={{ opacity: 0.7 }}>Not Now</T>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
