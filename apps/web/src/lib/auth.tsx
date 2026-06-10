"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "./supabase";

/** Result of an auth action: ok, or a human-readable error message. */
type AuthResult = { error: string | null };

interface AuthValue {
  /** Auth backend is configured (env present). When false, the app is local-only. */
  enabled: boolean;
  /** Still resolving the initial session. */
  loading: boolean;
  user: User | null;
  session: Session | null;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

/** Turn a Supabase error into a short, friendly message. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "Wrong email or password.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "That email already has an account — try signing in.";
  if (m.includes("password")) return message; // length / strength rules pass through
  if (m.includes("email")) return "Please enter a valid email.";
  return message || "Something went wrong. Please try again.";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const enabled = supabaseConfigured();
  const [loading, setLoading] = useState(enabled);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const sb = supabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    let alive = true;
    sb.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });
    // Fires on sign-in, sign-out, token refresh, and the OAuth redirect landing.
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const sb = supabase();
    if (!sb) return { error: "Sync is not configured." };
    const { error } = await sb.auth.signUp({ email, password });
    return { error: error ? friendly(error.message) : null };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = supabase();
    if (!sb) return { error: "Sync is not configured." };
    const { error } = await sb.auth.signInWithPassword({ email, password });
    return { error: error ? friendly(error.message) : null };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const sb = supabase();
    if (!sb) return { error: "Sync is not configured." };
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    return { error: error ? friendly(error.message) : null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase()?.auth.signOut();
  }, []);

  const value: AuthValue = {
    enabled,
    loading,
    user: session?.user ?? null,
    session,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
