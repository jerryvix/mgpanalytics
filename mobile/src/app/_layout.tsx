// Import each weight on its own so only these four font files ship with the app.
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_400Regular_Italic } from '@expo-google-fonts/geist/400Regular_Italic';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { Geist_700Bold } from '@expo-google-fonts/geist/700Bold';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono/400Regular';
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono/500Medium';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, useColorScheme, View } from 'react-native';

import { Icon, T } from '@/components/night';
import { useTheme } from '@/hooks/use-theme';
import { useAppUpdates } from '@/lib/app-updates';
import { AuthProvider } from '@/lib/auth';
import { TourProvider } from '@/lib/tour';
import { hasSeenWelcome, rememberWelcome, WelcomeContext } from '@/lib/welcome';


SplashScreen.preventAutoHideAsync();

/** Shown by expo-router when a screen crashes: the MGP mark and a way back in. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const c = useTheme();
  // A crash before the first screen would otherwise sit behind the splash screen
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 }}>
      <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="waveform.path.ecg" size={28} color={c.brand} weight="bold" />
      </View>
      <T size={22} weight="medium" style={{ letterSpacing: -0.4, textAlign: 'center' }}>Something went wrong</T>
      <Pressable onPress={retry} accessibilityRole="button"
        style={{ paddingHorizontal: 22, height: 48, borderRadius: 999, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' }}>
        <T size={16} weight="bold" style={{ color: c.onBrand }}>Try Again</T>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  useAppUpdates();
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_400Regular_Italic,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    GeistMono_400Regular,
    GeistMono_500Medium,
  });
  // First launch (O6): read before the splash hides, so the welcome comes first and the tabs never flash
  const [welcomed, setWelcomed] = useState<boolean | null>(null);
  const ready = (fontsLoaded || fontError !== null) && welcomed !== null;

  useEffect(() => {
    hasSeenWelcome().then(setWelcomed);
  }, []);

  useEffect(() => {
    // Keep the splash up until Geist is ready, so text never flashes in the system font.
    // If loading fails, show the app anyway in the system font rather than hanging.
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  const welcome = useMemo(() => ({
    accept: () => {
      rememberWelcome();
      setWelcomed(true);
    },
  }), []);

  if (!ready) return null;

  return (
    <AuthProvider>
    <WelcomeContext value={welcome}>
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
    <TourProvider>
      <Stack screenOptions={{ headerShown: false }}>
        {/* Until the welcome is done, every other screen sends you to it */}
        <Stack.Protected guard={!!welcomed} redirectTo="/welcome">
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="game/[id]" />
          <Stack.Screen name="profile" options={{ presentation: 'card' }} />
          <Stack.Screen name="sign-in" options={{ presentation: 'modal' }} />
          <Stack.Screen name="get-started" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
          <Stack.Screen name="analyst-history" options={{ presentation: 'modal' }} />
        </Stack.Protected>
        <Stack.Protected guard={!welcomed} redirectTo="/">
          <Stack.Screen name="welcome" options={{ gestureEnabled: false, animation: 'fade' }} />
        </Stack.Protected>
      </Stack>
    </TourProvider>
    </ThemeProvider>
    </WelcomeContext>
    </AuthProvider>
  );
}
