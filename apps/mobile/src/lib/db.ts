/**
 * Mobile persistence: the whole grit dataset lives in one JSON blob in
 * AsyncStorage. The web uses Dexie/IndexedDB; on mobile the data volume is
 * small (one user), so an in-memory snapshot persisted on every write is
 * simpler and fast. All domain math comes from @grit/core, identical to web.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_SETTINGS,
  type ActiveFocus,
  type Completion,
  type CustomList,
  type DayLog,
  type FoodItem,
  type LedgerEntry,
  type Settings,
  type Task,
} from "@grit/core";

/** A deleted row's gravestone so a delete propagates through sync. */
export interface Tombstone {
  table: string;
  id: string;
  updatedAt: number;
}

export interface DB {
  tasks: Task[];
  completions: Completion[];
  dayLogs: DayLog[];
  foods: FoodItem[];
  lists: CustomList[];
  ledger: LedgerEntry[];
  settings: Settings;
  activeFocus: ActiveFocus | null;
  /** Delete gravestones, pushed to the server on sync. */
  tombstones: Tombstone[];
}

/** Synced collections, mapped to Supabase tables (must match the website). */
export const REMOTE_TABLE = {
  tasks: "tasks",
  completions: "completions",
  ledger: "ledger",
  settings: "settings",
  lists: "lists",
  foods: "foods",
  dayLogs: "day_logs",
  focus: "focus",
} as const;

export type SyncedTable = keyof typeof REMOTE_TABLE;

const KEY = "grit.db.v1";

export function emptyDB(): DB {
  return {
    tasks: [],
    completions: [],
    dayLogs: [],
    foods: [],
    lists: [],
    ledger: [],
    settings: { ...DEFAULT_SETTINGS },
    activeFocus: null,
    tombstones: [],
  };
}

export async function loadDB(): Promise<DB> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return emptyDB();
    const parsed = JSON.parse(raw) as Partial<DB>;
    const base = emptyDB();
    return {
      ...base,
      ...parsed,
      // Merge settings so fields added later get defaults.
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    return emptyDB();
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced persist so rapid mutations don't thrash storage. */
export function saveDB(db: DB): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void AsyncStorage.setItem(KEY, JSON.stringify(db));
  }, 120);
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
