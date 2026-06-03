"use client";

import Dexie, { type Table } from "dexie";
import type {
  Task,
  Completion,
  LedgerEntry,
  Settings,
  CustomList,
} from "./types";

/**
 * IndexedDB store via Dexie. This is the concrete persistence backend behind the
 * repository. Phase 3 can swap in a remote-backed implementation behind the same
 * repository interface without touching the UI.
 */
export class GritDB extends Dexie {
  tasks!: Table<Task, string>;
  completions!: Table<Completion, string>;
  ledger!: Table<LedgerEntry, string>;
  settings!: Table<Settings, string>;
  lists!: Table<CustomList, string>;

  constructor() {
    // IndexedDB store name kept as "ebosh" so existing local data survives the
    // rebrand to "grit" (renaming it would orphan the current database).
    super("ebosh");
    this.version(1).stores({
      tasks: "id, listType, order, archived",
      completions: "id, taskId, date, [taskId+date]",
      ledger: "id, timestamp, type, taskId",
      settings: "id",
    });
    // v2: custom lists. Existing tables carry forward; `listId` added to the
    // tasks index so a list's tasks can be queried directly.
    this.version(2).stores({
      tasks: "id, listType, order, archived, listId",
      lists: "id, order",
    });
  }
}

let _db: GritDB | null = null;

/** Lazily construct the DB so it only touches IndexedDB in the browser. */
export function db(): GritDB {
  if (!_db) _db = new GritDB();
  return _db;
}
