"use client";

import Dexie, { type Table } from "dexie";
import type {
  Task,
  Completion,
  LedgerEntry,
  Settings,
  CustomList,
  FoodItem,
  DayLog,
  ActiveFocus,
} from "./types";

/**
 * A deleted row's gravestone, so a delete on one device propagates to others
 * (a plain "row is gone" can't be told from "row never synced"). Keyed
 * "table:id"; carries the local table name and the original row id.
 */
export interface Tombstone {
  key: string;
  table: string;
  id: string;
  updatedAt: number;
}

/**
 * Lets the sync layer apply remote changes without the write hooks firing —
 * otherwise pulled rows would re-stamp `updatedAt` (echo) and pulled deletes
 * would create fresh tombstones. Set `suppress` true around remote applies.
 */
export const syncControl = { suppress: false };

/** Tables that participate in cloud sync (everything except tombstones itself). */
export const SYNCED_TABLES = [
  "tasks",
  "completions",
  "ledger",
  "settings",
  "lists",
  "foods",
  "dayLogs",
  "focus",
] as const;

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
  foods!: Table<FoodItem, string>;
  dayLogs!: Table<DayLog, string>;
  focus!: Table<ActiveFocus, string>;
  tombstones!: Table<Tombstone, string>;

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
    // v3: Daily Log — saved foods library + day-keyed tracker entries.
    this.version(3).stores({
      foods: "id, name",
      dayLogs: "id, kind, date, loggedAt, [kind+date]",
    });
    // v4: Pomodoro — the single persisted running session.
    this.version(4).stores({
      focus: "id",
    });
    // v5: cloud sync — gravestones for deletes; `updatedAt` indexed for delta
    // queries on the synced tables.
    this.version(5).stores({
      tombstones: "key, updatedAt",
      tasks: "id, listType, order, archived, listId, updatedAt",
      completions: "id, taskId, date, [taskId+date], updatedAt",
      ledger: "id, timestamp, type, taskId, updatedAt",
      lists: "id, order, updatedAt",
      foods: "id, name, updatedAt",
      dayLogs: "id, kind, date, loggedAt, [kind+date], updatedAt",
    });

    this.attachSyncHooks();
  }

  /**
   * Stamp `updatedAt` on every create/update and record a tombstone on delete,
   * so the sync layer can ship only what changed. Skipped while
   * `syncControl.suppress` is set (i.e. while applying remote changes).
   */
  private attachSyncHooks(): void {
    for (const name of SYNCED_TABLES) {
      const table = this.table(name);
      table.hook("creating", function (_pk, obj: Record<string, unknown>) {
        if (syncControl.suppress) return;
        if (obj.updatedAt === undefined) obj.updatedAt = Date.now();
      });
      table.hook("updating", function () {
        if (syncControl.suppress) return;
        return { updatedAt: Date.now() };
      });
      table.hook("deleting", function (pk, _obj, tx) {
        if (syncControl.suppress) return;
        const id = String(pk);
        // Write the tombstone once the delete commits, in its own transaction
        // (the current one may not include the tombstones table).
        tx.on("complete", () => {
          void db().tombstones.put({
            key: `${name}:${id}`,
            table: name,
            id,
            updatedAt: Date.now(),
          });
        });
      });
    }
  }
}

let _db: GritDB | null = null;

/** Lazily construct the DB so it only touches IndexedDB in the browser. */
export function db(): GritDB {
  if (!_db) _db = new GritDB();
  return _db;
}
