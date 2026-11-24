/**
 * Sign in or create an account (PLAN v1 #7). Email and password, the same accounts as the
 * website. Email confirmation is off, so a new account is signed in right away. Creating an
 * account from a guest session turns that guest into the account (same user, so its first
 * visit stays with it); signing in to an existing account leaves the guest behind. Forgot
 * Password sends a reset link (it also sets a first password for people who signed up on the
 * website with Google), an "Email not confirmed" error offers the link again, and Supabase
 * errors read as plain sentences.
 */
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, Mono, T } from '@/components/night';
import { PASSWORD_RESET_REDIRECT } from '@/constants/links';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type AuthErr = { message?: string; code?: string; status?: number };

const notConfirmed = (e: AuthErr) => e.code === 'email_not_confirmed' || /email not confirmed/i.test(e.message ?? '');

/** Supabase's error, as a sentence you can act on. */
function friendly(e: AuthErr): string {
  const code = e.code ?? '';
  const msg = (e.message ?? '').toLowerCase();
  if (code === 'invalid_credentials' || msg.includes('invalid login')) return "That email and password don't match. Try again or reset your password";
  if (notConfirmed(e)) return 'Confirm your email to sign in. Check your inbox for the link';
  if (code.startsWith('over_') || e.status === 429 || msg.includes('rate limit') || msg.includes('security purposes')) return 'Too many tries for now. Wait a minute and try again';
  // Passwords need 8 characters and can't be on a list of leaked passwords (D-099)
  if (code === 'weak_password' || /password should|weak|pwned|leaked|easy to guess/.test(msg)) return "Pick a password with at least 8 characters that you haven't used elsewhere";
  if (code === 'user_already_exists' || code === 'email_exists' || /already (been )?registered/.test(msg)) return 'You already have an account with that email. Sign in instead';
  if (code === 'email_address_invalid' || msg.includes('invalid email') || msg.includes('validate email')) return 'Check that your email is typed right';
  if (msg.includes('network') || msg.includes('fetch')) return "Couldn't reach MGP. Check your connection and try again";
  return 'Something went wrong. Try again in a moment';
}

export default function SignInScreen() {
  const c = useTheme();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resendable, setResendable] = useState(false);
  // A quick double tap sends once
  const working = useRef(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  // Keep the buttons above the keyboard while typing
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => scroll.current?.scrollToEnd({ animated: true }));
    return () => sub.remove();
  }, []);

  /** Runs one auth call at a time with the spinner on. */
  const run = async (step: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setMessage(null);
    setResendable(false);
    try {
      await step();
    } catch (e) {
      setMessage(friendly({ message: e instanceof Error ? e.message : String(e) }));
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const submit = () => run(async () => {
    const addr = email.trim();
    if (mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email: addr, password });
      if (error) {
        setMessage(friendly(error));
        setResendable(notConfirmed(error));
        return;
      }
      router.back();
      return;
    }
    const meta = { signup_source: 'app' };
    const { data: current } = await supabase.auth.getSession();
    if (current.session?.user.is_anonymous) {
      // A guest: add the email and password to this same user instead of making a second one
      // Email first (confirmation is off, so it sticks right away), then the password: Supabase
      // won't set a password on a guest that doesn't have an email yet
      const step1 = await supabase.auth.updateUser({ email: addr, data: meta });
      if (step1.error) return setMessage(friendly(step1.error));
      const step2 = await supabase.auth.updateUser({ password });
      if (step2.error) return setMessage(friendly(step2.error));
      // A fresh token, so the server sees an account and not a guest
      await supabase.auth.refreshSession().catch(() => undefined);
      router.back();
      return;
    }
    const { data, error } = await supabase.auth.signUp({ email: addr, password, options: { data: meta } });
    if (error) return setMessage(friendly(error));
    // Supabase answers a sign-up for an existing email with a user that has no identities
    if (data.user && data.user.identities?.length === 0) {
      setMessage('You already have an account with that email. Sign in instead');
      setMode('in');
      return;
    }
    if (!data.session) {
      // Confirmation is off, so this is a fallback: sign in with what was just typed
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: addr, password });
      if (signInError) {
        setMessage(friendly(signInError));
        setResendable(notConfirmed(signInError));
        setMode('in');
        return;
      }
    }
    router.back();
  });

  const forgot = () => {
    const addr = email.trim();
    if (!addr.includes('@')) {
      setMessage('Enter your email above, then tap Forgot Password');
      setResendable(false);
      return;
    }
    run(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(addr, { redirectTo: PASSWORD_RESET_REDIRECT });
      setMessage(error ? friendly(error) : 'Check your email for a link to reset your password');
    });
  };

  const resend = () => run(async () => {
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    setMessage(error ? friendly(error) : 'Check your email for a new link to confirm your account');
  });

  const input = { color: c.text, fontFamily: Font.regular, fontSize: 17, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: c.surface };
  // New passwords need 8 characters (D-099); older accounts can still sign in with 6
  const canSubmit = email.includes('@') && password.length >= (mode === 'up' ? 8 : 6) && !busy;
  const link = { alignItems: 'center' as const, paddingVertical: 10 };
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView ref={scroll} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
        contentContainerStyle={{ padding: 20, gap: 14 }}>
        <Pressable accessibilityLabel="Close" onPress={() => router.back()} style={{ alignSelf: 'flex-end', width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="xmark" size={15} />
        </Pressable>
        <T size={30} weight="semibold" style={{ letterSpacing: -0.6 }}>{mode === 'in' ? 'Sign In' : 'Create Account'}</T>
        <T size={16} style={{ lineHeight: 22 }}>Use the same account as mgp-analytics.com</T>
        <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={c.textTertiary} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" style={input} />
        <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={c.textTertiary} secureTextEntry autoComplete={mode === 'in' ? 'current-password' : 'new-password'} textContentType={mode === 'in' ? 'password' : 'newPassword'} style={input} onSubmitEditing={() => canSubmit && submit()} />
        {message ? <T size={15} style={{ lineHeight: 21 }}>{message}</T> : null}
        {resendable ? (
          <Pressable onPress={resend} disabled={busy} accessibilityRole="button"
            style={{ alignSelf: 'flex-start', paddingHorizontal: 16, height: 40, borderRadius: 999, backgroundColor: c.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}>
            <T size={15} weight="semibold">Resend Email</T>
          </Pressable>
        ) : null}
        <Pressable disabled={!canSubmit} onPress={submit} accessibilityRole="button"
          style={{ marginTop: 4, height: 52, borderRadius: 999, backgroundColor: c.brand, opacity: canSubmit ? 1 : 0.4, alignItems: 'center', justifyContent: 'center' }}>
          {busy ? <ActivityIndicator color={c.onBrand} /> : <T size={17} weight="bold" style={{ color: c.onBrand }}>{mode === 'in' ? 'Sign In' : 'Create Account'}</T>}
        </Pressable>
        {mode === 'in' ? (
          <Pressable onPress={forgot} disabled={busy} accessibilityRole="button" style={link}>
            <T size={15} weight="semibold">Forgot Password?</T>
          </Pressable>
        ) : null}
        <Pressable onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setMessage(null); setResendable(false); }} style={link}>
          <T size={15}>{mode === 'in' ? 'New to MGP? ' : 'Have an account? '}<T size={15} weight="semibold">{mode === 'in' ? 'Create Account' : 'Sign In'}</T></T>
        </Pressable>
        {mode === 'up' ? <Mono style={{ textAlign: 'center' }}>Passwords need 8 or more characters</Mono> : null}
        {mode === 'in' ? (
          <T size={14} style={{ lineHeight: 20, textAlign: 'center' }}>Signed up on the website with Google? Use Forgot Password to set a password for the app</T>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
