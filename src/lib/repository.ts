"use client";

import { db } from "./db";
import {
  type Task,
  type Completion,
  type LedgerEntry,
  type Settings,
  type ListType,
  DEFAULT_SETTINGS,
  DEFAULT_POINTS,
  DEFAULT_SLIP_PENALTY,
} from "./types";
import { pendingMilestones, streakMs } from "./milestones";

/**
 * The single gateway between EBOSH's UI and persisted state. Every XP change goes
 * through here and lands in the append-only ledger, so XP/level/streaks stay derivable
 * and sync-friendly.
 */

function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** Local calendar day (YYYY-MM-DD) for a timestamp. */
export function localDay(ts = Date.now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------- Settings ----------

export async function getSettings(): Promise<Settings> {
  const s = await db().settings.get("singleton");
  if (s) return s;
  await db().settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const s = await getSettings();
  await db().settings.put({ ...s, ...patch, id: "singleton" });
}

// ---------- Ledger ----------

async function addLedger(
  entry: Omit<LedgerEntry, "id" | "timestamp"> & { timestamp?: number },
): Promise<void> {
  await db().ledger.add({
    id: uid(),
    timestamp: entry.timestamp ?? Date.now(),
    type: entry.type,
    delta: entry.delta,
    taskId: entry.taskId,
    meta: entry.meta,
  });
}

export async function getLedger(): Promise<LedgerEntry[]> {
  return db().ledger.orderBy("timestamp").toArray();
}

export async function totalXp(): Promise<number> {
  let sum = 0;
  await db().ledger.each((e) => {
    sum += e.delta;
  });
  return Math.max(0, sum);
}

/** XP earned today (positive deltas only, for the "today" readout). */
export async function xpGainedOn(date = localDay()): Promise<number> {
  const all = await getLedger();
  return all
    .filter((e) => localDay(e.timestamp) === date)
    .reduce((s, e) => s + e.delta, 0);
}

// ---------- Tasks ----------

export async function listTasks(listType?: ListType): Promise<Task[]> {
  const all = await db().tasks.toArray();
  return all
    .filter((t) => (listType ? t.listType === listType : true))
    .sort((a, b) => a.order - b.order);
}

export async function addTask(input: {
  listType: ListType;
  title: string;
  points?: number;
  notes?: string;
  recurrence?: Task["recurrence"];
  slipPenalty?: number;
  rewardMultiplier?: number;
}): Promise<Task> {
  const siblings = await listTasks(input.listType);
  const order = siblings.length;
  const now = Date.now();
  const task: Task = {
    id: uid(),
    listType: input.listType,
    title: input.title.trim(),
    notes: input.notes,
    points: input.points ?? DEFAULT_POINTS[input.listType],
    order,
    archived: false,
    createdAt: now,
  };
  if (input.listType === "must") {
    task.recurrence = input.recurrence ?? { type: "daily", weekdays: [] };
    task.starredMyDay = false;
  }
  if (input.listType === "bad") {
    task.slipPenalty = input.slipPenalty ?? DEFAULT_SLIP_PENALTY;
    task.rewardMultiplier = input.rewardMultiplier ?? 1;
    task.awardedMilestoneIds = [];
    // Streak starts now.
    task.lastSlipAt = undefined;
  }
  await db().tasks.add(task);
  return task;
}

export async function updateTask(
  id: string,
  patch: Partial<Task>,
): Promise<void> {
  await db().tasks.update(id, patch);
}

export async function deleteTask(id: string): Promise<void> {
  await db().tasks.delete(id);
  await db().completions.where("taskId").equals(id).delete();
}

// ---------- Must completions ----------

export async function getCompletion(
  taskId: string,
  date = localDay(),
): Promise<Completion | undefined> {
  return db().completions.where({ taskId, date }).first();
}

export async function completionsForDay(date = localDay()): Promise<Completion[]> {
  return db().completions.where("date").equals(date).toArray();
}

/** Mark a Must task done for `date`, awarding its points. Idempotent. */
export async function completeMust(
  task: Task,
  date = localDay(),
): Promise<void> {
  const existing = await getCompletion(task.id, date);
  if (existing) return;
  await db().completions.add({
    id: uid(),
    taskId: task.id,
    date,
    completedAt: Date.now(),
  });
  await addLedger({
    type: "must_complete",
    delta: task.points,
    taskId: task.id,
    meta: task.title,
  });
}

/** Undo a Must completion for `date`, reversing its points via an append-only entry. */
export async function uncompleteMust(
  task: Task,
  date = localDay(),
): Promise<void> {
  const existing = await getCompletion(task.id, date);
  if (!existing) return;
  await db().completions.delete(existing.id);
  await addLedger({
    type: "adjust",
    delta: -task.points,
    taskId: task.id,
    meta: `undo: ${task.title}`,
  });
}

// ---------- Bad slips & milestones ----------

/** Record a slip: penalty applied, streak reset, milestones re-armed. */
export async function recordSlip(task: Task): Promise<number> {
  const penalty = task.slipPenalty ?? DEFAULT_SLIP_PENALTY;
  const now = Date.now();
  await addLedger({
    type: "bad_slip",
    delta: -penalty,
    taskId: task.id,
    meta: task.title,
  });
  await updateTask(task.id, { lastSlipAt: now, awardedMilestoneIds: [] });
  return penalty;
}

/**
 * Award any clean-streak milestones a bad task has crossed but not yet collected.
 * Idempotent — safe to call on every load/tick. Returns awarded {label, xp} list.
 */
export async function awardMilestones(
  task: Task,
  now = Date.now(),
): Promise<{ label: string; xp: number }[]> {
  const streak = streakMs(now, task.lastSlipAt, task.createdAt);
  const awarded = task.awardedMilestoneIds ?? [];
  const pending = pendingMilestones(streak, awarded);
  if (pending.length === 0) return [];

  const mult = task.rewardMultiplier ?? 1;
  const granted: { label: string; xp: number }[] = [];
  for (const m of pending) {
    const xp = Math.round(m.baseXp * mult);
    await addLedger({
      type: "streak_milestone",
      delta: xp,
      taskId: task.id,
      meta: `${task.title} · ${m.label} clean`,
    });
    granted.push({ label: m.label, xp });
  }
  await updateTask(task.id, {
    awardedMilestoneIds: [...awarded, ...pending.map((m) => m.id)],
  });
  return granted;
}

// ---------- Cool / Impossible achievements ----------

export async function achieve(task: Task): Promise<void> {
  if (task.archived) return;
  await addLedger({
    type: task.listType === "impossible" ? "impossible_achieve" : "cool_achieve",
    delta: task.points,
    taskId: task.id,
    meta: task.title,
  });
  await updateTask(task.id, { archived: true, achievedAt: Date.now() });
}

export async function unachieve(task: Task): Promise<void> {
  if (!task.archived) return;
  await addLedger({
    type: "adjust",
    delta: -task.points,
    taskId: task.id,
    meta: `undo: ${task.title}`,
  });
  await updateTask(task.id, { archived: false, achievedAt: undefined });
}
