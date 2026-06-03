import type { Task } from "./types";

/** Weekday (0=Sun..6=Sat) of a YYYY-MM-DD local day string. */
export function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** Is a Must task scheduled for the given local day? */
export function isMustDue(task: Task, day: string): boolean {
  if (task.listType !== "must") return false;
  const rec = task.recurrence;
  if (!rec || rec.type === "daily") return true;
  return rec.weekdays.includes(weekdayOf(day));
}

/**
 * Tasks shown in My Day: due Must tasks (auto) + anything (any list) pinned in.
 * Completed (archived) pinned tasks stay included so the view can list them in
 * its Done section; archived Must tasks are out of rotation and excluded.
 */
export function myDayTasks(tasks: Task[], day: string): Task[] {
  return tasks.filter((t) => {
    if (t.listType === "must")
      return !t.archived && (isMustDue(t, day) || t.starredMyDay);
    return !!t.starredMyDay;
  });
}

/** Tasks shown in Important: anything (any list) flagged important. */
export function importantTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.archived && t.important);
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function recurrenceLabel(task: Task): string {
  const rec = task.recurrence;
  if (!rec || rec.type === "daily") return "Every day";
  if (rec.weekdays.length === 0) return "No days set";
  if (rec.weekdays.length === 7) return "Every day";
  return rec.weekdays
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WD[d])
    .join(" · ");
}
