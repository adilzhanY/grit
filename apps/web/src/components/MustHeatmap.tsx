"use client";

import { useState } from "react";
import type { Task } from "@/lib/types";
import { addDays, isDueOn, weekdayOf } from "@/lib/schedule";
import { localDay } from "@/lib/repository";
import { useStore } from "@/lib/store";
import { Icon } from "./Icon";

type Mode = "week" | "month" | "year";

const GREEN = "#22a55e";
const GRAY = "rgba(20, 26, 24, 0.14)";
/** Day exists but the task isn't scheduled for it. */
const FAINT = "rgba(20, 26, 24, 0.05)";

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dayStr(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Monday of the week containing `day`. */
function mondayOf(day: string): string {
  return addDays(day, -((weekdayOf(day) + 6) % 7));
}

function fmtShort(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Per-task cell color for a day. */
function cellColor(
  task: Task,
  day: string,
  today: string,
  completedOn: Set<string>,
): string {
  if (day > today || day < localDay(task.createdAt)) return "transparent";
  if (completedOn.has(`${task.id}:${day}`)) return GREEN;
  return isDueOn(task, day) ? GRAY : FAINT;
}

function NavArrow({
  dir,
  onClick,
  disabled,
}: {
  dir: "left" | "right";
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "left" ? "Previous period" : "Next period"}
      className="grid h-8 w-8 place-items-center rounded-full hover:bg-black/5 disabled:opacity-30"
      style={{ cursor: disabled ? "default" : "pointer" }}
    >
      <Icon
        name={dir === "left" ? "ChevronLeft" : "ChevronRight"}
        className="h-4 w-4"
      />
    </button>
  );
}

/** Rows = tasks, columns = days. Used for the week and month views. */
function TaskDayGrid({
  tasks,
  days,
  header,
  today,
  completedOn,
  cellSize,
}: {
  tasks: Task[];
  days: string[];
  header: (day: string, i: number) => string;
  today: string;
  completedOn: Set<string>;
  cellSize: string;
}) {
  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="grid items-center gap-1"
        style={{
          gridTemplateColumns: `minmax(6rem, 9rem) repeat(${days.length}, ${cellSize})`,
        }}
      >
        {/* header row (first cell sticky with the task-name column) */}
        <span
          className="sticky left-0 z-10 h-full"
          style={{ background: "var(--surface)" }}
        />
        {days.map((d, i) => (
          <span
            key={d}
            className="overflow-visible whitespace-nowrap text-center text-[10px] font-bold text-ink-faint"
          >
            {header(d, i)}
          </span>
        ))}
        {/* one row per task */}
        {tasks.map((t) => (
          <Row
            key={t.id}
            task={t}
            days={days}
            today={today}
            completedOn={completedOn}
            cellSize={cellSize}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  task,
  days,
  today,
  completedOn,
  cellSize,
}: {
  task: Task;
  days: string[];
  today: string;
  completedOn: Set<string>;
  cellSize: string;
}) {
  return (
    <>
      {/* Sticky so names stay visible while scrolling a wide (e.g. yearly) map. */}
      <span
        className="sticky left-0 z-10 truncate py-0.5 pr-2 text-xs font-semibold"
        style={{ background: "var(--surface)" }}
        title={task.title}
      >
        {task.title}
      </span>
      {days.map((d) => (
        <span
          key={d}
          title={`${task.title} · ${fmtShort(d)}`}
          className="rounded-[5px]"
          style={{
            width: cellSize,
            height: cellSize,
            background: cellColor(task, d, today, completedOn),
          }}
        />
      ))}
    </>
  );
}

export function MustHeatmap() {
  const { tasks, today, completedOn } = useStore();
  const musts = tasks.filter((t) => t.listType === "must" && !t.archived);

  const [mode, setMode] = useState<Mode>("week");
  /** Periods back from the current one (0 = current). */
  const [offset, setOffset] = useState(0);

  const pick = (m: Mode) => {
    setMode(m);
    setOffset(0);
  };

  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];

  let label = "";
  let body: React.ReactNode = null;

  if (mode === "week") {
    const start = addDays(mondayOf(today), -offset * 7);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    label = `${fmtShort(days[0])} – ${fmtShort(days[6])}, ${days[6].slice(0, 4)}`;
    body = (
      <TaskDayGrid
        tasks={musts}
        days={days}
        header={(_, i) => WD[i]}
        today={today}
        completedOn={completedOn}
        cellSize="1.75rem"
      />
    );
  } else if (mode === "month") {
    // Walk back `offset` months from the current one.
    const total = ty * 12 + (tm - 1) - offset;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    const count = new Date(y, m, 0).getDate();
    const days = Array.from({ length: count }, (_, i) => dayStr(y, m, i + 1));
    label = `${new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long" })} ${y}`;
    body = (
      <TaskDayGrid
        tasks={musts}
        days={days}
        header={(d) => String(Number(d.slice(8)))}
        today={today}
        completedOn={completedOn}
        cellSize="1.1rem"
      />
    );
  } else {
    // Year: per-task rows like the other modes — one tiny cell per day,
    // horizontally scrollable, names pinned via the sticky first column.
    const y = ty - offset;
    label = String(y);
    const dec31 = dayStr(y, 12, 31);
    const days: string[] = [];
    for (let d = dayStr(y, 1, 1); d <= dec31; d = addDays(d, 1)) days.push(d);
    body = (
      <TaskDayGrid
        tasks={musts}
        days={days}
        header={(d) =>
          d.endsWith("-01") ? MONTHS[Number(d.slice(5, 7)) - 1] : ""
        }
        today={today}
        completedOn={completedOn}
        cellSize="0.7rem"
      />
    );
  }

  return (
    <div
      className="clay flex flex-col gap-4 p-5 sm:col-span-2"
      style={{ background: "var(--surface)" }}
    >
      {/* Mode tabs + period navigation */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex gap-1 rounded-full p-1"
          style={{ background: "var(--page-2)" }}
        >
          {(["week", "month", "year"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => pick(m)}
              aria-pressed={mode === m}
              className="rounded-full px-3 py-1 text-sm font-bold capitalize"
              style={{
                background: mode === m ? "var(--surface)" : "transparent",
                boxShadow: mode === m ? "var(--clay-sm)" : "none",
                color: mode === m ? "var(--ink)" : "var(--ink-soft)",
                cursor: "pointer",
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <NavArrow dir="left" onClick={() => setOffset((o) => o + 1)} />
          <span className="min-w-36 text-center text-sm font-bold">{label}</span>
          <NavArrow
            dir="right"
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={offset === 0}
          />
        </div>
      </div>

      {musts.length === 0 ? (
        <p className="text-sm font-medium text-ink-faint">
          No Must tasks yet — add one to start filling the map.
        </p>
      ) : (
        body
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] font-semibold text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[4px]" style={{ background: GREEN }} />
          Done
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[4px]" style={{ background: GRAY }} />
          Missed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[4px]" style={{ background: FAINT }} />
          Not scheduled
        </span>
      </div>
    </div>
  );
}
