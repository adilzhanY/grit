"use client";

import { db } from "./db";
import {
  type Task,
  type Subtask,
  type Completion,
  type LedgerEntry,
  type Settings,
  type ListType,
  type CustomList,
  DEFAULT_SETTINGS,
  DEFAULT_POINTS,
  DEFAULT_SLIP_PENALTY,
} from "./types";
import { pendingMilestones, streakMs } from "./milestones";

/**
 * The single gateway between grit's UI and persisted state. Every XP change goes
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
  let delta = entry.delta;
  // XP floors at 0: never deduct more than the user currently has, so the
  // running total can't go negative and "hide" later gains in a debt hole.
  if (delta < 0) {
    const current = await totalXp();
    delta = -Math.min(-delta, current);
  }
  await db().ledger.add({
    id: uid(),
    timestamp: entry.timestamp ?? Date.now(),
    type: entry.type,
    delta,
    taskId: entry.taskId,
    meta: entry.meta,
  });
}

export async function getLedger(): Promise<LedgerEntry[]> {
  return db().ledger.orderBy("timestamp").toArray();
}

/**
 * Testing helper: wipe the XP ledger so XP/level go back to 0. Tasks,
 * completions, custom lists and bad-task streak state are untouched.
 */
export async function resetXp(): Promise<void> {
  await db().ledger.clear();
}

export async function totalXp(): Promise<number> {
  // Walk events in time order, flooring at 0 after each one. A penalty while at
  // 0 XP costs nothing, and never leaves a hidden debt that eats later gains.
  const all = await getLedger();
  let bal = 0;
  for (const e of all) bal = Math.max(0, bal + e.delta);
  return bal;
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
  /** Bad only: the habit was already quit at this timestamp (backdated streak). */
  cleanSince?: number;
  listId?: string;
  /** Pin the new task into My Day (e.g. quick-add from the My Day view). */
  starredMyDay?: boolean;
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
    if (input.cleanSince && input.cleanSince < now) {
      // Backdated quit: streak shows time clean since then, but milestones
      // already crossed are pre-marked as awarded (no XP) — only milestones
      // reached after creation count.
      task.lastSlipAt = input.cleanSince;
      task.awardedMilestoneIds = pendingMilestones(now - input.cleanSince, []).map(
        (m) => m.id,
      );
    } else {
      task.awardedMilestoneIds = [];
      // Streak starts now.
      task.lastSlipAt = undefined;
    }
  }
  if (input.listType === "custom") {
    task.listId = input.listId;
  }
  if (input.starredMyDay) task.starredMyDay = true;
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

function achieveLedgerType(listType: ListType): LedgerEntry["type"] {
  if (listType === "impossible") return "impossible_achieve";
  if (listType === "custom") return "custom_complete";
  return "cool_achieve";
}

export async function achieve(task: Task): Promise<void> {
  if (task.archived) return;
  await addLedger({
    type: achieveLedgerType(task.listType),
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

// ---------- Custom lists ----------

export async function listCustomLists(): Promise<CustomList[]> {
  const all = await db().lists.toArray();
  return all.sort((a, b) => a.order - b.order);
}

export async function addCustomList(name: string): Promise<CustomList> {
  const existing = await listCustomLists();
  const list: CustomList = {
    id: uid(),
    name: name.trim() || "Untitled list",
    order: existing.length,
    createdAt: Date.now(),
  };
  await db().lists.add(list);
  return list;
}

export async function renameCustomList(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await db().lists.update(id, { name: trimmed });
}

/** Delete a list along with its tasks and their completions. */
export async function deleteCustomList(id: string): Promise<void> {
  const tasks = await db().tasks.where("listId").equals(id).toArray();
  for (const t of tasks) {
    await db().completions.where("taskId").equals(t.id).delete();
  }
  await db().tasks.where("listId").equals(id).delete();
  await db().lists.delete(id);
}

// ---------- Subtasks ----------

/** Is this subtask done? Must subtasks reset daily; one-shots stay done. */
export function subtaskDone(
  task: Task,
  sub: Subtask,
  date = localDay(),
): boolean {
  if (sub.doneAt === undefined) return false;
  return task.listType === "must" ? localDay(sub.doneAt) === date : true;
}

/**
 * XP share per subtask id. Done subtasks map to what they actually awarded;
 * undone subtasks split the remaining pool (points − awarded so far) evenly,
 * remainder to the earliest. The last subtask to complete therefore always
 * receives exactly the remaining pool, so the total awarded always equals
 * the parent's points — even after mid-flight adds/removes.
 */
export function subtaskShares(
  task: Task,
  date = localDay(),
): Map<string, number> {
  const subs = task.subtasks ?? [];
  const shares = new Map<string, number>();
  const undone: Subtask[] = [];
  let pool = task.points;
  for (const s of subs) {
    if (subtaskDone(task, s, date)) {
      shares.set(s.id, s.awardedXp ?? 0);
      pool -= s.awardedXp ?? 0;
    } else {
      undone.push(s);
    }
  }
  pool = Math.max(0, pool);
  undone.forEach((s, i) => {
    shares.set(
      s.id,
      Math.floor(pool / undone.length) + (i < pool % undone.length ? 1 : 0),
    );
  });
  return shares;
}

/** Ledger type for completing (a share of) a task of this list type. */
function completeLedgerType(listType: ListType): LedgerEntry["type"] {
  return listType === "must" ? "must_complete" : achieveLedgerType(listType);
}

/** Parent done state: must = completed today; one-shot = archived. */
async function parentDone(task: Task, date: string): Promise<boolean> {
  if (task.listType === "must") return !!(await getCompletion(task.id, date));
  const fresh = await db().tasks.get(task.id);
  return !!(fresh ?? task).archived;
}

/**
 * If every subtask is done, complete the parent. XP was already distributed
 * via subtask shares, so the parent itself awards 0 — except any leftover
 * pool (e.g. an undone subtask was just deleted), which is topped up here so
 * the total still equals the parent's points.
 */
async function maybeCompleteParent(task: Task, date: string): Promise<boolean> {
  const subs = task.subtasks ?? [];
  if (subs.length === 0) return false;
  if (!subs.every((s) => subtaskDone(task, s, date))) return false;
  if (await parentDone(task, date)) return false;

  const leftover = Math.max(
    0,
    task.points - subs.reduce((sum, s) => sum + (s.awardedXp ?? 0), 0),
  );
  if (task.listType === "must") {
    await db().completions.add({
      id: uid(),
      taskId: task.id,
      date,
      completedAt: Date.now(),
    });
  } else {
    await db().tasks.update(task.id, { archived: true, achievedAt: Date.now() });
  }
  if (leftover > 0) {
    await addLedger({
      type: completeLedgerType(task.listType),
      delta: leftover,
      taskId: task.id,
      meta: task.title,
    });
  }
  await db().tasks.update(task.id, {
    subtaskRemainderXp: leftover > 0 ? leftover : undefined,
  });
  return true;
}

/**
 * Un-complete a parent that was completed via subtasks. The parent itself
 * carried 0 XP (shares hold it), except a possible leftover top-up — reverse
 * that here.
 */
async function uncompleteParent(task: Task, date: string): Promise<void> {
  const fresh = (await db().tasks.get(task.id)) ?? task;
  const remainder = fresh.subtaskRemainderXp ?? 0;
  if (remainder > 0) {
    await addLedger({
      type: "adjust",
      delta: -remainder,
      taskId: task.id,
      meta: `undo: ${task.title}`,
    });
    await db().tasks.update(task.id, { subtaskRemainderXp: undefined });
  }
  if (task.listType === "must") {
    const existing = await getCompletion(task.id, date);
    if (existing) await db().completions.delete(existing.id);
  } else if (fresh.archived) {
    await db().tasks.update(task.id, { archived: false, achievedAt: undefined });
  }
}

/** Append a new (undone) subtask. */
export async function addSubtask(task: Task, title: string): Promise<void> {
  const t = title.trim();
  if (!t) return;
  const subs = [...(task.subtasks ?? []), { id: uid(), title: t }];
  await updateTask(task.id, { subtasks: subs });
}

/**
 * Delete a subtask. A done subtask's awarded XP is reversed (otherwise its
 * share would re-enter the pool and be awarded twice). Deleting the last
 * undone subtask while the rest are done auto-completes the parent, awarding
 * the leftover pool with it.
 */
export async function deleteSubtask(task: Task, subId: string): Promise<void> {
  const date = localDay();
  const subs = task.subtasks ?? [];
  const sub = subs.find((s) => s.id === subId);
  if (!sub) return;
  if (subtaskDone(task, sub, date) && (sub.awardedXp ?? 0) > 0) {
    await addLedger({
      type: "adjust",
      delta: -(sub.awardedXp ?? 0),
      taskId: task.id,
      meta: `undo: ${task.title} · ${sub.title}`,
    });
  }
  const rest = subs.filter((s) => s.id !== subId);
  await updateTask(task.id, { subtasks: rest });
  await maybeCompleteParent({ ...task, subtasks: rest }, date);
}

/**
 * Toggle one subtask. Checking awards its current share; un-checking
 * reverses the exact awarded XP and un-completes the parent if it was done.
 * Returns what happened so the UI can pick sounds.
 */
export async function toggleSubtask(
  task: Task,
  subId: string,
): Promise<{ checked: boolean; parentCompleted: boolean }> {
  const date = localDay();
  const subs = [...(task.subtasks ?? [])];
  const i = subs.findIndex((s) => s.id === subId);
  if (i === -1) return { checked: false, parentCompleted: false };
  const sub = subs[i];

  if (subtaskDone(task, sub, date)) {
    const wasDone = await parentDone(task, date);
    if ((sub.awardedXp ?? 0) > 0) {
      await addLedger({
        type: "adjust",
        delta: -(sub.awardedXp ?? 0),
        taskId: task.id,
        meta: `undo: ${task.title} · ${sub.title}`,
      });
    }
    subs[i] = { ...sub, doneAt: undefined, awardedXp: undefined };
    await updateTask(task.id, { subtasks: subs });
    if (wasDone) await uncompleteParent(task, date);
    return { checked: false, parentCompleted: false };
  }

  const share = subtaskShares(task, date).get(subId) ?? 0;
  subs[i] = { ...sub, doneAt: Date.now(), awardedXp: share };
  await updateTask(task.id, { subtasks: subs });
  if (share > 0) {
    await addLedger({
      type: completeLedgerType(task.listType),
      delta: share,
      taskId: task.id,
      meta: `${task.title} · ${sub.title}`,
    });
  }
  const parentCompleted = await maybeCompleteParent(
    { ...task, subtasks: subs },
    date,
  );
  return { checked: true, parentCompleted };
}

/** Parent-check shortcut: complete all remaining subtasks, or un-check all. */
export async function setAllSubtasks(task: Task, done: boolean): Promise<void> {
  const date = localDay();
  const subs = task.subtasks ?? [];
  if (subs.length === 0) return;

  if (done) {
    const shares = subtaskShares(task, date);
    const now = Date.now();
    const next: Subtask[] = [];
    for (const s of subs) {
      if (subtaskDone(task, s, date)) {
        next.push(s);
        continue;
      }
      const share = shares.get(s.id) ?? 0;
      next.push({ ...s, doneAt: now, awardedXp: share });
      if (share > 0) {
        await addLedger({
          type: completeLedgerType(task.listType),
          delta: share,
          taskId: task.id,
          meta: `${task.title} · ${s.title}`,
        });
      }
    }
    await updateTask(task.id, { subtasks: next });
    await maybeCompleteParent({ ...task, subtasks: next }, date);
  } else {
    const wasDone = await parentDone(task, date);
    const refund = subs.reduce(
      (sum, s) => sum + (subtaskDone(task, s, date) ? (s.awardedXp ?? 0) : 0),
      0,
    );
    if (refund > 0) {
      await addLedger({
        type: "adjust",
        delta: -refund,
        taskId: task.id,
        meta: `undo: ${task.title}`,
      });
    }
    const next = subs.map((s) =>
      subtaskDone(task, s, date)
        ? { ...s, doneAt: undefined, awardedXp: undefined }
        : s,
    );
    await updateTask(task.id, { subtasks: next });
    if (wasDone) await uncompleteParent(task, date);
  }
}
