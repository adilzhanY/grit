"use client";

import { createContext, useContext, useState } from "react";

export type View = "myday" | "must" | "bad" | "cool" | "impossible";

interface UiValue {
  view: View;
  setView: (v: View) => void;
}

const Ctx = createContext<UiValue | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<View>("myday");
  return <Ctx.Provider value={{ view, setView }}>{children}</Ctx.Provider>;
}

export function useUi(): UiValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUi must be used within UiProvider");
  return v;
}
