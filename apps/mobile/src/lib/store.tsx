/**
 * The mobile data store: a single context holding the whole DB in a ref, with
 * action methods that mirror the web store. All XP/level/streak math comes from
 * @grit/core; this layer just wires it to AsyncStorage persistence + sounds.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  ageFromBirthday,
  computeLevel,
  pendingMilestones,
  streakMs,
  focusXp,
  focusPhaseEnd,
  focusElapsedMs,
  foodPenalty,
  localDay,
  readingXp,
  sleepXp,
  stepsXp,
  walkCalories,
  weightLossXp,
  FOCUS_SET_SIZE,
  FOCUS_SET_XP,
  type ActiveFocus,
  type GaitActivity,
  type DayLog,
  type LedgerEntry,
  type LedgerType,
  type LevelInfo,
  type ListType,
  type Settings,
  type Subtask,
  type Task,
  type WeightUnit,
  DEFAULT_POINTS,
  DEFAULT_SLIP_PENALTY,
} from "@grit/core";
import { AppState } from "react-native";
import { emptyDB, loadDB, saveDB, uid, type DB } from "./db";
import { play, setSoundEnabled, unlockAudio, type SoundKind } from "./sounds";
import { useAuth } from "./auth";
import { supabase } from "./supabase";
import { sync as runSyncCycle, resetSyncCursor } from "./sync";
import { bundleToDB, exportBundle, type BackupBundle } from "./backup";

/** Stamp a row's sync clock. */
function stamp<T extends object>(row: T): T {
  (row as Record<string, unknown>).updatedAt = Date.now();
  return row;
}

/** Record a delete gravestone so it propagates on sync. */
function tomb(db: DB, table: string, id: string): void {
  db.tombstones = db.tombstones.filter((t) => !(t.table === table && t.id === id));
  db.tombstones.push({ table, id, updatedAt: Date.now() });
}

/** Merge a settings patch and stamp it for sync. */
function patchSettings(db: DB, patch: Partial<Settings>): void {
  db.settings = stamp({ ...db.settings, ...patch });
}

export type Celebration =
  | { kind: "levelup"; level: number }
  | { kind: "milestone"; label: string; xp: number; title: string };

// ---- ledger helpers (mirror web repository) ----

function totalXp(ledger: LedgerEntry[]): number {
  let bal = 0;
  for (const e of ledger) bal = Math.max(0, bal + e.delta);
  return bal;
}

function pushLedger(
  db: DB,
  entry: Omit<LedgerEntry, "id" | "timestamp"> & { id?: string; timestamp?: number },
): void {
  let delta = entry.delta;
  if (delta < 0) {
    const current = totalXp(db.ledger);
    delta = -Math.min(-delta, current);
  }
  db.ledger.push(
    stamp({
      id: entry.id ?? uid(),
      timestamp: entry.timestamp ?? Date.now(),
      type: entry.type,
      delta,
      taskId: entry.taskId,
      meta: entry.meta,
      ...(entry.milestoneId ? { milestoneId: entry.milestoneId } : {}),
    }),
  );
}

function completeType(listType: ListType): LedgerType {
  if (listType === "must") return "must_complete";
  if (listType === "custom") return "custom_complete";
  if (listType === "impossible") return "impossible_achieve";
  return "cool_achieve";
}
function achieveType(listType: ListType): LedgerType {
  if (listType === "impossible") return "impossible_achieve";
  if (listType === "custom") return "custom_complete";
  return "cool_achieve";
}

// ---- subtasks (ported from web repository) ----

/** A subtask is done if completed; recurring parents only count today. */
export function subtaskDone(task: Task, sub: Subtask, date: string): boolean {
  if (sub.doneAt === undefined) return false;
  return task.recurrence ? localDay(sub.doneAt) === date : true;
}

/**
 * XP each subtask awards: done ones keep their award; pinned (manual xp) ones
 * take exactly that; the rest split the remaining pool. Total always = points.
 */
export function subtaskShares(task: Task, date: string): Map<string, number> {
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
  auto.forEach((s, i) =>
    shares.set(s.id, Math.floor(pool / auto.length) + (i < pool % auto.length ? 1 : 0)),
  );
  return shares;
}

function getCompletion(db: DB, taskId: string, date: string) {
  return db.completions.find((c) => c.taskId === taskId && c.date === date);
}

function parentDoneDb(db: DB, task: Task, date: string): boolean {
  if (task.recurrence) return !!getCompletion(db, task.id, date);
  const fresh = db.tasks.find((t) => t.id === task.id) ?? task;
  return !!fresh.archived;
}

/** Complete the parent when all subtasks are done; tops up leftover XP. */
function maybeCompleteParent(db: DB, task: Task, date: string): boolean {
  const subs = task.subtasks ?? [];
  if (subs.length === 0) return false;
  if (!subs.every((s) => subtaskDone(task, s, date))) return false;
  if (parentDoneDb(db, task, date)) return false;

  const leftover = Math.max(0, task.points - subs.reduce((sum, s) => sum + (s.awardedXp ?? 0), 0));
  if (task.recurrence) {
    db.completions.push(stamp({ id: uid(), taskId: task.id, date, completedAt: Date.now() }));
  } else {
    const i = db.tasks.findIndex((t) => t.id === task.id);
    if (i >= 0) db.tasks[i] = stamp({ ...db.tasks[i], archived: true, achievedAt: Date.now() });
  }
  if (leftover > 0) {
    pushLedger(db, { type: completeType(task.listType), delta: leftover, taskId: task.id, meta: task.title });
  }
  const j = db.tasks.findIndex((t) => t.id === task.id);
  if (j >= 0) db.tasks[j] = stamp({ ...db.tasks[j], subtaskRemainderXp: leftover > 0 ? leftover : undefined });
  return true;
}

function uncompleteParent(db: DB, task: Task, date: string): void {
  const fi = db.tasks.findIndex((t) => t.id === task.id);
  const fresh = fi >= 0 ? db.tasks[fi] : task;
  const remainder = fresh.subtaskRemainderXp ?? 0;
  if (remainder > 0) {
    pushLedger(db, { type: "adjust", delta: -remainder, taskId: task.id, meta: `undo: ${task.title}` });
    if (fi >= 0) db.tasks[fi] = stamp({ ...db.tasks[fi], subtaskRemainderXp: undefined });
  }
  if (task.recurrence) {
    const existing = getCompletion(db, task.id, date);
    if (existing) {
      db.completions = db.completions.filter((c) => c.id !== existing.id);
      tomb(db, "completions", existing.id);
    }
  } else if (fresh.archived) {
    if (fi >= 0) db.tasks[fi] = stamp({ ...db.tasks[fi], archived: false, achievedAt: undefined });
  }
}

// ---- context shape ----

interface StoreValue {
  ready: boolean;
  today: string;
  now: number;
  settings: Settings;
  level: LevelInfo;
  xpToday: number;

  tasks: Task[];
  completedToday: Set<string>;
  completedOn: Set<string>;
  dayLogs: DayLog[];
  foods: DB["foods"];
  lists: DB["lists"];
  ledger: LedgerEntry[];
  activeFocus: ActiveFocus | null;

  // tasks
  addTask: (input: Omit<Parameters<typeof buildTask>[0], "order">) => Promise<Task>;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  toggleMust: (task: Task, day?: string) => Promise<void>;
  achieve: (task: Task) => Promise<void>;
  unachieve: (task: Task) => Promise<void>;
  toggleImportant: (task: Task) => Promise<void>;
  toggleMyDay: (task: Task) => Promise<void>;
  recordSlip: (task: Task) => Promise<void>;

  // subtasks
  addSubtask: (task: Task, title: string) => Promise<void>;
  removeSubtask: (task: Task, subId: string) => Promise<void>;
  editSubtask: (task: Task, subId: string, patch: { title?: string; xp?: number }) => Promise<void>;
  toggleSubtask: (task: Task, subId: string) => Promise<void>;
  setAllSubtasks: (task: Task, done: boolean) => Promise<void>;

  // custom lists
  addList: (name: string) => Promise<DB["lists"][number]>;
  renameList: (id: string, name: string) => Promise<void>;
  removeList: (id: string) => Promise<void>;

  // daily log
  logFood: (
    input: { name: string; calories: number; protein: number; carbs: number; fat: number },
    save?: boolean,
  ) => Promise<void>;
  /** Add a food to the saved-foods library (no log entry). */
  saveFood: (input: {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }) => Promise<void>;
  updateFood: (
    id: string,
    patch: { name: string; calories: number; protein: number; carbs: number; fat: number },
  ) => Promise<void>;
  removeFood: (id: string) => Promise<void>;
  setCalorieLimit: (n: number) => Promise<void>;
  logSleep: (minutes: number) => Promise<void>;
  logSteps: (input: { steps?: number; meters?: number; minutes?: number; activity?: GaitActivity; caloriesBurnt?: number }) => Promise<void>;
  logReading: (minutes: number) => Promise<void>;
  logWeight: (kg: number) => Promise<void>;
  setWeightUnit: (u: WeightUnit) => Promise<void>;
  removeDayLog: (id: string) => Promise<void>;
  setProfile: (patch: Partial<Pick<Settings, "heightCm" | "sex" | "birthday" | "name">>) => Promise<void>;

  // focus
  startFocusSession: (focusMin: number, restMin: number, label?: string) => Promise<void>;
  cancelFocusSession: () => Promise<void>;
  saveFocusSession: () => Promise<void>;
  pauseFocusSession: () => Promise<void>;
  resumeFocusSession: () => Promise<void>;
  finishFocusSession: (startRest: boolean) => Promise<void>;
  continueFocusSession: () => Promise<void>;
  addFocusTask: (name: string) => Promise<void>;
  removeFocusTask: (name: string) => Promise<void>;

  setSoundsEnabled: (on: boolean) => Promise<void>;

  // celebration overlay
  celebration: Celebration | null;
  dismissCelebration: () => void;

  // sync + backup
  syncing: boolean;
  syncError: string | null;
  syncNow: () => Promise<void>;
  /** Force every local row to win: re-stamp all rows now, then full re-sync. */
  forcePush: () => Promise<void>;
  exportBundle: () => BackupBundle;
  importBundle: (raw: string) => Promise<number>;
}

function buildTask(input: {
  listType: ListType;
  title: string;
  points?: number;
  recurrence?: Task["recurrence"];
  slipPenalty?: number;
  rewardMultiplier?: number;
  cleanSince?: number;
  starredMyDay?: boolean;
  plannedFor?: string;
  listId?: string;
  order: number;
}): Task {
  const now = Date.now();
  const task: Task = {
    id: uid(),
    listType: input.listType,
    title: input.title.trim(),
    points: input.points ?? DEFAULT_POINTS[input.listType],
    order: input.order,
    archived: false,
    createdAt: now,
  };
  if (input.listType === "must") {
    task.recurrence = input.recurrence ?? { type: "daily", weekdays: [] };
    task.starredMyDay = false;
  } else if (input.recurrence) {
    task.recurrence = input.recurrence;
  }
  if (input.listType === "bad") {
    task.slipPenalty = input.slipPenalty ?? DEFAULT_SLIP_PENALTY;
    task.rewardMultiplier = input.rewardMultiplier ?? 1;
    task.awardedMilestoneIds = [];
    if (input.cleanSince && input.cleanSince < now) task.lastSlipAt = input.cleanSince;
  }
  if (input.listType === "custom" && input.listId) task.listId = input.listId;
  if (input.starredMyDay) task.starredMyDay = true;
  if (input.plannedFor) task.plannedFor = input.plannedFor;
  return task;
}

const Ctx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const dbRef = useRef<DB>(emptyDB());
  const [ready, setReady] = useState(false);
  const [version, force] = useReducer((x: number) => x + 1, 0);
  const [today, setToday] = useState(localDay());
  const [now, setNow] = useState(Date.now());
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const prevLevel = useRef<number | null>(null);
  // Milestones sweep only after the first sync, so awards use merged data
  // (never a stale pre-slip copy).
  const syncedOnceRef = useRef(false);
  // Latest syncNow + the realtime channel, for the instant cross-device
  // "stop the alarm" poke (see flushFocus).
  const syncNowRef = useRef<(() => Promise<void> | void) | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);

  // useCallback isn't exported as useCallback in some React builds re-export;
  // alias to the real hook here.
  const cb = useCallback;

  useEffect(() => {
    void loadDB().then((db) => {
      dbRef.current = db;
      setSoundEnabled(db.settings.soundsEnabled);
      setReady(true);
      force();
    });
  }, []);

  // 1s heartbeat for the focus timer; also rolls the day over.
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      const d = localDay();
      setToday((prev) => (prev !== d ? d : prev));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const commit = cb(() => {
    saveDB(dbRef.current);
    force();
  }, []);

  // ---------- task actions ----------
  const addTask = cb(
    async (input: Omit<Parameters<typeof buildTask>[0], "order">) => {
      const db = dbRef.current;
      const order = db.tasks.filter((t) => t.listType === input.listType).length;
      const task = stamp(buildTask({ ...input, order }));
      db.tasks.push(task);
      commit();
      return task;
    },
    [commit],
  );

  const updateTask = cb(async (id: string, patch: Partial<Task>) => {
    const db = dbRef.current;
    const i = db.tasks.findIndex((t) => t.id === id);
    if (i >= 0) db.tasks[i] = stamp({ ...db.tasks[i], ...patch });
    commit();
  }, [commit]);

  const removeTask = cb(async (id: string) => {
    const db = dbRef.current;
    const removedComps = db.completions.filter((c) => c.taskId === id);
    db.tasks = db.tasks.filter((t) => t.id !== id);
    tomb(db, "tasks", id);
    db.completions = db.completions.filter((c) => c.taskId !== id);
    removedComps.forEach((c) => tomb(db, "completions", c.id));
    commit();
  }, [commit]);

  const toggleMust = cb(async (task: Task, day = today) => {
    unlockAudio();
    const db = dbRef.current;
    const existing = db.completions.find((c) => c.taskId === task.id && c.date === day);
    if (existing) {
      db.completions = db.completions.filter((c) => c.id !== existing.id);
      tomb(db, "completions", existing.id);
      pushLedger(db, { type: "adjust", delta: -task.points, taskId: task.id, meta: `undo: ${task.title}` });
    } else {
      db.completions.push(stamp({ id: uid(), taskId: task.id, date: day, completedAt: Date.now() }));
      pushLedger(db, { type: completeType(task.listType), delta: task.points, taskId: task.id, meta: task.title });
      play("good");
    }
    commit();
  }, [commit, today]);

  const achieve = cb(async (task: Task) => {
    unlockAudio();
    const db = dbRef.current;
    if (task.archived) return;
    pushLedger(db, { type: achieveType(task.listType), delta: task.points, taskId: task.id, meta: task.title });
    await updateTask(task.id, { archived: true, achievedAt: Date.now() });
    play(task.listType === "impossible" ? "epic" : "cool");
  }, [updateTask]);

  const unachieve = cb(async (task: Task) => {
    const db = dbRef.current;
    if (!task.archived) return;
    pushLedger(db, { type: "adjust", delta: -task.points, taskId: task.id, meta: `undo: ${task.title}` });
    await updateTask(task.id, { archived: false, achievedAt: undefined });
  }, [updateTask]);

  const toggleImportant = cb(async (task: Task) => {
    await updateTask(task.id, { important: !task.important });
  }, [updateTask]);

  const toggleMyDay = cb(async (task: Task) => {
    await updateTask(task.id, { starredMyDay: !task.starredMyDay });
  }, [updateTask]);

  const recordSlip = cb(async (task: Task) => {
    unlockAudio();
    const db = dbRef.current;
    const penalty = task.slipPenalty ?? DEFAULT_SLIP_PENALTY;
    const ended = streakMs(Date.now(), task.lastSlipAt, task.createdAt);
    pushLedger(db, { type: "bad_slip", delta: -penalty, taskId: task.id, meta: task.title });
    const i = db.tasks.findIndex((t) => t.id === task.id);
    if (i >= 0) {
      db.tasks[i] = stamp({
        ...task,
        lastSlipAt: Date.now(),
        awardedMilestoneIds: [],
        bestStreakMs: Math.max(task.bestStreakMs ?? 0, ended),
      });
    }
    play("bad");
    commit();
  }, [commit]);

  // ---------- subtasks ----------
  const addSubtask = cb(async (taskArg: Task, title: string) => {
    const db = dbRef.current;
    const i = db.tasks.findIndex((t) => t.id === taskArg.id);
    const t = title.trim();
    if (i < 0 || !t) return;
    const subs = [...(db.tasks[i].subtasks ?? []), { id: uid(), title: t }];
    db.tasks[i] = stamp({ ...db.tasks[i], subtasks: subs });
    commit();
  }, [commit]);

  const removeSubtask = cb(async (taskArg: Task, subId: string) => {
    const db = dbRef.current;
    const date = localDay();
    const i = db.tasks.findIndex((t) => t.id === taskArg.id);
    if (i < 0) return;
    const task = db.tasks[i];
    const subs = task.subtasks ?? [];
    const sub = subs.find((s) => s.id === subId);
    if (!sub) return;
    if (subtaskDone(task, sub, date) && (sub.awardedXp ?? 0) > 0) {
      pushLedger(db, { type: "adjust", delta: -(sub.awardedXp ?? 0), taskId: task.id, meta: `undo: ${task.title} · ${sub.title}` });
    }
    db.tasks[i] = stamp({ ...task, subtasks: subs.filter((s) => s.id !== subId) });
    maybeCompleteParent(db, db.tasks[i], date);
    commit();
  }, [commit]);

  const editSubtask = cb(async (taskArg: Task, subId: string, patch: { title?: string; xp?: number }) => {
    const db = dbRef.current;
    const date = localDay();
    const i = db.tasks.findIndex((t) => t.id === taskArg.id);
    if (i < 0) return;
    const task = db.tasks[i];
    let subs = task.subtasks ?? [];
    const target = subs.find((s) => s.id === subId);
    if (!target) return;

    if (patch.title !== undefined) {
      const t = patch.title.trim();
      if (t) subs = subs.map((s) => (s.id === subId ? { ...s, title: t } : s));
    }
    if (patch.xp !== undefined && !subtaskDone(task, target, date)) {
      const doneAwarded = subs.reduce((sum, s) => sum + (subtaskDone(task, s, date) ? s.awardedXp ?? 0 : 0), 0);
      const otherPins = subs.reduce(
        (sum, s) => (s.id !== subId && !subtaskDone(task, s, date) && s.xp != null ? sum + s.xp : sum),
        0,
      );
      const maxXp = Math.max(0, task.points - doneAwarded - otherPins);
      const xp = Math.min(maxXp, Math.max(0, Math.round(patch.xp)));
      subs = subs.map((s) => (s.id === subId ? { ...s, xp } : s));
    }
    db.tasks[i] = stamp({ ...task, subtasks: subs });
    commit();
  }, [commit]);

  const toggleSubtask = cb(async (taskArg: Task, subId: string) => {
    unlockAudio();
    const db = dbRef.current;
    const date = localDay();
    const i = db.tasks.findIndex((t) => t.id === taskArg.id);
    if (i < 0) return;
    const task = db.tasks[i];
    const subs = [...(task.subtasks ?? [])];
    const si = subs.findIndex((s) => s.id === subId);
    if (si < 0) return;
    const sub = subs[si];

    if (subtaskDone(task, sub, date)) {
      const wasDone = parentDoneDb(db, task, date);
      if ((sub.awardedXp ?? 0) > 0) {
        pushLedger(db, { type: "adjust", delta: -(sub.awardedXp ?? 0), taskId: task.id, meta: `undo: ${task.title} · ${sub.title}` });
      }
      subs[si] = { ...sub, doneAt: undefined, awardedXp: undefined };
      db.tasks[i] = stamp({ ...task, subtasks: subs });
      if (wasDone) uncompleteParent(db, db.tasks[i], date);
      commit();
      return;
    }

    const share = subtaskShares(task, date).get(subId) ?? 0;
    subs[si] = { ...sub, doneAt: Date.now(), awardedXp: share };
    db.tasks[i] = stamp({ ...task, subtasks: subs });
    if (share > 0) {
      pushLedger(db, { type: completeType(task.listType), delta: share, taskId: task.id, meta: `${task.title} · ${sub.title}` });
    }
    const completed = maybeCompleteParent(db, db.tasks[i], date);
    play(completed && task.listType === "impossible" ? "epic" : completed && task.listType === "cool" ? "cool" : "good");
    commit();
  }, [commit]);

  const setAllSubtasks = cb(async (taskArg: Task, done: boolean) => {
    unlockAudio();
    const db = dbRef.current;
    const date = localDay();
    const i = db.tasks.findIndex((t) => t.id === taskArg.id);
    if (i < 0) return;
    const task = db.tasks[i];
    const subs = task.subtasks ?? [];
    if (subs.length === 0) return;

    if (done) {
      const shares = subtaskShares(task, date);
      const now2 = Date.now();
      const next = subs.map((s) => {
        if (subtaskDone(task, s, date)) return s;
        const share = shares.get(s.id) ?? 0;
        if (share > 0) {
          pushLedger(db, { type: completeType(task.listType), delta: share, taskId: task.id, meta: `${task.title} · ${s.title}` });
        }
        return { ...s, doneAt: now2, awardedXp: share };
      });
      db.tasks[i] = stamp({ ...task, subtasks: next });
      maybeCompleteParent(db, db.tasks[i], date);
      play("good");
    } else {
      const wasDone = parentDoneDb(db, task, date);
      const refund = subs.reduce((sum, s) => sum + (subtaskDone(task, s, date) ? (s.awardedXp ?? 0) : 0), 0);
      if (refund > 0) {
        pushLedger(db, { type: "adjust", delta: -refund, taskId: task.id, meta: `undo: ${task.title}` });
      }
      const next = subs.map((s) => (subtaskDone(task, s, date) ? { ...s, doneAt: undefined, awardedXp: undefined } : s));
      db.tasks[i] = stamp({ ...task, subtasks: next });
      if (wasDone) uncompleteParent(db, db.tasks[i], date);
    }
    commit();
  }, [commit]);

  // ---------- custom lists ----------
  const addList = cb(async (name: string) => {
    const db = dbRef.current;
    const list = stamp({
      id: uid(),
      name: name.trim() || "Untitled list",
      order: db.lists.length,
      createdAt: Date.now(),
    });
    db.lists.push(list);
    commit();
    return list;
  }, [commit]);

  const renameList = cb(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const db = dbRef.current;
    const i = db.lists.findIndex((l) => l.id === id);
    if (i >= 0) db.lists[i] = stamp({ ...db.lists[i], name: trimmed });
    commit();
  }, [commit]);

  const removeList = cb(async (id: string) => {
    const db = dbRef.current;
    const tasks = db.tasks.filter((t) => t.listId === id);
    for (const t of tasks) {
      db.completions.filter((c) => c.taskId === t.id).forEach((c) => tomb(db, "completions", c.id));
      tomb(db, "tasks", t.id);
    }
    db.completions = db.completions.filter((c) => !tasks.some((t) => t.id === c.taskId));
    db.tasks = db.tasks.filter((t) => t.listId !== id);
    db.lists = db.lists.filter((l) => l.id !== id);
    tomb(db, "lists", id);
    commit();
  }, [commit]);

  // Award any clean-streak milestones bad tasks have crossed (run on tick).
  // Conflict-free: dedup is derived from the append-only ledger scoped to the
  // current clean run, each award uses a deterministic id (so concurrent
  // devices collapse to one row on upsert), and the task row is NEVER written —
  // so a sweep on a stale, pre-slip copy can't clobber a slip via LWW.
  const sweepMilestones = cb(() => {
    if (!syncedOnceRef.current) return; // act only on merged data
    const db = dbRef.current;
    let changed = false;
    let party: Celebration | null = null;
    const ts = Date.now();
    for (const task of db.tasks) {
      if (task.listType !== "bad") continue;
      const runStart = task.lastSlipAt ?? task.createdAt;
      const streak = streakMs(ts, task.lastSlipAt, task.createdAt);
      // Dedup = paid this run (ledger) ∪ pre-marked at creation (backdated clean
      // since). Read-only — the sweep never writes the task, so it can't clobber.
      const awarded = new Set<string>(task.awardedMilestoneIds ?? []);
      for (const e of db.ledger) {
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
      if (pending.length === 0) continue;
      const mult = task.rewardMultiplier ?? 1;
      for (const m of pending) {
        const id = `m:${task.id}:${m.id}:${runStart}`;
        if (db.ledger.some((e) => e.id === id)) continue;
        const xp = Math.round(m.baseXp * mult);
        pushLedger(db, {
          id,
          type: "streak_milestone",
          delta: xp,
          taskId: task.id,
          milestoneId: m.id,
          meta: `${task.title} · ${m.label} clean`,
        });
        party = { kind: "milestone", label: m.label, xp, title: task.title };
        changed = true;
      }
    }
    if (changed) {
      play("milestone");
      if (party) setCelebration(party);
      commit();
    }
  }, [commit]);

  // ---------- daily log actions ----------
  const logFood = cb(
    async (
      input: { name: string; calories: number; protein: number; carbs: number; fat: number },
      save = false,
    ) => {
      unlockAudio();
      const db = dbRef.current;
      const date = localDay();
      const todays = db.dayLogs.filter((l) => l.kind === "food" && l.date === date);
      const prev = todays.reduce((s, l) => s + (l.calories ?? 0), 0);
      const penalty = foodPenalty(prev, prev + input.calories, db.settings.calorieLimit);
      if (penalty > 0) {
        pushLedger(db, { type: "food_penalty", delta: -penalty, meta: `${input.name} · over limit` });
        play("bad");
      }
      db.dayLogs.push(stamp({ id: uid(), kind: "food", date, loggedAt: Date.now(), awardedXp: -penalty, ...input }));
      if (save && !db.foods.some((f) => f.name.toLowerCase() === input.name.toLowerCase())) {
        db.foods.push(stamp({ id: uid(), createdAt: Date.now(), ...input }));
      }
      commit();
    },
    [commit],
  );

  const saveFood = cb(
    async (input: {
      name: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }) => {
      const db = dbRef.current;
      if (db.foods.some((f) => f.name.toLowerCase() === input.name.toLowerCase())) return;
      db.foods.push(stamp({ id: uid(), createdAt: Date.now(), ...input }));
      commit();
    },
    [commit],
  );

  const updateFood = cb(
    async (
      id: string,
      patch: { name: string; calories: number; protein: number; carbs: number; fat: number },
    ) => {
      const db = dbRef.current;
      const i = db.foods.findIndex((f) => f.id === id);
      if (i === -1) return;
      db.foods[i] = stamp({ ...db.foods[i], ...patch });
      commit();
    },
    [commit],
  );

  const removeFood = cb(async (id: string) => {
    const db = dbRef.current;
    db.foods = db.foods.filter((f) => f.id !== id);
    tomb(db, "foods", id);
    commit();
  }, [commit]);

  const setCalorieLimit = cb(async (n: number) => {
    patchSettings(dbRef.current, { calorieLimit: Math.max(0, Math.round(n)) });
    commit();
  }, [commit]);

  const logSleep = cb(async (minutes: number) => {
    unlockAudio();
    const db = dbRef.current;
    const xp = sleepXp(minutes);
    if (xp !== 0) pushLedger(db, { type: "sleep_log", delta: xp, meta: `sleep ${minutes}m` });
    db.dayLogs.push(stamp({ id: uid(), kind: "sleep", date: localDay(), loggedAt: Date.now(), awardedXp: xp, minutes }));
    if (xp > 0) play("good");
    commit();
  }, [commit]);

  const logSteps = cb(
    async (input: { steps?: number; meters?: number; minutes?: number; activity?: GaitActivity; caloriesBurnt?: number }) => {
      unlockAudio();
      const db = dbRef.current;
      const steps = input.steps ?? 0;
      const meters = input.meters ?? 0;
      const minutes = input.minutes ?? 0;
      const isRun = input.activity === "run";
      const xp = stepsXp(steps, meters);
      if (xp !== 0) {
        const what = steps > 0 ? `${steps} steps` : `${meters} m`;
        pushLedger(db, { type: "steps_log", delta: xp, meta: isRun ? `${what} run` : what });
      }
      let caloriesBurnt: number | undefined;
      if (minutes > 0) {
        const weightLog = [...db.dayLogs]
          .filter((l) => l.kind === "weight")
          .sort((a, b) => b.loggedAt - a.loggedAt)[0];
        const weightKg = weightLog?.weightKg ?? 0;
        if (weightKg > 0) {
          caloriesBurnt = walkCalories({
            steps: input.steps,
            meters: input.meters,
            minutes,
            weightKg,
            heightCm: db.settings.heightCm,
            age: ageFromBirthday(db.settings.birthday, localDay()),
            sex: db.settings.sex,
            mode: input.activity,
          }).calories;
        }
      }
      db.dayLogs.push(stamp({
        id: uid(),
        kind: "steps",
        date: localDay(),
        loggedAt: Date.now(),
        awardedXp: xp,
        steps: input.steps,
        meters: input.meters,
        minutes: minutes > 0 ? minutes : undefined,
        activity: isRun ? "run" : undefined,
        // A directly entered burn wins over the estimate.
        caloriesBurnt: input.caloriesBurnt ?? caloriesBurnt,
      }));
      if (xp > 0) play("good");
      commit();
    },
    [commit],
  );

  const logReading = cb(async (minutes: number) => {
    unlockAudio();
    const db = dbRef.current;
    const xp = readingXp(minutes);
    if (xp !== 0) pushLedger(db, { type: "reading_log", delta: xp, meta: `reading ${minutes}m` });
    db.dayLogs.push(stamp({ id: uid(), kind: "reading", date: localDay(), loggedAt: Date.now(), awardedXp: xp, minutes }));
    if (xp > 0) play("good");
    commit();
  }, [commit]);

  const logWeight = cb(async (kg: number) => {
    unlockAudio();
    const db = dbRef.current;
    const date = localDay();
    const all = [...db.dayLogs].filter((l) => l.kind === "weight").sort((a, b) => b.loggedAt - a.loggedAt);
    const todays = all.find((l) => l.date === date);
    const prev = all.find((l) => l.date !== date);
    const xp = prev ? weightLossXp(prev.weightKg ?? 0, kg) : 0;
    if (todays && todays.awardedXp !== 0) {
      pushLedger(db, { type: "adjust", delta: -todays.awardedXp, meta: "undo log: weight" });
    }
    if (xp > 0) {
      pushLedger(db, { type: "weight_log", delta: xp, meta: `lost ${Math.round(((prev!.weightKg ?? 0) - kg) * 10) / 10} kg` });
      play("good");
    }
    if (todays) {
      const i = db.dayLogs.findIndex((l) => l.id === todays.id);
      db.dayLogs[i] = stamp({ ...todays, weightKg: kg, awardedXp: xp, loggedAt: Date.now() });
    } else {
      db.dayLogs.push(stamp({ id: uid(), kind: "weight", date, loggedAt: Date.now(), awardedXp: xp, weightKg: kg }));
    }
    commit();
  }, [commit]);

  const setWeightUnit = cb(async (u: WeightUnit) => {
    patchSettings(dbRef.current, { weightUnit: u });
    commit();
  }, [commit]);

  const removeDayLog = cb(async (id: string) => {
    const db = dbRef.current;
    const log = db.dayLogs.find((l) => l.id === id);
    if (!log) return;
    if (log.awardedXp !== 0) {
      pushLedger(db, { type: "adjust", delta: -log.awardedXp, meta: `undo log: ${log.name ?? log.kind}` });
    }
    db.dayLogs = db.dayLogs.filter((l) => l.id !== id);
    tomb(db, "dayLogs", id);
    commit();
  }, [commit]);

  const setProfile = cb(
    async (patch: Partial<Pick<Settings, "heightCm" | "sex" | "birthday" | "name">>) => {
      patchSettings(dbRef.current, patch);
      commit();
    },
    [commit],
  );

  // A focus phase changed — push it now and poke the other device so its alarm
  // stops near-instantly instead of waiting on the change-feed round-trip.
  const flushFocus = cb(() => {
    void (async () => {
      try {
        await syncNowRef.current?.();
        await channelRef.current?.send({ type: "broadcast", event: "focus", payload: {} });
      } catch {
        // Broadcast is a best-effort speed-up; normal sync is the fallback.
      }
    })();
  }, []);

  // ---------- focus ----------
  const completeFocusBlock = (db: DB, a: ActiveFocus, endTs: number) => {
    const date = localDay(endTs);
    const base = focusXp(a.focusMin);
    pushLedger(db, { type: "focus_log", delta: base, meta: `focus ${a.focusMin}m`, timestamp: endTs });
    const before = db.dayLogs.filter((l) => l.kind === "focus" && l.date === date).length;
    let bonus = 0;
    if ((before + 1) % FOCUS_SET_SIZE === 0) {
      bonus = FOCUS_SET_XP;
      pushLedger(db, { type: "focus_log", delta: bonus, meta: `pomodoro set ×${FOCUS_SET_SIZE}`, timestamp: endTs });
    }
    db.dayLogs.push(stamp({
      id: uid(),
      kind: "focus",
      date,
      loggedAt: endTs,
      awardedXp: base + bonus,
      minutes: a.focusMin,
      ...(a.label ? { name: a.label } : {}),
    }));
  };

  const startFocusSession = cb(async (focusMin: number, restMin: number, label?: string) => {
    unlockAudio();
    dbRef.current.activeFocus = stamp<ActiveFocus>({
      id: "active",
      phase: "focus",
      startedAt: Date.now(),
      focusMin,
      restMin,
      ...(label ? { label } : {}),
    });
    play("focusStart");
    commit();
  }, [commit]);

  const cancelFocusSession = cb(async () => {
    const db = dbRef.current;
    const wasRest = db.activeFocus?.phase === "rest";
    db.activeFocus = null;
    tomb(db, "focus", "active");
    if (wasRest) play("restEnd");
    commit();
    flushFocus();
  }, [commit, flushFocus]);

  const saveFocusSession = cb(async () => {
    const db = dbRef.current;
    const a = db.activeFocus;
    if (!a || a.phase !== "focus") return;
    const mins = Math.floor(focusElapsedMs(a, Date.now()) / 60_000);
    if (mins < 1) return;
    const xp = focusXp(mins);
    if (xp !== 0) pushLedger(db, { type: "focus_log", delta: xp, meta: `focus ${mins}m`, timestamp: Date.now() });
    db.dayLogs.push(stamp({
      id: uid(),
      kind: "focus",
      date: localDay(),
      loggedAt: Date.now(),
      awardedXp: xp,
      minutes: mins,
      ...(a.label ? { name: a.label } : {}),
    }));
    db.activeFocus = null;
    tomb(db, "focus", "active");
    if (xp > 0) play("good");
    commit();
  }, [commit]);

  const pauseFocusSession = cb(async () => {
    const db = dbRef.current;
    const a = db.activeFocus;
    if (!a || a.pausedAt != null) return;
    db.activeFocus = stamp<ActiveFocus>({ ...a, pausedAt: Date.now() });
    commit();
  }, [commit]);

  const resumeFocusSession = cb(async () => {
    const db = dbRef.current;
    const a = db.activeFocus;
    if (!a || a.pausedAt == null) return;
    const { pausedAt, ...rest } = a;
    db.activeFocus = stamp<ActiveFocus>({ ...rest, startedAt: a.startedAt + (Date.now() - pausedAt) });
    commit();
  }, [commit]);

  // Focus alarm answered: bank the pomodoro (full XP), then rest or stop.
  const finishFocusSession = cb(async (startRest: boolean) => {
    const db = dbRef.current;
    const a = db.activeFocus;
    if (!a || a.phase !== "focus") return;
    completeFocusBlock(db, a, focusPhaseEnd(a));
    if (startRest && a.restMin > 0) {
      const { pausedAt, ...rest } = a;
      db.activeFocus = stamp<ActiveFocus>({ ...rest, phase: "rest", startedAt: Date.now() });
    } else {
      db.activeFocus = null;
      tomb(db, "focus", "active");
    }
    play("good");
    commit();
    flushFocus();
  }, [commit, flushFocus]);

  // Rest alarm answered with "keep going": start a fresh focus phase.
  const continueFocusSession = cb(async () => {
    const db = dbRef.current;
    const a = db.activeFocus;
    if (!a) return;
    const { pausedAt, ...rest } = a;
    db.activeFocus = stamp<ActiveFocus>({ ...rest, phase: "focus", startedAt: Date.now() });
    play("focusStart");
    commit();
    flushFocus();
  }, [commit, flushFocus]);

  const addFocusTask = cb(async (name: string) => {
    const db = dbRef.current;
    const n = name.trim();
    if (!n || db.settings.focusTasks.some((t) => t.toLowerCase() === n.toLowerCase())) return;
    patchSettings(db, { focusTasks: [...db.settings.focusTasks, n] });
    commit();
  }, [commit]);

  const removeFocusTask = cb(async (name: string) => {
    const db = dbRef.current;
    patchSettings(db, { focusTasks: db.settings.focusTasks.filter((t) => t !== name) });
    commit();
  }, [commit]);

  const setSoundsEnabled = cb(async (on: boolean) => {
    patchSettings(dbRef.current, { soundsEnabled: on });
    setSoundEnabled(on);
    commit();
  }, [commit]);

  // ---------- sync + backup ----------
  const syncNow = cb(async () => {
    if (!user) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await runSyncCycle(dbRef.current, user.id);
      if (res) {
        syncedOnceRef.current = true; // merged: milestone sweeps are now safe
        saveDB(dbRef.current);
        // Re-render only when remote changes actually landed (avoids a loop
        // with the debounced push effect below).
        if (res.pulled > 0) force();
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Make THIS device the source of truth: re-stamp every row with one fresh
  // timestamp (so it sorts newest), forget the cursors (so everything re-uploads
  // and re-pulls from scratch), then sync. Combined with the future-stamp clamp
  // in sync.ts, this resolves a wedged history where edits stopped crossing
  // devices — the other device adopts this one's data on its next pull.
  const forcePush = cb(async () => {
    if (!user) return;
    const db = dbRef.current;
    const t = Date.now();
    const re = <T extends object>(r: T): T => {
      (r as Record<string, unknown>).updatedAt = t;
      return r;
    };
    db.tasks.forEach(re);
    db.completions.forEach(re);
    db.ledger.forEach(re);
    db.lists.forEach(re);
    db.foods.forEach(re);
    db.dayLogs.forEach(re);
    db.settings = re(db.settings);
    if (db.activeFocus) db.activeFocus = re(db.activeFocus);
    saveDB(db);
    await resetSyncCursor(user.id);
    await syncNow();
  }, [user, syncNow]);

  const exportBundleAction = cb(() => exportBundle(dbRef.current), []);

  const importBundle = cb(async (raw: string) => {
    const [next, count] = bundleToDB(raw);
    // Re-stamp everything so the import is pushed to the server on next sync.
    const t = Date.now();
    const restamp = <T extends object>(r: T): T => {
      (r as Record<string, unknown>).updatedAt = t;
      return r;
    };
    next.tasks.forEach(restamp);
    next.completions.forEach(restamp);
    next.ledger.forEach(restamp);
    next.lists.forEach(restamp);
    next.foods.forEach(restamp);
    next.dayLogs.forEach(restamp);
    next.settings = restamp(next.settings);
    if (next.activeFocus) next.activeFocus = restamp(next.activeFocus);
    dbRef.current = next;
    setSoundEnabled(next.settings.soundsEnabled);
    commit();
    return count;
  }, [commit]);

  // Auto-sync: on sign-in, periodic fallback, and when the app returns to foreground.
  useEffect(() => {
    if (!user) return;
    void syncNow();
    const id = setInterval(() => void syncNow(), 30_000);
    const subPromise = AppState.addEventListener("change", (s) => {
      if (s === "active") void syncNow();
    });
    return () => {
      clearInterval(id);
      subPromise.remove();
    };
  }, [user, syncNow]);

  // Push local changes to the cloud almost immediately (debounced).
  useEffect(() => {
    if (!user || !ready) return;
    const id = setTimeout(() => void syncNow(), 700);
    return () => clearTimeout(id);
  }, [version, user, ready, syncNow]);

  // Keep the ref pointing at the latest syncNow for flushFocus.
  useEffect(() => {
    syncNowRef.current = syncNow;
  }, [syncNow]);

  // Realtime: pull the instant a row changes for this user on the server, plus
  // a low-latency "focus" broadcast so a phase change stops the other device's
  // alarm immediately (the change-feed can lag several seconds).
  useEffect(() => {
    if (!user) return;
    const sb = supabase();
    if (!sb) return;
    const tables = ["tasks", "completions", "ledger", "settings", "lists", "foods", "day_logs", "focus"];
    const channel = sb.channel(`grit-sync-${user.id}`, {
      config: { broadcast: { self: false } },
    });
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `user_id=eq.${user.id}` },
        () => void syncNow(),
      );
    }
    channel.on("broadcast", { event: "focus" }, () => void syncNow());
    channel.subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void sb.removeChannel(channel);
    };
  }, [user, syncNow]);

  // Periodic milestone sweep (focus phases settle via the manual alarm).
  useEffect(() => {
    if (ready) sweepMilestones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, ready]);

  const dismissCelebration = cb(() => setCelebration(null), []);

  // Fire the level-up overlay when the derived level climbs.
  useEffect(() => {
    if (!ready) return;
    const lvl = computeLevel(
      totalXp(dbRef.current.ledger),
      dbRef.current.settings.levelBase,
      dbRef.current.settings.levelGrowth,
    ).level;
    if (prevLevel.current === null) {
      prevLevel.current = lvl;
      return;
    }
    if (lvl > prevLevel.current) {
      setCelebration({ kind: "levelup", level: lvl });
      play("levelup");
    }
    prevLevel.current = lvl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ready]);

  const db = dbRef.current;
  const settings = db.settings;
  const value: StoreValue = useMemo(() => {
    const completedOn = new Set(db.completions.map((c) => `${c.taskId}:${c.date}`));
    const completedToday = new Set(
      db.completions.filter((c) => c.date === today).map((c) => c.taskId),
    );
    const xpToday = db.ledger
      .filter((e) => localDay(e.timestamp) === today)
      .reduce((s, e) => s + e.delta, 0);
    return {
      ready,
      today,
      now,
      settings,
      level: computeLevel(totalXp(db.ledger), settings.levelBase, settings.levelGrowth),
      xpToday,
      tasks: db.tasks,
      completedToday,
      completedOn,
      dayLogs: [...db.dayLogs].sort((a, b) => b.loggedAt - a.loggedAt),
      foods: db.foods,
      lists: [...db.lists].sort((a, b) => a.order - b.order),
      ledger: db.ledger,
      activeFocus: db.activeFocus,
      addTask,
      updateTask,
      removeTask,
      toggleMust,
      achieve,
      unachieve,
      toggleImportant,
      toggleMyDay,
      recordSlip,
      addSubtask,
      removeSubtask,
      editSubtask,
      toggleSubtask,
      setAllSubtasks,
      addList,
      renameList,
      removeList,
      logFood,
      saveFood,
      updateFood,
      removeFood,
      setCalorieLimit,
      logSleep,
      logSteps,
      logReading,
      logWeight,
      setWeightUnit,
      removeDayLog,
      setProfile,
      startFocusSession,
      cancelFocusSession,
      saveFocusSession,
      pauseFocusSession,
      resumeFocusSession,
      finishFocusSession,
      continueFocusSession,
      addFocusTask,
      removeFocusTask,
      setSoundsEnabled,
      celebration,
      dismissCelebration,
      syncing,
      syncError,
      syncNow,
      forcePush,
      exportBundle: exportBundleAction,
      importBundle,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, today, now, version, syncing, syncError, syncNow, celebration]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be used within StoreProvider");
  return v;
}

export type { SoundKind };
