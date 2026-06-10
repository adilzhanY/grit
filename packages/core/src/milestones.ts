/** Bad-task clean-streak milestones. Global fixed ladder; per-task reward multiplier scales XP. */

export interface Milestone {
  id: string;
  label: string;
  /** Required clean duration in milliseconds. */
  ms: number;
  /** Base XP reward (before per-task multiplier). */
  baseXp: number;
}

const H = 3_600_000;
const D = 24 * H;

export const MILESTONES: Milestone[] = [
  { id: "h24", label: "24 hours", ms: 1 * D, baseXp: 25 },
  { id: "d3", label: "3 days", ms: 3 * D, baseXp: 50 },
  { id: "w1", label: "1 week", ms: 7 * D, baseXp: 100 },
  { id: "w2", label: "2 weeks", ms: 14 * D, baseXp: 200 },
  { id: "m1", label: "1 month", ms: 30 * D, baseXp: 400 },
  { id: "m2", label: "2 months", ms: 60 * D, baseXp: 600 },
  { id: "m3", label: "3 months", ms: 90 * D, baseXp: 900 },
  { id: "m6", label: "6 months", ms: 182 * D, baseXp: 1500 },
  { id: "m9", label: "9 months", ms: 273 * D, baseXp: 2200 },
  { id: "y1", label: "1 year", ms: 365 * D, baseXp: 3500 },
  { id: "y2", label: "2 years", ms: 730 * D, baseXp: 5000 },
  { id: "y3", label: "3 years", ms: 1095 * D, baseXp: 7000 },
  { id: "y5", label: "5 years", ms: 1825 * D, baseXp: 10000 },
];

export const MS = { H, D } as const;

/** Clean-streak duration in ms for a bad task. */
export function streakMs(
  now: number,
  lastSlipAt: number | undefined,
  createdAt: number,
): number {
  return Math.max(0, now - (lastSlipAt ?? createdAt));
}

/** The most advanced milestone fully reached (or null if under 24h). */
export function currentMilestone(streak: number): Milestone | null {
  let reached: Milestone | null = null;
  for (const m of MILESTONES) {
    if (streak >= m.ms) reached = m;
    else break;
  }
  return reached;
}

/** The next milestone not yet reached (or null if at the top). */
export function nextMilestone(streak: number): Milestone | null {
  for (const m of MILESTONES) {
    if (streak < m.ms) return m;
  }
  return null;
}

/** Milestones whose threshold is crossed by `streak` but not yet in awardedIds. */
export function pendingMilestones(
  streak: number,
  awardedIds: string[],
): Milestone[] {
  const awarded = new Set(awardedIds);
  return MILESTONES.filter((m) => streak >= m.ms && !awarded.has(m.id));
}

/** Human-readable streak like "2d 7h" or "53h" or "12m". */
export function formatStreak(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
