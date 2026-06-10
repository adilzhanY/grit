/**
 * Delta sync against the same Supabase tables the website uses: each row is
 * { user_id, id, data jsonb, updated_at, deleted }, last-write-wins by
 * updatedAt. Operates on the in-memory DB object (the store commits after).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { REMOTE_TABLE, type DB, type SyncedTable } from "./db";

export interface SyncResult {
  pushed: number;
  pulled: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/** Per-table local accessors over the DB object. */
function collection(db: DB, name: SyncedTable): {
  rows: () => Row[];
  upsert: (row: Row) => void;
  del: (id: string) => void;
} {
  switch (name) {
    case "settings":
      return {
        rows: () => [db.settings],
        upsert: (row) => { db.settings = row; },
        del: () => {},
      };
    case "focus":
      return {
        rows: () => (db.activeFocus ? [db.activeFocus] : []),
        upsert: (row) => { db.activeFocus = row; },
        del: () => { db.activeFocus = null; },
      };
    default: {
      const key = name as Exclude<SyncedTable, "settings" | "focus">;
      return {
        rows: () => db[key] as Row[],
        upsert: (row) => {
          const arr = db[key] as Row[];
          const i = arr.findIndex((r) => r.id === row.id);
          if (i >= 0) arr[i] = row;
          else arr.push(row);
        },
        del: (id) => { (db[key] as Row[]) = (db[key] as Row[]).filter((r) => r.id !== id); },
      };
    }
  }
}

const cursorKey = (userId: string) => `grit.sync.${userId}.at`;

async function getCursor(userId: string): Promise<number> {
  return Number((await AsyncStorage.getItem(cursorKey(userId))) ?? 0);
}
async function setCursor(userId: string, ms: number): Promise<void> {
  await AsyncStorage.setItem(cursorKey(userId), String(ms));
}

export async function resetSyncCursor(userId: string): Promise<void> {
  await AsyncStorage.removeItem(cursorKey(userId));
}

let running = false;

const NAMES = Object.keys(REMOTE_TABLE) as SyncedTable[];

export async function sync(db: DB, userId: string): Promise<SyncResult | null> {
  const sb = supabase();
  if (!sb || running) return null;
  running = true;
  try {
    const since = await getCursor(userId);
    const startedAt = Date.now();
    let pushed = 0;
    let pulled = 0;

    // ---- push changed rows ----
    for (const name of NAMES) {
      const dirty = collection(db, name)
        .rows()
        .filter((r) => (r.updatedAt ?? 0) > since);
      if (!dirty.length) continue;
      const payload = dirty.map((r) => ({
        id: String(r.id),
        user_id: userId,
        data: r,
        updated_at: new Date(r.updatedAt ?? Date.now()).toISOString(),
        deleted: false,
      }));
      const { error } = await sb.from(REMOTE_TABLE[name]).upsert(payload, { onConflict: "user_id,id" });
      if (error) throw error;
      pushed += payload.length;
    }

    // ---- push tombstones ----
    const tombs = db.tombstones.filter((t) => t.updatedAt > since);
    for (const name of NAMES) {
      const list = tombs.filter((t) => t.table === name);
      if (!list.length) continue;
      const payload = list.map((t) => ({
        id: String(t.id),
        user_id: userId,
        data: {},
        updated_at: new Date(t.updatedAt).toISOString(),
        deleted: true,
      }));
      const { error } = await sb.from(REMOTE_TABLE[name]).upsert(payload, { onConflict: "user_id,id" });
      if (error) throw error;
      pushed += payload.length;
    }

    // ---- pull ----
    const sinceIso = new Date(since).toISOString();
    for (const name of NAMES) {
      const { data, error } = await sb
        .from(REMOTE_TABLE[name])
        .select("*")
        .eq("user_id", userId)
        .gt("updated_at", sinceIso);
      if (error) throw error;
      if (!data?.length) continue;
      const coll = collection(db, name);
      const existing = new Map(coll.rows().map((r) => [String(r.id), r.updatedAt ?? 0]));
      for (const row of data) {
        const remoteMs = new Date(row.updated_at).getTime();
        const id = String(row.id);
        if (row.deleted) {
          coll.del(id);
          pulled += 1;
          continue;
        }
        if ((existing.get(id) ?? 0) <= remoteMs) {
          coll.upsert({ ...row.data, updatedAt: remoteMs });
          pulled += 1;
        }
      }
    }

    // Drop tombstones we've pushed (avoid re-sending forever).
    db.tombstones = db.tombstones.filter((t) => t.updatedAt > startedAt);

    await setCursor(userId, startedAt);
    return { pushed, pulled };
  } finally {
    running = false;
  }
}
