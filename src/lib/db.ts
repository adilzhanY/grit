"use client";

import Dexie, { type Table } from "dexie";
import type { Task, Completion, LedgerEntry, Settings } from "./types";

/**
 * IndexedDB store via Dexie. This is the concrete persistence backend behind the
 * repository. Phase 3 can swap in a remote-backed implementation behind the same
 * repository interface without touching the UI.
 */
export class EboshDB extends Dexie {
  tasks!: Table<Task, string>;
  completions!: Table<Completion, string>;
  ledger!: Table<LedgerEntry, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super("ebosh");
    this.version(1).stores({
      tasks: "id, listType, order, archived",
      completions: "id, taskId, date, [taskId+date]",
      ledger: "id, timestamp, type, taskId",
      settings: "id",
    });
  }
}

let _db: EboshDB | null = null;

/** Lazily construct the DB so it only touches IndexedDB in the browser. */
export function db(): EboshDB {
  if (!_db) _db = new EboshDB();
  return _db;
}
