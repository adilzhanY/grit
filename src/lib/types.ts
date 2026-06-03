/** grit domain types — Phase 1. */

export type ListType = "must" | "bad" | "cool" | "impossible" | "custom";

export type RecurrenceType = "daily" | "weekly";

/** Weekday recurrence for Must tasks. weekdays: 0=Sun .. 6=Sat. "daily" ignores weekdays. */
export interface Recurrence {
  type: RecurrenceType;
  weekdays: number[];
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
  /** Custom-list membership. Set only when listType === "custom". */
  listId?: string;

  // --- Must only ---
  recurrence?: Recurrence;

  // --- Bad only ---
  /** XP lost per slip (stored positive; applied as negative). */
  slipPenalty?: number;
  /** Scales the global milestone reward ladder. Default 1. */
  rewardMultiplier?: number;
  /** Timestamp of the last slip; streak is measured from here (or createdAt). */
  lastSlipAt?: number;
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

export type LedgerType =
  | "must_complete"
  | "bad_slip"
  | "cool_achieve"
  | "impossible_achieve"
  | "custom_complete"
  | "streak_milestone"
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
  levelBase: number;
  levelGrowth: number;
  soundsEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  id: "singleton",
  levelBase: 1500,
  levelGrowth: 1.3,
  soundsEnabled: true,
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
