/** Sign in or create an account (PLAN v1 #7). Email and password, the same accounts as the website. */
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, Mono, T } from '@/components/night';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const c = useTheme();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    if (mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setBusy(false);
      if (error) return setMessage(error.message);
      router.back();
    } else {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      setBusy(false);
      if (error) return setMessage(error.message);
      if (data.session) return router.back();
      setMessage('Check your email for a link to confirm your account, then sign in here');
      setMode('in');
    }
  };

  const input = { color: c.text, fontFamily: Font.regular, fontSize: 17, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: c.surface };
  const canSubmit = email.includes('@') && password.length >= 6 && !busy;
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ padding: 20, gap: 14 }}>
          <Pressable accessibilityLabel="Close" onPress={() => router.back()} style={{ alignSelf: 'flex-end', width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="xmark" size={15} />
          </Pressable>
          <T size={30} weight="semibold" style={{ letterSpacing: -0.6 }}>{mode === 'in' ? 'Sign In' : 'Create Account'}</T>
          <T size={16} style={{ lineHeight: 22 }}>Use the same account as mgp-analytics.com</T>
          <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={c.textTertiary} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" style={input} />
          <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={c.textTertiary} secureTextEntry autoComplete={mode === 'in' ? 'current-password' : 'new-password'} textContentType={mode === 'in' ? 'password' : 'newPassword'} style={input} onSubmitEditing={() => canSubmit && submit()} />
          {message ? <T size={15} style={{ lineHeight: 21 }}>{message}</T> : null}
          <Pressable disabled={!canSubmit} onPress={submit} accessibilityRole="button"
            style={{ marginTop: 4, height: 52, borderRadius: 999, backgroundColor: c.brand, opacity: canSubmit ? 1 : 0.4, alignItems: 'center', justifyContent: 'center' }}>
            {busy ? <ActivityIndicator color={c.onBrand} /> : <T size={17} weight="bold" style={{ color: c.onBrand }}>{mode === 'in' ? 'Sign In' : 'Create Account'}</T>}
          </Pressable>
          <Pressable onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setMessage(null); }} style={{ alignItems: 'center', paddingVertical: 10 }}>
            <T size={15}>{mode === 'in' ? 'New to MGP? ' : 'Have an account? '}<T size={15} weight="semibold">{mode === 'in' ? 'Create Account' : 'Sign In'}</T></T>
          </Pressable>
          {mode === 'up' ? <Mono style={{ textAlign: 'center' }}>Passwords need 6 or more characters</Mono> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
