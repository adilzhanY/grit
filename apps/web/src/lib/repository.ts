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
  type FoodItem,
  type DayLog,
  type ActiveFocus,
  type GaitActivity,
  DEFAULT_SETTINGS,
  DEFAULT_POINTS,
  DEFAULT_SLIP_PENALTY,
} from "./types";
import { localDay } from "@grit/core";
import { pendingMilestones, streakMs } from "./milestones";
import {
  focusXp,
  foodPenalty,
  readingXp,
  sleepXp,
  stepsXp,
  weightLossXp,
  walkCalories,
  ageFromBirthday,
  focusPhaseEnd,
  focusElapsedMs,
  FOCUS_SET_SIZE,
  FOCUS_SET_XP,
} from "./daylog";

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

// localDay now lives in @grit/core; re-exported so existing
// `import { localDay } from "@/lib/repository"` call sites keep working.
export { localDay };

// ---------- Settings ----------

export async function getSettings(): Promise<Settings> {
  const s = await db().settings.get("singleton");
  // Merge defaults so settings added later (e.g. calorieLimit) get a value.
  if (s) return { ...DEFAULT_SETTINGS, ...s };
  await db().settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const s = await getSettings();
  await db().settings.put({ ...s, ...patch, id: "singleton" });
}

// ---------- Ledger ----------

async function addLedger(
  entry: Omit<LedgerEntry, "id" | "timestamp"> & { id?: string; timestamp?: number },
): Promise<void> {
  let delta = entry.delta;
  // XP floors at 0: never deduct more than the user currently has, so the
  // running total can't go negative and "hide" later gains in a debt hole.
  if (delta < 0) {
    const current = await totalXp();
    delta = -Math.min(-delta, current);
  }
  await db().ledger.add({
    id: entry.id ?? uid(),
    timestamp: entry.timestamp ?? Date.now(),
    type: entry.type,
    delta,
    taskId: entry.taskId,
    meta: entry.meta,
    ...(entry.milestoneId ? { milestoneId: entry.milestoneId } : {}),
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
  /** Local day (YYYY-MM-DD) the task is planned for (shows in Planned, then My Day). */
  plannedFor?: string;
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
  } else if (input.recurrence) {
    // Any list can repeat (e.g. a My Day quick-add with a Repeat rule).
    task.recurrence = input.recurrence;
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
  if (input.plannedFor) task.plannedFor = input.plannedFor;
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

/** All completions, for date-keyed done checks (e.g. the Planned view). */
export async function listCompletions(): Promise<Completion[]> {
  return db().completions.toArray();
}

/** Mark a recurring task done for `date`, awarding its points. Idempotent. */
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
    type: completeLedgerType(task.listType),
    delta: task.points,
    taskId: task.id,
    meta: task.title,
  });
}

/** Undo a recurring completion for `date`, reversing its points via an append-only entry. */
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

/** Record a slip: penalty applied, streak reset, milestones re-armed.
 *  The streak that just ended is kept if it's a new personal best. */
export async function recordSlip(task: Task): Promise<number> {
  const penalty = task.slipPenalty ?? DEFAULT_SLIP_PENALTY;
  const now = Date.now();
  const ended = streakMs(now, task.lastSlipAt, task.createdAt);
  await addLedger({
    type: "bad_slip",
    delta: -penalty,
    taskId: task.id,
    meta: task.title,
  });
  await updateTask(task.id, {
    lastSlipAt: now,
    awardedMilestoneIds: [],
    bestStreakMs: Math.max(task.bestStreakMs ?? 0, ended),
  });
  return penalty;
}

/**
 * Award any clean-streak milestones a bad task has crossed but not yet collected.
 *
 * Conflict-free across devices: dedup is derived from the append-only ledger
 * scoped to the *current* clean run (entries since the last slip), and each
 * award uses a deterministic id so two devices awarding the same milestone
 * collapse to one row on upsert. Crucially this NEVER writes the task row, so a
 * milestone sweep on a device with a stale (pre-slip) copy can no longer clobber
 * a slip via last-write-wins. Idempotent — safe to call on every load/tick.
 */
export async function awardMilestones(
  task: Task,
  now = Date.now(),
): Promise<{ label: string; xp: number }[]> {
  if (task.listType !== "bad") return [];
  const runStart = task.lastSlipAt ?? task.createdAt;
  const streak = streakMs(now, task.lastSlipAt, task.createdAt);
  const ledger = await getLedger();
  // Dedup = milestones already paid this run (from the ledger) ∪ any pre-marked
  // at creation for a backdated "clean since". We only READ the task here, never
  // write it, so awarding still can't clobber a slip.
  const awarded = new Set<string>(task.awardedMilestoneIds ?? []);
  for (const e of ledger) {
    if (
      e.type === "streak_milestone" &&
      e.taskId === task.id &&
      e.timestamp >= runStart &&
      e.milestoneId
    ) {
      awarded.add(e.milestoneId);
    }
  }
  const pending = pendingMilestones(streak, [...awarded]);
  if (pending.length === 0) return [];

  const mult = task.rewardMultiplier ?? 1;
  const granted: { label: string; xp: number }[] = [];
  for (const m of pending) {
    const id = `m:${task.id}:${m.id}:${runStart}`;
    if (ledger.some((e) => e.id === id)) continue; // already awarded this run
    const xp = Math.round(m.baseXp * mult);
    await addLedger({
      id,
      type: "streak_milestone",
      delta: xp,
      taskId: task.id,
      milestoneId: m.id,
      meta: `${task.title} · ${m.label} clean`,
    });
    granted.push({ label: m.label, xp });
  }
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

/** Is this subtask done? Recurring subtasks reset daily; one-shots stay done. */
export function subtaskDone(
  task: Task,
  sub: Subtask,
  date = localDay(),
): boolean {
  if (sub.doneAt === undefined) return false;
  return task.recurrence ? localDay(sub.doneAt) === date : true;
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
  const auto: Subtask[] = []; // undone, unpinned
  let pool = task.points;
  for (const s of subs) {
    if (subtaskDone(task, s, date)) {
      shares.set(s.id, s.awardedXp ?? 0);
      pool -= s.awardedXp ?? 0;
    } else if (s.xp != null) {
      shares.set(s.id, s.xp);
      pool -= s.xp;
    } else {
      auto.push(s);
    }
  }
  pool = Math.max(0, pool);
  auto.forEach((s, i) => {
    shares.set(
      s.id,
      Math.floor(pool / auto.length) + (i < pool % auto.length ? 1 : 0),
    );
  });
  return shares;
}

/**
 * Edit an undone subtask's title and/or its XP pin. Setting XP clamps it to
 * what's available (parent points minus already-awarded and other pins) so the
 * total never exceeds the parent; the unpinned subtasks absorb the rest.
 */
export async function editSubtask(
  task: Task,
  subId: string,
  patch: { title?: string; xp?: number },
): Promise<void> {
  const fresh = (await db().tasks.get(task.id)) ?? task;
  const date = localDay();
  let subs = fresh.subtasks ?? [];
  const target = subs.find((s) => s.id === subId);
  if (!target) return;

  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (t) subs = subs.map((s) => (s.id === subId ? { ...s, title: t } : s));
  }

  if (patch.xp !== undefined && !subtaskDone(fresh, target, date)) {
    const doneAwarded = subs.reduce(
      (sum, s) => sum + (subtaskDone(fresh, s, date) ? s.awardedXp ?? 0 : 0),
      0,
    );
    const otherPins = subs.reduce(
      (sum, s) =>
        s.id !== subId && !subtaskDone(fresh, s, date) && s.xp != null
          ? sum + s.xp
          : sum,
      0,
    );
    const maxXp = Math.max(0, fresh.points - doneAwarded - otherPins);
    const xp = Math.min(maxXp, Math.max(0, Math.round(patch.xp)));
    subs = subs.map((s) => (s.id === subId ? { ...s, xp } : s));
  }

  await updateTask(task.id, { subtasks: subs });
}

/** Ledger type for completing (a share of) a task of this list type. */
function completeLedgerType(listType: ListType): LedgerEntry["type"] {
  return listType === "must" ? "must_complete" : achieveLedgerType(listType);
}

/** Parent done state: recurring = completed today; one-shot = archived. */
async function parentDone(task: Task, date: string): Promise<boolean> {
  if (task.recurrence) return !!(await getCompletion(task.id, date));
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
  if (task.recurrence) {
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
  if (task.recurrence) {
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

// ---------- Daily Log ----------

/** Saved foods library, most recent first. */
export async function listFoods(): Promise<FoodItem[]> {
  const all = await db().foods.toArray();
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveFood(input: {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}): Promise<FoodItem> {
  const food: FoodItem = { id: uid(), createdAt: Date.now(), ...input };
  await db().foods.add(food);
  return food;
}

export async function updateFood(
  id: string,
  patch: { name: string; calories: number; protein: number; carbs: number; fat: number },
): Promise<void> {
  await db().foods.update(id, patch);
}

export async function deleteFood(id: string): Promise<void> {
  await db().foods.delete(id);
}

/** All Daily Log entries, newest first. */
export async function listDayLogs(): Promise<DayLog[]> {
  const all = await db().dayLogs.toArray();
  return all.sort((a, b) => b.loggedAt - a.loggedAt);
}

async function addDayLog(log: Omit<DayLog, "id" | "loggedAt">): Promise<DayLog> {
  const full: DayLog = { id: uid(), loggedAt: Date.now(), ...log };
  await db().dayLogs.add(full);
  return full;
}

/**
 * Log a food eaten today. Only calories newly past the daily limit are
 * penalized (-0.1 XP each), so each log pays for exactly its own overage.
 */
export async function addFoodLog(input: {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}): Promise<DayLog> {
  const date = localDay();
  const settings = await getSettings();
  const todays = await db().dayLogs.where({ kind: "food", date }).toArray();
  const prevTotal = todays.reduce((s, l) => s + (l.calories ?? 0), 0);
  const penalty = foodPenalty(
    prevTotal,
    prevTotal + input.calories,
    settings.calorieLimit,
  );
  if (penalty > 0) {
    await addLedger({
      type: "food_penalty",
      delta: -penalty,
      meta: `${input.name} · over limit`,
    });
  }
  return addDayLog({ kind: "food", date, awardedXp: -penalty, ...input });
}

/** Log last night's sleep in minutes. XP per the gold/over/under rules. */
export async function addSleepLog(minutes: number): Promise<DayLog> {
  const xp = sleepXp(minutes);
  if (xp !== 0) {
    await addLedger({ type: "sleep_log", delta: xp, meta: `sleep ${minutes}m` });
  }
  return addDayLog({ kind: "sleep", date: localDay(), awardedXp: xp, minutes });
}

/** The most recently logged body weight in kg, or null if never logged. */
export async function latestWeightKg(): Promise<number | null> {
  const all = await db().dayLogs.where("kind").equals("weight").toArray();
  if (all.length === 0) return null;
  all.sort((a, b) => b.loggedAt - a.loggedAt);
  return all[0].weightKg ?? null;
}

/**
 * Log steps and/or meters walked today, plus the time spent. When time is
 * given we estimate the active calories burnt from the user's body profile and
 * their latest logged weight (see {@link walkCalories}).
 */
export async function addStepsLog(input: {
  steps?: number;
  meters?: number;
  minutes?: number;
  activity?: GaitActivity;
  /** Directly logged burnt calories — overrides the body-model estimate. */
  caloriesBurnt?: number;
}): Promise<DayLog> {
  const steps = input.steps ?? 0;
  const meters = input.meters ?? 0;
  const minutes = input.minutes ?? 0;
  const isRun = input.activity === "run";
  const xp = stepsXp(steps, meters);
  if (xp !== 0) {
    const what = steps > 0 ? `${steps} steps` : `${meters} m`;
    await addLedger({
      type: "steps_log",
      delta: xp,
      meta: isRun ? `${what} run` : what,
    });
  }

  // Calories burnt needs both a duration and a known body weight.
  let caloriesBurnt: number | undefined;
  if (minutes > 0) {
    const settings = await getSettings();
    const weightKg = await latestWeightKg();
    if (weightKg && weightKg > 0) {
      const est = walkCalories({
        steps: input.steps,
        meters: input.meters,
        minutes,
        weightKg,
        heightCm: settings.heightCm,
        age: ageFromBirthday(settings.birthday, localDay()),
        sex: settings.sex,
        mode: input.activity,
      });
      caloriesBurnt = est.calories;
    }
  }

  return addDayLog({
    kind: "steps",
    date: localDay(),
    awardedXp: xp,
    steps: input.steps,
    meters: input.meters,
    minutes: minutes > 0 ? minutes : undefined,
    activity: isRun ? "run" : undefined,
    // A directly entered burn wins over the estimate.
    caloriesBurnt: input.caloriesBurnt ?? caloriesBurnt,
  });
}

/** Log minutes of reading. */
export async function addReadingLog(minutes: number): Promise<DayLog> {
  const xp = readingXp(minutes);
  if (xp !== 0) {
    await addLedger({
      type: "reading_log",
      delta: xp,
      meta: `reading ${minutes}m`,
    });
  }
  return addDayLog({ kind: "reading", date: localDay(), awardedXp: xp, minutes });
}

/**
 * Log today's weight (canonical kg) — one entry per day. Logging again today
 * *updates* today's entry: its old XP is reversed and re-computed, so the
 * reward always reflects the final number against the previous day's log.
 * Losing weight pays +10 XP per 100g; gains cost nothing.
 */
export async function addWeightLog(weightKg: number): Promise<DayLog> {
  const date = localDay();
  const all = (await db().dayLogs.where("kind").equals("weight").toArray()).sort(
    (a, b) => b.loggedAt - a.loggedAt,
  );
  const todays = all.find((l) => l.date === date);
  // Baseline is the newest log from a *previous* day, so re-logging today
  // can't farm XP against this morning's entry.
  const prev = all.find((l) => l.date !== date);
  const xp = prev ? weightLossXp(prev.weightKg ?? 0, weightKg) : 0;

  if (todays && todays.awardedXp !== 0) {
    await addLedger({
      type: "adjust",
      delta: -todays.awardedXp,
      meta: "undo log: weight",
    });
  }
  if (xp > 0) {
    await addLedger({
      type: "weight_log",
      delta: xp,
      meta: `lost ${Math.round(((prev!.weightKg ?? 0) - weightKg) * 10) / 10} kg`,
    });
  }

  if (todays) {
    const updated: DayLog = {
      ...todays,
      weightKg,
      awardedXp: xp,
      loggedAt: Date.now(),
    };
    await db().dayLogs.put(updated);
    return updated;
  }
  return addDayLog({ kind: "weight", date, awardedXp: xp, weightKg });
}

/** Delete a Daily Log entry, reversing exactly the XP it applied. */
export async function deleteDayLog(id: string): Promise<void> {
  const log = await db().dayLogs.get(id);
  if (!log) return;
  if (log.awardedXp !== 0) {
    await addLedger({
      type: "adjust",
      delta: -log.awardedXp,
      meta: `undo log: ${log.name ?? log.kind}`,
    });
  }
  await db().dayLogs.delete(id);
}

// ---------- Focus (Pomodoro) ----------

export async function getActiveFocus(): Promise<ActiveFocus | null> {
  return (await db().focus.get("active")) ?? null;
}

export async function startFocus(
  focusMin: number,
  restMin: number,
  label?: string,
): Promise<void> {
  await db().focus.put({
    id: "active",
    phase: "focus",
    startedAt: Date.now(),
    focusMin,
    restMin,
    ...(label ? { label } : {}),
  });
}

/** Add a named focus task (no-op if it already exists). */
export async function addFocusTask(name: string): Promise<void> {
  const n = name.trim();
  if (!n) return;
  const s = await getSettings();
  if (s.focusTasks.some((t) => t.toLowerCase() === n.toLowerCase())) return;
  await updateSettings({ focusTasks: [...s.focusTasks, n] });
}

/** Remove a named focus task. Past logs keep their label. */
export async function removeFocusTask(name: string): Promise<void> {
  const s = await getSettings();
  await updateSettings({ focusTasks: s.focusTasks.filter((t) => t !== name) });
}

/** Abandon the running session (or skip the rest). No XP either way. */
export async function cancelFocus(): Promise<void> {
  await db().focus.delete("active");
}

/** Freeze the countdown (the session stays alive). */
export async function pauseFocus(now = Date.now()): Promise<void> {
  const a = await getActiveFocus();
  if (!a || a.pausedAt != null) return;
  await db().focus.put({ ...a, pausedAt: now });
}

/** Resume: shift the start forward by the paused span so the clock continues. */
export async function resumeFocus(now = Date.now()): Promise<void> {
  const a = await getActiveFocus();
  if (!a || a.pausedAt == null) return;
  const { pausedAt, ...rest } = a;
  await db().focus.put({ ...rest, startedAt: a.startedAt + (now - pausedAt) });
}

/**
 * The focus phase's alarm was answered: bank the finished pomodoro (full XP),
 * then either roll into the rest phase or end the session.
 */
export async function finishFocus(startRest: boolean, now = Date.now()): Promise<number> {
  const a = await getActiveFocus();
  if (!a || a.phase !== "focus") return 0;
  const xp = await completeFocusBlock(a, focusPhaseEnd(a));
  if (startRest && a.restMin > 0) {
    const { pausedAt, ...rest } = a;
    await db().focus.put({ ...rest, phase: "rest", startedAt: now });
  } else {
    await db().focus.delete("active");
  }
  return xp;
}

/** The rest alarm was answered with "keep going": start a fresh focus phase. */
export async function continueFocus(now = Date.now()): Promise<void> {
  const a = await getActiveFocus();
  if (!a) return;
  const { pausedAt, ...rest } = a;
  await db().focus.put({ ...rest, phase: "focus", startedAt: now });
}

/**
 * End a running focus block early, banking the elapsed whole minutes as a focus
 * log (base XP for the time actually spent). No-op if under a minute or not in
 * a focus phase. Returns the saved log, or null if nothing was saved.
 */
export async function saveFocusEarly(now = Date.now()): Promise<DayLog | null> {
  const a = await getActiveFocus();
  if (!a || a.phase !== "focus") return null;
  const elapsedMin = Math.floor(focusElapsedMs(a, now) / 60_000);
  if (elapsedMin < 1) return null;

  const xp = focusXp(elapsedMin);
  if (xp !== 0) {
    await addLedger({
      type: "focus_log",
      delta: xp,
      meta: `focus ${elapsedMin}m`,
      timestamp: now,
    });
  }
  const log: DayLog = {
    id: uid(),
    kind: "focus",
    date: localDay(now),
    loggedAt: now,
    awardedXp: xp,
    minutes: elapsedMin,
    ...(a.label ? { name: a.label } : {}),
  };
  await db().dayLogs.add(log);
  await db().focus.delete("active");
  return log;
}

/** Award a finished focus block: base XP + set bonus every 4th of the day. */
async function completeFocusBlock(a: ActiveFocus, endTs: number): Promise<number> {
  const date = localDay(endTs);
  const base = focusXp(a.focusMin);
  await addLedger({
    type: "focus_log",
    delta: base,
    meta: `focus ${a.focusMin}m`,
    timestamp: endTs,
  });
  const before = await db().dayLogs.where({ kind: "focus", date }).count();
  let bonus = 0;
  if ((before + 1) % FOCUS_SET_SIZE === 0) {
    bonus = FOCUS_SET_XP;
    await addLedger({
      type: "focus_log",
      delta: bonus,
      meta: `pomodoro set ×${FOCUS_SET_SIZE}`,
      timestamp: endTs,
    });
  }
  await db().dayLogs.add({
    id: uid(),
    kind: "focus",
    date,
    loggedAt: endTs,
    awardedXp: base + bonus,
    minutes: a.focusMin,
    ...(a.label ? { name: a.label } : {}),
  });
  return base + bonus;
}

