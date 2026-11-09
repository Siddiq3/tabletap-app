// Login provider for the staff app. Only this file and feed.ts know it's Supabase.
// Logins go through the backend (api.login); we hand the returned session to Supabase, which refreshes it.
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import type { AuthSession } from "../contract";

export const supabase: SupabaseClient = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } },
);

// Refresh the login only while the app is on screen (Supabase's recommended setup for React Native).
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export async function setSession(s: AuthSession) {
  const { error } = await supabase.auth.setSession({ access_token: s.accessToken, refresh_token: s.refreshToken });
  if (error) throw new Error("Could not log you in. Try again.");
}

export async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Login address of the account on this device; used to re-check the password ("Continue as owner"). */
export async function loginEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.email ?? null;
}

export async function signOut() {
  await supabase.auth.signOut();
}
