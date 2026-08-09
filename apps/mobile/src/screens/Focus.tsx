/**
 * Focus — ported from the Quickshell FocusView (Adilzhan approved the full
 * scope in `.lavish/grit-focus-redesign.html`, 2026-08-09): one layout for
 * idle and running with the ring always the hero, then the analytics the
 * desktop widget has — progression title card with set dots, stacked
 * per-task analysis chart (Last 7 / Weekly / Monthly / Yearly), task
 * breakdown donut with legend, and a vertical activity heatmap (weeks flow
 * downward in two strips). Desktop interactions become touch: hover → tap
 * (bars and heat cells pin a detail line), right-click → long-press (unsave
 * a task chip). The FocusAlarm overlay still owns phase-end choices; the
 * recent-session history stays at the bottom, trimmed to 5 days.
 */
import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import {
  FOCUS_SET_SIZE,
  FOCUS_SET_XP,
  addDays,
  fmtMinutes,
  focusElapsed,
  focusElapsedMs,
  focusPhaseEnd,
  focusRemainingMs,
  focusTitle,
  focusXp,
  mondayOf,
  nextFocusTitle,
  type DayLog,
} from "@grit/core";
import { useStore } from "../lib/store";
import { C, EDGE, R, TOP_BAR_SPACE, claySm, glow } from "../theme";
import { Card, NumberField, PrimaryButton, SectionTitle, TextField, Txt } from "../components/ui";
import { Icon } from "../components/Icon";
import { PopIn } from "../components/anim";
import { useConfirm } from "../components/ConfirmDialog";

const num = (s: string) => Math.max(0, Math.round(Number(s) || 0));
const PRESETS = [
  { label: "Classic", focus: 25, rest: 5 },
  { label: "Deep", focus: 50, rest: 10 },
];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];
/** Stable series palette; tasks past the last slot fold into gray. */
const SERIES = [C.chart1, C.chart2, C.chart3, C.chart4, C.chart5];
const SERIES_OTHER = "rgba(255,255,255,0.25)";

const clock = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** "Aug 9" for a YYYY-MM-DD. */
const fmtDay = (day: string) => `${MONTHS_SHORT[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;

type ChartMode = "7d" | "week" | "month" | "year";
const CHART_MODES: { v: ChartMode; l: string }[] = [
  { v: "7d", l: "Last 7" },
  { v: "week", l: "Weekly" },
  { v: "month", l: "Monthly" },
  { v: "year", l: "Yearly" },
];

type ChartRow = { label: string; minutes: number; perTask: Record<string, number> };

export function Focus() {
  const {
    dayLogs, settings, today, now, activeFocus,
    startFocusSession, cancelFocusSession, saveFocusSession, pauseFocusSession, resumeFocusSession,
    addFocusTask, removeFocusTask, removeDayLog,
  } = useStore();
  const confirm = useConfirm();
  const [task, setTask] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>("7d");
  const [bucket, setBucket] = useState<number>(-1);
  const [heatRange, setHeatRange] = useState<"last" | number>("last");
  const [heatSel, setHeatSel] = useState<string | null>(null);

  // ---------------- data ----------------
  const focusLogs = dayLogs.filter((l) => l.kind === "focus");
  const loggedNames = [...new Set(focusLogs.map((l) => l.name).filter(Boolean) as string[])];
  const allTasks = [...settings.focusTasks, ...loggedNames.filter((n) => !settings.focusTasks.includes(n))];

  const todayFocus = focusLogs.filter((l) => l.date === today);
  const todayCount = todayFocus.length;
  const todayMinutes = todayFocus.reduce((s, l) => s + (l.minutes ?? 0), 0);
  const totalMinutes = focusLogs.reduce((s, l) => s + (l.minutes ?? 0), 0);
  const totalHours = totalMinutes / 60;

  const minutesByDay = new Map<string, number>();
  const minutesByDayTask = new Map<string, Record<string, number>>();
  for (const l of focusLogs) {
    const t = l.name ?? "Focus";
    minutesByDay.set(l.date, (minutesByDay.get(l.date) ?? 0) + (l.minutes ?? 0));
    const per = minutesByDayTask.get(l.date) ?? {};
    per[t] = (per[t] ?? 0) + (l.minutes ?? 0);
    minutesByDayTask.set(l.date, per);
  }

  // ---------------- analysis window ----------------
  let windowStart: string;
  if (chartMode === "7d") windowStart = addDays(today, -6);
  else if (chartMode === "week") windowStart = addDays(mondayOf(today), -49);
  else if (chartMode === "month") {
    const y = Number(today.slice(0, 4));
    const m = Number(today.slice(5, 7));
    let mm = m - 11, yy = y;
    while (mm < 1) { mm += 12; yy -= 1; }
    windowStart = `${yy}-${String(mm).padStart(2, "0")}-01`;
  } else windowStart = `${today.slice(0, 4)}-01-01`;

  // Per-task minutes in the window — the donut, and the bars' color order.
  const byTask: Record<string, number> = {};
  for (const l of focusLogs) {
    if (l.date < windowStart) continue;
    const key = l.name ?? "Focus";
    byTask[key] = (byTask[key] ?? 0) + (l.minutes ?? 0);
  }
  const breakdown = Object.keys(byTask)
    .map((k) => ({ label: k, value: byTask[k] }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const breakdownTotal = breakdown.reduce((s, d) => s + d.value, 0);
  const taskColor = (name: string) => {
    const i = breakdown.findIndex((d) => d.label === name);
    return i < 0 ? SERIES_OTHER : i < SERIES.length ? SERIES[i] : SERIES_OTHER;
  };

  // ---------------- chart buckets ----------------
  const chartData: ChartRow[] = [];
  const makeRow = (label: string): ChartRow => ({ label, minutes: 0, perTask: {} });
  const addDayTo = (row: ChartRow, day: string) => {
    const per = minutesByDayTask.get(day);
    if (!per) return;
    for (const t in per) {
      row.perTask[t] = (row.perTask[t] ?? 0) + per[t];
      row.minutes += per[t];
    }
  };
  const addPrefixTo = (row: ChartRow, prefix: string) => {
    for (const [day] of minutesByDayTask) if (day.startsWith(prefix)) addDayTo(row, day);
  };
  if (chartMode === "7d") {
    for (let i = 6; i >= 0; i--) {
      const day = addDays(today, -i);
      const row = makeRow(WD_INITIALS[(new Date(day).getDay() + 6) % 7]);
      addDayTo(row, day);
      chartData.push(row);
    }
  } else if (chartMode === "week") {
    const thisMonday = mondayOf(today);
    for (let w = 7; w >= 0; w--) {
      const monday = addDays(thisMonday, -7 * w);
      const row = makeRow(`${Number(monday.slice(8, 10))}.${monday.slice(5, 7)}`);
      for (let d = 0; d < 7; d++) addDayTo(row, addDays(monday, d));
      chartData.push(row);
    }
  } else if (chartMode === "month") {
    const y = Number(today.slice(0, 4));
    const m = Number(today.slice(5, 7));
    for (let i = 11; i >= 0; i--) {
      let mm = m - i, yy = y;
      while (mm < 1) { mm += 12; yy -= 1; }
      const row = makeRow(MONTHS_SHORT[mm - 1]);
      addPrefixTo(row, `${yy}-${String(mm).padStart(2, "0")}`);
      chartData.push(row);
    }
  } else {
    const years = new Set<string>([today.slice(0, 4)]);
    for (const [day] of minutesByDayTask) years.add(day.slice(0, 4));
    for (const yr of [...years].sort()) {
      const row = makeRow(yr);
      addPrefixTo(row, yr);
      chartData.push(row);
    }
  }
  const chartMax = Math.max(1, ...chartData.map((d) => d.minutes));
  const selBucket = bucket >= 0 && bucket < chartData.length ? chartData[bucket] : null;

  // ---------------- heatmap ----------------
  const heatYears = [...new Set([Number(today.slice(0, 4)), ...focusLogs.map((l) => Number(l.date.slice(0, 4)))])]
    .sort((a, b) => b - a)
    .slice(0, 3);
  const heatStart = heatRange === "last" ? addDays(today, -364) : `${heatRange}-01-01`;
  const heatEnd = heatRange === "last" || heatRange === Number(today.slice(0, 4)) ? today : `${heatRange}-12-31`;
  const heatWeeks: string[] = [];
  for (let w = mondayOf(heatStart); w <= heatEnd; w = addDays(w, 7)) heatWeeks.push(w);
  const weeksPerStrip = Math.ceil(heatWeeks.length / 2);
  const heatRangeMinutes = [...minutesByDay].reduce(
    (s, [day, min]) => (day >= heatStart && day <= heatEnd ? s + min : s), 0);
  // Same intensity ramp as Quickshell/web: <30, <60, <120, 120+ minutes.
  const heatColor = (min: number) => {
    if (min <= 0) return C.page2;
    const a = min < 30 ? 0.25 : min < 60 ? 0.48 : min < 120 ? 0.72 : 1;
    return `rgba(255,122,26,${a})`;
  };
  // Month label per row: strip starts get "MMM yy", then on month change.
  const heatRowLabels: Record<number, string> = {};
  {
    let prevMonth = "";
    let lastLabelAt = -3;
    heatWeeks.forEach((monday, wi) => {
      const month = monday.slice(0, 7);
      const stripStart = wi % weeksPerStrip === 0;
      if (stripStart || (month !== prevMonth && wi - lastLabelAt >= 3)) {
        const name = MONTHS_SHORT[Number(month.slice(5, 7)) - 1];
        heatRowLabels[wi] = stripStart ? `${name} ${monday.slice(2, 4)}` : name;
        lastLabelAt = wi;
      }
      prevMonth = month;
    });
  }

  // ---------------- history (5 days) ----------------
  const byDate = new Map<string, DayLog[]>();
  for (const l of focusLogs) byDate.set(l.date, [...(byDate.get(l.date) ?? []), l]);
  const dates = [...byDate.keys()].sort().reverse().slice(0, 5);

  // ---------------- running state ----------------
  const running = activeFocus != null;
  const isFocus = running && activeFocus.phase === "focus";
  const paused = running && activeFocus.pausedAt != null;
  const phaseOver = running && focusElapsed(activeFocus, now);
  const leftMs = running ? focusRemainingMs(activeFocus, now) : 0;
  const leftMin = Math.floor(leftMs / 60_000);
  const leftSec = Math.floor((leftMs % 60_000) / 1000);
  const ringColor = paused ? C.inkFaint : isFocus || !running ? C.accent : C.coolAcc;
  const frac = running
    ? 1 - leftMs / Math.max(1, (isFocus ? activeFocus.focusMin : activeFocus.restMin) * 60_000)
    : 0;
  const canSave = running && isFocus && Math.floor(focusElapsedMs(activeFocus, now) / 60_000) >= 1;

  const start = (f: number, r: number) => void startFocusSession(f, r, task ?? undefined);

  const next = nextFocusTitle(totalHours);

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingTop: TOP_BAR_SPACE + 16, gap: 12, paddingBottom: 140 }}
      keyboardShouldPersistTaps="handled"
    >
      {running ? (
        <View
          style={{
            flexDirection: "row", alignItems: "center", alignSelf: "center", gap: 7, marginTop: 4,
            backgroundColor: paused ? "rgba(255,255,255,0.07)" : isFocus ? "rgba(255,122,26,0.14)" : "rgba(45,212,191,0.12)",
            borderWidth: 1,
            borderColor: paused ? EDGE : isFocus ? "rgba(255,122,26,0.45)" : "rgba(45,212,191,0.4)",
            borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 7,
          }}
        >
          <Icon name={paused ? "Pause" : isFocus ? "Timer" : "Coffee"} size={15} color={ringColor} />
          <Txt weight="extrabold" color={ringColor} size={12} style={{ textTransform: "uppercase", letterSpacing: 1.5 }}>
            {paused ? "Paused" : isFocus ? "Focus" : "Rest"}
            {activeFocus.label ? ` · ${activeFocus.label}` : ""}
          </Txt>
        </View>
      ) : (
        <Txt size={24} weight="extrabold">Focus</Txt>
      )}

      {/* ---------------- ring (always) ---------------- */}
      <View style={{ alignItems: "center", marginTop: running ? 10 : 2 }}>
        <Ring frac={frac} color={ringColor} size={running ? 230 : 190} glowing={running && !paused}>
          {running ? (
            <>
              <Txt size={50} weight="extrabold" style={{ fontVariant: ["tabular-nums"] }}>
                {leftMin}:{String(leftSec).padStart(2, "0")}
              </Txt>
              <Txt size={12} weight="semibold" color={C.inkFaint}>
                {clock(activeFocus.startedAt)} – {clock(focusPhaseEnd(activeFocus))}
                {isFocus ? ` · +${focusXp(activeFocus.focusMin)} XP` : ""}
              </Txt>
            </>
          ) : (
            <>
              <Txt size={42} weight="extrabold" color={C.inkSoft}>--:--</Txt>
              <Txt size={12} weight="semibold" color={C.inkFaint}>idle</Txt>
            </>
          )}
        </Ring>
      </View>

      {running ? (
        /* ---------------- running controls ---------------- */
        !phaseOver ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 4 }}>
            {canSave ? <GhostButton label="Save early" onPress={() => void saveFocusSession()} /> : null}
            <Pressable
              onPress={() => (paused ? resumeFocusSession() : pauseFocusSession())}
              style={[
                { width: 58, height: 58, borderRadius: 29, backgroundColor: ringColor, alignItems: "center", justifyContent: "center" },
                glow(ringColor, 12),
              ]}
            >
              <Icon name={paused ? "Play" : "Pause"} size={24} color={C.primaryDeep} />
            </Pressable>
            <GhostButton
              label={isFocus ? "Give up" : "Skip rest"}
              onPress={async () => {
                if (!isFocus) return void cancelFocusSession();
                if (await confirm({ title: "Give up this pomodoro?", message: "An abandoned session earns no XP.", confirmLabel: "Give up" }))
                  void cancelFocusSession();
              }}
            />
          </View>
        ) : null /* full-screen FocusAlarm owns the phase-end choices */
      ) : (
        /* ---------------- idle: presets + tasks + start ---------------- */
        <>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            {PRESETS.map((p) => (
              <Pressable
                key={p.label}
                onPress={() => start(p.focus, p.rest)}
                style={[{ borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.accent }, glow(C.accent, 7)]}
              >
                <Txt weight="extrabold" size={13} color={C.primaryDeep}>{p.label} {p.focus}/{p.rest}</Txt>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setCustomOpen(true)}
              style={{ width: 41, height: 41, borderRadius: R.pill, borderWidth: 1, borderColor: EDGE, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" }}
            >
              <Icon name="Plus" size={18} color={C.inkSoft} />
            </Pressable>
          </View>

          <SectionTitle>Focus task</SectionTitle>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {allTasks.map((t) => {
              const on = task === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => setTask(on ? null : t)}
                  onLongPress={async () => {
                    if (await confirm({ title: `Unsave focus task "${t}"?`, message: "It stays on past logs and charts.", confirmLabel: "Remove" })) {
                      if (on) setTask(null);
                      void removeFocusTask(t);
                    }
                  }}
                  style={{
                    borderRadius: R.pill, paddingHorizontal: 13, paddingVertical: 7,
                    backgroundColor: on ? "rgba(255,122,26,0.16)" : C.page2,
                    borderWidth: 1, borderColor: on ? "rgba(255,122,26,0.45)" : EDGE,
                  }}
                >
                  <Txt weight="semibold" size={12.5} color={on ? C.accent : C.inkSoft}>{t}</Txt>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setNewTaskOpen(true)}
              style={{ borderRadius: R.pill, paddingHorizontal: 13, paddingVertical: 7, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", borderStyle: "dashed" }}
            >
              <Txt weight="semibold" size={12.5} color={C.inkFaint}>＋ New</Txt>
            </Pressable>
          </View>
        </>
      )}

      {/* ---------------- progression ---------------- */}
      <View style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: EDGE, borderRadius: 20, padding: 14, marginTop: 4 }, claySm()]}>
        <View style={{ flexShrink: 1 }}>
          <Txt size={17} weight="extrabold" color={C.accent}>{focusTitle(totalHours)}</Txt>
          <Txt size={11} weight="medium" color={C.inkFaint}>
            {fmtMinutes(totalMinutes) || "0m"} total{next ? ` · ${next.title} at ${next.hours}h` : ""}
          </Txt>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Txt size={12.5} weight="semibold">Today: {todayCount} · {fmtMinutes(todayMinutes) || "0m"}</Txt>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 }}>
            {Array.from({ length: FOCUS_SET_SIZE }, (_, i) => {
              const on = i < todayCount % FOCUS_SET_SIZE;
              return (
                <View
                  key={i}
                  style={[
                    { width: 9, height: 9, borderRadius: 5, backgroundColor: on ? C.accent : "rgba(255,255,255,0.12)" },
                    on ? glow(C.accent, 5) : {},
                  ]}
                />
              );
            })}
            <Txt size={10} weight="semibold" color={C.inkFaint} style={{ marginLeft: 3 }}>set +{FOCUS_SET_XP}</Txt>
          </View>
        </View>
      </View>

      {/* ---------------- analysis chart ---------------- */}
      <SectionTitle>Analysis</SectionTitle>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        {CHART_MODES.map((m) => {
          const on = chartMode === m.v;
          return (
            <Pressable
              key={m.v}
              onPress={() => { setChartMode(m.v); setBucket(-1); }}
              style={{
                borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6,
                backgroundColor: on ? "rgba(255,122,26,0.16)" : C.page2,
                borderWidth: 1, borderColor: on ? "rgba(255,122,26,0.4)" : "transparent",
              }}
            >
              <Txt size={12} weight="bold" color={on ? C.accent : C.inkSoft}>{m.l}</Txt>
            </Pressable>
          );
        })}
      </View>
      <Card style={{ padding: 13 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 110 }}>
          {chartData.map((row, i) => {
            const h = Math.max(3, 100 * (row.minutes / chartMax));
            const dimmed = bucket >= 0 && bucket !== i;
            return (
              <Pressable
                key={`${row.label}-${i}`}
                onPress={() => setBucket(bucket === i ? -1 : i)}
                style={{ flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center" }}
              >
                <View style={{ width: "100%", maxWidth: 26, height: `${h}%`, borderRadius: 5, overflow: "hidden", opacity: dimmed ? 0.45 : 1, backgroundColor: row.minutes > 0 ? "transparent" : C.page2, flexDirection: "column" }}>
                  {breakdown
                    .filter((d) => (row.perTask[d.label] ?? 0) > 0)
                    .map((d) => (
                      <View key={d.label} style={{ flex: row.perTask[d.label], backgroundColor: taskColor(d.label) }} />
                    ))}
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
          {chartData.map((row, i) => (
            <Txt key={`${row.label}-${i}`} size={9.5} weight="semibold" color={bucket === i ? C.accent : C.inkFaint} style={{ flex: 1, textAlign: "center" }}>
              {row.label}
            </Txt>
          ))}
        </View>
        {selBucket ? (
          <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: EDGE, paddingTop: 9, gap: 5 }}>
            <Txt size={12} weight="extrabold">{selBucket.label} · {fmtMinutes(selBucket.minutes) || "0m"}</Txt>
            {breakdown
              .filter((d) => (selBucket.perTask[d.label] ?? 0) > 0)
              .map((d) => (
                <View key={d.label} style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: taskColor(d.label) }} />
                  <Txt size={12} weight="semibold" color={C.inkSoft} style={{ flex: 1 }} numberOfLines={1}>{d.label}</Txt>
                  <Txt size={12} weight="bold" color={C.inkSoft}>{fmtMinutes(selBucket.perTask[d.label])}</Txt>
                </View>
              ))}
          </View>
        ) : null}
      </Card>

      {/* ---------------- task breakdown donut ---------------- */}
      <SectionTitle>Task breakdown</SectionTitle>
      <Card style={{ padding: 14 }}>
        {breakdown.length === 0 ? (
          <Txt size={13} weight="medium" color={C.inkFaint} style={{ textAlign: "center", paddingVertical: 14 }}>
            No focus in this period.
          </Txt>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <Donut data={breakdown.map((d) => ({ value: d.value, color: taskColor(d.label) }))}>
              <Txt size={15} weight="extrabold">{fmtMinutes(breakdownTotal)}</Txt>
              <Txt size={9} weight="bold" color={C.inkFaint} style={{ letterSpacing: 1 }}>FOCUSED</Txt>
            </Donut>
            <View style={{ flex: 1 }}>
              {breakdown.map((d, i) => (
                <View
                  key={d.label}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: "rgba(255,255,255,0.05)" }}
                >
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: taskColor(d.label) }} />
                  <Txt size={12} weight="semibold" style={{ flex: 1 }} numberOfLines={1}>{d.label}</Txt>
                  <Txt size={11.5} weight="medium" color={C.inkFaint} style={{ fontVariant: ["tabular-nums"] }}>
                    {fmtMinutes(d.value)} · {Math.round((d.value / Math.max(1, breakdownTotal)) * 100)}%
                  </Txt>
                </View>
              ))}
            </View>
          </View>
        )}
      </Card>

      {/* ---------------- activity heatmap ---------------- */}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <SectionTitle>Activity</SectionTitle>
        <Txt size={11} weight="semibold" color={C.inkFaint}>{fmtMinutes(heatRangeMinutes) || "0m"} focused</Txt>
      </View>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        {(["last", ...heatYears] as ("last" | number)[]).map((r) => {
          const on = heatRange === r;
          return (
            <Pressable
              key={String(r)}
              onPress={() => { setHeatRange(r); setHeatSel(null); }}
              style={{
                borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6,
                backgroundColor: on ? "rgba(255,122,26,0.16)" : C.page2,
                borderWidth: 1, borderColor: on ? "rgba(255,122,26,0.4)" : "transparent",
              }}
            >
              <Txt size={12} weight="bold" color={on ? C.accent : C.inkSoft}>{r === "last" ? "Last year" : String(r)}</Txt>
            </Pressable>
          );
        })}
      </View>
      <Card style={{ padding: 14 }}>
        <View style={{ flexDirection: "row", gap: 14 }}>
          {[0, 1].map((stripIdx) => {
            const offset = stripIdx * weeksPerStrip;
            return (
              <View key={stripIdx} style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", gap: 3, marginBottom: 3 }}>
                  <View style={{ width: 34 }} />
                  {WD_INITIALS.map((w, i) => (
                    <Txt key={i} size={8.5} weight="semibold" color={C.inkFaint} style={{ width: 13, textAlign: "center" }}>{w}</Txt>
                  ))}
                </View>
                {heatWeeks.slice(offset, offset + weeksPerStrip).map((monday, wi) => (
                  <View key={monday} style={{ flexDirection: "row", gap: 3, marginBottom: 3, alignItems: "center" }}>
                    <Txt size={8.5} weight="semibold" color={C.inkFaint} style={{ width: 34, textAlign: "right", paddingRight: 2 }}>
                      {heatRowLabels[offset + wi] ?? ""}
                    </Txt>
                    {Array.from({ length: 7 }, (_, di) => {
                      const day = addDays(monday, di);
                      const inRange = day >= heatStart && day <= heatEnd;
                      const min = minutesByDay.get(day) ?? 0;
                      const isToday = day === today;
                      const isSel = heatSel === day;
                      return (
                        <Pressable
                          key={di}
                          disabled={!inRange}
                          onPress={() => setHeatSel(isSel ? null : day)}
                          style={{
                            width: 13, height: 13, borderRadius: 3,
                            backgroundColor: inRange ? heatColor(min) : "transparent",
                            borderWidth: isToday || isSel ? 1.5 : 0,
                            borderColor: isSel ? C.ink : C.accent,
                          }}
                        />
                      );
                    })}
                  </View>
                ))}
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }}>
          <Txt size={10} weight="medium" color={C.inkFaint} style={{ flex: 1 }}>
            {heatSel ? `${fmtDay(heatSel)} · ${fmtMinutes(minutesByDay.get(heatSel) ?? 0) || "0m"}` : `start ${fmtDay(heatStart)}`}
          </Txt>
          <Txt size={10} weight="medium" color={C.inkFaint}>less</Txt>
          {[0, 15, 45, 90, 150].map((m) => (
            <View key={m} style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: heatColor(m) }} />
          ))}
          <Txt size={10} weight="medium" color={C.inkFaint}>more</Txt>
          <Txt size={10} weight="semibold" color={C.accent} style={{ flex: 1, textAlign: "right" }}>
            {heatEnd === today ? "today ◉" : fmtDay(heatEnd)}
          </Txt>
        </View>
      </Card>

      {/* ---------------- history (5 days) ---------------- */}
      {dates.length > 0 ? (
        <Card>
          <SectionTitle>Recent sessions</SectionTitle>
          <View style={{ marginTop: 8, gap: 12 }}>
            {dates.map((d) => (
              <View key={d} style={{ gap: 6 }}>
                <Txt size={12} weight="bold" color={C.inkFaint}>{fmtDay(d)}</Txt>
                {[...byDate.get(d)!].sort((a, b) => b.loggedAt - a.loggedAt).map((l) => {
                  const s = l.loggedAt - (l.minutes ?? 0) * 60_000;
                  return (
                    <View key={l.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ width: 28, height: 28, borderRadius: R.pill, backgroundColor: "rgba(255,122,26,0.14)", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="Timer" size={14} color={C.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Txt size={11.5} weight="medium" color={C.inkFaint}>{clock(s)} – {clock(l.loggedAt)}</Txt>
                        <Txt size={13.5} weight="bold">{l.name ?? "Focus"}</Txt>
                      </View>
                      <Txt weight="bold" size={13} color={C.inkSoft}>{fmtMinutes(l.minutes ?? 0)}</Txt>
                      <Pressable
                        onPress={async () => {
                          if (await confirm({ title: "Delete this focus session?", message: "Its XP will be reversed.", confirmLabel: "Delete" }))
                            void removeDayLog(l.id);
                        }}
                        hitSlop={8}
                        style={{ padding: 2 }}
                      >
                        <Icon name="Trash2" size={16} color={C.inkFaint} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <CustomTimerModal open={customOpen} onClose={() => setCustomOpen(false)} onStart={start} />
      <NewTaskModal
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        onAdd={(name) => { void addFocusTask(name); setTask(name); }}
      />
    </ScrollView>
  );
}

function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ borderRadius: R.sm, paddingHorizontal: 17, paddingVertical: 12, backgroundColor: C.page2, borderWidth: 1, borderColor: EDGE }}
    >
      <Txt weight="bold" size={13} color={C.inkSoft}>{label}</Txt>
    </Pressable>
  );
}

function Ring({
  frac, color, size, glowing, children,
}: {
  frac: number; color: string; size: number; glowing?: boolean; children: React.ReactNode;
}) {
  const stroke = size >= 220 ? 13 : 10;
  const rad = (size - stroke) / 2;
  const circ = 2 * Math.PI * rad;
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, glowing ? glow(color, 16) : {}]}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={rad} stroke="rgba(255,255,255,0.09)" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={rad} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.min(1, Math.max(0, frac)))}
        />
      </Svg>
      <View style={{ alignItems: "center", gap: 2 }}>{children}</View>
    </View>
  );
}

/** Donut from stroked circle segments (same technique as the XP ring). */
function Donut({ data, children }: { data: { value: number; color: string }[]; children: React.ReactNode }) {
  const size = 110, stroke = 17;
  const rad = (size - stroke) / 2;
  const circ = 2 * Math.PI * rad;
  const total = Math.max(1, data.reduce((s, d) => s + d.value, 0));
  let acc = 0;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        {data.map((d, i) => {
          const frac = d.value / total;
          const seg = (
            <Circle
              key={i}
              cx={size / 2} cy={size / 2} r={rad} stroke={d.color} strokeWidth={stroke} fill="none"
              strokeDasharray={`${Math.max(0, frac * circ - 2)} ${circ}`}
              strokeDashoffset={-acc * circ}
            />
          );
          acc += frac;
          return seg;
        })}
      </Svg>
      <View style={{ alignItems: "center" }}>{children}</View>
    </View>
  );
}

/** Custom focus/rest minutes — pop-in dialog, like Quickshell's. */
function CustomTimerModal({ open, onClose, onStart }: { open: boolean; onClose: () => void; onStart: (f: number, r: number) => void }) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      {open ? <CustomTimerForm onClose={onClose} onStart={onStart} /> : null}
    </Modal>
  );
}

function CustomTimerForm({ onClose, onStart }: { onClose: () => void; onStart: (f: number, r: number) => void }) {
  const [f, setF] = useState("25");
  const [r, setR] = useState("5");
  const go = () => {
    if (num(f) <= 0) return;
    onStart(num(f), num(r));
    onClose();
  };
  return (
    <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <PopIn>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[{ width: "100%", maxWidth: 320, backgroundColor: C.surface, borderRadius: R.md, padding: 22, gap: 14 }, claySm()]}
        >
          <Txt size={18} weight="extrabold">Custom timer</Txt>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <NumberField label="Focus" value={f} onChange={setF} suffix="min" width={110} />
            <NumberField label="Rest" value={r} onChange={setR} suffix="min" width={110} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
            <PrimaryButton label="Start" onPress={go} disabled={num(f) <= 0} />
          </View>
        </Pressable>
      </PopIn>
    </Pressable>
  );
}

/** Name a new focus task — pop-in dialog, selects it on add. */
function NewTaskModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (name: string) => void }) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      {open ? <NewTaskForm onClose={onClose} onAdd={onAdd} /> : null}
    </Modal>
  );
}

function NewTaskForm({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  const go = () => {
    const n = name.trim();
    if (!n) return;
    onAdd(n);
    onClose();
  };
  return (
    <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <PopIn>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[{ width: "100%", maxWidth: 340, backgroundColor: C.surface, borderRadius: R.md, padding: 22, gap: 14 }, claySm()]}
        >
          <Txt size={18} weight="extrabold">New focus task</Txt>
          <TextField value={name} onChange={setName} placeholder="e.g. Learn German" onSubmit={go} />
          <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
            <PrimaryButton label="Add" onPress={go} disabled={!name.trim()} />
          </View>
        </Pressable>
      </PopIn>
    </Pressable>
  );
}
