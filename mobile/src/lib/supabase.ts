/**
 * Supabase client for sign-in and The Analyst. Same project and accounts as the website.
 * The publishable key is public by design (the website ships it to every browser).
 */
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

export const SUPABASE_URL = 'https://vwezujtftfccamoduglp.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_zYMfs9g0myTf6pmh2Y-oJQ_qNkvxNLF';

// Build steps can load this module in Node, where there's no storage; keep sessions on devices only.
const onDevice = Platform.OS !== 'web' || typeof window !== 'undefined';

export const supabase = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { storage: onDevice ? AsyncStorage : undefined, autoRefreshToken: onDevice, persistSession: onDevice, detectSessionInUrl: false },
});
