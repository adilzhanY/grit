import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { addDays, fmtMinutes, foodTotal, localDay, type DayLog } from "@grit/core";
import { useStore } from "../lib/store";
import { C, R } from "../theme";
import { Card, SectionTitle, Txt } from "../components/ui";

type Period = "week" | "month" | "year" | "all";
const PERIODS: { v: Period; l: string }[] = [
  { v: "week", l: "Week" }, { v: "month", l: "Month" }, { v: "year", l: "Year" }, { v: "all", l: "All" },
];
type Point = { day: string; value: number | null };

export function Stats() {
  const { dayLogs, ledger, level, today } = useStore();
  const [period, setPeriod] = useState<Period>("month");

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
