"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Single browser Supabase client. The URL + publishable key are public by
 * design — every row is guarded by Row-Level Security on the server, so the
 * key alone grants nothing without a valid user session.
 *
 * The session is persisted in localStorage and auto-refreshed; `detectSessionInUrl`
 * lets the OAuth (Google) redirect land back here and pick up the session from
 * the URL with no extra route handler — which suits this client-only SPA.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let _client: SupabaseClient | null = null;

/** Whether Supabase is configured (env present). Lets the app run sync-less if not. */
export function supabaseConfigured(): boolean {
  return Boolean(url && key);
}

/** Lazily build the browser client; returns null if env is missing. */
export function supabase(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  if (!_client) {
    _client = createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return _client;
}
