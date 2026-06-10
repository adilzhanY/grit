"use client";

import { createContext, useContext, useState } from "react";
import type { DayLogKind } from "./types";

export type View =
  | "myday"
  | "important"
  | "planned"
  | "dailylog"
  | "analytics"
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
  /** Which Daily Log tracker is open. Lifted here so the floating focus
   *  banner knows when the big timer ring is already on screen. */
  dailyLogTab: DayLogKind;
  setDailyLogTab: (k: DayLogKind) => void;
}

const Ctx = createContext<UiValue | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<View>("myday");
  const [menuOpen, setMenuOpen] = useState(false);
  const [dailyLogTab, setDailyLogTab] = useState<DayLogKind>("food");
  return (
    <Ctx.Provider
      value={{ view, setView, menuOpen, setMenuOpen, dailyLogTab, setDailyLogTab }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useUi(): UiValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUi must be used within UiProvider");
  return v;
}
