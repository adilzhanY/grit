"use client";

/**
 * Tiny toast bus. Log actions in the store call `logToast(...)`; the <Toast />
 * overlay subscribes via `onToast`. Kept outside React state so any log entry
 * point fires it with zero wiring — and so the store needn't re-render to toast.
 */
export type ToastKind = "food" | "sleep" | "steps" | "reading" | "weight" | "focus";

export interface ToastData {
  id: number;
  icon: string;
  title: string;
  xp: number;
}

const META: Record<ToastKind, { icon: string; label: string }> = {
  food: { icon: "Flame", label: "Food" },
  sleep: { icon: "Moon", label: "Sleep" },
  steps: { icon: "Footprints", label: "Steps" },
  reading: { icon: "BookOpen", label: "Reading" },
  weight: { icon: "Scale", label: "Weight" },
  focus: { icon: "Timer", label: "Focus" },
};

let listener: ((t: ToastData) => void) | null = null;
let seq = 0;

/** Subscribe the overlay. Returns an unsubscribe for cleanup. */
export function onToast(fn: (t: ToastData) => void): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

/** Fire a centered toast for a logged entry. `name` personalises food toasts. */
export function logToast(kind: ToastKind, xp: number, name?: string): void {
  const m = META[kind];
  const title = name && name.trim() ? `Logged ${name.trim()}` : `${m.label} logged`;
  listener?.({ id: ++seq, icon: m.icon, title, xp: Math.round(xp) });
}
