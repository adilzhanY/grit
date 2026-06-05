"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { CustomList, Settings, Task } from "./types";
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
  completionsForDay,
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
} from "./repository";
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
  today: string;
  level: LevelInfo;
  todayXp: number;
  celebration: Celebration | null;

  toggleMust: (task: Task) => Promise<void>;
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
  resetXp: () => Promise<void>;
  setSoundsEnabled: (on: boolean) => Promise<void>;
  dismissCelebration: () => void;
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
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lists, setLists] = useState<CustomList[]>([]);
  const [completedToday, setCompletedToday] = useState<Set<string>>(new Set());
  const [today, setToday] = useState(() => localDay());
  const [level, setLevel] = useState<LevelInfo>(() =>
    computeLevel(0, DEFAULT_SETTINGS.levelBase, DEFAULT_SETTINGS.levelGrowth),
  );
  const [todayXp, setTodayXp] = useState(0);
  const [celebration, setCelebration] = useState<Celebration | null>(null);

  const prevLevel = useRef(0);

  const refresh = useCallback(async (announceLevelUp = true) => {
    const s = await getSettings();
    const day = localDay();
    const [allTasks, customLists, comps, xp, gained] = await Promise.all([
      listTasks(),
      listCustomLists(),
      completionsForDay(day),
      totalXp(),
      xpGainedOn(day),
    ]);
    const info = computeLevel(xp, s.levelBase, s.levelGrowth);

    setSettings(s);
    setSoundEnabled(s.soundsEnabled);
    setTasks(allTasks);
    setLists(customLists);
    setCompletedToday(new Set(comps.map((c) => c.taskId)));
    setToday(day);
    setTodayXp(gained);
    setLevel(info);

    if (announceLevelUp && info.level > prevLevel.current) {
      play("levelup");
      setCelebration({ kind: "levelup", level: info.level });
    }
    prevLevel.current = info.level;
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
    async (task: Task) => {
      unlockAudio();
      if (completedToday.has(task.id)) {
        await uncompleteMust(task, today);
        await refresh(false);
      } else {
        await completeMust(task, today);
        play("good");
        await refresh(true);
      }
    },
    [completedToday, today, refresh],
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

  const dismissCelebration = useCallback(() => setCelebration(null), []);

  const value: StoreValue = {
    ready,
    settings,
    tasks,
    lists,
    completedToday,
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
    resetXp,
    setSoundsEnabled,
    dismissCelebration,
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
