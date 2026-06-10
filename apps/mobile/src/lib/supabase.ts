import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Mobile Supabase client. Point it at the SAME project as the website by
 * setting these in apps/mobile/.env (Expo inlines EXPO_PUBLIC_* at build time):
 *
 *   EXPO_PUBLIC_SUPABASE_URL=...
 *   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
 *
 * The session is stored in AsyncStorage; RLS guards every row server-side.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let _client: SupabaseClient | null = null;

export function supabaseConfigured(): boolean {
  return Boolean(url && key);
}

export function supabase(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  if (!_client) {
    _client = createClient(url!, key!, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return _client;
}
