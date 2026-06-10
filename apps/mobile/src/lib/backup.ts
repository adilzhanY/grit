/**
 * Export/import in the EXACT same bundle format as the website
 * (`grit-backup` v1), so a file exported on the web imports here and back.
 * The web stores `settings` and `focus` as one-row tables; we map our
 * singleton objects to/from those arrays.
 */
import { DEFAULT_SETTINGS, type ActiveFocus, type Settings } from "@grit/core";
import { emptyDB, type DB } from "./db";

const FORMAT = "grit-backup";
const VERSION = 1;

const TABLES = ["settings", "lists", "tasks", "completions", "ledger", "foods", "dayLogs", "focus"] as const;
type TableName = (typeof TABLES)[number];

export interface BackupBundle {
  format: "grit-backup";
  version: number;
  exportedAt: number;
  data: Record<TableName, unknown[]>;
}

export function exportBundle(db: DB): BackupBundle {
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: Date.now(),
    data: {
      settings: [db.settings],
      lists: db.lists,
      tasks: db.tasks,
      completions: db.completions,
      ledger: db.ledger,
      foods: db.foods,
      dayLogs: db.dayLogs,
      focus: db.activeFocus ? [db.activeFocus] : [],
    },
  };
}

function isBundle(x: unknown): x is BackupBundle {
  if (!x || typeof x !== "object") return false;
  const b = x as Partial<BackupBundle>;
  return b.format === FORMAT && typeof b.version === "number" && !!b.data;
}

/** Parse + validate a backup string/object into a fresh DB. Returns [db, rowCount]. */
export function bundleToDB(raw: string | BackupBundle): [DB, number] {
  const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!isBundle(parsed)) throw new Error("Not a valid grit backup file.");
  if (parsed.version > VERSION) {
    throw new Error("This backup was made by a newer version of grit. Update first.");
  }
  const d = emptyDB();
  const data = parsed.data;
  d.settings = { ...DEFAULT_SETTINGS, ...((data.settings?.[0] as Settings) ?? {}) };
  d.lists = (data.lists ?? []) as DB["lists"];
  d.tasks = (data.tasks ?? []) as DB["tasks"];
  d.completions = (data.completions ?? []) as DB["completions"];
  d.ledger = (data.ledger ?? []) as DB["ledger"];
  d.foods = (data.foods ?? []) as DB["foods"];
  d.dayLogs = (data.dayLogs ?? []) as DB["dayLogs"];
  d.activeFocus = ((data.focus?.[0] as ActiveFocus) ?? null) || null;
  d.tombstones = [];

  const count =
    d.lists.length + d.tasks.length + d.completions.length + d.ledger.length +
    d.foods.length + d.dayLogs.length + data.settings.length + data.focus.length;
  return [d, count];
}
