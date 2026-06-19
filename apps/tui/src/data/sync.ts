/**
 * Delta sync between the in-memory store and Supabase — the web app's sync.ts,
 * adapted for the terminal. The cloud is GritTUI's only durable store: the
 * cursor lives in memory and starts at 0, so launch does a full pull, then each
 * cycle ships just what changed. Last-write-wins per row by `updatedAt`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { db, syncControl, SYNCED_TABLES } from "./db";
import { supabase } from "../supabase";

/** local table name -> Supabase table name (snake_case). */
const REMOTE: Record<(typeof SYNCED_TABLES)[number], string> = {
  tasks: "tasks",
  completions: "completions",
  ledger: "ledger",
  settings: "settings",
  lists: "lists",
  foods: "foods",
  dayLogs: "day_logs",
  focus: "focus",
};

// Push cursor: this device's clock, selects our own dirty rows. Pull cursor:
// max *server* updated_at seen, so pulling is skew-proof (the server stamps
// updated_at via a trigger — see supabase/schema.sql).
const pushCursors = new Map<string, number>();
const pullCursors = new Map<string, number>();

let running = false;

export interface SyncResult {
  pushed: number;
  pulled: number;
}

export async function sync(userId: string): Promise<SyncResult | null> {
  const sb = supabase();
  if (!sb || running) return null;
  running = true;
  try {
    const pushSince = pushCursors.get(userId) ?? 0;
    const startedAt = Date.now();
    const pushed = await push(sb, userId, pushSince);
    pushCursors.set(userId, startedAt);

    const pullSince = pullCursors.get(userId) ?? 0;
    const { pulled, maxSeen } = await pull(sb, userId, pullSince, pushSince, startedAt);
    pullCursors.set(userId, Math.max(pullSince, maxSeen));

    // Tombstones pushed this cycle won't change again — drop them so they
    // aren't re-sent forever.
    for (const t of [...db().tombstones.values()]) {
      if (t.updatedAt <= startedAt) db().tombstones.delete(t.key);
    }
    return { pushed, pulled };
  } finally {
    running = false;
  }
}

async function push(
  sb: SupabaseClient,
  userId: string,
  since: number,
): Promise<number> {
  let n = 0;
  // Changed rows.
  for (const name of SYNCED_TABLES) {
    const rows = await db().table(name).toArray();
    const dirty = rows.filter(
      (r: { updatedAt?: number }) => (r.updatedAt ?? 0) > since,
    );
    if (!dirty.length) continue;
    const payload = dirty.map((r: { id: string; updatedAt?: number }) => ({
      id: String(r.id),
      user_id: userId,
      data: r,
      updated_at: new Date(r.updatedAt ?? Date.now()).toISOString(),
      deleted: false,
    }));
    const { error } = await sb
      .from(REMOTE[name])
      .upsert(payload, { onConflict: "user_id,id" });
    if (error) throw error;
    n += payload.length;
  }
  // Deletes.
  const tombs = [...db().tombstones.values()].filter((t) => t.updatedAt > since);
  const byTable = new Map<string, typeof tombs>();
  for (const t of tombs) {
    const list = byTable.get(t.table) ?? [];
    list.push(t);
    byTable.set(t.table, list);
  }
  for (const name of SYNCED_TABLES) {
    const list = byTable.get(name);
    if (!list?.length) continue;
    const payload = list.map((t) => ({
      id: String(t.id),
      user_id: userId,
      data: {},
      updated_at: new Date(t.updatedAt).toISOString(),
      deleted: true,
    }));
    const { error } = await sb
      .from(REMOTE[name])
      .upsert(payload, { onConflict: "user_id,id" });
    if (error) throw error;
    n += payload.length;
  }
  return n;
}

async function pull(
  sb: SupabaseClient,
  userId: string,
  pullSince: number,
  pushSince: number,
  stampAt: number,
): Promise<{ pulled: number; maxSeen: number }> {
  let n = 0;
  let maxSeen = pullSince;
  const sinceIso = new Date(pullSince).toISOString();
  for (const name of SYNCED_TABLES) {
    const { data, error } = await sb
      .from(REMOTE[name])
      .select("*")
      .eq("user_id", userId)
      .gt("updated_at", sinceIso);
    if (error) throw error;
    if (!data?.length) continue;

    syncControl.suppress = true;
    try {
      await db().transaction("rw", db().table(name), async () => {
        const table = db().table(name);
        for (const row of data) {
          const remoteMs = new Date(row.updated_at).getTime();
          if (remoteMs > maxSeen) maxSeen = remoteMs;
          if (row.deleted) {
            await table.delete(row.id);
            n += 1;
            continue;
          }
          const existing = (await table.get(row.id)) as
            | { updatedAt?: number }
            | undefined;
          // Apply the remote row UNLESS we hold an unpushed local edit to it.
          // "Locally dirty" = updatedAt > pushSince — this device's own clock
          // measured against its own push cursor, so it is immune to clock skew
          // between devices. (The old `existing.updatedAt <= remoteMs` compared a
          // device clock against the server clock; a device whose clock ran ahead
          // stamped its edits with inflated times and then rejected every remote
          // edit to rows it had touched — bad-task edits never crossed devices.)
          const locallyDirty = !!existing && (existing.updatedAt ?? 0) > pushSince;
          if (!locallyDirty) {
            // Stamp pulled rows with OUR cycle-start time (device domain), never
            // the server clock — otherwise next cycle this row would look newer
            // than our push cursor and be misread as a pending local edit.
            await table.put({ ...row.data, updatedAt: stampAt });
            n += 1;
          }
        }
      });
    } finally {
      syncControl.suppress = false;
    }
  }
  return { pulled: n, maxSeen };
}

export function resetSyncCursor(userId: string): void {
  pushCursors.delete(userId);
  pullCursors.delete(userId);
}
