"use client";

import { createContext, useContext, useState } from "react";

export type View =
  | "myday"
  | "important"
  | "must"
  | "bad"
  | "cool"
  | "impossible"
  | `list:${string}`;

/** Returns the custom-list id for a `list:<id>` view, else null. */
export function parseListView(view: View): string | null {
  return view.startsWith("list:") ? view.slice("list:".length) : null;
}

interface UiValue {
  view: View;
  setView: (v: View) => void;
  /** Mobile nav drawer open state. */
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
}

const Ctx = createContext<UiValue | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<View>("myday");
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <Ctx.Provider value={{ view, setView, menuOpen, setMenuOpen }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUi(): UiValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUi must be used within UiProvider");
  return v;
}
