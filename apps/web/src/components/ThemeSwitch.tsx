"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "./Icon";

export const THEME_KEY = "grit:theme";

/**
 * Light/dark switcher. The theme itself is pure CSS: a `dark` class on
 * <html> (see the .dark block in globals.css), so toggling costs one
 * classList mutation — no React tree re-render beyond these buttons. The
 * saved choice is applied pre-paint by the inline script in app/layout.tsx,
 * so this store only has to stay in sync with the class.
 */
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

// Server render is always light; useSyncExternalStore re-reads the real
// class right after hydration, so the pre-paint script's choice wins.
function getServerSnapshot(): boolean {
  return false;
}

function useDarkTheme(): [boolean, () => void] {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = () => {
    document.documentElement.classList.toggle("dark", !dark);
    try {
      localStorage.setItem(THEME_KEY, !dark ? "dark" : "light");
    } catch {
      /* storage unavailable (private mode) — theme still applies for the session */
    }
    listeners.forEach((l) => l());
  };

  return [dark, toggle];
}

/** Sidebar row, styled like the neighbouring Sound toggle. */
export function ThemeSwitch() {
  const [dark, toggle] = useDarkTheme();
  return (
    <button
      onClick={toggle}
      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left font-semibold text-ink-soft transition-colors hover:bg-black/5 dark:hover:bg-white/10"
      style={{ cursor: "pointer" }}
    >
      <Icon name={dark ? "Moon" : "Sun"} className="h-5 w-5" />
      Theme {dark ? "dark" : "light"}
    </button>
  );
}

/** Icon-only clay button for the mobile top bar. */
export function ThemeSwitchIcon() {
  const [dark, toggle] = useDarkTheme();
  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="clay-press grid h-11 w-11 shrink-0 place-items-center"
      style={{ background: "var(--surface)", cursor: "pointer" }}
    >
      <Icon name={dark ? "Moon" : "Sun"} className="h-5 w-5" />
    </button>
  );
}
