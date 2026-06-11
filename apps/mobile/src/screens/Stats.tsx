import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  addDays,
  fmtMinutes,
  fmtWeight,
  foodTotal,
  localDay,
  type DayLog,
  type LedgerEntry,
  type LedgerType,
  type WeightUnit,
} from "@grit/core";
import { useStore } from "../lib/store";
import { C, R, claySm } from "../theme";
import { Card, SectionTitle, Txt } from "../components/ui";
import { Icon } from "../components/Icon";

type Period = "week" | "month" | "year" | "all";
const PERIODS: { v: Period; l: string }[] = [
  { v: "week", l: "Week" }, { v: "month", l: "Month" }, { v: "year", l: "Year" }, { v: "all", l: "All" },
];
type Point = { day: string; value: number | null };

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

/** "Today" / "Yesterday" / "Thu, June 17". */
function dayHeading(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "long",
    day: "numeric",
  });
}

function logSummary(l: DayLog, unit: WeightUnit): string {
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
      return `Weight · ${fmtWeight(l.weightKg ?? 0, unit)}`;
    default:
      return "Log";
  }
}

function ActivityRow({ text, xp }: { text: string; xp: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.surface, borderRadius: R.sm, paddingHorizontal: 12, paddingVertical: 9 }}>
      <Txt size={13} weight="semibold" numberOfLines={1} style={{ flex: 1 }}>{text}</Txt>
      {xp !== 0 ? (
        <Txt size={12} weight="bold" color={xp > 0 ? C.primary : C.badAcc}>
          {xp > 0 ? "+" : ""}{xp}
        </Txt>
      ) : null}
    </View>
  );
}

/** One day's daily-logs + XP events. */
function DayActivity({ date, heading, dayLogs, ledger, unit }: {
  date: string;
  heading?: string;
  dayLogs: DayLog[];
  ledger: LedgerEntry[];
  unit: WeightUnit;
}) {
  const logs = dayLogs.filter((l) => l.date === date).sort((a, b) => b.loggedAt - a.loggedAt);
  const events = ledger.filter((e) => localDay(e.timestamp) === date).sort((a, b) => b.timestamp - a.timestamp);
  const net = events.reduce((s, e) => s + e.delta, 0);
  const empty = logs.length === 0 && events.length === 0;

  return (
    <View style={{ backgroundColor: C.page2, borderRadius: R.md, padding: 12, gap: 10 }}>
      {heading ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Txt size={14} weight="extrabold">{heading}</Txt>
          {events.length > 0 ? (
            <Txt size={12} weight="bold" color={net >= 0 ? C.primary : C.badAcc}>
              {net > 0 ? "+" : ""}{net.toLocaleString()} XP
            </Txt>
          ) : null}
        </View>
      ) : null}
      {empty ? (
        <Txt size={13} weight="medium" color={C.inkFaint}>Nothing logged on this day.</Txt>
      ) : (
        <>
          {events.length > 0 ? (
            <View style={{ gap: 6 }}>
              <SectionTitle>XP events</SectionTitle>
              {events.map((e) => (
                <ActivityRow key={e.id} text={e.meta ?? LEDGER_LABELS[e.type]} xp={e.delta} />
              ))}
            </View>
          ) : null}
          {logs.length > 0 ? (
            <View style={{ gap: 6 }}>
              <SectionTitle>Logs</SectionTitle>
              {logs.map((l) => (
                <ActivityRow key={l.id} text={logSummary(l, unit)} xp={l.awardedXp} />
              ))}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

/** Date stepper + that day's activity. */
function FindADay({ dayLogs, ledger, today, unit }: {
  dayLogs: DayLog[];
  ledger: LedgerEntry[];
  today: string;
  unit: WeightUnit;
}) {
  const [date, setDate] = useState(today);
  const isToday = date >= today;
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="CalendarClock" size={18} color={C.inkSoft} />
        <Txt size={14} weight="bold" style={{ flex: 1 }}>Find a day</Txt>
        <Pressable onPress={() => setDate((d) => addDays(d, -1))} hitSlop={8} style={[{ width: 32, height: 32, borderRadius: R.sm, backgroundColor: C.page2, alignItems: "center", justifyContent: "center" }, claySm()]}>
          <Icon name="ChevronLeft" size={18} color={C.inkSoft} strokeWidth={2.6} />
        </Pressable>
        <Pressable
          onPress={() => !isToday && setDate((d) => addDays(d, 1))}
          hitSlop={8}
          style={[{ width: 32, height: 32, borderRadius: R.sm, backgroundColor: C.page2, alignItems: "center", justifyContent: "center", opacity: isToday ? 0.35 : 1 }, claySm()]}
        >
          <Icon name="ChevronRight" size={18} color={C.inkSoft} strokeWidth={2.6} />
        </Pressable>
      </View>
      <View style={{ marginTop: 4 }}>
        <Txt size={12} weight="bold" color={C.inkFaint}>{dayHeading(date, today)}</Txt>
      </View>
      <View style={{ marginTop: 10 }}>
        <DayActivity date={date} dayLogs={dayLogs} ledger={ledger} unit={unit} />
      </View>
    </Card>
  );
}

export function Stats() {
  const { dayLogs, ledger, level, today, settings } = useStore();
  const [period, setPeriod] = useState<Period>("month");
  const recentDays = [0, 1, 2, 3, 4].map((i) => addDays(today, -i));

  let start = today;
  if (period === "week") start = addDays(today, -((new Date().getDay() + 6) % 7));
  else if (period === "month") start = `${today.slice(0, 8)}01`;
  else if (period === "year") start = `${today.slice(0, 4)}-01-01`;
  else start = "0000-01-01";
  const inRange = (d: string) => d >= start && d <= today;

  const days: string[] = [];
  { let d = start === "0000-01-01" ? addDays(today, -29) : start; let g = 0; while (d <= today && g < 400) { days.push(d); d = addDays(d, 1); g++; } }

  const sumLog = (kind: DayLog["kind"], field: "minutes" | "steps") =>
    days.map((day) => ({ day, value: dayLogs.filter((l) => l.kind === kind && l.date === day).reduce((s, l) => s + ((l[field] as number) ?? 0), 0) }));
  const calSeries: Point[] = days.map((day) => ({ day, value: foodTotal(dayLogs.filter((l) => l.kind === "food" && l.date === day), "calories") }));

  const xpByDay = new Map<string, number>();
  for (const e of ledger) if (inRange(localDay(e.timestamp))) xpByDay.set(localDay(e.timestamp), (xpByDay.get(localDay(e.timestamp)) ?? 0) + e.delta);
  const xpSeries: Point[] = days.map((day) => ({ day, value: xpByDay.get(day) ?? 0 }));
  const xpTotal = xpSeries.reduce((s, p) => s + (p.value ?? 0), 0);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 140 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Txt size={24} weight="extrabold">Analytics</Txt>
        <View style={{ flexDirection: "row", gap: 4, backgroundColor: C.page2, borderRadius: R.pill, padding: 3 }}>
          {PERIODS.map((p) => (
            <Pressable key={p.v} onPress={() => setPeriod(p.v)} style={{ paddingHorizontal: 11, paddingVertical: 5, borderRadius: R.pill, backgroundColor: period === p.v ? C.surface : "transparent" }}>
              <Txt size={12} weight="bold" color={period === p.v ? C.ink : C.inkSoft}>{p.l}</Txt>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Tile label="Level" value={String(level.level)} />
        <Tile label="Total XP" value={level.totalXp.toLocaleString()} />
        <Tile label="XP period" value={xpTotal.toLocaleString()} />
      </View>

      {/* Recent activity — Today, Yesterday, and the 3 days before */}
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="CalendarClock" size={18} color={C.inkSoft} />
          <Txt size={14} weight="bold">Recent activity</Txt>
        </View>
        <View style={{ gap: 10, marginTop: 12 }}>
          {recentDays.map((d) => (
            <DayActivity key={d} date={d} heading={dayHeading(d, today)} dayLogs={dayLogs} ledger={ledger} unit={settings.weightUnit} />
          ))}
        </View>
      </Card>

      <FindADay dayLogs={dayLogs} ledger={ledger} today={today} unit={settings.weightUnit} />

      <Chart title="XP earned" data={xpSeries} color={C.primary} fmt={(v) => `${v} XP`} />
      <Chart title="Calories" data={calSeries} color={C.mustAcc} fmt={(v) => `${v} kcal`} />
      <Chart title="Focus" data={sumLog("focus", "minutes")} color={C.accent} fmt={(v) => fmtMinutes(v) || "0m"} />
      <Chart title="Sleep" data={sumLog("sleep", "minutes")} color={C.impAcc} fmt={(v) => fmtMinutes(v) || "0m"} />
      <Chart title="Steps" data={sumLog("steps", "steps")} color={C.coolAcc} fmt={(v) => v.toLocaleString()} />
    </ScrollView>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 12 }}>
      <Txt size={11} weight="semibold" color={C.inkFaint}>{label}</Txt>
      <Txt size={22} weight="extrabold">{value}</Txt>
    </Card>
  );
}

function Chart({ title, data, color, fmt }: { title: string; data: Point[]; color: string; fmt: (v: number) => string }) {
  const max = Math.max(1, ...data.map((p) => p.value ?? 0));
  const total = data.reduce((s, p) => s + (p.value ?? 0), 0);
  const H = 110;
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <SectionTitle>{title}</SectionTitle>
        <Txt size={13} weight="extrabold">{fmt(total)}</Txt>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height: H, marginTop: 12 }}>
        {data.map((p, i) => (
          <View key={i} style={{ flex: 1, minWidth: 2, height: Math.max(p.value ? 3 : 0, ((p.value ?? 0) / max) * H), backgroundColor: color, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
        ))}
      </View>
    </Card>
  );
}
