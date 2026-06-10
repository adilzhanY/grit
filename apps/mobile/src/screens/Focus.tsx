import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { addDays, fmtMinutes, focusXp, type DayLog } from "@grit/core";
import { useStore } from "../lib/store";
import { C, R, claySm } from "../theme";
import { Card, NumberField, PrimaryButton, SectionTitle, TextField, Txt } from "../components/ui";
import { Icon } from "../components/Icon";
import { useConfirm } from "../components/ConfirmDialog";

const num = (s: string) => Math.max(0, Math.round(Number(s) || 0));
const PRESETS = [
  { label: "Classic", focus: 25, rest: 5 },
  { label: "Deep", focus: 50, rest: 10 },
];

const clock = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

type Period = "today" | "week" | "month" | "year" | "all";
const PERIODS: { v: Period; l: string }[] = [
  { v: "today", l: "Today" }, { v: "week", l: "Week" }, { v: "month", l: "Month" }, { v: "year", l: "Year" }, { v: "all", l: "All" },
];

export function Focus() {
  const { dayLogs, settings, today, now, activeFocus, startFocusSession, cancelFocusSession, saveFocusSession, addFocusTask, removeFocusTask } = useStore();
  const confirm = useConfirm();
  const [focusMin, setFocusMin] = useState("25");
  const [restMin, setRestMin] = useState("5");
  const [task, setTask] = useState<string | null>(null);
  const [newTask, setNewTask] = useState("");
  const [period, setPeriod] = useState<Period>("today");

  const focusLogs = dayLogs.filter((l) => l.kind === "focus");
  const loggedNames = [...new Set(focusLogs.map((l) => l.name).filter(Boolean) as string[])];
  const allTasks = [...settings.focusTasks, ...loggedNames.filter((n) => !settings.focusTasks.includes(n))];

  // ----- running -----
  if (activeFocus) {
    const isFocus = activeFocus.phase === "focus";
    const totalMs = (isFocus ? activeFocus.focusMin : activeFocus.restMin) * 60_000;
    const end = activeFocus.startedAt + totalMs;
    const leftMs = Math.max(0, end - now);
    const leftMin = Math.floor(leftMs / 60_000);
    const leftSec = Math.floor((leftMs % 60_000) / 1000);
    const frac = totalMs > 0 ? 1 - leftMs / totalMs : 0;
    const color = isFocus ? C.accent : C.coolAcc;
    const elapsedMin = Math.floor((now - activeFocus.startedAt) / 60_000);

    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140, alignItems: "center", gap: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: color, borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 7, marginTop: 16 }}>
          <Icon name={isFocus ? "Timer" : "Coffee"} size={16} color="#fff" />
          <Txt weight="extrabold" color="#fff" size={13} style={{ textTransform: "uppercase", letterSpacing: 1 }}>{isFocus ? "Focus" : "Rest"}</Txt>
        </View>
        {activeFocus.label ? <Txt size={18} weight="extrabold">{activeFocus.label}</Txt> : null}

        <Ring frac={frac} color={color}>
          <Txt size={52} weight="extrabold">{leftMin}:{String(leftSec).padStart(2, "0")}</Txt>
          <Txt size={13} weight="bold" color={C.inkSoft}>{clock(activeFocus.startedAt)} – {clock(end)}</Txt>
          {isFocus ? <Txt size={12} weight="semibold" color={C.inkFaint}>+{focusXp(activeFocus.focusMin)} XP on finish</Txt> : null}
        </Ring>

        <View style={{ flexDirection: "row", gap: 10 }}>
          {isFocus && elapsedMin >= 1 ? (
            <PrimaryButton label="Save" background={C.accent} onPress={() => void saveFocusSession()} />
          ) : null}
          <PrimaryButton
            label={isFocus ? "Give up" : "Skip rest"}
            background={isFocus ? C.badAcc : C.primary}
            onPress={async () => {
              if (!isFocus) return void cancelFocusSession();
              if (await confirm({ title: "Give up this pomodoro?", message: "An abandoned session earns no XP.", confirmLabel: "Give up" }))
                void cancelFocusSession();
            }}
          />
        </View>
      </ScrollView>
    );
  }

  // ----- idle -----
  const f = num(focusMin);
  const r = num(restMin);

  let start = today, e = today;
  if (period === "week") start = addDays(today, -((new Date().getDay() + 6) % 7));
  else if (period === "month") start = `${today.slice(0, 8)}01`;
  else if (period === "year") start = `${today.slice(0, 4)}-01-01`;
  else if (period === "all") start = "0000-01-01";
  const inRange = (d: string) => d >= start && d <= e;
  const taskMin = (name: string) => focusLogs.filter((l) => inRange(l.date) && (l.name ?? "") === name).reduce((s, l) => s + (l.minutes ?? 0), 0);

  // group record by day
  const byDate = new Map<string, DayLog[]>();
  for (const l of focusLogs) byDate.set(l.date, [...(byDate.get(l.date) ?? []), l]);
  const dates = [...byDate.keys()].sort().reverse().slice(0, 14);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
      <Txt size={24} weight="extrabold">Focus</Txt>

      <Card>
        <SectionTitle>Start a pomodoro</SectionTitle>
        {/* task chips */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          <Chip label="No task" on={task === null} onPress={() => setTask(null)} />
          {allTasks.map((t) => (
            <Chip
              key={t}
              label={t}
              on={task === t}
              onPress={() => setTask(task === t ? null : t)}
              onRemove={async () => {
                if (await confirm({ title: `Delete focus task "${t}"?`, message: "Past sessions keep their time.", confirmLabel: "Delete" })) {
                  if (task === t) setTask(null);
                  void removeFocusTask(t);
                }
              }}
            />
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <TextField value={newTask} onChange={setNewTask} placeholder="New focus task (e.g. Learn German)" onSubmit={() => { if (newTask.trim()) { void addFocusTask(newTask); setTask(newTask.trim()); setNewTask(""); } }} />
          </View>
          <Pressable onPress={() => { if (newTask.trim()) { void addFocusTask(newTask); setTask(newTask.trim()); setNewTask(""); } }} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" }}>
            <Icon name="Plus" color="#fff" size={18} />
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "flex-end" }}>
          {PRESETS.map((p) => {
            const on = f === p.focus && r === p.rest;
            return (
              <Pressable key={p.label} onPress={() => { setFocusMin(String(p.focus)); setRestMin(String(p.rest)); }} style={[{ borderRadius: R.sm, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: on ? C.accent : C.page2 }]}>
                <Txt weight="extrabold" size={13} color={on ? "#fff" : C.ink}>{p.label}</Txt>
                <Txt size={11} weight="semibold" color={on ? "#fff" : C.inkSoft}>{p.focus}/{p.rest} min</Txt>
              </Pressable>
            );
          })}
          <NumberField label="Focus" value={focusMin} onChange={setFocusMin} suffix="min" width={84} />
          <NumberField label="Rest" value={restMin} onChange={setRestMin} suffix="min" width={84} />
        </View>
        <View style={{ marginTop: 12 }}>
          <PrimaryButton label="Start" background={C.accent} onPress={() => void startFocusSession(f, r, task ?? undefined)} disabled={f <= 0} />
        </View>
      </Card>

      {/* per-task time */}
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <SectionTitle>Focus tasks</SectionTitle>
          <View style={{ flexDirection: "row", gap: 4, backgroundColor: C.page2, borderRadius: R.pill, padding: 3 }}>
            {PERIODS.map((p) => (
              <Pressable key={p.v} onPress={() => setPeriod(p.v)} style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: R.pill, backgroundColor: period === p.v ? C.surface : "transparent" }}>
                <Txt size={11} weight="bold" color={period === p.v ? C.ink : C.inkSoft}>{p.l}</Txt>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={{ marginTop: 8 }}>
          {allTasks.length === 0 ? (
            <Txt color={C.inkFaint} weight="medium" size={13}>Create a focus task to track time.</Txt>
          ) : (
            allTasks.map((t, i) => (
              <View key={t} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: "rgba(0,0,0,0.05)" }}>
                <View style={{ width: 34, height: 34, borderRadius: R.pill, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" }}><Icon name="Timer" size={17} color="#fff" /></View>
                <Txt weight="bold" size={14} style={{ flex: 1 }} numberOfLines={1}>{t}</Txt>
                <Txt weight="bold" size={13} color={C.inkSoft}>{fmtMinutes(taskMin(t)) || "0m"}</Txt>
                <Pressable onPress={() => void startFocusSession(f, r, t)}><Icon name="Play" size={20} color={C.accent} /></Pressable>
              </View>
            ))
          )}
        </View>
      </Card>

      {/* focus record */}
      {dates.length > 0 ? (
        <Card>
          <SectionTitle>Focus record</SectionTitle>
          <View style={{ marginTop: 8, gap: 12 }}>
            {dates.map((d) => (
              <View key={d} style={{ gap: 6 }}>
                <Txt size={12} weight="bold" color={C.inkFaint}>{d}</Txt>
                {[...byDate.get(d)!].sort((a, b) => b.loggedAt - a.loggedAt).map((l) => {
                  const s = l.loggedAt - (l.minutes ?? 0) * 60_000;
                  return (
                    <View key={l.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ width: 28, height: 28, borderRadius: R.pill, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" }}><Icon name="Timer" size={14} color="#fff" /></View>
                      <View style={{ flex: 1 }}>
                        <Txt size={12} weight="medium" color={C.inkFaint}>{clock(s)} – {clock(l.loggedAt)}</Txt>
                        <Txt size={14} weight="extrabold">{l.name ?? "Focus"}</Txt>
                      </View>
                      <Txt weight="bold" size={13} color={C.inkSoft}>{fmtMinutes(l.minutes ?? 0)}</Txt>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}

function Ring({ frac, color, children }: { frac: number; color: string; children: React.ReactNode }) {
  const size = 240, stroke = 14, rad = (size - stroke) / 2, circ = 2 * Math.PI * rad;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={rad} stroke={C.page2} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={rad} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.min(1, Math.max(0, frac)))} />
      </Svg>
      <View style={{ alignItems: "center", gap: 2 }}>{children}</View>
    </View>
  );
}

function Chip({ label, on, onPress, onRemove }: { label: string; on: boolean; onPress: () => void; onRemove?: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", borderRadius: R.pill, backgroundColor: on ? C.accent : C.page2 }}>
      <Pressable onPress={onPress} style={{ paddingLeft: 12, paddingRight: onRemove ? 6 : 12, paddingVertical: 7 }}>
        <Txt weight="bold" size={13} color={on ? "#fff" : C.ink}>{label}</Txt>
      </Pressable>
      {onRemove ? (
        <Pressable onPress={onRemove} style={{ paddingRight: 8 }}>
          <Icon name="X" size={13} color={on ? "#fff" : C.inkFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}
