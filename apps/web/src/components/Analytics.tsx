"use client";

import { useEffect, useMemo, useState } from "react";
import type { DayLog, LedgerEntry, LedgerType } from "@/lib/types";
import { useStore } from "@/lib/store";
import { getLedger, localDay } from "@/lib/repository";
import { addDays } from "@/lib/schedule";
import { fmtMinutes, fmtWeight, foodTotal } from "@/lib/daylog";
import { Icon } from "./Icon";
import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Line,
  LineChart as RLineChart,
  ReferenceLine,
  XAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "./ui/chart";

// ---------------- Period selection ----------------

type Period = "week" | "month" | "year" | "all" | "custom";

const PERIODS: { value: Period; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

/** Inclusive [start, end] day window for a period. */
function periodRange(
  period: Period,
  today: string,
  custom: { from: string; to: string },
  earliest: string,
): { start: string; end: string } {
  switch (period) {
    case "week":
      return { start: addDays(today, -((new Date().getDay() + 6) % 7)), end: today };
    case "month":
      return { start: `${today.slice(0, 8)}01`, end: today };
    case "year":
      return { start: `${today.slice(0, 4)}-01-01`, end: today };
    case "all":
      return { start: earliest, end: today };
    case "custom":
      return { start: custom.from, end: custom.to };
  }
}

/** Every day from start..end inclusive (capped so huge ranges stay sane). */
function dayList(start: string, end: string): string[] {
  const out: string[] = [];
  let d = start;
  let guard = 0;
  while (d <= end && guard < 1500) {
    out.push(d);
    d = addDays(d, 1);
    guard += 1;
  }
  return out;
}

// ---------------- Chart primitives ----------------

type Point = { day: string; value: number | null };

const short = (day: string) => {
  const [, m, d] = day.split("-").map(Number);
  return `${m}/${d}`;
};

/** "Jun 10" for a YYYY-MM-DD day, used as the tooltip heading. */
const longDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

const CHART_H = "h-[150px] w-full aspect-auto";

function tipLabel(
  _: unknown,
  payload?: { payload?: Record<string, unknown> }[],
) {
  const day = payload?.[0]?.payload?.day;
  return typeof day === "string" ? longDay(day) : "";
}

/** shadcn/Recharts bar chart over a per-day series. */
function BarChart({
  data,
  color,
  goal,
  fmt = (v: number) => v.toLocaleString(),
}: {
  data: Point[];
  color: string;
  goal?: number;
  fmt?: (v: number) => string;
}) {
  const config: ChartConfig = { value: { label: "", color } };
  return (
    <ChartContainer config={config} className={CHART_H}>
      <RBarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          minTickGap={28}
          tickFormatter={short}
        />
        {goal !== undefined && goal > 0 && (
          <ReferenceLine
            y={goal}
            stroke="var(--ink-faint)"
            strokeDasharray="4 4"
          />
        )}
        <ChartTooltip
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
          content={
            <ChartTooltipContent
              hideIndicator
              labelFormatter={tipLabel}
              formatter={(v) => (
                <span className="font-mono font-medium tabular-nums text-[var(--ink)]">
                  {fmt(Number(v))}
                </span>
              )}
            />
          }
        />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
      </RBarChart>
    </ChartContainer>
  );
}

/** shadcn/Recharts line chart; null points are bridged. */
function LineChart({
  data,
  color,
  fmt = (v: number) => v.toLocaleString(),
}: {
  data: Point[];
  color: string;
  fmt?: (v: number) => string;
}) {
  const hasData = data.some((p) => p.value != null);
  if (!hasData)
    return (
      <div className="grid h-[150px] place-items-center text-sm font-medium text-ink-faint">
        No data in this period.
      </div>
    );
  const config: ChartConfig = { value: { label: "", color } };
  return (
    <ChartContainer config={config} className={CHART_H}>
      <RLineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          minTickGap={28}
          tickFormatter={short}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideIndicator
              labelFormatter={tipLabel}
              formatter={(v) => (
                <span className="font-mono font-medium tabular-nums text-[var(--ink)]">
                  {fmt(Number(v))}
                </span>
              )}
            />
          }
        />
        <Line
          dataKey="value"
          type="monotone"
          stroke={color}
          strokeWidth={2.5}
          dot={false}
          connectNulls
        />
      </RLineChart>
    </ChartContainer>
  );
}

/** A titled chart card with a headline stat. */
function ChartCard({
  title,
  icon,
  stat,
  children,
}: {
  title: string;
  icon: string;
  stat?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="clay flex flex-col gap-3 p-5" style={{ background: "var(--surface)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-bold">
          <Icon name={icon} className="h-4.5 w-4.5 text-ink-soft" />
          {title}
        </span>
        {stat && <span className="text-sm font-extrabold tabular-nums">{stat}</span>}
      </div>
      {children}
    </div>
  );
}

// ---------------- XP-by-source labels ----------------

const LEDGER_LABELS: Record<LedgerType, string> = {
  must_complete: "Must habits",
  bad_slip: "Bad slips",
  cool_achieve: "Cool goals",
  impossible_achieve: "Impossible goals",
  custom_complete: "Tasks",
  streak_milestone: "Streak milestones",
  food_penalty: "Food penalties",
  sleep_log: "Sleep",
  steps_log: "Steps",
  reading_log: "Reading",
  focus_log: "Focus",
  weight_log: "Weight",
  adjust: "Adjustments",
};

// ---------------- The view ----------------

export function Analytics() {
  const { dayLogs, tasks, completedOn, today, level, settings } = useStore();
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [period, setPeriod] = useState<Period>("month");
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today });
  const [pickDate, setPickDate] = useState(today);

  // Reload the ledger whenever underlying data changes (refs change on refresh).
  useEffect(() => {
    let alive = true;
    void getLedger().then((l) => alive && setLedger(l));
    return () => {
      alive = false;
    };
  }, [dayLogs, completedOn, level.totalXp]);

  // Earliest day we have any record of, for "All time".
  const earliest = useMemo(() => {
    let e = today;
    for (const l of dayLogs) if (l.date < e) e = l.date;
    for (const x of ledger) {
      const d = localDay(x.timestamp);
      if (d < e) e = d;
    }
    return e;
  }, [dayLogs, ledger, today]);

  const { start, end } = periodRange(period, today, custom, earliest);
  const days = useMemo(() => dayList(start, end), [start, end]);
  const inRange = (d: string) => d >= start && d <= end;

  // ---- Per-day series builders ----
  const logsByKindDay = useMemo(() => {
    const m = new Map<string, DayLog[]>();
    for (const l of dayLogs) {
      if (!inRange(l.date)) continue;
      const key = `${l.kind}:${l.date}`;
      (m.get(key) ?? m.set(key, []).get(key)!).push(l);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayLogs, start, end]);

  const sumField = (kind: DayLog["kind"], field: "minutes" | "steps" | "caloriesBurnt") =>
    days.map((day) => {
      const ls = logsByKindDay.get(`${kind}:${day}`) ?? [];
      return { day, value: ls.reduce((s, l) => s + ((l[field] as number) ?? 0), 0) };
    });

  const caloriesSeries: Point[] = days.map((day) => {
    const ls = logsByKindDay.get(`food:${day}`) ?? [];
    return { day, value: ls.length ? foodTotal(ls, "calories") : 0 };
  });

  const weightSeries: Point[] = days.map((day) => {
    const ls = logsByKindDay.get(`weight:${day}`) ?? [];
    const newest = ls.sort((a, b) => b.loggedAt - a.loggedAt)[0];
    return { day, value: newest ? newest.weightKg ?? null : null };
  });

  const stepsSeries = sumField("steps", "steps");
  const sleepSeries = sumField("sleep", "minutes");
  const focusSeries = sumField("focus", "minutes");
  const readingSeries = sumField("reading", "minutes");
  const burntSeries = sumField("steps", "caloriesBurnt");

  // XP per day + tasks completed per day (from ledger / completions).
  const xpByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of ledger) {
      const d = localDay(e.timestamp);
      if (inRange(d)) m.set(d, (m.get(d) ?? 0) + e.delta);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger, start, end]);
  const xpSeries: Point[] = days.map((day) => ({ day, value: xpByDay.get(day) ?? 0 }));

  const tasksByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const key of completedOn) {
      const date = key.slice(key.indexOf(":") + 1);
      if (inRange(date)) m.set(date, (m.get(date) ?? 0) + 1);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedOn, start, end]);
  const tasksSeries: Point[] = days.map((day) => ({ day, value: tasksByDay.get(day) ?? 0 }));

  // XP by source (totals over the period).
  const xpBySource = useMemo(() => {
    const m = new Map<LedgerType, number>();
    for (const e of ledger) {
      if (!inRange(localDay(e.timestamp))) continue;
      m.set(e.type, (m.get(e.type) ?? 0) + e.delta);
    }
    return [...m.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger, start, end]);
  const xpSourceMax = Math.max(1, ...xpBySource.map(([, v]) => Math.abs(v)));

  const sum = (s: Point[]) => s.reduce((n, p) => n + (p.value ?? 0), 0);
  const avg = (s: Point[]) => {
    const vals = s.filter((p) => p.value != null && p.value !== 0);
    return vals.length ? Math.round(sum(s) / vals.length) : 0;
  };

  // ---- Day explorer ----
  const logsOnDate = dayLogs
    .filter((l) => l.date === pickDate)
    .sort((a, b) => b.loggedAt - a.loggedAt);
  const eventsOnDate = ledger
    .filter((e) => localDay(e.timestamp) === pickDate)
    .sort((a, b) => b.timestamp - a.timestamp);

  const logSummary = (l: DayLog): string => {
    switch (l.kind) {
      case "food":
        return `${l.name ?? "Food"} · ${l.calories ?? 0} kcal`;
      case "sleep":
        return `Sleep · ${fmtMinutes(l.minutes ?? 0)}`;
      case "steps":
        return `${(l.steps ?? 0).toLocaleString()} steps${l.caloriesBurnt ? ` · ${l.caloriesBurnt} kcal` : ""}`;
      case "reading":
        return `Reading · ${fmtMinutes(l.minutes ?? 0)}`;
      case "focus":
        return `${l.name ?? "Focus"} · ${fmtMinutes(l.minutes ?? 0)}`;
      case "weight":
        return `Weight · ${fmtWeight(l.weightKg ?? 0, settings.weightUnit)}`;
    }
  };

  const taskCount = tasks.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Header + period selector */}
      <div className="flex flex-wrap items-center gap-4 p-5 clay" style={{ background: "var(--surface)" }}>
        <div
          className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white"
          style={{ background: "var(--primary)" }}
        >
          <Icon name="ChartColumn" className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight">Analytics</h1>
          <p className="text-sm font-medium text-ink-soft">
            Every metric, charted. Pick a period or explore a single day.
          </p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          aria-label="Time period"
          className="rounded-xl bg-page-2 px-3 py-2 text-sm font-bold text-ink-soft outline-none"
          style={{ cursor: "pointer" }}
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {period === "custom" && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-2xl p-3 text-sm font-semibold text-ink-soft"
          style={{ background: "var(--surface)", boxShadow: "var(--clay-sm)" }}
        >
          <input
            type="date"
            value={custom.from}
            max={custom.to}
            onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
            aria-label="From date"
            className="rounded-xl bg-page-2 px-3 py-1.5 text-ink outline-none"
          />
          <span>–</span>
          <input
            type="date"
            value={custom.to}
            min={custom.from}
            onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
            aria-label="To date"
            className="rounded-xl bg-page-2 px-3 py-1.5 text-ink outline-none"
          />
        </div>
      )}

      {/* Headline tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Level" value={String(level.level)} />
        <Tile label="Total XP" value={level.totalXp.toLocaleString()} />
        <Tile label="XP this period" value={sum(xpSeries).toLocaleString()} />
        <Tile label="Active tasks" value={String(taskCount)} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="XP earned" icon="Zap" stat={`${sum(xpSeries).toLocaleString()} total`}>
          <BarChart data={xpSeries} color="var(--primary)" fmt={(v) => `${v.toLocaleString()} XP`} />
        </ChartCard>

        <ChartCard title="Tasks completed" icon="CheckCheck" stat={`${sum(tasksSeries)} total`}>
          <BarChart data={tasksSeries} color="var(--cool-acc)" />
        </ChartCard>

        <ChartCard title="Calories" icon="Flame" stat={`${avg(caloriesSeries)} kcal/day avg`}>
          <BarChart
            data={caloriesSeries}
            color="var(--must-acc)"
            goal={settings.calorieLimit}
            fmt={(v) => `${v.toLocaleString()} kcal`}
          />
        </ChartCard>

        <ChartCard title="Weight" icon="Scale" stat={weightStat(weightSeries, settings.weightUnit)}>
          <LineChart
            data={weightSeries}
            color="var(--imp-acc)"
            fmt={(v) => fmtWeight(v, settings.weightUnit)}
          />
        </ChartCard>

        <ChartCard title="Focus" icon="Timer" stat={fmtMinutes(sum(focusSeries)) || "0m"}>
          <BarChart data={focusSeries} color="var(--accent)" fmt={(v) => fmtMinutes(v) || "0m"} />
        </ChartCard>

        <ChartCard title="Sleep" icon="Moon" stat={`${fmtMinutes(avg(sleepSeries)) || "0m"} avg`}>
          <BarChart data={sleepSeries} color="var(--imp-acc)" goal={450} fmt={(v) => fmtMinutes(v) || "0m"} />
        </ChartCard>

        <ChartCard title="Steps" icon="Footprints" stat={`${sum(stepsSeries).toLocaleString()} total`}>
          <BarChart data={stepsSeries} color="var(--cool-acc)" fmt={(v) => v.toLocaleString()} />
        </ChartCard>

        <ChartCard title="Calories burnt (walking)" icon="Gauge" stat={`${sum(burntSeries).toLocaleString()} kcal`}>
          <BarChart data={burntSeries} color="var(--cool-acc)" fmt={(v) => `${v.toLocaleString()} kcal`} />
        </ChartCard>

        <ChartCard title="Reading" icon="BookOpen" stat={fmtMinutes(sum(readingSeries)) || "0m"}>
          <BarChart data={readingSeries} color="var(--primary)" fmt={(v) => fmtMinutes(v) || "0m"} />
        </ChartCard>

        {/* XP by source */}
        <ChartCard title="XP by source" icon="ChartColumn">
          {xpBySource.length === 0 ? (
            <p className="text-sm font-medium text-ink-faint">No XP events in this period.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {xpBySource.map(([type, val]) => (
                <div key={type} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-xs font-semibold text-ink-soft">
                    {LEDGER_LABELS[type]}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full" style={{ background: "var(--page-2)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(Math.abs(val) / xpSourceMax) * 100}%`,
                        background: val < 0 ? "var(--bad-acc)" : "var(--primary)",
                      }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right text-xs font-bold tabular-nums">
                    {val > 0 ? "+" : ""}
                    {val.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Day explorer */}
      <div className="clay flex flex-col gap-3 p-5" style={{ background: "var(--surface)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-bold">
            <Icon name="CalendarClock" className="h-4.5 w-4.5 text-ink-soft" />
            Find a day
          </span>
          <input
            type="date"
            value={pickDate}
            max={today}
            onChange={(e) => setPickDate(e.target.value)}
            aria-label="Pick a date"
            className="rounded-xl bg-page-2 px-3 py-1.5 text-sm font-semibold text-ink outline-none"
          />
        </div>

        {logsOnDate.length === 0 && eventsOnDate.length === 0 ? (
          <p className="text-sm font-medium text-ink-faint">Nothing logged on this day.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-faint">Logs</p>
              {logsOnDate.length === 0 ? (
                <p className="text-sm font-medium text-ink-faint">No daily-log entries.</p>
              ) : (
                logsOnDate.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between gap-2 rounded-xl px-3 py-2"
                    style={{ background: "var(--page-2)" }}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{logSummary(l)}</span>
                    {l.awardedXp !== 0 && (
                      <span
                        className="shrink-0 text-xs font-bold tabular-nums"
                        style={{ color: l.awardedXp > 0 ? "var(--primary)" : "var(--bad-acc)" }}
                      >
                        {l.awardedXp > 0 ? "+" : ""}
                        {l.awardedXp}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-faint">XP events</p>
              {eventsOnDate.length === 0 ? (
                <p className="text-sm font-medium text-ink-faint">No XP events.</p>
              ) : (
                eventsOnDate.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-2 rounded-xl px-3 py-2"
                    style={{ background: "var(--page-2)" }}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {e.meta ?? LEDGER_LABELS[e.type]}
                    </span>
                    <span
                      className="shrink-0 text-xs font-bold tabular-nums"
                      style={{ color: e.delta >= 0 ? "var(--primary)" : "var(--bad-acc)" }}
                    >
                      {e.delta > 0 ? "+" : ""}
                      {e.delta}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="clay flex flex-col gap-1 p-4" style={{ background: "var(--surface)" }}>
      <span className="text-xs font-semibold text-ink-faint">{label}</span>
      <span className="text-2xl font-extrabold tabular-nums">{value}</span>
    </div>
  );
}

function weightStat(series: Point[], unit: "kg" | "lbs"): string {
  const vals = series.filter((p) => p.value != null) as { value: number }[];
  if (vals.length === 0) return "—";
  return fmtWeight(vals[vals.length - 1].value, unit);
}
