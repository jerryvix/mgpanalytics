/**
 * Continue with Apple and Continue with Google (D-125), for Get Started and Sign In. Apple's own
 * button (its look is Apple's rule), and Google's mark on a plain pill (Google's guidelines).
 * `onDone` runs after a sign-in works; a cancel does nothing.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, useColorScheme, View } from 'react-native';

import { T } from '@/components/night';
import { useTheme } from '@/hooks/use-theme';
import { appleAvailable, signInWithApple, signInWithGoogle, type SocialResult } from '@/lib/social-sign-in';

const HEIGHT = 52;

/** The provider's error, as a sentence. */
function friendly(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)).toLowerCase();
  if (msg.includes('network') || msg.includes('fetch')) return "Couldn't reach MGP. Check your connection and try again";
  return "That didn't go through. Try again, or use your email";
}

export function SocialButtons({ onDone }: { onDone: () => void }) {
  const c = useTheme();
  const dark = useColorScheme() === 'dark';
  const [apple, setApple] = useState(false);
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const working = useRef(false);

  useEffect(() => {
    appleAvailable().then(setApple);
  }, []);

  const run = async (which: 'apple' | 'google', go: () => Promise<SocialResult>) => {
    if (working.current) return;
    working.current = true;
    setBusy(which);
    setMessage(null);
    try {
      if ((await go()) === 'ok') onDone();
    } catch (e) {
      setMessage(friendly(e));
    } finally {
      working.current = false;
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      {apple ? (
        <View style={{ height: HEIGHT, opacity: busy ? 0.5 : 1 }} pointerEvents={busy ? 'none' : 'auto'}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={dark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={HEIGHT / 2}
            style={{ height: HEIGHT, width: '100%' }}
            onPress={() => run('apple', signInWithApple)}
          />
        </View>
      ) : null}
      <Pressable onPress={() => run('google', signInWithGoogle)} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Continue with Google"
        style={{ height: HEIGHT, borderRadius: HEIGHT / 2, backgroundColor: dark ? c.surfaceRaised : c.bg, borderWidth: dark ? 0 : 1, borderColor: c.border,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: busy && busy !== 'google' ? 0.5 : 1 }}>
        {busy === 'google' ? <ActivityIndicator color={c.text} /> : (
          <>
            <Image source={require('@/assets/images/google-g.png')} style={{ width: 18, height: 18 }} contentFit="contain" accessible={false} />
            <T size={17} weight="semibold">Continue with Google</T>
          </>
        )}
      </Pressable>
      {message ? <T size={15} style={{ lineHeight: 21 }}>{message}</T> : null}
    </View>
  );
}
