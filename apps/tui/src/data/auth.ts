/**
 * Thin auth wrapper over the Supabase client. Email/password only — OAuth needs
 * a browser redirect, which a terminal can't do. The session is persisted to a
 * file (see supabase.ts), so a successful sign-in sticks across launches.
 */
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../supabase";

export async function getSession(): Promise<Session | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function currentUser(): Promise<User | null> {
  return (await getSession())?.user ?? null;
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ error: string | null }> {
  const sb = supabase();
  if (!sb) return { error: "Supabase is not configured." };
  const { error } = await sb.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

export async function signUp(
  email: string,
  password: string,
): Promise<{ error: string | null; needsConfirm: boolean }> {
  const sb = supabase();
  if (!sb) return { error: "Supabase is not configured.", needsConfirm: false };
  const { data, error } = await sb.auth.signUp({ email, password });
  // If email confirmation is on, there's a user but no session yet.
  const needsConfirm = !!data.user && !data.session;
  return { error: error?.message ?? null, needsConfirm };
}

export async function signOut(): Promise<void> {
  await supabase()?.auth.signOut();
}

/** Subscribe to sign-in/out. Returns an unsubscribe function. */
export function onAuthStateChange(
  cb: (user: User | null) => void,
): () => void {
  const sb = supabase();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    cb(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}
