"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { Icon } from "./Icon";

/** Google's multi-color "G" mark (inline so it stays on-brand, not a lucide glyph). */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

type Mode = "signin" | "signup";

function AuthModal({ onClose }: { onClose: () => void }) {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (busy) return;
    setError(null);
    setNotice(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    const fn = mode === "signin" ? signIn : signUp;
    const { error } = await fn(email.trim(), password);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    if (mode === "signup") {
      // With email confirmation on, there's no session yet — tell the user.
      setNotice("Account created. Check your email if confirmation is required, then sign in.");
      setMode("signin");
      return;
    }
    onClose(); // signed in — onAuthStateChange already updated the session
  };

  const google = async () => {
    setError(null);
    setBusy(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error);
      setBusy(false);
    }
    // On success the browser redirects to Google, so no further UI needed.
  };

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/40 px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Account"
      onClick={onClose}
    >
      <div
        className="animate-pop w-full max-w-sm p-6 clay"
        style={{ background: "var(--surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <Icon name="Cloud" className="h-5 w-5 text-primary" />
          <p className="text-lg font-extrabold tracking-tight">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </p>
        </div>
        <p className="mb-4 text-sm font-medium text-ink-soft">
          Sync your tasks and XP across every device. Your local progress stays
          right here.
        </p>

        <button
          onClick={google}
          disabled={busy}
          className="clay-press mb-3 flex w-full items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-bold disabled:opacity-50"
          style={{ background: "var(--page-2)", cursor: "pointer" }}
        >
          <GoogleMark className="h-5 w-5" />
          Continue with Google
        </button>

        <div className="my-3 flex items-center gap-3 text-[11px] font-bold text-ink-faint">
          <span className="h-px flex-1 bg-black/10" />
          OR
          <span className="h-px flex-1 bg-black/10" />
        </div>

        <div className="flex flex-col gap-2">
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            aria-label="Email"
            className="rounded-2xl px-4 py-2.5 text-sm font-semibold outline-none"
            style={{ background: "var(--page-2)" }}
          />
          <input
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            placeholder="Password"
            aria-label="Password"
            className="rounded-2xl px-4 py-2.5 text-sm font-semibold outline-none"
            style={{ background: "var(--page-2)" }}
          />
        </div>

        {error && (
          <p className="mt-3 text-sm font-semibold text-[var(--bad-acc)]">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-3 text-sm font-semibold text-primary">{notice}</p>
        )}

        <button
          onClick={submit}
          disabled={busy}
          className="clay-press mt-4 w-full px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          style={{ background: "var(--primary)", cursor: "pointer" }}
        >
          {busy
            ? "…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>

        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setNotice(null);
          }}
          className="mt-3 w-full text-center text-sm font-semibold text-ink-soft"
          style={{ cursor: "pointer" }}
        >
          {mode === "signin"
            ? "New here? Create an account"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

/** Signed-in row: email, live sync status, and sign-out. */
function SignedIn({
  label,
  onSignOut,
}: {
  label: string;
  onSignOut: () => void;
}) {
  const { syncing, syncError, syncNow } = useStore();
  const status = syncError
    ? `Sync failed: ${syncError} — tap to retry`
    : syncing
      ? "Syncing…"
      : "Synced";
  return (
    <div className="rounded-2xl px-3 py-2">
      <div className="flex items-center gap-2 font-semibold">
        <Icon name="UserCircle" className="h-5 w-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm" title={label}>
          {label}
        </span>
        <button
          onClick={onSignOut}
          aria-label="Sign out"
          title="Sign out"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-black/5"
          style={{ cursor: "pointer" }}
        >
          <Icon name="LogOut" className="h-4 w-4 text-ink-soft" />
        </button>
      </div>
      <button
        onClick={() => void syncNow()}
        title={syncError ?? status}
        className="mt-0.5 flex w-full items-center gap-1.5 pl-7 text-left text-[11px] font-bold"
        style={{
          color: syncError ? "var(--bad-acc)" : "var(--ink-faint)",
          cursor: "pointer",
        }}
      >
        <Icon
          name="Cloud"
          className={`h-3.5 w-3.5 shrink-0 ${syncing ? "animate-pulse" : ""}`}
        />
        <span className="min-w-0 flex-1 truncate">{status}</span>
      </button>
    </div>
  );
}

/** Sidebar account control: opens the auth modal, or shows the signed-in user. */
export function AccountButton() {
  const { enabled, loading, user, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (!enabled) return null; // sync not configured — hide entirely

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl px-3 py-2.5 font-semibold text-ink-faint">
        <Icon name="Cloud" className="h-5 w-5 shrink-0" />
        <span className="truncate">…</span>
      </div>
    );
  }

  if (user) {
    return <SignedIn label={user.email ?? "Account"} onSignOut={signOut} />;
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left font-semibold text-primary transition-colors hover:bg-black/5"
        style={{ cursor: "pointer" }}
      >
        <Icon name="LogIn" className="h-5 w-5 shrink-0" />
        Sign in to sync
      </button>
      {open && <AuthModal onClose={() => setOpen(false)} />}
    </>
  );
}
