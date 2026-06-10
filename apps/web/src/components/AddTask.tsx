"use client";

import { useEffect, useRef, useState } from "react";
import type { ListType, Recurrence, RecurrenceType } from "@/lib/types";
import { DEFAULT_POINTS, DEFAULT_SLIP_PENALTY } from "@/lib/types";
import { LIST_TINT } from "@/lib/tint";
import { useStore } from "@/lib/store";
import { addDays, dayLabel, recurrenceLabel, weekdayOf } from "@/lib/schedule";
import { Icon } from "./Icon";

/** Close an open popover on any outside mousedown. */
function useClickOutside(
  ref: React.RefObject<HTMLDivElement | null>,
  open: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [ref, open, close]);
}

const WD = ["S", "M", "T", "W", "T", "F", "S"];
const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Due" popover for My Day quick-add: when should this task appear? */
function DuePicker({
  due,
  todayStr,
  onPick,
}: {
  /** Selected YYYY-MM-DD ("" = today). */
  due: string;
  todayStr: string;
  onPick: (day: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tomorrow = addDays(todayStr, 1);
  useClickOutside(ref, open, () => setOpen(false));

  const pick = (day: string) => {
    onPick(day);
    setOpen(false);
    setPicking(false);
  };

  const row =
    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-black/5";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Choose when this task appears"
        aria-expanded={open}
        className="clay-press flex h-11 shrink-0 items-center gap-1.5 px-3"
        style={{
          background: "var(--page-2)",
          color: due && due !== todayStr ? "var(--primary)" : "var(--ink-soft)",
          cursor: "pointer",
        }}
      >
        <Icon name="CalendarDays" className="h-5 w-5" />
        {due && due !== todayStr && (
          <span className="hidden text-xs font-bold sm:inline">
            {dayLabel(due, todayStr)}
          </span>
        )}
      </button>

      {open && (
        <div
          className="clay absolute left-0 top-12 z-30 w-60 p-2"
          style={{ background: "var(--surface)" }}
        >
          <div className="px-3 py-1.5 text-center text-xs font-bold uppercase tracking-wider text-ink-faint">
            Due
          </div>
          <button onClick={() => pick(todayStr)} className={row} style={{ cursor: "pointer" }}>
            <Icon name="CalendarCheck" className="h-4.5 w-4.5 text-ink-soft" />
            <span className="flex-1">Today</span>
            <span className="text-xs font-medium text-ink-faint">
              {WD_SHORT[weekdayOf(todayStr)]}
            </span>
          </button>
          <button onClick={() => pick(tomorrow)} className={row} style={{ cursor: "pointer" }}>
            <Icon name="CalendarDays" className="h-4.5 w-4.5 text-ink-soft" />
            <span className="flex-1">Tomorrow</span>
            <span className="text-xs font-medium text-ink-faint">
              {WD_SHORT[weekdayOf(tomorrow)]}
            </span>
          </button>
          <div className="my-1 h-px bg-black/10" />
          {picking ? (
            <input
              autoFocus
              type="date"
              min={todayStr}
              onChange={(e) => e.target.value && pick(e.target.value)}
              className="w-full rounded-xl bg-page-2 px-3 py-2 text-sm font-semibold text-ink outline-none"
              aria-label="Pick a date"
            />
          ) : (
            <button onClick={() => setPicking(true)} className={row} style={{ cursor: "pointer" }}>
              <Icon name="CalendarClock" className="h-4.5 w-4.5 text-ink-soft" />
              <span className="flex-1">Pick a date</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const REPEAT_PRESETS: { label: string; icon: string; rec: Recurrence }[] = [
  { label: "Daily", icon: "CalendarDays", rec: { type: "daily", weekdays: [] } },
  {
    label: "Weekdays",
    icon: "CalendarDays",
    rec: { type: "weekly", weekdays: [1, 2, 3, 4, 5] },
  },
  { label: "Weekly", icon: "CalendarDays", rec: { type: "weekly", weekdays: [] } },
  { label: "Monthly", icon: "CalendarDays", rec: { type: "monthly", weekdays: [] } },
  { label: "Yearly", icon: "CalendarDays", rec: { type: "yearly", weekdays: [] } },
];

const UNITS: { value: RecurrenceType; label: string }[] = [
  { value: "daily", label: "days" },
  { value: "weekly", label: "weeks" },
  { value: "monthly", label: "months" },
  { value: "yearly", label: "years" },
];

/** "Repeat" popover for My Day quick-add: presets + custom every-N rule. */
function RepeatPicker({
  repeat,
  onPick,
}: {
  repeat: Recurrence | null;
  onPick: (rec: Recurrence | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [interval, setInterval] = useState(1);
  const [unit, setUnit] = useState<RecurrenceType>("weekly");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  const pick = (rec: Recurrence | null) => {
    onPick(rec);
    setOpen(false);
    setCustom(false);
  };

  const saveCustom = () =>
    pick({
      type: unit,
      interval: Math.max(1, Math.round(interval) || 1),
      weekdays: unit === "weekly" ? weekdays : [],
    });

  const toggleDay = (d: number) =>
    setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]));

  const row =
    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-black/5";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Choose how this task repeats"
        aria-expanded={open}
        className="clay-press flex h-11 shrink-0 items-center gap-1.5 px-3"
        style={{
          background: "var(--page-2)",
          color: repeat ? "var(--primary)" : "var(--ink-soft)",
          cursor: "pointer",
        }}
      >
        <Icon name="Repeat" className="h-5 w-5" />
        {repeat && (
          <span className="hidden text-xs font-bold sm:inline">
            {recurrenceLabel({ recurrence: repeat })}
          </span>
        )}
      </button>

      {open && (
        <div
          className="clay absolute left-0 top-12 z-30 w-64 p-2"
          style={{ background: "var(--surface)" }}
        >
          <div className="px-3 py-1.5 text-center text-xs font-bold uppercase tracking-wider text-ink-faint">
            Repeat
          </div>
          {!custom && (
            <>
              {REPEAT_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => pick(p.rec)}
                  className={row}
                  style={{ cursor: "pointer" }}
                >
                  <Icon name={p.icon} className="h-4.5 w-4.5 text-ink-soft" />
                  <span className="flex-1">{p.label}</span>
                </button>
              ))}
              <div className="my-1 h-px bg-black/10" />
              <button
                onClick={() => setCustom(true)}
                className={row}
                style={{ cursor: "pointer" }}
              >
                <Icon name="CalendarClock" className="h-4.5 w-4.5 text-ink-soft" />
                <span className="flex-1">Custom</span>
              </button>
              {repeat && (
                <>
                  <div className="my-1 h-px bg-black/10" />
                  <button
                    onClick={() => pick(null)}
                    className={row}
                    style={{ cursor: "pointer", color: "var(--bad-acc, #c0392b)" }}
                  >
                    <Icon name="Trash2" className="h-4.5 w-4.5" />
                    <span className="flex-1">Never repeat</span>
                  </button>
                </>
              )}
            </>
          )}

          {custom && (
            <div className="flex flex-col gap-2 p-1">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={interval}
                  onChange={(e) => setInterval(Number(e.target.value))}
                  aria-label="Repeat every"
                  className="w-16 rounded-lg bg-page-2 px-2 py-1.5 text-sm font-semibold text-ink outline-none"
                />
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as RecurrenceType)}
                  aria-label="Repeat unit"
                  className="flex-1 rounded-lg bg-page-2 px-2 py-1.5 text-sm font-semibold text-ink outline-none"
                  style={{ cursor: "pointer" }}
                >
                  {UNITS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              {unit === "weekly" && (
                <div className="flex justify-between gap-1">
                  {WD_SHORT.map((w, d) => {
                    const on = weekdays.includes(d);
                    return (
                      <button
                        key={d}
                        onClick={() => toggleDay(d)}
                        aria-pressed={on}
                        aria-label={`Toggle ${w}`}
                        className="grid h-8 flex-1 place-items-center rounded-lg text-[11px] font-bold"
                        style={{
                          background: on ? "var(--primary)" : "var(--page-2)",
                          color: on ? "#fff" : "var(--ink-soft)",
                          cursor: "pointer",
                        }}
                      >
                        {w.slice(0, 2)}
                      </button>
                    );
                  })}
                </div>
              )}
              <button
                onClick={saveCustom}
                className="clay-press mx-auto px-5 py-1.5 text-sm font-bold"
                style={{ background: "var(--primary)", color: "#fff", cursor: "pointer" }}
              >
                Save
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AddTask({
  listType,
  listId,
  myDay = false,
}: {
  listType: ListType;
  listId?: string;
  /** Quick-add from My Day: the new task is pinned into My Day. */
  myDay?: boolean;
}) {
  const { addTask } = useStore();
  const tint = LIST_TINT[listType];
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [points, setPoints] = useState(DEFAULT_POINTS[listType]);
  const [penalty, setPenalty] = useState(DEFAULT_SLIP_PENALTY);
  const [mult, setMult] = useState(1);
  /** Bad only: "YYYY-MM-DD" the habit was quit; empty = starting now. */
  const [cleanSince, setCleanSince] = useState("");
  /** My Day only: "YYYY-MM-DD" the task should appear; "" = today. */
  const [due, setDue] = useState("");
  /** My Day only: repeat rule; null = one-shot. */
  const [repeat, setRepeat] = useState<Recurrence | null>(null);

  // Local midnight of a YYYY-MM-DD string (Date parsing of bare dates is UTC).
  const dateToTs = (s: string): number => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  };

  const todayStr = (() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  })();

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    // A future due date plans the task for that day; today pins it into My Day.
    const planned = myDay && due && due > todayStr ? due : undefined;
    await addTask({
      listType,
      title: t,
      points: listType === "bad" ? 0 : points,
      recurrence:
        listType === "must"
          ? weekdays.length === 0 || weekdays.length === 7
            ? { type: "daily", weekdays: [] }
            : { type: "weekly", weekdays }
          : (myDay && repeat) || undefined,
      slipPenalty: listType === "bad" ? penalty : undefined,
      rewardMultiplier: listType === "bad" ? mult : undefined,
      cleanSince:
        listType === "bad" && cleanSince ? dateToTs(cleanSince) : undefined,
      listId: listType === "custom" ? listId : undefined,
      // Repeating tasks follow their rule; only one-shots for today get pinned.
      starredMyDay: (myDay && !planned && !repeat) || undefined,
      plannedFor: planned,
    });
    setTitle("");
    setDue("");
    setRepeat(null);
    setWeekdays([]);
    setPoints(DEFAULT_POINTS[listType]);
    setPenalty(DEFAULT_SLIP_PENALTY);
    setMult(1);
    setCleanSince("");
    setOpen(false);
  };

  const toggleDay = (d: number) =>
    setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]));

  return (
    <div className="clay p-3 sm:p-4" style={{ background: "var(--surface)" }}>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Task options"
          aria-expanded={open}
          className="clay-press grid h-11 w-11 shrink-0 place-items-center"
          style={{ background: tint.surf, color: tint.acc, cursor: "pointer" }}
        >
          <Icon name="Plus" className="h-5 w-5" />
        </button>
        {myDay && (
          <>
            <DuePicker due={due} todayStr={todayStr} onPick={setDue} />
            <RepeatPicker repeat={repeat} onPick={setRepeat} />
          </>
        )}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={
            myDay
              ? "Add a task for today…"
              : listType === "custom"
                ? "Add a task…"
                : `Add to ${listType}…`
          }
          aria-label={`Add a ${listType} task`}
          className="min-w-0 flex-1 bg-transparent px-2 text-base font-medium outline-none placeholder:text-ink-faint"
        />
        <button
          onClick={submit}
          disabled={!title.trim()}
          className="clay-press px-4 py-2 text-sm font-bold disabled:opacity-40"
          style={{
            background: tint.acc,
            color: "#fff",
            cursor: title.trim() ? "pointer" : "not-allowed",
          }}
        >
          Add
        </button>
      </div>

      {open && (
        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-black/5 pt-3 text-sm">
          {listType === "must" && (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink-soft">Days:</span>
              <div className="flex gap-1">
                {WD.map((w, d) => {
                  const on = weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      onClick={() => toggleDay(d)}
                      aria-pressed={on}
                      aria-label={`Toggle day ${d}`}
                      className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold"
                      style={{
                        background: on ? tint.acc : "var(--page-2)",
                        color: on ? "#fff" : "var(--ink-soft)",
                        cursor: "pointer",
                      }}
                    >
                      {w}
                    </button>
                  );
                })}
              </div>
              <span className="text-xs text-ink-faint">
                {weekdays.length === 0 ? "(every day)" : ""}
              </span>
            </div>
          )}

          {(listType === "cool" ||
            listType === "impossible" ||
            listType === "custom") && (
            <label className="flex items-center gap-2 font-semibold text-ink-soft">
              XP reward:
              <input
                type="number"
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
                className="w-24 rounded-lg bg-page-2 px-2 py-1 text-ink outline-none"
              />
            </label>
          )}

          {listType === "bad" && (
            <>
              <label className="flex items-center gap-2 font-semibold text-ink-soft">
                Slip penalty:
                <input
                  type="number"
                  value={penalty}
                  onChange={(e) => setPenalty(Number(e.target.value))}
                  className="w-20 rounded-lg bg-page-2 px-2 py-1 text-ink outline-none"
                />
              </label>
              <label className="flex items-center gap-2 font-semibold text-ink-soft">
                Reward ×:
                <input
                  type="number"
                  step="0.1"
                  value={mult}
                  onChange={(e) => setMult(Number(e.target.value))}
                  className="w-16 rounded-lg bg-page-2 px-2 py-1 text-ink outline-none"
                />
              </label>
              <label className="flex items-center gap-2 font-semibold text-ink-soft">
                Clean since:
                <input
                  type="date"
                  value={cleanSince}
                  max={todayStr}
                  onChange={(e) => setCleanSince(e.target.value)}
                  className="rounded-lg bg-page-2 px-2 py-1 text-ink outline-none"
                />
                <span className="text-xs font-medium text-ink-faint">
                  {cleanSince ? "" : "(now)"}
                </span>
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}
