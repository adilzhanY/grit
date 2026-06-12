import type { Recurrence, Task } from "./types";
import { localDay } from "./day";

/** Weekday (0=Sun..6=Sat) of a YYYY-MM-DD local day string. */
export function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

function parts(day: string): [number, number, number] {
  return day.split("-").map(Number) as [number, number, number];
}

/** Whole days from `a` to `b` (local; DST-safe via UTC normalization). */
function diffDays(a: string, b: string): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  );
}

/** The day a recurring task starts repeating from. */
function anchorDay(task: Task): string {
  return task.plannedFor ?? localDay(task.createdAt);
}

/** Does a recurring task fall on the given local day? False without recurrence. */
export function isDueOn(task: Task, day: string): boolean {
  const rec = task.recurrence;
  if (!rec) return false;
  const anchor = anchorDay(task);
  const days = diffDays(anchor, day);
  if (days < 0) return false;
  const every = Math.max(1, rec.interval ?? 1);

  switch (rec.type) {
    case "daily":
      return days % every === 0;
    case "weekly": {
      if (rec.weekdays.length > 0) {
        if (!rec.weekdays.includes(weekdayOf(day))) return false;
        // Weeks counted Sun-based from the anchor's week.
        const weekIndex = Math.floor((days + weekdayOf(anchor)) / 7);
        return weekIndex % every === 0;
      }
      return days % 7 === 0 && (days / 7) % every === 0;
    }
    case "monthly": {
      const [ay, am, ad] = parts(anchor);
      const [y, m, d] = parts(day);
      const months = (y - ay) * 12 + (m - am);
      return d === ad && months >= 0 && months % every === 0;
    }
    case "yearly": {
      const [ay, am, ad] = parts(anchor);
      const [y, m, d] = parts(day);
      return m === am && d === ad && (y - ay) % every === 0;
    }
  }
}

/** Repeats every single day (so listing it in Planned would be noise). */
export function isEveryday(rec: Recurrence): boolean {
  const every = Math.max(1, rec.interval ?? 1);
  if (rec.type === "daily") return every === 1;
  return rec.type === "weekly" && every === 1 && rec.weekdays.length === 7;
}

/**
 * Tasks shown in My Day: due Must tasks (auto) + anything (any list) pinned in.
 * Completed (archived) pinned tasks stay included so the view can list them in
 * its Done section; archived Must tasks are out of rotation and excluded.
 */
export function myDayTasks(tasks: Task[], day: string): Task[] {
  return tasks.filter((t) => {
    if (t.recurrence) return !t.archived && (isDueOn(t, day) || t.starredMyDay);
    // Planned one-shots enter My Day on their day and stick around until done.
    if (t.plannedFor && t.plannedFor <= day) return true;
    return !!t.starredMyDay;
  });
}

/** Tasks shown in Important: anything (any list) flagged important. */
export function importantTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.archived && t.important);
}

/** XP weight used for ordering. (Subtasks roll their value up into points.) */
function taskXp(t: Task): number {
  return t.points ?? 0;
}

/**
 * Order tasks by XP, highest first; ties fall back to their manual `order`.
 * Pure — returns a new array, never mutates the input.
 */
export function byXp(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => taskXp(b) - taskXp(a) || a.order - b.order);
}

/**
 * My Day's priority ladder (lower rank = nearer the top):
 *   0. Added here ("Add a task for today…" — a pinned/planned one-shot)
 *   1. Important (starred)   2. Repeated (recurring)   3. Must   4. anything else
 * A task is ranked by the first rung it matches. Within a rung, higher XP wins,
 * then manual `order`.
 */
function myDayRank(t: Task): number {
  // One-shots dropped straight into My Day live at the top.
  if (!t.recurrence && (t.starredMyDay || t.plannedFor)) return 0;
  if (t.important) return 1;
  if (t.recurrence) return 2;
  if (t.listType === "must") return 3;
  return 4;
}

/** Order My Day tasks by the priority ladder, then XP within each rung. Pure. */
export function byMyDayPriority(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      myDayRank(a) - myDayRank(b) ||
      taskXp(b) - taskXp(a) ||
      a.order - b.order,
  );
}

/** A YYYY-MM-DD local day string offset by n days. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/** Human label for an upcoming day: "Tomorrow", else "Tue, June 9" (+ year if different). */
export function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    ...(String(y) === today.slice(0, 4) ? {} : { year: "numeric" }),
  });
}

/**
 * The Planned schedule: the next `horizon` days after today, each with the
 * tasks due then — one-shots planned for that day plus recurring Must tasks.
 * Days with nothing due are omitted. The horizon keeps recurring tasks from
 * stretching the list forever.
 */
export function plannedDays(
  tasks: Task[],
  today: string,
  horizon = 10,
): { day: string; tasks: Task[] }[] {
  const out: { day: string; tasks: Task[] }[] = [];
  for (let i = 1; i <= horizon; i++) {
    const day = addDays(today, i);
    const due = tasks.filter((t) => {
      if (t.archived) return false;
      // Everyday repeats (e.g. daily Musts) would fill every group — skip them.
      if (t.recurrence)
        return !isEveryday(t.recurrence) && isDueOn(t, day);
      return t.plannedFor === day;
    });
    if (due.length > 0) out.push({ day, tasks: due });
  }
  return out;
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const UNIT: Record<string, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

export function recurrenceLabel(task: Pick<Task, "recurrence">): string {
  const rec = task.recurrence;
  if (!rec) return "";
  const every = Math.max(1, rec.interval ?? 1);
  if (rec.type === "daily")
    return every === 1 ? "Every day" : `Every ${every} days`;
  if (rec.type === "weekly") {
    const days = rec.weekdays.slice().sort((a, b) => a - b);
    if (days.length === 7 && every === 1) return "Every day";
    const dayPart =
      days.length === 5 && days.join() === "1,2,3,4,5"
        ? "Weekdays"
        : days.map((d) => WD[d]).join(" · ");
    const prefix = every === 1 ? "" : `Every ${every} weeks · `;
    return days.length === 0
      ? every === 1
        ? "Weekly"
        : `Every ${every} weeks`
      : prefix + dayPart;
  }
  if (every === 1) return rec.type === "monthly" ? "Monthly" : "Yearly";
  return `Every ${every} ${UNIT[rec.type]}s`;
}
