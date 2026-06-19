/**
 * GritTUI store — the web app's StoreProvider, reshaped for Ink. Same actions
 * and the same append-only-ledger semantics; the differences are: no DOM (Node
 * timers instead of visibility events), no audio (the terminal stays quiet), and
 * the cloud is the only store, so we sync (full pull) before the first render.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import {
  type ActiveFocus,
  type CustomList,
  type DayLog,
  type FoodItem,
  type GaitActivity,
  type Settings,
  type Task,
  type WeightUnit,
  type LevelInfo,
  DEFAULT_SETTINGS,
  computeLevel,
  localDay,
} from "@grit/core";
import {
  achieve as repoAchieve,
  unachieve as repoUnachieve,
  addTask as repoAddTask,
  addSubtask as repoAddSubtask,
  deleteSubtask as repoDeleteSubtask,
  editSubtask as repoEditSubtask,
  toggleSubtask as repoToggleSubtask,
  setAllSubtasks as repoSetAllSubtasks,
  addCustomList as repoAddCustomList,
  awardMilestones,
  completeMust,
  listCompletions,
  deleteTask as repoDeleteTask,
  deleteCustomList as repoDeleteCustomList,
  getSettings,
  listCustomLists,
  listTasks,
  recordSlip,
  renameCustomList as repoRenameCustomList,
  resetXp as repoResetXp,
  totalXp,
  uncompleteMust,
  updateSettings,
  updateTask as repoUpdateTask,
  xpGainedOn,
  listFoods,
  saveFood as repoSaveFood,
  updateFood as repoUpdateFood,
  deleteFood as repoDeleteFood,
  listDayLogs,
  addFoodLog as repoAddFoodLog,
  addSleepLog as repoAddSleepLog,
  addStepsLog as repoAddStepsLog,
  addReadingLog as repoAddReadingLog,
  deleteDayLog as repoDeleteDayLog,
  addWeightLog as repoAddWeightLog,
  getActiveFocus,
  startFocus as repoStartFocus,
  cancelFocus as repoCancelFocus,
  saveFocusEarly as repoSaveFocusEarly,
  pauseFocus as repoPauseFocus,
  resumeFocus as repoResumeFocus,
  finishFocus as repoFinishFocus,
  continueFocus as repoContinueFocus,
  addFocusTask as repoAddFocusTask,
  removeFocusTask as repoRemoveFocusTask,
} from "../data/repository";
import { writeBackup, importBackupFile } from "../data/backup";
import { sync } from "../data/sync";
import { resetDb } from "../data/db";

export type Celebration =
  | { kind: "levelup"; level: number }
  | { kind: "milestone"; label: string; xp: number; title: string };

interface StoreValue {
  ready: boolean;
  settings: Settings;
  tasks: Task[];
  lists: CustomList[];
  completedToday: Set<string>;
  completedOn: Set<string>;
  today: string;
  level: LevelInfo;
  todayXp: number;
  celebration: Celebration | null;

  toggleMust: (task: Task, date?: string) => Promise<void>;
  slip: (task: Task) => Promise<void>;
  achieve: (task: Task) => Promise<void>;
  unachieve: (task: Task) => Promise<void>;
  addTask: (input: Parameters<typeof repoAddTask>[0]) => Promise<void>;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  toggleMyDay: (task: Task) => Promise<void>;
  toggleImportant: (task: Task) => Promise<void>;
  addSubtask: (task: Task, title: string) => Promise<void>;
  removeSubtask: (task: Task, subId: string) => Promise<void>;
  editSubtask: (
    task: Task,
    subId: string,
    patch: { title?: string; xp?: number },
  ) => Promise<void>;
  toggleSubtask: (task: Task, subId: string) => Promise<void>;
  setAllSubtasks: (task: Task, done: boolean) => Promise<void>;
  addList: (name: string) => Promise<CustomList>;
  renameList: (id: string, name: string) => Promise<void>;
  removeList: (id: string) => Promise<void>;

  foods: FoodItem[];
  dayLogs: DayLog[];
  logFood: (
    input: {
      name: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    },
    save?: boolean,
  ) => Promise<void>;
  saveFood: (input: {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }) => Promise<void>;
  updateFood: (
    id: string,
    patch: {
      name: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    },
  ) => Promise<void>;
  removeFood: (id: string) => Promise<void>;
  logSleep: (minutes: number) => Promise<void>;
  logSteps: (input: {
    steps?: number;
    meters?: number;
    minutes?: number;
    activity?: GaitActivity;
    caloriesBurnt?: number;
  }) => Promise<void>;
  logReading: (minutes: number) => Promise<void>;
  removeDayLog: (id: string) => Promise<void>;
  setCalorieLimit: (limit: number) => Promise<void>;
  setProfile: (
    patch: Partial<Pick<Settings, "heightCm" | "sex" | "birthday">>,
  ) => Promise<void>;
  logWeight: (weightKg: number) => Promise<void>;
  setWeightUnit: (unit: WeightUnit) => Promise<void>;

  activeFocus: ActiveFocus | null;
  startFocusSession: (
    focusMin: number,
    restMin: number,
    label?: string,
  ) => Promise<void>;
  addFocusTask: (name: string) => Promise<void>;
  removeFocusTask: (name: string) => Promise<void>;
  saveFocusSession: () => Promise<void>;
  cancelFocusSession: () => Promise<void>;
  pauseFocusSession: () => Promise<void>;
  resumeFocusSession: () => Promise<void>;
  finishFocusSession: (startRest: boolean) => Promise<void>;
  continueFocusSession: () => Promise<void>;

  resetXp: () => Promise<void>;
  setSoundsEnabled: (on: boolean) => Promise<void>;
  dismissCelebration: () => void;
  exportBackup: (path?: string) => Promise<string>;
  importBackup: (path: string) => Promise<number>;

  syncing: boolean;
  syncError: string | null;
  syncNow: () => Promise<void>;
}

const Ctx = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be used within StoreProvider");
  return v;
}

export function StoreProvider({
  user,
  children,
}: {
  user: User;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lists, setLists] = useState<CustomList[]>([]);
  const [completedToday, setCompletedToday] = useState<Set<string>>(new Set());
  const [completedOn, setCompletedOn] = useState<Set<string>>(new Set());
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [dayLogs, setDayLogs] = useState<DayLog[]>([]);
  const [activeFocus, setActiveFocus] = useState<ActiveFocus | null>(null);
  const [today, setToday] = useState(() => localDay());
  const [level, setLevel] = useState<LevelInfo>(() =>
    computeLevel(0, DEFAULT_SETTINGS.levelBase, DEFAULT_SETTINGS.levelGrowth),
  );
  const [todayXp, setTodayXp] = useState(0);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [changeSeq, setChangeSeq] = useState(0);

  const prevLevel = useRef(0);
  // Milestones sweep only after the first sync, so awards use merged data.
  const syncedOnce = useRef(false);
  const runSyncRef = useRef<(() => Promise<void>) | null>(null);

  const refresh = useCallback(async (announceLevelUp = true) => {
    const s = await getSettings();
    const day = localDay();
    const [allTasks, customLists, comps, xp, gained, foodLib, logs, focus] =
      await Promise.all([
        listTasks(),
        listCustomLists(),
        listCompletions(),
        totalXp(),
        xpGainedOn(day),
        listFoods(),
        listDayLogs(),
        getActiveFocus(),
      ]);
    const info = computeLevel(xp, s.levelBase, s.levelGrowth);

    setSettings(s);
    setTasks(allTasks);
    setLists(customLists);
    setCompletedToday(
      new Set(comps.filter((c) => c.date === day).map((c) => c.taskId)),
    );
    setCompletedOn(new Set(comps.map((c) => `${c.taskId}:${c.date}`)));
    setFoods(foodLib);
    setDayLogs(logs);
    setActiveFocus(focus);
    setToday(day);
    setTodayXp(gained);
    setLevel(info);

    if (announceLevelUp && info.level > prevLevel.current) {
      setCelebration({ kind: "levelup", level: info.level });
    }
    prevLevel.current = info.level;
    setChangeSeq((n) => n + 1);
  }, []);

  const checkMilestones = useCallback(async () => {
    if (!syncedOnce.current) return; // act only on merged data
    const bad = (await listTasks("bad")).filter((t) => !t.archived);
    let best: { label: string; xp: number; title: string } | null = null;
    for (const t of bad) {
      const granted = await awardMilestones(t);
      for (const g of granted) {
        if (!best || g.xp > best.xp)
          best = { label: g.label, xp: g.xp, title: t.title };
      }
    }
    if (best) {
      await refresh(false);
      setCelebration({ kind: "milestone", ...best });
    }
  }, [refresh]);

  const runSync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await sync(user.id);
      if (res && res.pulled > 0) await refresh(false);
      if (res) syncedOnce.current = true;
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }, [user.id, refresh]);

  // Initial load: pull the cloud first (full pull, cursor=0), then render.
  useEffect(() => {
    let alive = true;
    (async () => {
      setSyncing(true);
      try {
        await sync(user.id);
        syncedOnce.current = true; // merged: milestone sweeps are now safe
      } catch (err) {
        if (alive)
          setSyncError(err instanceof Error ? err.message : "Sync failed.");
      } finally {
        if (alive) setSyncing(false);
      }
      const s = await getSettings();
      prevLevel.current = computeLevel(
        await totalXp(),
        s.levelBase,
        s.levelGrowth,
      ).level;
      if (!alive) return;
      await refresh(false);
      await checkMilestones();
      if (!alive) return;
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [user.id, refresh, checkMilestones]);

  // Periodic sync + day-rollover + milestone check.
  useEffect(() => {
    const id = setInterval(() => {
      if (localDay() !== today) void refresh(false);
      void checkMilestones();
      void runSync();
    }, 30_000);
    return () => clearInterval(id);
  }, [today, refresh, checkMilestones, runSync]);

  // Debounced push after a local change.
  useEffect(() => {
    if (changeSeq === 0) return;
    const id = setTimeout(() => void runSync(), 700);
    return () => clearTimeout(id);
  }, [changeSeq, runSync]);

  useEffect(() => {
    runSyncRef.current = runSync;
  }, [runSync]);

  // ---- actions ----
  const toggleMust = useCallback(
    async (task: Task, date?: string) => {
      const day = date ?? today;
      if (completedOn.has(`${task.id}:${day}`)) {
        await uncompleteMust(task, day);
        await refresh(false);
      } else {
        await completeMust(task, day);
        await refresh(true);
      }
    },
    [completedOn, today, refresh],
  );

  const slip = useCallback(
    async (task: Task) => {
      await recordSlip(task);
      await refresh(false);
    },
    [refresh],
  );

  const achieve = useCallback(
    async (task: Task) => {
      await repoAchieve(task);
      await refresh(true);
    },
    [refresh],
  );

  const unachieve = useCallback(
    async (task: Task) => {
      await repoUnachieve(task);
      await refresh(false);
    },
    [refresh],
  );

  const addTask = useCallback(
    async (input: Parameters<typeof repoAddTask>[0]) => {
      await repoAddTask(input);
      await refresh(false);
    },
    [refresh],
  );

  const updateTask = useCallback(
    async (id: string, patch: Partial<Task>) => {
      await repoUpdateTask(id, patch);
      await refresh(false);
    },
    [refresh],
  );

  const removeTask = useCallback(
    async (id: string) => {
      await repoDeleteTask(id);
      await refresh(false);
    },
    [refresh],
  );

  const toggleMyDay = useCallback(
    async (task: Task) => {
      await repoUpdateTask(task.id, { starredMyDay: !task.starredMyDay });
      await refresh(false);
    },
    [refresh],
  );

  const toggleImportant = useCallback(
    async (task: Task) => {
      await repoUpdateTask(task.id, { important: !task.important });
      await refresh(false);
    },
    [refresh],
  );

  const addSubtask = useCallback(
    async (task: Task, title: string) => {
      await repoAddSubtask(task, title);
      await refresh(false);
    },
    [refresh],
  );

  const removeSubtask = useCallback(
    async (task: Task, subId: string) => {
      await repoDeleteSubtask(task, subId);
      await refresh(true);
    },
    [refresh],
  );

  const editSubtask = useCallback(
    async (task: Task, subId: string, patch: { title?: string; xp?: number }) => {
      await repoEditSubtask(task, subId, patch);
      await refresh(false);
    },
    [refresh],
  );

  const toggleSubtask = useCallback(
    async (task: Task, subId: string) => {
      const { checked } = await repoToggleSubtask(task, subId);
      await refresh(checked);
    },
    [refresh],
  );

  const setAllSubtasks = useCallback(
    async (task: Task, done: boolean) => {
      await repoSetAllSubtasks(task, done);
      await refresh(done);
    },
    [refresh],
  );

  const addList = useCallback(
    async (name: string) => {
      const list = await repoAddCustomList(name);
      await refresh(false);
      return list;
    },
    [refresh],
  );

  const renameList = useCallback(
    async (id: string, name: string) => {
      await repoRenameCustomList(id, name);
      await refresh(false);
    },
    [refresh],
  );

  const removeList = useCallback(
    async (id: string) => {
      await repoDeleteCustomList(id);
      await refresh(false);
    },
    [refresh],
  );

  // ---- Daily Log ----
  const logFood = useCallback(
    async (
      input: {
        name: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
      },
      save = false,
    ) => {
      if (save) await repoSaveFood(input);
      await repoAddFoodLog(input);
      await refresh(false);
    },
    [refresh],
  );

  const saveFood = useCallback(
    async (input: {
      name: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }) => {
      await repoSaveFood(input);
      await refresh(false);
    },
    [refresh],
  );

  const updateFood = useCallback(
    async (
      id: string,
      patch: {
        name: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
      },
    ) => {
      await repoUpdateFood(id, patch);
      await refresh(false);
    },
    [refresh],
  );

  const removeFood = useCallback(
    async (id: string) => {
      await repoDeleteFood(id);
      await refresh(false);
    },
    [refresh],
  );

  const logSleep = useCallback(
    async (minutes: number) => {
      const log = await repoAddSleepLog(minutes);
      await refresh(log.awardedXp > 0);
    },
    [refresh],
  );

  const logSteps = useCallback(
    async (input: {
      steps?: number;
      meters?: number;
      minutes?: number;
      activity?: GaitActivity;
      caloriesBurnt?: number;
    }) => {
      await repoAddStepsLog(input);
      await refresh(true);
    },
    [refresh],
  );

  const logReading = useCallback(
    async (minutes: number) => {
      await repoAddReadingLog(minutes);
      await refresh(true);
    },
    [refresh],
  );

  const removeDayLog = useCallback(
    async (id: string) => {
      await repoDeleteDayLog(id);
      await refresh(false);
    },
    [refresh],
  );

  const setCalorieLimit = useCallback(
    async (limit: number) => {
      await updateSettings({ calorieLimit: Math.max(0, Math.round(limit)) });
      await refresh(false);
    },
    [refresh],
  );

  const setProfile = useCallback(
    async (patch: Partial<Pick<Settings, "heightCm" | "sex" | "birthday">>) => {
      await updateSettings(patch);
      await refresh(false);
    },
    [refresh],
  );

  const logWeight = useCallback(
    async (weightKg: number) => {
      const log = await repoAddWeightLog(weightKg);
      await refresh(log.awardedXp > 0);
    },
    [refresh],
  );

  const setWeightUnit = useCallback(
    async (unit: WeightUnit) => {
      await updateSettings({ weightUnit: unit });
      await refresh(false);
    },
    [refresh],
  );

  // ---- Pomodoro ----
  const startFocusSession = useCallback(
    async (focusMin: number, restMin: number, label?: string) => {
      await repoStartFocus(focusMin, restMin, label);
      await refresh(false);
      void runSync();
    },
    [refresh, runSync],
  );

  const addFocusTask = useCallback(
    async (name: string) => {
      await repoAddFocusTask(name);
      await refresh(false);
    },
    [refresh],
  );

  const removeFocusTask = useCallback(
    async (name: string) => {
      await repoRemoveFocusTask(name);
      await refresh(false);
    },
    [refresh],
  );

  const saveFocusSession = useCallback(async () => {
    const log = await repoSaveFocusEarly();
    await refresh(!!log && log.awardedXp > 0);
    void runSync();
  }, [refresh, runSync]);

  const cancelFocusSession = useCallback(async () => {
    await repoCancelFocus();
    await refresh(false);
    void runSync();
  }, [refresh, runSync]);

  const pauseFocusSession = useCallback(async () => {
    await repoPauseFocus();
    await refresh(false);
  }, [refresh]);

  const resumeFocusSession = useCallback(async () => {
    await repoResumeFocus();
    await refresh(false);
  }, [refresh]);

  const finishFocusSession = useCallback(
    async (startRest: boolean) => {
      await repoFinishFocus(startRest);
      await refresh(true);
      void runSync();
    },
    [refresh, runSync],
  );

  const continueFocusSession = useCallback(async () => {
    await repoContinueFocus();
    await refresh(false);
    void runSync();
  }, [refresh, runSync]);

  const resetXp = useCallback(async () => {
    await repoResetXp();
    await refresh(false);
  }, [refresh]);

  const setSoundsEnabled = useCallback(
    async (on: boolean) => {
      await updateSettings({ soundsEnabled: on });
      await refresh(false);
    },
    [refresh],
  );

  const exportBackup = useCallback(async (path?: string) => {
    return writeBackup(path);
  }, []);

  const importBackup = useCallback(
    async (path: string) => {
      const count = await importBackupFile(path);
      const s = await getSettings();
      prevLevel.current = computeLevel(
        await totalXp(),
        s.levelBase,
        s.levelGrowth,
      ).level;
      await refresh(false);
      void runSync();
      return count;
    },
    [refresh, runSync],
  );

  const dismissCelebration = useCallback(() => setCelebration(null), []);

  const value: StoreValue = {
    ready,
    settings,
    tasks,
    lists,
    completedToday,
    completedOn,
    today,
    level,
    todayXp,
    celebration,
    toggleMust,
    slip,
    achieve,
    unachieve,
    addTask,
    updateTask,
    removeTask,
    toggleMyDay,
    toggleImportant,
    addSubtask,
    removeSubtask,
    editSubtask,
    toggleSubtask,
    setAllSubtasks,
    addList,
    renameList,
    removeList,
    foods,
    dayLogs,
    logFood,
    saveFood,
    updateFood,
    removeFood,
    logSleep,
    logSteps,
    setProfile,
    logReading,
    removeDayLog,
    setCalorieLimit,
    logWeight,
    setWeightUnit,
    activeFocus,
    startFocusSession,
    addFocusTask,
    removeFocusTask,
    saveFocusSession,
    cancelFocusSession,
    pauseFocusSession,
    resumeFocusSession,
    finishFocusSession,
    continueFocusSession,
    resetXp,
    setSoundsEnabled,
    dismissCelebration,
    exportBackup,
    importBackup,
    syncing,
    syncError,
    syncNow: runSync,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** On sign-out, drop in-memory data and the sync cursor. */
export function clearLocalData(): void {
  resetDb();
}

/** Opt-in ticking clock so only components that need live time re-render. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
