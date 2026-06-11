/** grit domain types — Phase 1. */

export type ListType = "must" | "bad" | "cool" | "impossible" | "custom";

export type RecurrenceType = "daily" | "weekly" | "monthly" | "yearly";

/**
 * Repeat rule. Any task with a recurrence completes per-day (via Completions)
 * instead of archiving. Dates are measured from the task's anchor day
 * (plannedFor, else creation day).
 * - weekdays (weekly only): 0=Sun .. 6=Sat. Empty = the anchor's weekday.
 * - interval: repeat every N units (days/weeks/months/years). Default 1.
 */
export interface Recurrence {
  type: RecurrenceType;
  weekdays: number[];
  interval?: number;
}

/** A child step of a task. Not a full task: no star, notes, or My Day. */
export interface Subtask {
  id: string;
  title: string;
  /** When completed. For Must parents, counts as done only if it's today. */
  doneAt?: number;
  /** XP actually awarded on completion, so undo reverses the exact amount. */
  awardedXp?: number;
}

export interface Task {
  id: string;
  listType: ListType;
  title: string;
  notes?: string;
  /** XP awarded on complete (must/cool/impossible). For bad, see slipPenalty. */
  points: number;
  /** Sort order within its list. */
  order: number;
  archived: boolean;
  createdAt: number;

  // --- Universal flags (any list) ---
  /** User flagged this task as Important. Drives the Important view. */
  important?: boolean;
  /** User pinned this into My Day. Drives the My Day view for any list type. */
  starredMyDay?: boolean;
  /** Local day (YYYY-MM-DD) this task is planned for. It shows in the Planned
   *  view until then, and enters My Day on (and after, until done) that day. */
  plannedFor?: string;
  /** Custom-list membership. Set only when listType === "custom". */
  listId?: string;
  /** Child steps (any list except bad). Parent is done only when all are
   *  done; its points are distributed across them. */
  subtasks?: Subtask[];
  /** XP awarded alongside an auto-completion to top up the remaining pool
   *  (e.g. after deleting the last undone subtask). Reversed on un-complete. */
  subtaskRemainderXp?: number;

  // --- Must only ---
  recurrence?: Recurrence;

  // --- Bad only ---
  /** XP lost per slip (stored positive; applied as negative). */
  slipPenalty?: number;
  /** Scales the global milestone reward ladder. Default 1. */
  rewardMultiplier?: number;
  /** Timestamp of the last slip; streak is measured from here (or createdAt). */
  lastSlipAt?: number;
  /** Longest clean streak ever achieved (ms). Captured when a slip ends a streak. */
  bestStreakMs?: number;
  /** Milestone ids already awarded for the current clean streak. Cleared on slip. */
  awardedMilestoneIds?: string[];

  // --- Cool / Impossible only ---
  achievedAt?: number;
}

/** A user-created list. Holds one-shot to-do tasks (listType === "custom"). */
export interface CustomList {
  id: string;
  name: string;
  order: number;
  createdAt: number;
}

/** One completion of a recurring Must task on a given local day. */
export interface Completion {
  id: string;
  taskId: string;
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  completedAt: number;
}

/** A saved food (library item) so repeat meals can be logged in one tap. */
export interface FoodItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  createdAt: number;
}

export type DayLogKind =
  | "food"
  | "sleep"
  | "steps"
  | "reading"
  | "focus"
  | "weight";

export type WeightUnit = "kg" | "lbs";

/** Gait for a steps log — running burns more than walking for the same distance. */
export type GaitActivity = "walk" | "run";

/**
 * The (single) running Pomodoro session. Persisted so a refresh or tab close
 * never loses it: on reopen, a phase past its end shows the alarm so the user
 * decides what to do (the timer never silently auto-completes).
 */
export interface ActiveFocus {
  id: "active";
  phase: "focus" | "rest";
  /** When the current phase started (shifted forward on resume). */
  startedAt: number;
  focusMin: number;
  restMin: number;
  /** Optional focus task this session is dedicated to (e.g. "Learn German"). */
  label?: string;
  /** When the timer was paused; the countdown is frozen while set. */
  pausedAt?: number;
}

/** One Daily Log entry (food eaten, sleep, steps walked, reading session). */
export interface DayLog {
  id: string;
  kind: DayLogKind;
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  loggedAt: number;
  /** XP applied by this log (negative for penalties). Reversed on delete. */
  awardedXp: number;

  // food
  name?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;

  // sleep / reading / steps (time spent walking)
  minutes?: number;

  // steps
  steps?: number;
  meters?: number;
  /** "walk" (default) or "run" — running burns more for the same distance. */
  activity?: GaitActivity;
  /** Estimated active calories burnt by this walk/run (distance + time). */
  caloriesBurnt?: number;

  /** Weight, always stored in kg; rendered in the user's chosen unit. */
  weightKg?: number;
}

export type LedgerType =
  | "must_complete"
  | "bad_slip"
  | "cool_achieve"
  | "impossible_achieve"
  | "custom_complete"
  | "streak_milestone"
  | "food_penalty"
  | "sleep_log"
  | "steps_log"
  | "reading_log"
  | "focus_log"
  | "weight_log"
  | "adjust";

/** Immutable XP event. Current XP = sum of all deltas (floored at 0). */
export interface LedgerEntry {
  id: string;
  timestamp: number;
  type: LedgerType;
  /** Signed XP change. */
  delta: number;
  taskId?: string;
  /** Free-form label, e.g. task title or milestone name. */
  meta?: string;
}

export interface Settings {
  id: "singleton";
  /** Display name used in greetings. */
  name: string;
  levelBase: number;
  levelGrowth: number;
  soundsEnabled: boolean;
  /** Daily calorie budget; eating past it costs -1 XP per calorie. */
  calorieLimit: number;
  /** Display unit for the weight logger. Logs are stored in kg. */
  weightUnit: WeightUnit;

  // ---- Body profile (powers the steps → calories-burnt estimate) ----
  /** Height in centimetres. */
  heightCm: number;
  /** Biological sex — affects stride length and BMR. */
  sex: BodySex;
  /** Birthday, YYYY-MM-DD. Age is derived from it. */
  birthday: string;

  /** Named focus tasks for the Pomodoro logger (e.g. "Learn German"). */
  focusTasks: string[];
}

export type BodySex = "male" | "female";

export const DEFAULT_SETTINGS: Settings = {
  id: "singleton",
  name: "",
  levelBase: 1500,
  levelGrowth: 1.3,
  soundsEnabled: true,
  calorieLimit: 2000,
  weightUnit: "kg",
  heightCm: 177,
  sex: "male",
  birthday: "2005-01-28",
  focusTasks: [],
};

export const DEFAULT_POINTS: Record<ListType, number> = {
  must: 10,
  bad: 0, // bad uses slipPenalty, not points
  cool: 100,
  impossible: 1000,
  custom: 15,
};

export const DEFAULT_SLIP_PENALTY = 100;

export const LIST_META: Record<
  ListType,
  { label: string; icon: string; blurb: string }
> = {
  must: { label: "Must", icon: "Flame", blurb: "Every day. No excuses." },
  bad: { label: "Bad", icon: "Skull", blurb: "Don't. Keep the streak alive." },
  cool: { label: "Cool", icon: "Sparkles", blurb: "Big wins worth chasing." },
  impossible: {
    label: "Impossible",
    icon: "Mountain",
    blurb: "Life-changing milestones.",
  },
  custom: { label: "List", icon: "ListChecks", blurb: "Your tasks." },
};
