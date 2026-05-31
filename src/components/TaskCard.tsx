"use client";

import { useState } from "react";
import type { Task } from "@/lib/types";
import { LIST_TINT } from "@/lib/tint";
import { recurrenceLabel } from "@/lib/schedule";
import { useStore } from "@/lib/store";
import { Icon } from "./Icon";

/** Card for a positive task (Must / Cool / Impossible). Self-contained: reads store. */
export function TaskCard({
  task,
  showStar = false,
  className = "",
}: {
  task: Task;
  showStar?: boolean;
  className?: string;
}) {
  const { completedToday, toggleMust, achieve, unachieve, toggleStar, removeTask } =
    useStore();
  const tint = LIST_TINT[task.listType];
  const [float, setFloat] = useState<number | null>(null);

  const done =
    task.listType === "must" ? completedToday.has(task.id) : task.archived;

  const onToggle = () => {
    if (task.listType === "must") return toggleMust(task);
    return task.archived ? unachieve(task) : achieve(task);
  };

  const handle = () => {
    if (!done) {
      setFloat(Date.now());
      window.setTimeout(() => setFloat(null), 1000);
    }
    onToggle();
  };

  return (
    <div
      className={`group relative flex items-center gap-4 p-4 sm:p-5 clay ${className}`}
      style={{ background: tint.surf }}
    >
      {/* Complete / achieve toggle */}
      <button
        onClick={handle}
        aria-label={done ? `Mark ${task.title} not done` : `Complete ${task.title}`}
        aria-pressed={done}
        className="clay-press relative grid h-12 w-12 shrink-0 place-items-center"
        style={{
          background: done ? tint.acc : "var(--surface)",
          color: done ? "#fff" : "rgba(20,26,24,0.22)",
          cursor: "pointer",
        }}
      >
        <Icon name="Check" className="h-6 w-6" strokeWidth={3.2} />
        {float !== null && (
          <span
            key={float}
            className="animate-float-up pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 text-lg font-extrabold"
            style={{ color: tint.acc }}
          >
            +{task.points}
          </span>
        )}
      </button>

      {/* Title + meta */}
      <div className="min-w-0 flex-1">
        <p
          className="text-base font-semibold break-words sm:text-lg"
          style={{
            color: "var(--ink)",
            textDecoration: done ? "line-through" : "none",
            opacity: done ? 0.55 : 1,
          }}
        >
          {task.title}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-xs font-medium text-ink-soft">
          {task.listType === "must" && <span>{recurrenceLabel(task)}</span>}
          {task.listType !== "must" && task.archived && <span>Achieved</span>}
        </div>
      </div>

      {/* Points badge */}
      <span
        className="shrink-0 rounded-full px-3 py-1 text-sm font-extrabold"
        style={{ background: "var(--surface)", color: tint.acc }}
      >
        +{task.points}
      </span>

      {/* Hover actions — overlaid so they don't steal title width */}
      <div
        className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full p-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100"
        style={{ background: tint.surf }}
      >
        {showStar && (
          <button
            onClick={() => toggleStar(task)}
            aria-label={task.starredMyDay ? "Remove from My Day" : "Add to My Day"}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-black/5"
            style={{
              cursor: "pointer",
              color: task.starredMyDay ? tint.acc : "var(--ink-faint)",
            }}
          >
            <Icon name="Star" className="h-5 w-5" />
          </button>
        )}
        <button
          onClick={() => {
            if (confirm(`Delete "${task.title}"?`)) removeTask(task.id);
          }}
          aria-label={`Delete ${task.title}`}
          className="grid h-9 w-9 place-items-center rounded-full text-ink-faint hover:bg-black/5"
          style={{ cursor: "pointer" }}
        >
          <Icon name="Trash2" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
