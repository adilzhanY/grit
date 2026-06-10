import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "./supabase";

type AuthResult = { error: string | null };

interface AuthValue {
  enabled: boolean;
  loading: boolean;
  user: User | null;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "Wrong email or password.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "That email already has an account — try signing in.";
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
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string) => {
    const sb = supabase();
    if (!sb) return { error: "Sync is not configured." };
    const { error } = await sb.auth.signUp({ email: email.trim(), password });
    return { error: error ? friendly(error.message) : null };
  };

  const signIn = async (email: string, password: string) => {
    const sb = supabase();
    if (!sb) return { error: "Sync is not configured." };
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    return { error: error ? friendly(error.message) : null };
  };

  const signOut = async () => {
    await supabase()?.auth.signOut();
  };

  return (
    <Ctx.Provider
      value={{ enabled, loading, user: session?.user ?? null, signUp, signIn, signOut }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
