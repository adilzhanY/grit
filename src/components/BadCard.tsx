"use client";

import { useState } from "react";
import type { Task } from "@/lib/types";
import { LIST_TINT } from "@/lib/tint";
import { useNow, useStore } from "@/lib/store";
import {
  currentMilestone,
  formatStreak,
  nextMilestone,
  streakMs,
} from "@/lib/milestones";
import { Icon } from "./Icon";

export function BadCard({ task }: { task: Task }) {
  const { slip, removeTask } = useStore();
  const now = useNow(1000);
  const tint = LIST_TINT.bad;
  const [shake, setShake] = useState(0);

  const streak = streakMs(now, task.lastSlipAt, task.createdAt);
  const reached = currentMilestone(streak);
  const next = nextMilestone(streak);
  const floor = reached?.ms ?? 0;
  const ceil = next?.ms ?? streak;
  const span = ceil - floor;
  const progress = span > 0 ? Math.min(1, (streak - floor) / span) : 1;

  const onSlip = () => {
    setShake((n) => n + 1);
    slip(task);
  };

  return (
    <div
      key={shake}
      className={`group relative flex flex-col gap-3 p-5 clay ${shake ? "animate-shake" : ""}`}
      style={{ background: tint.surf }}
    >
      <div className="flex items-start gap-3">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
          style={{ background: "var(--surface)", color: tint.acc }}
        >
          <Icon name="Skull" className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold sm:text-lg">
            {task.title}
          </p>
          <p className="text-xs font-medium text-ink-soft">
            −{task.slipPenalty} XP if you slip
          </p>
        </div>
        <button
          onClick={() => {
            if (confirm(`Delete "${task.title}"?`)) removeTask(task.id);
          }}
          aria-label={`Delete ${task.title}`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-faint opacity-0 transition-opacity hover:bg-black/5 group-hover:opacity-100"
          style={{ cursor: "pointer" }}
        >
          <Icon name="Trash2" className="h-4 w-4" />
        </button>
      </div>

      {/* Streak readout */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-1.5" style={{ color: tint.acc }}>
            <Icon name="Shield" className="h-5 w-5" />
            <span className="text-2xl font-extrabold tabular-nums">
              {formatStreak(streak)}
            </span>
          </div>
          <p className="text-xs font-medium text-ink-soft">
            {reached ? `${reached.label} clean` : "clean streak"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-ink-soft">
            {next ? `Next: ${next.label}` : "Maxed out 🏆"}
          </p>
          {next && (
            <p className="text-[11px] text-ink-faint">
              +{Math.round(next.baseXp * (task.rewardMultiplier ?? 1))} XP
            </p>
          )}
        </div>
      </div>

      {/* Progress to next milestone */}
      <div
        className="h-3 w-full overflow-hidden rounded-full clay-inset"
        style={{ background: "var(--surface)" }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.round(progress * 100)}%`,
            background: `linear-gradient(90deg, ${tint.acc}, var(--accent))`,
          }}
        />
      </div>

      <button
        onClick={onSlip}
        className="clay-press mt-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold"
        style={{ background: tint.acc, color: "#fff", cursor: "pointer" }}
      >
        <Icon name="Skull" className="h-4 w-4" />I slipped
      </button>
    </div>
  );
}
