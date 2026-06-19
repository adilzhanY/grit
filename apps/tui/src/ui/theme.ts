/** Terminal palette, mapped from the web app's CSS variables. */
import type { ListType } from "@grit/core";

export const theme = {
  primary: "#38bdf8", // smart views
  accent: "#f59e0b", // focus / pomodoro
  done: "#22c55e",
  ink: "white",
  inkSoft: "gray",
  inkFaint: "#6b7280",
  warn: "#f43f5e",
  must: "#f97316",
  bad: "#ef4444",
  cool: "#a78bfa",
  impossible: "#f43f5e",
  custom: "#38bdf8",
} as const;

export function listColor(t: ListType): string {
  switch (t) {
    case "must":
      return theme.must;
    case "bad":
      return theme.bad;
    case "cool":
      return theme.cool;
    case "impossible":
      return theme.impossible;
    default:
      return theme.custom;
  }
}

/** A simple block progress bar, e.g. ███████░░░░░░. */
export function bar(fraction: number, width = 18): string {
  const f = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(f * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}
