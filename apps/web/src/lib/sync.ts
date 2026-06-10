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

const cursorKey = (userId: string) => `grit.sync.${userId}.at`;

function getCursor(userId: string): number {
  return Number(localStorage.getItem(cursorKey(userId)) ?? 0);
}
function setCursor(userId: string, ms: number): void {
  localStorage.setItem(cursorKey(userId), String(ms));
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
    const since = getCursor(userId);
    const startedAt = Date.now();
    // Backfill `updatedAt` on legacy rows (created before sync existed) so the
    // first sync actually uploads them instead of skipping them. Stamped with
    // `startedAt` so they push this cycle (> since) but not the next (cursor
    // becomes startedAt).
    await backfillUpdatedAt(startedAt);
    const pushed = await push(sb, userId, since);
    const pulled = await pull(sb, userId, since);
    // Cursor = when this cycle began, so changes made during it sync next time.
    setCursor(userId, startedAt);
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
  since: number,
): Promise<number> {
  let n = 0;
  const sinceIso = new Date(since).toISOString();
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
          if (row.deleted) {
            await table.delete(row.id);
            n += 1;
            continue;
          }
          const existing = (await table.get(row.id)) as
            | { updatedAt?: number }
            | undefined;
          if (!existing || (existing.updatedAt ?? 0) <= remoteMs) {
            await table.put({ ...row.data, updatedAt: remoteMs });
            n += 1;
          }
        }
      });
    } finally {
      syncControl.suppress = false;
    }
  }
  return n;
}

/** Forget a user's sync cursor (e.g. on sign-out) so the next sign-in re-syncs fully. */
export function resetSyncCursor(userId: string): void {
  localStorage.removeItem(cursorKey(userId));
}
