import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import type { AuthSession } from '../contract';
import { DEMO_MODE, demoStore } from './demo-store';

let client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  if (DEMO_MODE) throw new Error('Supabase is not used in demo mode.');
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Add the Supabase settings in .env, or run npm run demo for sample data.');
  client ??= createClient(url, key, { auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  return client;
}
AppState.addEventListener('change', state => {
  if (!client) return;
  if (state === 'active') client.auth.startAutoRefresh();
  else client.auth.stopAutoRefresh();
});
export async function setSession(s: AuthSession) {
  if (DEMO_MODE) return;
  const { error } = await getSupabase().auth.setSession({ access_token: s.accessToken, refresh_token: s.refreshToken });
  if (error) throw new Error('Could not log you in. Try again.');
}
export async function getToken(): Promise<string | null> {
  if (DEMO_MODE) return demoStore.signedIn ? 'demo-only-token' : null;
  if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) return null;
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}
export async function loginEmail(): Promise<string | null> {
  if (DEMO_MODE) return 'owner@example.test';
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.email ?? null;
}
export async function signOut() {
  if (DEMO_MODE) { demoStore.signOut(); return; }
  await getSupabase().auth.signOut();
}
