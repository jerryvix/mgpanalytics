/**
 * One-tap sign-in with Apple or Google (D-125, owner Nov 26: "super quick, a simple Google
 * sign-in"). Apple's rule 4.8 asks for Sign in with Apple wherever Google sign-in is offered, so
 * both ship together.
 *
 * - Apple: the native sheet, then Supabase checks Apple's ID token (the provider's client ID is
 *   the bundle ID, so no Apple key or service ID is needed).
 * - Google: Supabase's Google sign-in (the one the website uses) in the iOS sign-in sheet, which
 *   comes back to mgp://auth-callback with the session.
 *
 * A guest (every install starts as one) is turned into the account by linking, so the first
 * visit stays with the person (owner, Nov 24). If that Apple or Google account already belongs to
 * someone, it signs in to that account instead and the guest is left behind.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export const AUTH_REDIRECT = 'mgp://auth-callback';

const SIGNUP_META = { signup_source: 'app' };

export type SocialResult = 'ok' | 'canceled';

/** Sign in with Apple needs iOS 13+ and this build's native module. */
export async function appleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

async function isGuest(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session?.user.is_anonymous;
}

const alreadyTaken = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === 'identity_already_exists' || /already (been )?linked|identity.*exists/i.test(e.message ?? ''));

/** Keeps a name Apple shares only the first time, and where the account came from. */
async function noteNewAccount(name?: string | null) {
  const { data } = await supabase.auth.getUser();
  const meta = data.user?.user_metadata ?? {};
  const add: Record<string, string> = {};
  if (!meta.signup_source) Object.assign(add, SIGNUP_META);
  if (name && !meta.full_name) add.full_name = name;
  if (Object.keys(add).length) await supabase.auth.updateUser({ data: add }).catch(() => undefined);
  // A fresh token, so the server sees an account and not a guest
  await supabase.auth.refreshSession().catch(() => undefined);
}

export async function signInWithApple(): Promise<SocialResult> {
  let cred: AppleAuthentication.AppleAuthenticationCredential;
  try {
    cred = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return 'canceled';
    throw e;
  }
  if (!cred.identityToken) throw new Error('Apple sign-in returned no token');
  const token = cred.identityToken;
  let error = null;
  if (await isGuest()) {
    ({ error } = await supabase.auth.linkIdentity({ provider: 'apple', token }));
    if (alreadyTaken(error)) ({ error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token }));
  } else {
    ({ error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token }));
  }
  if (error) throw error;
  const name = cred.fullName ? [cred.fullName.givenName, cred.fullName.familyName].filter(Boolean).join(' ') : '';
  await noteNewAccount(name);
  return 'ok';
}

/** The session or error Supabase sends back to mgp://auth-callback, from the query or the fragment. */
export function readCallback(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of [url.split('?')[1]?.split('#')[0], url.split('#')[1]]) {
    if (!part) continue;
    for (const [k, v] of new URLSearchParams(part)) out[k] = v;
  }
  return out;
}

async function googleOnce(link: boolean): Promise<SocialResult | Record<string, string>> {
  const options = { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true };
  const { data, error } = link
    ? await supabase.auth.linkIdentity({ provider: 'google', options })
    : await supabase.auth.signInWithOAuth({ provider: 'google', options });
  if (error) throw error;
  if (!data?.url) throw new Error('Google sign-in returned no address');
  const res = await WebBrowser.openAuthSessionAsync(data.url, AUTH_REDIRECT);
  if (res.type !== 'success') return 'canceled';
  return readCallback(res.url);
}

export async function signInWithGoogle(): Promise<SocialResult> {
  const guest = await isGuest();
  let back = await googleOnce(guest);
  // That Google account is already someone's: sign in to it instead
  if (typeof back !== 'string' && guest && alreadyTaken({ code: back.error_code, message: back.error_description })) {
    back = await googleOnce(false);
  }
  if (typeof back === 'string') return back;
  if (back.error || back.error_code) throw new Error(back.error_description || back.error || back.error_code);
  if (back.access_token && back.refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token: back.access_token, refresh_token: back.refresh_token });
    if (error) throw error;
  } else if (back.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(back.code);
    if (error) throw error;
  } else {
    throw new Error('Google sign-in came back without a session');
  }
  await noteNewAccount();
  return 'ok';
}
