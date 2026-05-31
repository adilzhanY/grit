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

/** Tasks shown in My Day: due Must tasks + anything starred in. */
export function myDayTasks(tasks: Task[], day: string): Task[] {
  return tasks.filter(
    (t) =>
      t.listType === "must" &&
      !t.archived &&
      (isMustDue(t, day) || t.starredMyDay),
  );
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
