/**
 * Welcome (O6): the first screen on a new install, shown once. What MGP does, an 18+
 * confirmation that's required to continue, and the responsible gaming line.
 */
import { Linking, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, T } from '@/components/night';
import { GAMBLER_LABEL, GAMBLER_TEL } from '@/constants/links';
import { useTheme } from '@/hooks/use-theme';
import { useWelcome } from '@/lib/welcome';

export default function WelcomeScreen() {
  const c = useTheme();
  const { accept } = useWelcome();
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 18 }}>
        <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}
          accessible accessibilityRole="image" accessibilityLabel="MGP Analytics">
          <Icon name="waveform.path.ecg" size={34} color={c.brand} weight="bold" />
        </View>
        <T size={34} weight="medium" style={{ letterSpacing: -0.8 }}>Welcome to MGP</T>
        <T size={17} style={{ lineHeight: 24 }}>Get Betting Splits, trends and Expert Picks for NFL, college football and NBA games</T>
        <T size={17} style={{ lineHeight: 24 }}>Ask the Analyst anything about tonight&apos;s games</T>
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: 16, gap: 14 }}>
        <Pressable onPress={accept} accessibilityRole="button" accessibilityHint="Confirms you are 18 or older and opens the app"
          style={{ height: 52, borderRadius: 999, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' }}>
          <T size={17} weight="bold" style={{ color: c.onBrand }}>I&apos;m 18 or Older</T>
        </Pressable>
        <Pressable onPress={() => Linking.openURL(GAMBLER_TEL).catch(() => undefined)} accessibilityRole="link"
          accessibilityLabel={`Gambling problem? Call ${GAMBLER_LABEL}`} style={{ alignItems: 'center', paddingVertical: 6 }}>
          <T size={13}>Gambling problem? Call <T size={13} weight="semibold" style={{ textDecorationLine: 'underline' }}>{GAMBLER_LABEL}</T></T>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
