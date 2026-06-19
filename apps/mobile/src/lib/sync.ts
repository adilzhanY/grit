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

// Push cursor (this device's clock) selects our own dirty rows. Pull cursor
// tracks the max *server* updated_at seen, so pulling is immune to clock skew
// between devices (the server stamps updated_at via a trigger — see
// supabase/schema.sql).
const pushKey = (userId: string) => `grit.sync.${userId}.at`;
const pullKey = (userId: string) => `grit.sync.${userId}.pull`;

async function getNum(key: string): Promise<number> {
  return Number((await AsyncStorage.getItem(key)) ?? 0);
}
async function setNum(key: string, ms: number): Promise<void> {
  await AsyncStorage.setItem(key, String(ms));
}

export async function resetSyncCursor(userId: string): Promise<void> {
  await AsyncStorage.multiRemove([pushKey(userId), pullKey(userId)]);
}

let running = false;

const NAMES = Object.keys(REMOTE_TABLE) as SyncedTable[];

export async function sync(db: DB, userId: string): Promise<SyncResult | null> {
  const sb = supabase();
  if (!sb || running) return null;
  running = true;
  try {
    const pushSince = await getNum(pushKey(userId));
    const pullSince = await getNum(pullKey(userId));
    const startedAt = Date.now();
    let maxSeen = pullSince;
    let pushed = 0;
    let pulled = 0;

    // ---- repair clock-skew corruption ----
    // A row stamped in the FUTURE (this device's clock was ahead when the edit
    // was made, then later corrected by NTP) reads as "locally dirty" forever:
    // updatedAt stays > every future pushSince, so we re-push our copy each
    // cycle AND reject every incoming remote edit to it — the two devices wedge
    // and never converge. Bad tasks are hit hardest because they're edited in
    // place (slip/penalty/streak) rather than appended to the ledger. Clamp any
    // future stamp down to the cycle clock so the row pushes once this cycle and
    // then settles (updatedAt <= pushSince next cycle ⇒ remote edits flow again).
    for (const name of NAMES) {
      for (const r of collection(db, name).rows()) {
        if ((r.updatedAt ?? 0) > startedAt) r.updatedAt = startedAt;
      }
    }

    // ---- push changed rows ----
    for (const name of NAMES) {
      const dirty = collection(db, name)
        .rows()
        .filter((r) => (r.updatedAt ?? 0) > pushSince);
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
    const tombs = db.tombstones.filter((t) => t.updatedAt > pushSince);
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
    const sinceIso = new Date(pullSince).toISOString();
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
        if (remoteMs > maxSeen) maxSeen = remoteMs;
        const id = String(row.id);
        if (row.deleted) {
          coll.del(id);
          pulled += 1;
          continue;
        }
        // Apply the remote row UNLESS we hold an unpushed local edit to it.
        // "Locally dirty" = updatedAt > pushSince — this device's own clock
        // measured against its own push cursor, so it is immune to clock skew
        // between devices. (The old `existing <= remoteMs` compared a device
        // clock against the server clock; a device whose clock ran ahead stamped
        // its edits with inflated times and then rejected every remote edit to
        // rows it had touched — bad-task edits never crossed devices.)
        const local = existing.get(id);
        const locallyDirty = local !== undefined && local > pushSince;
        if (!locallyDirty) {
          // Stamp pulled rows with OUR cycle-start time (device domain), never
          // the server clock — otherwise next cycle this row would look newer
          // than our push cursor and be misread as a pending local edit.
          coll.upsert({ ...row.data, updatedAt: startedAt });
          pulled += 1;
        }
      }
    }

    // Drop tombstones we've pushed (avoid re-sending forever).
    db.tombstones = db.tombstones.filter((t) => t.updatedAt > startedAt);

    await setNum(pushKey(userId), startedAt);
    await setNum(pullKey(userId), Math.max(pullSince, maxSeen));
    return { pushed, pulled };
  } finally {
    running = false;
  }
}
