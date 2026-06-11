"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  ActiveFocus,
  CustomList,
  DayLog,
  FoodItem,
  Settings,
  Task,
  WeightUnit,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";
import {
  achieve as repoAchieve,
  unachieve as repoUnachieve,
  addTask as repoAddTask,
  addSubtask as repoAddSubtask,
  deleteSubtask as repoDeleteSubtask,
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
  localDay,
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
} from "./repository";
import { downloadBackup, importData } from "./backup";
import { sync } from "./sync";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import { computeLevel, type LevelInfo } from "./leveling";
import { play, setSoundEnabled, unlockAudio } from "./sounds";
import { seedIfEmpty } from "./seed";

export type Celebration =
  | { kind: "levelup"; level: number }
  | { kind: "milestone"; label: string; xp: number; title: string };

interface StoreValue {
  ready: boolean;
  settings: Settings;
  tasks: Task[];
  lists: CustomList[];
  /** Must-task ids completed today. */
  completedToday: Set<string>;
  /** All completions, keyed "taskId:YYYY-MM-DD" (for date-specific views). */
  completedOn: Set<string>;
  today: string;
  level: LevelInfo;
  todayXp: number;
  celebration: Celebration | null;

  /** Toggle a recurring task's completion for a day (defaults to today). */
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
  toggleSubtask: (task: Task, subId: string) => Promise<void>;
  /** Parent-check shortcut: complete or un-check every subtask. */
  setAllSubtasks: (task: Task, done: boolean) => Promise<void>;
  addList: (name: string) => Promise<CustomList>;
  renameList: (id: string, name: string) => Promise<void>;
  removeList: (id: string) => Promise<void>;
  // Daily Log
  foods: FoodItem[];
  dayLogs: DayLog[];
  /** Log a food; optionally save it to the library for one-tap re-adds. */
  logFood: (
    input: { name: string; calories: number; protein: number; carbs: number; fat: number },
    save?: boolean,
  ) => Promise<void>;
  updateFood: (
    id: string,
    patch: { name: string; calories: number; protein: number; carbs: number; fat: number },
  ) => Promise<void>;
  removeFood: (id: string) => Promise<void>;
  logSleep: (minutes: number) => Promise<void>;
  logSteps: (input: {
    steps?: number;
    meters?: number;
    minutes?: number;
  }) => Promise<void>;
  logReading: (minutes: number) => Promise<void>;
  removeDayLog: (id: string) => Promise<void>;
  setCalorieLimit: (limit: number) => Promise<void>;
  /** Update the body profile (height / sex / birthday). */
  setProfile: (
    patch: Partial<Pick<Settings, "heightCm" | "sex" | "birthday">>,
  ) => Promise<void>;
  /** Log today's weight, in kg (canonical unit). */
  logWeight: (weightKg: number) => Promise<void>;
  setWeightUnit: (unit: WeightUnit) => Promise<void>;
  // Pomodoro
  activeFocus: ActiveFocus | null;
  startFocusSession: (
    focusMin: number,
    restMin: number,
    label?: string,
  ) => Promise<void>;
  addFocusTask: (name: string) => Promise<void>;
  removeFocusTask: (name: string) => Promise<void>;
  /** Bank the elapsed time of the running focus block and end it. */
  saveFocusSession: () => Promise<void>;
  /** Abandon the running session (or skip the rest). No XP. */
  cancelFocusSession: () => Promise<void>;
  /** Freeze / unfreeze the countdown without ending the session. */
  pauseFocusSession: () => Promise<void>;
  resumeFocusSession: () => Promise<void>;
  /** Focus alarm answered: bank the pomodoro, then rest (true) or stop (false). */
  finishFocusSession: (startRest: boolean) => Promise<void>;
  /** Rest alarm answered with "keep going": start a fresh focus phase. */
  continueFocusSession: () => Promise<void>;
  resetXp: () => Promise<void>;
  setSoundsEnabled: (on: boolean) => Promise<void>;
  dismissCelebration: () => void;
  // Backup
  /** Download all data as a JSON file. */
  exportBackup: () => Promise<void>;
  /** Replace all local data from a backup file's text. Returns rows restored. */
  importBackup: (raw: string) => Promise<number>;
  // Sync
  /** A sync cycle is currently running. */
  syncing: boolean;
  /** Last sync error message, if the most recent attempt failed. */
  syncError: string | null;
  /** Whether the signed-in user has cloud sync available. */
  syncEnabled: boolean;
  /** Trigger a sync now (no-op if signed out). */
  syncNow: () => Promise<void>;
}

const Ctx = createContext<StoreValue | null>(null);

/** Completion sound for a task acting as a subtask parent. */
function parentSound(task: Task): "good" | "cool" | "epic" {
  if (task.listType === "impossible") return "epic";
  if (task.listType === "cool") return "cool";
  return "good";
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be used within StoreProvider");
  return v;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
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
  // Bumped on every local data change to trigger a debounced push.
  const [changeSeq, setChangeSeq] = useState(0);

  const prevLevel = useRef(0);

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
    setSoundEnabled(s.soundsEnabled);
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
      play("levelup");
      setCelebration({ kind: "levelup", level: info.level });
    }
    prevLevel.current = info.level;
    // Signal that data changed so the debounced push can fire.
    setChangeSeq((n) => n + 1);
  }, []);

  // Check bad-task milestones; award + announce the most valuable new one.
  const checkMilestones = useCallback(async () => {
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
      await refresh(false); // milestone XP could level you up, but we lead with the bell
      play("milestone");
      setCelebration({ kind: "milestone", ...best });
    }
  }, [refresh]);

  // Initial load.
  useEffect(() => {
    let alive = true;
    (async () => {
      await seedIfEmpty();
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
  }, [refresh, checkMilestones]);

  const logWeight = useCallback(
    async (weightKg: number) => {
      unlockAudio();
      const log = await repoAddWeightLog(weightKg);
      if (log.awardedXp > 0) play("good");
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

  // ---- Pomodoro actions (declared before the heartbeat that uses them) ----
  const startFocusSession = useCallback(
    async (focusMin: number, restMin: number, label?: string) => {
      unlockAudio();
      await repoStartFocus(focusMin, restMin, label);
      play("focusStart");
      await refresh(false);
    },
    [refresh],
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
    if (log && log.awardedXp > 0) play("good");
    await refresh(!!log && log.awardedXp > 0);
  }, [refresh]);

  const cancelFocusSession = useCallback(async () => {
    await repoCancelFocus();
    await refresh(false);
  }, [refresh]);

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
      play("good");
      await refresh(true);
    },
    [refresh],
  );

  const continueFocusSession = useCallback(async () => {
    await repoContinueFocus();
    play("focusStart");
    await refresh(false);
  }, [refresh]);

  // Periodic milestone + day-rollover check.
  useEffect(() => {
    const id = setInterval(() => {
      if (localDay() !== today) void refresh(false);
      void checkMilestones();
    }, 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void checkMilestones();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [today, refresh, checkMilestones]);

  // ---- actions ----
  const toggleMust = useCallback(
    async (task: Task, date?: string) => {
      unlockAudio();
      const day = date ?? today;
      if (completedOn.has(`${task.id}:${day}`)) {
        await uncompleteMust(task, day);
        await refresh(false);
      } else {
        await completeMust(task, day);
        play("good");
        await refresh(true);
      }
    },
    [completedOn, today, refresh],
  );

  const slip = useCallback(
    async (task: Task) => {
      unlockAudio();
      await recordSlip(task);
      play("bad");
      await refresh(false);
    },
    [refresh],
  );

  const achieve = useCallback(
    async (task: Task) => {
      unlockAudio();
      await repoAchieve(task);
      play(task.listType === "impossible" ? "epic" : "cool");
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
      // Deleting the last undone subtask can complete the parent (with
      // leftover XP) — allow the level-up announcement.
      await repoDeleteSubtask(task, subId);
      await refresh(true);
    },
    [refresh],
  );

  const toggleSubtask = useCallback(
    async (task: Task, subId: string) => {
      unlockAudio();
      const { checked, parentCompleted } = await repoToggleSubtask(task, subId);
      if (parentCompleted) play(parentSound(task));
      else if (checked) play("good");
      await refresh(checked);
    },
    [refresh],
  );

  const setAllSubtasks = useCallback(
    async (task: Task, done: boolean) => {
      unlockAudio();
      await repoSetAllSubtasks(task, done);
      if (done) play(parentSound(task));
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

  // ---- Daily Log actions ----
  const logFood = useCallback(
    async (
      input: { name: string; calories: number; protein: number; carbs: number; fat: number },
      save = false,
    ) => {
      unlockAudio();
      if (save) await repoSaveFood(input);
      const log = await repoAddFoodLog(input);
      play(log.awardedXp < 0 ? "bad" : "good");
      await refresh(false);
    },
    [refresh],
  );

  const updateFood = useCallback(
    async (
      id: string,
      patch: { name: string; calories: number; protein: number; carbs: number; fat: number },
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
      unlockAudio();
      const log = await repoAddSleepLog(minutes);
      play(log.awardedXp > 0 ? "good" : log.awardedXp < 0 ? "bad" : "good");
      await refresh(log.awardedXp > 0);
    },
    [refresh],
  );

  const logSteps = useCallback(
    async (input: { steps?: number; meters?: number; minutes?: number }) => {
      unlockAudio();
      const log = await repoAddStepsLog(input);
      if (log.awardedXp > 0) play("good");
      await refresh(true);
    },
    [refresh],
  );

  const logReading = useCallback(
    async (minutes: number) => {
      unlockAudio();
      const log = await repoAddReadingLog(minutes);
      if (log.awardedXp > 0) play("good");
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
    async (
      patch: Partial<Pick<Settings, "heightCm" | "sex" | "birthday">>,
    ) => {
      await updateSettings(patch);
      await refresh(false);
    },
    [refresh],
  );

  const resetXp = useCallback(async () => {
    await repoResetXp();
    await refresh(false);
  }, [refresh]);

  const setSoundsEnabled = useCallback(
    async (on: boolean) => {
      await updateSettings({ soundsEnabled: on });
      setSoundEnabled(on);
      await refresh(false);
    },
    [refresh],
  );

  const exportBackup = useCallback(async () => {
    await downloadBackup();
  }, []);

  const importBackup = useCallback(
    async (raw: string) => {
      const count = await importData(raw);
      // Reset the level baseline so a restored XP total doesn't fire a level-up.
      const s = await getSettings();
      prevLevel.current = computeLevel(
        await totalXp(),
        s.levelBase,
        s.levelGrowth,
      ).level;
      await refresh(false);
      return count;
    },
    [refresh],
  );

  const runSync = useCallback(async () => {
    if (!user) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await sync(user.id);
      // Pulled changes touch the DB directly — reload state to reflect them.
      if (res && res.pulled > 0) await refresh(false);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }, [user, refresh]);

  // Sync on sign-in, periodically as a fallback, and when the tab regains focus.
  useEffect(() => {
    if (!user) return;
    void runSync();
    const id = setInterval(() => void runSync(), 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void runSync();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user, runSync]);

  // Push local changes to the cloud almost immediately (debounced) so the other
  // device sees them right away.
  useEffect(() => {
    if (!user || changeSeq === 0) return;
    const id = setTimeout(() => void runSync(), 700);
    return () => clearTimeout(id);
  }, [changeSeq, user, runSync]);

  // Realtime: pull the instant a row changes for this user on the server.
  useEffect(() => {
    if (!user) return;
    const sb = supabase();
    if (!sb) return;
    const tables = ["tasks", "completions", "ledger", "settings", "lists", "foods", "day_logs", "focus"];
    const channel = sb.channel(`grit-sync-${user.id}`);
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `user_id=eq.${user.id}` },
        () => void runSync(),
      );
    }
    channel.subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [user, runSync]);

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
    toggleSubtask,
    setAllSubtasks,
    addList,
    renameList,
    removeList,
    foods,
    dayLogs,
    logFood,
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
    syncEnabled: !!user,
    syncNow: runSync,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
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
