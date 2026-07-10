"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DayLog } from "@/lib/types";
import {
  fmtMinutes,
  focusXp,
  focusRemainingMs,
  focusElapsedMs,
  focusPhaseEnd,
  focusElapsed,
  logStreak,
  FOCUS_SET_SIZE,
  FOCUS_SET_XP,
  XP_PER_FOCUS_MIN,
} from "@/lib/daylog";
import { addDays, weekdayOf } from "@/lib/schedule";
import { useNow, useStore } from "@/lib/store";
import { useConfirm } from "./ConfirmDialog";
import { Icon } from "./Icon";
import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  LabelList,
  Pie,
  PieChart as RPieChart,
  XAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "./ui/chart";

const FOCUS_PRESETS = [
  { label: "Classic", focus: 25, rest: 5 },
  { label: "Deep", focus: 50, rest: 10 },
];

/** Gamified rank from lifetime focus hours, shown in the stat bar. */
const FOCUS_TITLES: [number, string][] = [
  [1000, "Zenith"],
  [500, "Sage"],
  [250, "Master"],
  [100, "Expert"],
  [50, "Scholar"],
  [25, "Adept"],
  [10, "Apprentice"],
  [0, "Novice"],
];

/**
 * Series colors for the task charts, assigned in this fixed order: slot 0 is
 * always untasked "Focus", slots 1+ follow the task list. CVD-validated on the
 * light surface (worst adjacent ΔE 23.2); tasks past the last slot fold into
 * a gray "Other".
 */
const SERIES_COLORS = ["#f97316", "#6d4fe0", "#0e9182", "#cf3b3f", "#c2700a", "#22a55e"];
const OTHER_COLOR = "#76817b";

/** "13:05" for a timestamp (24h, always colon-separated). */
function fmtClock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "May 14" for a YYYY-MM-DD day string. */
function fmtDayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

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

const num = (s: string) => Math.max(0, Math.round(Number(s) || 0));

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-ink-faint">
      {children}
    </h3>
  );
}

function NumberField({
  label,
  icon,
  value,
  onChange,
  suffix,
  width = "w-full",
}: {
  label: string;
  icon: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  width?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${width}`}>
      <span className="flex items-center gap-1.5 text-xs font-bold text-ink-soft">
        <Icon name={icon} className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="flex items-center gap-1 rounded-xl bg-page-2 px-3 py-2">
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="w-full bg-transparent text-sm font-semibold text-ink outline-none"
          placeholder="0"
        />
        {suffix && (
          <span className="text-xs font-medium text-ink-faint">{suffix}</span>
        )}
      </span>
    </label>
  );
}

/** SVG progress ring with the countdown in the center. */
function FocusRing({
  fraction,
  color,
  size = "h-64 w-64",
  children,
}: {
  fraction: number;
  color: string;
  size?: string;
  children: React.ReactNode;
}) {
  const R = 110;
  const C = 2 * Math.PI * R;
  return (
    <div className={`relative ${size}`}>
      <svg viewBox="0 0 256 256" className="h-full w-full -rotate-90">
        <circle
          cx="128"
          cy="128"
          r={R}
          fill="none"
          stroke="var(--page-2)"
          strokeWidth="14"
        />
        <circle
          cx="128"
          cy="128"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - Math.min(1, Math.max(0, fraction)))}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        {children}
      </div>
    </div>
  );
}

/** A focus block placed on the day timeline. */
type FocusBlock = { start: number; end: number; label: string; running: boolean };

const hourFloor = (ms: number) => {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.getTime();
};

/** Today's focus sessions laid out on a vertical 24h timeline. */
function FocusTimeline({
  blocks,
  now,
  maxH,
}: {
  blocks: FocusBlock[];
  now: number;
  /** Cap the card to the timer's height (px); content scrolls inside. */
  maxH?: number;
}) {
  const HOUR = 3_600_000;
  // Each block needs ~44px to show its label + time on two lines. At 144px/h a
  // 20 min session maps to 48px, so even short back-to-back sessions in one
  // hour stay readable instead of piling on top of each other.
  const PX_PER_HOUR = 144;
  const MIN_BLOCK_H = 44;

  // Window: from the first block (or now) to the last end (or now), padded to
  // whole hours, with a 4-hour minimum so a lone block isn't cramped.
  const starts = blocks.map((b) => b.start);
  const ends = blocks.map((b) => b.end);
  const rangeStart = hourFloor(Math.min(now, ...starts));
  let rangeEnd = hourFloor(Math.max(now, ...ends)) + HOUR;
  while (rangeEnd - rangeStart < 4 * HOUR) rangeEnd += HOUR;

  const hours: number[] = [];
  for (let t = rangeStart; t <= rangeEnd; t += HOUR) hours.push(t);
  const y = (ms: number) => ((ms - rangeStart) / HOUR) * PX_PER_HOUR;

  // Lay blocks out chronologically and never let one overlap the previous: a
  // block sits at its real time unless that would collide, in which case it's
  // nudged down just enough to clear the one before it. Keeps every label
  // readable even when several short sessions are packed into one hour.
  const GAP = 4;
  let cursor = -Infinity;
  const placed = [...blocks]
    .sort((a, b) => a.start - b.start)
    .map((b) => {
      const top = Math.max(y(b.start), cursor);
      const height = Math.max(MIN_BLOCK_H, y(b.end) - y(b.start));
      cursor = top + height + GAP;
      return { ...b, top, height };
    });

  // Tall enough for the hour grid, or for blocks pushed past the last hour.
  const containerH = Math.max((hours.length - 1) * PX_PER_HOUR, cursor);

  // While a session ticks, centre the red "now" line — but scroll only the
  // timeline's own box, never the page (scrollIntoView would bubble up to every
  // ancestor and yank the whole page).
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const hasRunning = blocks.some((b) => b.running);
  const nowY = y(now);
  useEffect(() => {
    const box = scrollBoxRef.current;
    if (hasRunning && box)
      box.scrollTo({ top: nowY - box.clientHeight / 2, behavior: "smooth" });
    // Only re-centre when a session starts or the box is (re)sized — not on
    // every tick, so the user stays free to scroll the timeline themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRunning, maxH]);

  return (
    <div
      className="clay flex min-h-0 flex-col gap-3 p-5"
      style={{ background: "var(--surface)", height: maxH }}
    >
      <SectionTitle>Today</SectionTitle>
      <div
        ref={scrollBoxRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
      <div
        className="relative ml-9 transition-[height] duration-300 ease-out"
        style={{ height: containerH }}
      >
        {/* Hour gridlines + 24h labels */}
        {hours.map((h) => (
          <div
            key={h}
            className="absolute left-0 right-0 flex items-center transition-[top] duration-300 ease-out"
            style={{ top: y(h) }}
          >
            <span className="absolute -left-9 -translate-y-1/2 text-xs font-bold text-ink-faint tabular-nums">
              {String(new Date(h).getHours()).padStart(2, "0")}
            </span>
            <span className="h-px w-full" style={{ background: "var(--page-2)" }} />
          </div>
        ))}

        {/* Focus blocks */}
        {placed.map((b, i) => {
          const { top, height } = b;
          return (
            <div
              key={i}
              className="absolute left-1 right-1 overflow-hidden rounded-xl px-3 py-1.5 transition-[top,height] duration-300 ease-out"
              style={{
                top,
                height,
                background: b.running
                  ? "color-mix(in srgb, var(--accent) 30%, var(--surface))"
                  : "color-mix(in srgb, var(--accent) 18%, var(--surface))",
                border: `2px solid ${b.running ? "var(--accent)" : "color-mix(in srgb, var(--accent) 40%, transparent)"}`,
              }}
            >
              <p className="truncate text-sm font-extrabold">{b.label}</p>
              <p className="truncate text-xs font-semibold text-ink-soft">
                {fmtClock(b.start)} – {fmtClock(b.end)}
                <span className="text-ink-faint">
                  {" · "}
                  {fmtMinutes(Math.max(1, Math.round((b.end - b.start) / 60000)))}
                </span>
              </p>
            </div>
          );
        })}

        {/* Now line */}
        <div
          className="absolute left-0 right-0 flex items-center transition-[top] duration-300 ease-out"
          style={{ top: nowY }}
        >
          <span
            className="absolute -left-1 h-2 w-2 -translate-y-1/2 rounded-full"
            style={{ background: "var(--bad-acc)" }}
          />
          <span className="h-0.5 w-full" style={{ background: "var(--bad-acc)" }} />
        </div>
      </div>
      </div>
    </div>
  );
}

// ---------------- Stat bar ----------------

/** Lifetime headline stats: rank title, sessions, focus time, streak. */
function StatBar({ logs, today }: { logs: DayLog[]; today: string }) {
  const totalMin = logs.reduce((s, l) => s + (l.minutes ?? 0), 0);
  const { current, best } = logStreak(logs.map((l) => l.date), today);
  const title = FOCUS_TITLES.find(([h]) => totalMin >= h * 60)![1];

  const cells: { icon: string; color: string; label: string; value: string; hint?: string }[] = [
    { icon: "Trophy", color: "var(--gold)", label: "Title", value: title },
    {
      icon: "Target",
      color: "var(--imp-acc)",
      label: "Sessions",
      value: logs.length.toLocaleString(),
    },
    {
      icon: "Clock",
      color: "var(--cool-acc)",
      label: "Focus time",
      value: fmtMinutes(totalMin),
    },
    {
      icon: "Flame",
      color: "var(--accent)",
      label: "Streak",
      value: `${current} day${current === 1 ? "" : "s"}`,
      hint: `Current ${current} · best ${best} days`,
    },
  ];

  return (
    <div
      className="clay grid grid-cols-2 gap-4 p-5 lg:grid-cols-4"
      style={{ background: "var(--surface)" }}
    >
      {cells.map((c) => (
        <div key={c.label} className="flex items-center gap-3" title={c.hint}>
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
            style={{
              background: `color-mix(in srgb, ${c.color} 16%, var(--surface))`,
              color: c.color,
            }}
          >
            <Icon name={c.icon} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-faint">
              {c.label}
            </p>
            <p className="truncate text-xl font-extrabold tabular-nums">{c.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------- Activity heatmap ----------------

const HEAT_EMPTY = "var(--cell-faint)";
/** Sequential ramp: one hue (the focus accent), light → dark. */
const HEAT_STEPS = [22, 45, 70, 100];

function heatColor(min: number): string {
  if (min <= 0) return HEAT_EMPTY;
  const lvl = min < 30 ? 0 : min < 60 ? 1 : min < 120 ? 2 : 3;
  return `color-mix(in srgb, var(--accent) ${HEAT_STEPS[lvl]}%, var(--surface))`;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type HeatHover = { day: string; min: number; count: number; x: number; y: number };

/** GitHub-style contribution grid of daily focus minutes. */
function ActivityHeatmap({ logs, today }: { logs: DayLog[]; today: string }) {
  // "last" = trailing 12 months; a number = that calendar year.
  const [range, setRange] = useState<"last" | number>("last");
  const [hover, setHover] = useState<HeatHover | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const byDay = useMemo(() => {
    const m = new Map<string, { min: number; count: number }>();
    for (const l of logs) {
      const e = m.get(l.date) ?? { min: 0, count: 0 };
      e.min += l.minutes ?? 0;
      e.count += 1;
      m.set(l.date, e);
    }
    return m;
  }, [logs]);

  const curYear = Number(today.slice(0, 4));
  const years = useMemo(() => {
    const ys = new Set<number>([curYear]);
    for (const l of logs) ys.add(Number(l.date.slice(0, 4)));
    return [...ys].sort((a, b) => b - a).slice(0, 3);
  }, [logs, curYear]);

  const start = range === "last" ? addDays(today, -364) : `${range}-01-01`;
  const end =
    range === "last" || range === curYear ? today : `${range}-12-31`;

  // Columns are Monday-anchored weeks spanning [start, end].
  const weeks: string[] = [];
  for (let w = mondayOf(start); w <= end; w = addDays(w, 7)) weeks.push(w);

  const CELL = 12;
  const STEP = 15; // cell + 3px gap
  const LABEL_H = 16;

  // A month label above the first week whose Monday enters that month, spaced
  // out so labels never overlap on a partial first month.
  const monthLabels: { week: number; label: string }[] = [];
  let prevMonth = "";
  let lastLabelAt = -3;
  weeks.forEach((monday, wi) => {
    const month = monday.slice(0, 7);
    if (month !== prevMonth && wi - lastLabelAt >= 3) {
      monthLabels.push({ week: wi, label: MONTHS_SHORT[Number(month.slice(5)) - 1] });
      lastLabelAt = wi;
    }
    prevMonth = month;
  });

  // Range totals for the subtitle.
  let rangeMin = 0;
  let rangeCount = 0;
  for (const [day, e] of byDay) {
    if (day >= start && day <= end) {
      rangeMin += e.min;
      rangeCount += e.count;
    }
  }

  const showTip = (e: React.MouseEvent<HTMLDivElement>, day: string) => {
    const box = boxRef.current;
    if (!box) return;
    const cell = e.currentTarget.getBoundingClientRect();
    const host = box.getBoundingClientRect();
    const entry = byDay.get(day);
    setHover({
      day,
      min: entry?.min ?? 0,
      count: entry?.count ?? 0,
      x: cell.left - host.left + cell.width / 2,
      y: cell.top - host.top,
    });
  };

  return (
    <div
      ref={boxRef}
      className="clay relative flex flex-col gap-4 p-5"
      style={{ background: "var(--surface)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="flex items-center gap-2 text-sm font-bold">
            <Icon name="CalendarDays" className="h-4.5 w-4.5 text-ink-soft" />
            Focus activity
          </span>
          <p className="mt-0.5 text-xs font-medium text-ink-faint">
            {rangeCount.toLocaleString()} session{rangeCount === 1 ? "" : "s"} ·{" "}
            {fmtMinutes(rangeMin)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {([["last", "Last year"] as const, ...years.map((y) => [y, String(y)] as const)]).map(
            ([value, label]) => {
              const on = range === value;
              return (
                <button
                  key={String(value)}
                  onClick={() => setRange(value)}
                  aria-pressed={on}
                  className="rounded-full px-3 py-1.5 text-sm font-bold"
                  style={{
                    background: on ? "var(--accent)" : "var(--page-2)",
                    color: on ? "var(--on-accent)" : "var(--ink-soft)",
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              );
            },
          )}
        </div>
      </div>

      <div className="overflow-x-auto pb-1" onMouseLeave={() => setHover(null)}>
        <div
          className="relative mx-auto"
          style={{
            width: weeks.length * STEP - 3,
            height: LABEL_H + 7 * STEP - 3,
          }}
        >
          {monthLabels.map((m) => (
            <span
              key={m.week}
              className="absolute top-0 text-[10px] font-bold text-ink-faint"
              style={{ left: m.week * STEP }}
            >
              {m.label}
            </span>
          ))}
          {weeks.map((monday, wi) =>
            Array.from({ length: 7 }, (_, r) => {
              const day = addDays(monday, r);
              if (day < start || day > end || day > today) return null;
              return (
                <div
                  key={day}
                  onMouseEnter={(e) => showTip(e, day)}
                  style={{
                    position: "absolute",
                    left: wi * STEP,
                    top: LABEL_H + r * STEP,
                    width: CELL,
                    height: CELL,
                    borderRadius: 4,
                    background: heatColor(byDay.get(day)?.min ?? 0),
                  }}
                />
              );
            }),
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 text-[10px] font-semibold text-ink-faint">
        Less
        {[0, ...HEAT_STEPS.map((_, i) => (i + 1) * 30)].map((min, i) => (
          <span
            key={i}
            className="h-3 w-3 rounded-[4px]"
            style={{ background: heatColor(min) }}
          />
        ))}
        More
      </div>

      {hover && (
        <div
          className="clay-sm pointer-events-none absolute z-10 px-3 py-2"
          style={{
            background: "var(--surface)",
            left: hover.x,
            top: hover.y,
            transform: "translate(-50%, calc(-100% - 8px))",
          }}
        >
          <p className="whitespace-nowrap text-sm font-extrabold">
            {hover.count === 0
              ? "No sessions"
              : `${hover.count} session${hover.count === 1 ? "" : "s"}`}
          </p>
          <p className="whitespace-nowrap text-xs font-semibold text-ink-soft">
            {fmtDayLabel(hover.day)}
            {hover.min > 0 && (
              <span className="text-ink-faint"> · {fmtMinutes(hover.min)} focused</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------- Analysis (task breakdown + per-day bars) ----------------

type RangeMode = "7d" | "week" | "month" | "year";

const RANGE_MODES: { value: RangeMode; label: string }[] = [
  { value: "7d", label: "Last 7" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
];

type Series = { key: string; name: string; color: string; min: number };

/** Small inset stat used inside the analysis card. */
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl p-3" style={{ background: "var(--page-2)" }}>
      <span className="text-xs font-semibold text-ink-faint">{label}</span>
      <span className="text-xl font-extrabold tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Donut of time per task plus a stacked per-day (or per-month) bar chart for
 * a navigable period. Colors follow the task, not its rank, so switching
 * periods never repaints a task.
 */
function Analysis({
  logs,
  today,
  taskOrder,
}: {
  logs: DayLog[];
  today: string;
  /** All known task names in a stable order (settings first, then logged-only). */
  taskOrder: string[];
}) {
  const [mode, setModeRaw] = useState<RangeMode>("week");
  const [offset, setOffset] = useState(0);
  const setMode = (m: RangeMode) => {
    setModeRaw(m);
    setOffset(0);
  };

  // Inclusive [start, end] window for the current mode + offset (offset 0 =
  // the period containing today, negative = further back).
  const [ty, tm] = today.split("-").map(Number);
  let start: string;
  let end: string;
  let rangeLabel: string;
  if (mode === "7d") {
    end = addDays(today, offset * 7);
    start = addDays(end, -6);
    rangeLabel = `${fmtDayLabel(start)} – ${fmtDayLabel(end)}`;
  } else if (mode === "week") {
    start = addDays(mondayOf(today), offset * 7);
    end = addDays(start, 6);
    rangeLabel = `${fmtDayLabel(start)} – ${fmtDayLabel(end)}`;
  } else if (mode === "month") {
    const first = new Date(ty, tm - 1 + offset, 1);
    const y = first.getFullYear();
    const m = first.getMonth() + 1;
    start = dayStr(y, m, 1);
    end = dayStr(y, m, new Date(y, m, 0).getDate());
    rangeLabel = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  } else {
    const y = ty + offset;
    start = `${y}-01-01`;
    end = `${y}-12-31`;
    rangeLabel = String(y);
  }

  const rangeLogs = logs.filter((l) => l.date >= start && l.date <= end);

  // Fixed color slots: "Focus" (untasked) is always slot 0, then tasks in
  // their stable order; anything past the palette folds into "Other".
  const order = ["Focus", ...taskOrder];
  const slotOf = (l: DayLog) => {
    const idx = order.indexOf(l.name ?? "Focus");
    return idx >= 0 && idx < SERIES_COLORS.length ? idx : -1;
  };

  const totals = new Map<number, number>(); // slot (-1 = Other) → minutes
  for (const l of rangeLogs) {
    const s = slotOf(l);
    totals.set(s, (totals.get(s) ?? 0) + (l.minutes ?? 0));
  }
  // Most-focused task first — order changes with the period, colors don't.
  const series: Series[] = [...totals.entries()]
    .filter(([, min]) => min > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([slot, min]) => ({
      key: slot === -1 ? "other" : `s${slot}`,
      name: slot === -1 ? "Other" : order[slot],
      color: slot === -1 ? OTHER_COLOR : SERIES_COLORS[slot],
      min,
    }));

  const totalMin = series.reduce((s, x) => s + x.min, 0);
  const sessions = rangeLogs.length;

  const config: ChartConfig = Object.fromEntries(
    series.map((s) => [s.key, { label: s.name, color: s.color }]),
  );

  // Buckets: one bar per day, or per month in the yearly view.
  const buckets: { id: string; label: string; tip: string }[] = [];
  if (mode === "year") {
    for (let m = 1; m <= 12; m++) {
      buckets.push({
        id: `${start.slice(0, 4)}-${pad2(m)}`,
        label: MONTHS_SHORT[m - 1],
        tip: `${MONTHS_SHORT[m - 1]} ${start.slice(0, 4)}`,
      });
    }
  } else {
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const [y, m, dd] = d.split("-").map(Number);
      const date = new Date(y, m - 1, dd);
      buckets.push({
        id: d,
        label:
          mode === "month"
            ? String(dd)
            : date.toLocaleDateString(undefined, { weekday: "short" }),
        tip: date.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
      });
    }
  }

  const minutesBy = new Map<string, number>(); // `${bucketId}:${seriesKey}` → min
  for (const l of rangeLogs) {
    const bucket = mode === "year" ? l.date.slice(0, 7) : l.date;
    const s = slotOf(l);
    const key = `${bucket}:${s === -1 ? "other" : `s${s}`}`;
    minutesBy.set(key, (minutesBy.get(key) ?? 0) + (l.minutes ?? 0));
  }
  // Direct total labels fit above the bars only in the 7-bar views. They ride
  // on an invisible epsilon "cap" segment stacked on top — recharts only emits
  // labels for nonzero segments, so pinning the label to any real series would
  // drop it wherever that series happens to be 0.
  const showTotals = mode === "7d" || mode === "week";
  const data = buckets.map((b) => {
    const row: Record<string, string | number> = { label: b.label, tip: b.tip };
    let total = 0;
    for (const s of series) {
      const v = minutesBy.get(`${b.id}:${s.key}`) ?? 0;
      row[s.key] = v;
      total += v;
    }
    row.total = total;
    row.cap = total > 0 ? 0.001 : 0;
    return row;
  });

  const tooltipRow = (
    value: number | string | undefined,
    name: string | undefined,
    item: { color?: string; payload?: { fill?: string } },
  ) => (
    <>
      <div
        className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
        style={{ background: item.color || item.payload?.fill }}
      />
      <div className="flex flex-1 items-center justify-between gap-3 leading-none">
        <span className="text-[var(--ink-soft)]">
          {config[name ?? ""]?.label ?? name}
        </span>
        <span className="font-mono font-medium tabular-nums text-[var(--ink)]">
          {fmtMinutes(Number(value))}
        </span>
      </div>
    </>
  );

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      {/* Task breakdown donut */}
      <div className="clay flex flex-col gap-3 p-5" style={{ background: "var(--surface)" }}>
        <div>
          <span className="flex items-center gap-2 text-sm font-bold">
            <Icon name="ChartPie" className="h-4.5 w-4.5 text-ink-soft" />
            Focus analysis
          </span>
          <p className="mt-0.5 text-xs font-medium text-ink-faint">Task breakdown</p>
        </div>

        {series.length === 0 ? (
          <p className="py-8 text-center text-sm font-medium text-ink-faint">
            No focus in this period.
          </p>
        ) : (
          <>
            <div className="relative mx-auto h-[190px] w-[190px]">
              <ChartContainer config={config} className="h-full w-full aspect-auto">
                <RPieChart>
                  <ChartTooltip
                    content={<ChartTooltipContent hideLabel formatter={tooltipRow} />}
                  />
                  <Pie
                    data={series.map((s) => ({ ...s, value: s.min, fill: s.color }))}
                    dataKey="value"
                    nameKey="key"
                    innerRadius={58}
                    outerRadius={86}
                    paddingAngle={3}
                    cornerRadius={5}
                    strokeWidth={0}
                  />
                </RPieChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <p className="text-xl font-extrabold tabular-nums">
                    {fmtMinutes(totalMin)}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                    focused
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col">
              {series.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center gap-2.5 border-t border-black/5 dark:border-white/10 py-2 first:border-t-0"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: s.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{s.name}</span>
                  <span className="shrink-0 text-sm font-semibold text-ink-soft tabular-nums">
                    {fmtMinutes(s.min)}
                  </span>
                  <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums">
                    {Math.round((s.min / totalMin) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Period breakdown bars */}
      <div className="clay flex flex-col gap-4 p-5" style={{ background: "var(--surface)" }}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            {RANGE_MODES.map((m) => {
              const on = mode === m.value;
              return (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  aria-pressed={on}
                  className="rounded-full px-3 py-1.5 text-sm font-bold"
                  style={{
                    background: on ? "var(--accent)" : "var(--page-2)",
                    color: on ? "var(--on-accent)" : "var(--ink-soft)",
                    cursor: "pointer",
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setOffset((o) => o - 1)}
              aria-label="Previous period"
              className="grid h-8 w-8 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
              style={{ cursor: "pointer" }}
            >
              <Icon name="ChevronLeft" className="h-4 w-4" />
            </button>
            <span className="min-w-28 text-center text-sm font-bold text-ink-soft tabular-nums">
              {rangeLabel}
            </span>
            <button
              onClick={() => setOffset((o) => o + 1)}
              disabled={offset >= 0}
              aria-label="Next period"
              className="grid h-8 w-8 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
              style={{ cursor: offset >= 0 ? "default" : "pointer" }}
            >
              <Icon name="ChevronRight" className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <MiniStat label="Focus time" value={fmtMinutes(totalMin)} />
          <MiniStat label="Sessions" value={String(sessions)} />
          <MiniStat
            label="Avg session"
            value={sessions ? fmtMinutes(Math.round(totalMin / sessions)) : "—"}
          />
        </div>

        {series.length === 0 ? (
          <div className="grid h-[220px] place-items-center text-sm font-medium text-ink-faint">
            No focus in this period.
          </div>
        ) : (
          <ChartContainer config={config} className="h-[240px] w-full aspect-auto">
            <RBarChart data={data} margin={{ top: 24, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                interval={mode === "month" ? "preserveStartEnd" : 0}
                minTickGap={mode === "month" ? 16 : 4}
              />
              <ChartTooltip
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) =>
                      String(payload?.[0]?.payload?.tip ?? "")
                    }
                    formatter={tooltipRow}
                  />
                }
              />
              {series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  stackId="focus"
                  fill={s.color}
                  stroke="var(--surface)"
                  strokeWidth={2}
                  radius={3}
                  maxBarSize={44}
                />
              ))}
              {showTotals && (
                <Bar
                  dataKey="cap"
                  stackId="focus"
                  fill="transparent"
                  strokeWidth={0}
                  isAnimationActive={false}
                  tooltipType="none"
                  maxBarSize={44}
                >
                  <LabelList
                    dataKey="total"
                    // A plain <text> instead of the default label: recharts
                    // wraps its Text to the bar width, splitting "1h 15m".
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    content={(props: any) => {
                      const n = Number(props.value);
                      if (!n) return null;
                      return (
                        <text
                          x={Number(props.x) + Number(props.width) / 2}
                          y={Number(props.y) - 8}
                          textAnchor="middle"
                          fill="var(--ink-soft)"
                          fontSize={11}
                          fontWeight={700}
                        >
                          {fmtMinutes(n)}
                        </text>
                      );
                    }}
                  />
                </Bar>
              )}
            </RBarChart>
          </ChartContainer>
        )}

        {series.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-4">
            {series.map((s) => (
              <span
                key={s.key}
                className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ background: s.color }}
                />
                {s.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Focus record ----------------

/** Per-day record of every focus session, newest first. */
function FocusRecord({ logs, today }: { logs: DayLog[]; today: string }) {
  const { removeDayLog } = useStore();
  const confirm = useConfirm();
  const [days, setDays] = useState(9);

  // Group sessions by day, newest day first; within a day, newest first.
  const byDate = new Map<string, DayLog[]>();
  for (const l of logs) {
    const arr = byDate.get(l.date) ?? [];
    arr.push(l);
    byDate.set(l.date, arr);
  }
  const dates = [...byDate.keys()].sort().reverse();
  const shown = dates.slice(0, days);

  return (
    <div className="clay flex flex-col gap-4 p-5" style={{ background: "var(--surface)" }}>
      <span className="flex items-center gap-2 text-sm font-bold">
        <Icon name="ListChecks" className="h-4.5 w-4.5 text-ink-soft" />
        Focus record
      </span>
      {dates.length === 0 ? (
        <p className="text-sm font-medium text-ink-faint">
          No sessions yet. Finish a pomodoro to see it here.
        </p>
      ) : (
        <>
          <div className="gap-6 sm:columns-2 xl:columns-3">
            {shown.map((date) => {
              const sessions = [...byDate.get(date)!].sort(
                (a, b) => b.loggedAt - a.loggedAt,
              );
              return (
                <div key={date} className="mb-4 flex break-inside-avoid flex-col gap-2">
                  <p className="text-xs font-bold text-ink-faint">
                    {date === today ? "Today" : fmtDayLabel(date)}
                  </p>
                  {sessions.map((l) => {
                    const start = l.loggedAt - (l.minutes ?? 0) * 60_000;
                    return (
                      <div key={l.id} className="group flex items-start gap-3">
                        <span
                          className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-(--on-accent)"
                          style={{ background: "var(--accent)" }}
                        >
                          <Icon name="Timer" className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium text-ink-faint tabular-nums">
                              {fmtClock(start)} – {fmtClock(l.loggedAt)}
                            </span>
                            <span className="shrink-0 text-sm font-bold text-ink-soft">
                              {fmtMinutes(l.minutes ?? 0)}
                            </span>
                          </div>
                          <p className="truncate text-sm font-extrabold">
                            {l.name ?? "Focus"}
                          </p>
                        </div>
                        <button
                          onClick={async () => {
                            if (
                              await confirm({
                                title: "Delete this focus session?",
                                message: "Its XP will be reversed.",
                                confirmLabel: "Delete",
                              })
                            )
                              removeDayLog(l.id);
                          }}
                          aria-label="Delete focus session"
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint opacity-0 transition-opacity hover:bg-black/5 dark:hover:bg-white/10 focus-visible:opacity-100 group-hover:opacity-100"
                          style={{ cursor: "pointer" }}
                        >
                          <Icon name="Trash2" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {dates.length > days && (
            <button
              onClick={() => setDays((d) => d + 9)}
              className="clay-press self-center px-4 py-2 text-sm font-bold"
              style={{ background: "var(--page-2)", cursor: "pointer" }}
            >
              View more
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ---------------- Page ----------------

export function FocusPage() {
  const {
    dayLogs,
    today,
    settings,
    activeFocus,
    startFocusSession,
    cancelFocusSession,
    saveFocusSession,
    pauseFocusSession,
    resumeFocusSession,
    addFocusTask,
    removeFocusTask,
  } = useStore();
  const confirm = useConfirm();
  const now = useNow(1000);
  const [focusMin, setFocusMin] = useState("25");
  const [restMin, setRestMin] = useState("5");
  const [task, setTask] = useState<string | null>(null);
  const [newTask, setNewTask] = useState("");

  const phaseEnd = activeFocus ? focusPhaseEnd(activeFocus) : null;

  // Zen mode: a full-screen, distraction-free timer. Esc leaves it, and it
  // can't outlive the session it magnifies.
  const [zen, setZen] = useState(false);
  useEffect(() => {
    if (!zen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zen]);
  // When the session ends, leave zen with it — adjusted during render so the
  // next session never starts already-fullscreen.
  const hasSession = !!activeFocus;
  const [hadSession, setHadSession] = useState(hasSession);
  if (hadSession !== hasSession) {
    setHadSession(hasSession);
    if (!hasSession) setZen(false);
  }

  // Measure the timer card so the timeline beside it can match its height
  // exactly and scroll its own overflow instead of stretching the card.
  const timerRef = useRef<HTMLDivElement>(null);
  const [timerH, setTimerH] = useState<number>();
  useEffect(() => {
    const el = timerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTimerH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeFocus]);

  // While the running-session panel is up there's nothing below the fold, so
  // lock page scroll — only the timeline scrolls (its own isolated overflow).
  const showingRunning = !!activeFocus && phaseEnd !== null;
  useEffect(() => {
    if (!showingRunning) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, [showingRunning]);

  // Countdown in the tab title while a session runs (frozen while paused).
  useEffect(() => {
    if (!activeFocus) return;
    const left = focusRemainingMs(activeFocus, now);
    const m = Math.floor(left / 60_000);
    const s = Math.floor((left % 60_000) / 1000);
    const paused = activeFocus.pausedAt != null;
    document.title = `${paused ? "⏸" : activeFocus.phase === "focus" ? "🔥" : "☕"} ${m}:${String(s).padStart(2, "0")} · grit`;
    return () => {
      document.title = "grit";
    };
  }, [activeFocus, now]);

  const focusLogs = dayLogs.filter((l) => l.kind === "focus");
  const todays = focusLogs.filter((l) => l.date === today);
  const doneToday = todays.length;

  // Created tasks first, then any logged-only labels (e.g. deleted tasks).
  const loggedNames = [
    ...new Set(focusLogs.map((l) => l.name).filter(Boolean) as string[]),
  ];
  const loggedOnly = loggedNames.filter((n) => !settings.focusTasks.includes(n));
  const allTasks = [...settings.focusTasks, ...loggedOnly];

  const submitNewTask = () => {
    const n = newTask.trim();
    if (!n) return;
    void addFocusTask(n);
    setTask(n);
    setNewTask("");
  };

  // ---- Running session ----
  if (activeFocus && phaseEnd !== null) {
    const isFocus = activeFocus.phase === "focus";
    const paused = activeFocus.pausedAt != null;
    const elapsed = focusElapsed(activeFocus, now);
    const totalMs =
      (isFocus ? activeFocus.focusMin : activeFocus.restMin) * 60_000;
    const leftMs = focusRemainingMs(activeFocus, now);
    const leftMin = Math.floor(leftMs / 60_000);
    const leftSec = Math.floor((leftMs % 60_000) / 1000);
    const canSave = Math.floor(focusElapsedMs(activeFocus, now) / 60_000) >= 1;
    const color = isFocus ? "var(--accent)" : "var(--cool-acc)";

    // Today's finished blocks + the one in progress (only during a focus phase).
    const blocks: FocusBlock[] = todays
      .map((l) => ({
        start: l.loggedAt - (l.minutes ?? 0) * 60_000,
        end: l.loggedAt,
        label: l.name ?? "Focus",
        running: false,
      }))
      .concat(
        isFocus
          ? [
              {
                start: activeFocus.startedAt,
                end: Math.min(now, phaseEnd),
                label: activeFocus.label ?? "Focus",
                running: true,
              },
            ]
          : [],
      );

    return (
      <div className="mx-auto grid w-full max-w-[860px] grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <div
        ref={timerRef}
        className="clay flex flex-col items-center gap-4 p-8"
        style={{ background: "var(--surface)" }}
      >
        <span
          className="flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-extrabold uppercase tracking-wider text-(--on-accent)"
          style={{ background: paused ? "var(--ink-soft)" : color }}
        >
          <Icon name={paused ? "Pause" : isFocus ? "Timer" : "Coffee"} className="h-4 w-4" />
          {paused ? "Paused" : isFocus ? "Focus" : "Rest"}
        </span>

        {activeFocus.label && (
          <span className="text-lg font-extrabold tracking-tight">
            {activeFocus.label}
          </span>
        )}

        <FocusRing fraction={1 - leftMs / totalMs} color={color}>
          <span className="text-5xl font-extrabold tabular-nums tracking-tight">
            {leftMin}:{String(leftSec).padStart(2, "0")}
          </span>
          <span className="text-sm font-bold text-ink-soft">
            {fmtClock(activeFocus.startedAt)} – {fmtClock(phaseEnd)}
          </span>
          {isFocus && (
            <span className="text-xs font-semibold text-ink-faint">
              +{focusXp(activeFocus.focusMin)} XP on finish
            </span>
          )}
        </FocusRing>

        {/* While the alarm is ringing the overlay owns the choices. */}
        {!elapsed && (
          <div className="flex items-center gap-3">
            {/* Pause / Resume */}
            <button
              onClick={() => (paused ? resumeFocusSession() : pauseFocusSession())}
              aria-label={paused ? "Resume" : "Pause"}
              className="clay-press grid h-12 w-12 place-items-center rounded-full text-(--on-accent)"
              style={{ background: color, cursor: "pointer" }}
            >
              <Icon name={paused ? "Play" : "Pause"} className="h-5 w-5" />
            </button>

            <button
              onClick={() => setZen(true)}
              className="clay-press flex items-center gap-2 px-5 py-2.5 text-sm font-bold"
              style={{ background: "var(--page-2)", cursor: "pointer" }}
            >
              <Icon name="Maximize2" className="h-4 w-4" />
              Zen
            </button>

            {isFocus && canSave && (
              <button
                onClick={async () => {
                  const mins = Math.floor(focusElapsedMs(activeFocus, Date.now()) / 60_000);
                  if (
                    await confirm({
                      title: "Save this focus session?",
                      message: `${fmtMinutes(mins)} of focus will be logged.`,
                      confirmLabel: "Save",
                    })
                  )
                    void saveFocusSession();
                }}
                className="clay-press px-5 py-2.5 text-sm font-bold"
                style={{ background: "var(--accent)", color: "var(--on-accent)", cursor: "pointer" }}
              >
                Save
              </button>
            )}

            <button
              onClick={async () => {
                if (!isFocus) return void cancelFocusSession();
                if (
                  await confirm({
                    title: "Give up this pomodoro?",
                    message: "An abandoned session earns no XP.",
                    confirmLabel: "Give up",
                  })
                )
                  void cancelFocusSession();
              }}
              className="clay-press px-5 py-2.5 text-sm font-bold"
              style={{
                background: isFocus ? "var(--bad-acc)" : "var(--primary)",
                color: "var(--on-accent)",
                cursor: "pointer",
              }}
            >
              {isFocus ? "Give up" : "Skip rest"}
            </button>
          </div>
        )}
      </div>

      <FocusTimeline blocks={blocks} now={now} maxH={timerH} />

      {/* Zen mode: nothing but the ticking timer. z-50 keeps it under the
          z-[60] alarm overlay, which takes over when the phase ends. */}
      {zen && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6"
          style={{ background: "var(--page)" }}
        >
          {activeFocus.label && (
            <span className="text-lg font-extrabold tracking-tight text-ink-soft">
              {activeFocus.label}
            </span>
          )}
          <FocusRing
            fraction={1 - leftMs / totalMs}
            color={color}
            size="h-[min(80vmin,34rem)] w-[min(80vmin,34rem)]"
          >
            <span className="text-[clamp(4rem,18vmin,8rem)] font-extrabold leading-none tabular-nums tracking-tight">
              {leftMin}:{String(leftSec).padStart(2, "0")}
            </span>
            <span className="text-base font-bold text-ink-soft">
              {paused ? "Paused" : isFocus ? "Focus" : "Rest"}
            </span>
          </FocusRing>
          <button
            onClick={() => setZen(false)}
            className="text-xs font-semibold text-ink-faint"
            style={{ cursor: "pointer" }}
          >
            Esc to exit
          </button>
        </div>
      )}
    </div>
    );
  }

  // ---- Idle: stats + start a pomodoro + activity + analysis + record ----
  const f = num(focusMin);
  const r = num(restMin);

  return (
    // Centered column sized so a full year of heatmap weeks (53 × 15px, plus
    // card padding) fits without a horizontal scrollbar; whitespace either side.
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4">
      <StatBar logs={focusLogs} today={today} />

      {/* Start a pomodoro */}
      <div
        className="clay flex flex-col gap-4 p-5"
        style={{ background: "var(--surface)" }}
      >
        <SectionTitle>Start a pomodoro</SectionTitle>

        {/* Focus task chooser */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setTask(null)}
              aria-pressed={task === null}
              className="rounded-full px-3 py-1.5 text-sm font-bold"
              style={{
                background: task === null ? "var(--accent)" : "var(--page-2)",
                color: task === null ? "var(--on-accent)" : "var(--ink-soft)",
                cursor: "pointer",
              }}
            >
              No task
            </button>
            {allTasks.map((t) => {
              const on = task === t;
              return (
                <span
                  key={t}
                  className="group flex items-center rounded-full"
                  style={{
                    background: on ? "var(--accent)" : "var(--page-2)",
                    color: on ? "var(--on-accent)" : "var(--ink)",
                  }}
                >
                  <button
                    onClick={() => setTask(on ? null : t)}
                    aria-pressed={on}
                    className="rounded-full py-1.5 pl-3 pr-2 text-sm font-bold"
                    style={{ cursor: "pointer" }}
                  >
                    {t}
                  </button>
                  <button
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `Delete focus task "${t}"?`,
                          message: "Past sessions keep their time.",
                          confirmLabel: "Delete",
                        })
                      ) {
                        if (task === t) setTask(null);
                        void removeFocusTask(t);
                      }
                    }}
                    aria-label={`Delete ${t}`}
                    className="grid h-6 w-6 place-items-center rounded-full opacity-0 transition-opacity hover:bg-black/10 dark:hover:bg-white/15 group-hover:opacity-100"
                    style={{ cursor: "pointer" }}
                  >
                    <Icon name="X" className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNewTask();
              }}
              placeholder="New focus task (e.g. Learn German)"
              aria-label="New focus task"
              className="min-w-0 flex-1 rounded-xl bg-page-2 px-3 py-2 text-sm font-semibold text-ink outline-none placeholder:text-ink-faint"
            />
            <button
              onClick={submitNewTask}
              disabled={!newTask.trim()}
              aria-label="Add focus task"
              className="clay-press grid h-9 w-9 shrink-0 place-items-center disabled:opacity-40"
              style={{
                background: "var(--accent)",
                color: "var(--on-accent)",
                cursor: newTask.trim() ? "pointer" : "not-allowed",
              }}
            >
              <Icon name="Plus" className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {FOCUS_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setFocusMin(String(p.focus));
                setRestMin(String(p.rest));
              }}
              aria-pressed={f === p.focus && r === p.rest}
              className="flex flex-col items-start gap-0.5 rounded-2xl px-4 py-2.5 text-left"
              style={{
                background:
                  f === p.focus && r === p.rest ? "var(--accent)" : "var(--page-2)",
                color: f === p.focus && r === p.rest ? "var(--on-accent)" : "var(--ink)",
                cursor: "pointer",
              }}
            >
              <span className="text-sm font-extrabold">{p.label}</span>
              <span className="text-xs font-semibold opacity-80">
                {p.focus} / {p.rest} min
              </span>
            </button>
          ))}
          <NumberField label="Focus" icon="Timer" value={focusMin} onChange={setFocusMin} suffix="min" width="w-28" />
          <NumberField label="Rest" icon="Coffee" value={restMin} onChange={setRestMin} suffix="min" width="w-28" />
          <div className="flex-1" />
          <button
            onClick={() => startFocusSession(f, r, task ?? undefined)}
            disabled={f <= 0}
            className="clay-press flex items-center gap-2 px-5 py-2.5 text-sm font-bold disabled:opacity-40"
            style={{
              background: "var(--accent)",
              color: "var(--on-accent)",
              cursor: f > 0 ? "pointer" : "not-allowed",
            }}
          >
            <Icon name="Play" className="h-4 w-4" />
            Start
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-ink-faint">
          <span>
            +{XP_PER_FOCUS_MIN} XP per focused minute — paid only when the
            session finishes. Every {FOCUS_SET_SIZE}th pomodoro of the day:
            +{FOCUS_SET_XP} bonus.
          </span>
          <span className="ml-auto flex items-center gap-1" aria-label="Set progress">
            {Array.from({ length: FOCUS_SET_SIZE }, (_, i) => {
              const filled =
                doneToday > 0 && doneToday % FOCUS_SET_SIZE === 0
                  ? FOCUS_SET_SIZE
                  : doneToday % FOCUS_SET_SIZE;
              return (
                <span
                  key={i}
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    background: i < filled ? "var(--accent)" : "var(--page-2)",
                  }}
                />
              );
            })}
            <span className="ml-1 font-bold text-ink-soft">{doneToday} today</span>
          </span>
        </div>
      </div>

      <ActivityHeatmap logs={focusLogs} today={today} />

      <Analysis logs={focusLogs} today={today} taskOrder={allTasks} />

      <FocusRecord logs={focusLogs} today={today} />
    </div>
  );
}
