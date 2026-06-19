/**
 * Backup export/import. Same bundle format as the web app (format "grit-backup",
 * version 1) so files are interchangeable across web, mobile, and TUI — only the
 * I/O differs: here we read and write JSON files on disk instead of triggering a
 * browser download. Restored rows keep their updatedAt and sync up on the next
 * cycle.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { db } from "./db";

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

/** Write the current data to a JSON file. Defaults to ~/grit-backup-<stamp>.json. Returns the path. */
export async function writeBackup(path?: string): Promise<string> {
  const bundle = await exportData();
  const stamp = new Date(bundle.exportedAt)
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, "-");
  const target = path ?? join(homedir(), `grit-backup-${stamp}.json`);
  writeFileSync(target, JSON.stringify(bundle, null, 2));
  return target;
}

function isBundle(x: unknown): x is BackupBundle {
  if (!x || typeof x !== "object") return false;
  const b = x as Partial<BackupBundle>;
  return b.format === FORMAT && typeof b.version === "number" && !!b.data;
}

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
  for (const t of TABLES) {
    const rows = (bundle.data[t] ?? []) as { id: string }[];
    await d.table(t).clear();
    if (rows.length) {
      await d.table(t).bulkAdd(rows);
      count += rows.length;
    }
  }
  return count;
}

/** Read a backup file from disk and restore it. Returns rows restored. */
export async function importBackupFile(path: string): Promise<number> {
  const raw = readFileSync(path, "utf8");
  return importData(raw);
}
