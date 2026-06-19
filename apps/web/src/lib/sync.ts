"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { db, syncControl, SYNCED_TABLES } from "./db";
import { supabase } from "./supabase";

/**
 * Delta sync between the local Dexie store and Supabase. Each local table maps
 * to a Supabase table of the same shape: { user_id, id, data jsonb, updated_at,
 * deleted }. Row-Level Security limits every query to the signed-in user.
 *
 * Strategy: last-write-wins per row by `updatedAt`. We push rows (and
 * tombstones) changed since the last sync, then pull remote rows changed since
 * then and apply the newer side. The append-only ledger means real conflicts
 * are rare; LWW is enough for the mutable tables (tasks, settings…).
 */

/** local Dexie table name -> Supabase table name (snake_case). */
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

// Two cursors. The PUSH cursor (this device's clock) selects our own dirty rows
// to upload. The PULL cursor tracks the max *server* updated_at we've actually
// seen — so pulling is immune to clock skew between devices (the server stamps
// updated_at via a trigger; see supabase/schema.sql).
const pushKey = (userId: string) => `grit.sync.${userId}.at`;
const pullKey = (userId: string) => `grit.sync.${userId}.pull`;

// Largest epoch-ms a JS Date can represent; beyond it new Date(n).toISOString()
// throws RangeError. A cursor that overflowed this (a pre-trigger future
// timestamp from a skewed clock, pulled into maxSeen and persisted) would throw
// on every pull and wedge sync forever. Treat any invalid/out-of-range cursor
// as 0 → a one-time full re-pull that re-converges and clears the bad value.
const MAX_TS = 8.64e15;
function getNum(key: string): number {
  const n = Number(localStorage.getItem(key) ?? 0);
  return Number.isFinite(n) && n >= 0 && n <= MAX_TS ? n : 0;
}
function setNum(key: string, ms: number): void {
  localStorage.setItem(key, String(ms));
}

let running = false;

export interface SyncResult {
  pushed: number;
  pulled: number;
}

/**
 * Run one full push+pull cycle for the given user. No-ops (returns null) if
 * Supabase isn't configured or a sync is already in flight. Throws on a
 * network/permission error so the caller can surface it.
 */
export async function sync(userId: string): Promise<SyncResult | null> {
  const sb = supabase();
  if (!sb || running) return null;
  running = true;
  try {
    const pushSince = getNum(pushKey(userId));
    const startedAt = Date.now();
    // Backfill `updatedAt` on legacy rows (created before sync existed) so the
    // first sync actually uploads them instead of skipping them.
    await backfillUpdatedAt(startedAt);
    await clampFutureUpdatedAt(startedAt);
    const pushed = await push(sb, userId, pushSince);
    // Push cursor = cycle start; our own writes are timed by our own clock.
    setNum(pushKey(userId), startedAt);

    const pullSince = getNum(pullKey(userId));
    const { pulled, maxSeen } = await pull(sb, userId, pullSince, pushSince, startedAt);
    // Pull cursor = newest server updated_at actually seen; it never advances
    // past data we haven't pulled, so skew can't make us skip a remote change.
    setNum(pullKey(userId), Math.max(pullSince, maxSeen));
    return { pushed, pulled };
  } finally {
    running = false;
  }
}

/**
 * One-time repair: rows created before the sync feature have no `updatedAt`,
 * so the delta push (`updatedAt > since`) silently skips them. Stamp each with
 * `stamp` (the cycle start) so they upload this cycle and then sort as already
 * synced. Hooks are suppressed so we can write the value verbatim.
 */
async function backfillUpdatedAt(stamp: number): Promise<void> {
  for (const name of SYNCED_TABLES) {
    const rows = (await db().table(name).toArray()) as Array<{
      id: string;
      updatedAt?: number;
    }>;
    const missing = rows.filter((r) => r.updatedAt === undefined);
    if (!missing.length) continue;
    syncControl.suppress = true;
    try {
      for (const r of missing) {
        await db().table(name).update(r.id, { updatedAt: stamp });
      }
    } finally {
      syncControl.suppress = false;
    }
  }
}

/**
 * Repair clock-skew corruption: a row stamped in the FUTURE (this device's
 * clock was ahead when edited, then corrected) reads as "locally dirty" forever
 * — updatedAt stays > every future pushSince, so we re-push our copy each cycle
 * AND reject every incoming remote edit to it. The two devices wedge and never
 * converge (worst on in-place-edited bad tasks). Clamp any future stamp to the
 * cycle clock so the row pushes once and then settles. Hooks are suppressed so
 * the value is written verbatim.
 */
async function clampFutureUpdatedAt(stamp: number): Promise<void> {
  for (const name of SYNCED_TABLES) {
    const rows = (await db().table(name).toArray()) as Array<{
      id: string;
      updatedAt?: number;
    }>;
    const future = rows.filter((r) => (r.updatedAt ?? 0) > stamp);
    if (!future.length) continue;
    syncControl.suppress = true;
    try {
      for (const r of future) {
        await db().table(name).update(r.id, { updatedAt: stamp });
      }
    } finally {
      syncControl.suppress = false;
    }
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
  const tombs = (await db().tombstones.toArray()).filter((t) => t.updatedAt > since);
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

    // Apply with hooks suppressed so we don't echo updatedAt / re-tombstone.
    syncControl.suppress = true;
    try {
      await db().transaction("rw", db().table(name), async () => {
        const table = db().table(name);
        for (const row of data) {
          const remoteMs = new Date(row.updated_at).getTime();
          // Ignore an unparseable/out-of-range server stamp so it can't poison
          // the persisted pull cursor (which then throws on the next cycle).
          if (Number.isFinite(remoteMs) && remoteMs > maxSeen && remoteMs <= MAX_TS) {
            maxSeen = remoteMs;
          }
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

/** Forget a user's sync cursors (e.g. on sign-out) so the next sign-in re-syncs fully. */
export function resetSyncCursor(userId: string): void {
  localStorage.removeItem(pushKey(userId));
  localStorage.removeItem(pullKey(userId));
}
