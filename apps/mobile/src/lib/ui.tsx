import React, { createContext, useContext, useState } from "react";
import type { DayLogKind } from "@grit/core";

export type Tab = "today" | "habits" | "log" | "focus" | "stats";

interface UiValue {
  tab: Tab;
  setTab: (t: Tab) => void;
  /** Which Daily Log tracker is open. */
  logTab: DayLogKind;
  setLogTab: (k: DayLogKind) => void;
  /** Open the Log tab focused on a given tracker. */
  openLog: (k: DayLogKind) => void;
}

const Ctx = createContext<UiValue | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>("today");
  const [logTab, setLogTab] = useState<DayLogKind>("food");
  const openLog = (k: DayLogKind) => {
    setLogTab(k);
    setTab("log");
  };
  return (
    <Ctx.Provider value={{ tab, setTab, logTab, setLogTab, openLog }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUi(): UiValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUi must be used within UiProvider");
  return v;
}
