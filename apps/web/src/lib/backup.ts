"use client";

import { db } from "./db";

/** Tables included in a backup, in dependency-safe order. */
const TABLES = [
  "settings",
  "lists",
  "tasks",
  "completions",
  "ledger",
  "foods",
  "dayLogs",
  "focus",
] as const;

type TableName = (typeof TABLES)[number];

export interface BackupBundle {
  format: "grit-backup";
  version: number;
  exportedAt: number;
  data: Record<TableName, unknown[]>;
}

const FORMAT = "grit-backup";
const VERSION = 1;

/** Snapshot every table into a single serializable bundle. */
export async function exportData(): Promise<BackupBundle> {
  const d = db();
  const entries = await Promise.all(
    TABLES.map(async (t) => [t, await d.table(t).toArray()] as const),
  );
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: Date.now(),
    data: Object.fromEntries(entries) as Record<TableName, unknown[]>,
  };
}

/** Trigger a browser download of the current data as a .json file. */
export async function downloadBackup(): Promise<void> {
  const bundle = await exportData();
  const stamp = new Date(bundle.exportedAt)
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, "-");
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `grit-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function isBundle(x: unknown): x is BackupBundle {
  if (!x || typeof x !== "object") return false;
  const b = x as Partial<BackupBundle>;
  return b.format === FORMAT && typeof b.version === "number" && !!b.data;
}

/**
 * Replace all local data with the bundle's contents. This is a full restore:
 * every table is cleared and repopulated inside one transaction, so a malformed
 * import can't leave the DB half-written. Returns the row count restored.
 */
export async function importData(raw: string | BackupBundle): Promise<number> {
  const bundle: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!isBundle(bundle)) {
    throw new Error("Not a valid grit backup file.");
  }
  if (bundle.version > VERSION) {
    throw new Error(
      "This backup was made by a newer version of grit. Update first.",
    );
  }
  const d = db();
  let count = 0;
  await d.transaction(
    "rw",
    TABLES.map((t) => d.table(t)),
    async () => {
      for (const t of TABLES) {
        const rows = bundle.data[t] ?? [];
        await d.table(t).clear();
        if (rows.length) {
          await d.table(t).bulkAdd(rows);
          count += rows.length;
        }
      }
    },
  );
  return count;
}
