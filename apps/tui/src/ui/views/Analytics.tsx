/** Analytics — headline tiles + compact ASCII bar charts over a chosen period. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Box, Text, useInput } from "ink";
import {
  type LedgerEntry,
  type LedgerType,
  addDays,
  fmtMinutes,
} from "@grit/core";
import { useStore } from "../../store/store";
import { useUI } from "../ui";
import { theme } from "../theme";
import { getLedger } from "../../data/repository";

type Period = "week" | "month" | "year" | "all";
const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30, year: 365, all: 9999 };
const SOURCE_LABEL: Partial<Record<LedgerType, string>> = {
  must_complete: "Must",
  custom_complete: "Tasks",
  cool_achieve: "Cool",
  impossible_achieve: "Impossible",
  streak_milestone: "Streaks",
  sleep_log: "Sleep",
  steps_log: "Steps",
  reading_log: "Reading",
  focus_log: "Focus",
  weight_log: "Weight",
  food_penalty: "Food",
  bad_slip: "Slips",
  adjust: "Adjust",
};

function ledgerLocalDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function BarRow({ label, value, max, color, suffix }: { label: string; value: number; max: number; color: string; suffix?: string }) {
  const width = 22;
  const filled = max > 0 ? Math.round((Math.abs(value) / max) * width) : 0;
  return (
    <Text>
      <Text color={theme.inkFaint}>{label.padEnd(12)}</Text>
      <Text color={color}>{"█".repeat(filled)}</Text>
      <Text color={theme.inkFaint}>{"░".repeat(Math.max(0, width - filled))}</Text>
      <Text color={theme.inkSoft}>{`  ${value}${suffix ?? ""}`}</Text>
    </Text>
  );
}

export function Analytics() {
  const store = useStore();
  const ui = useUI();
  const isActive = !ui.inputCaptured && ui.view === "analytics";
  const [period, setPeriod] = useState<Period>("week");
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

  useEffect(() => {
    void getLedger().then(setLedger);
  }, [store.level.totalXp, store.dayLogs.length]);

  useInput(
    (input, key) => {
      const order: Period[] = ["week", "month", "year", "all"];
      const i = order.indexOf(period);
      if (input === "l" || key.rightArrow) setPeriod(order[(i + 1) % order.length]);
      if (input === "h" || key.leftArrow) setPeriod(order[(i - 1 + order.length) % order.length]);
    },
    { isActive },
  );

  const today = store.today;
  const span = PERIOD_DAYS[period];
  const days = useMemo(() => {
    const n = period === "all" ? 14 : Math.min(span, 14); // cap visible columns
    return Array.from({ length: n }, (_, i) => addDays(today, -(n - 1 - i)));
  }, [period, span, today]);
  const inPeriod = (d: string) => period === "all" || d >= addDays(today, -(span - 1));

  // XP per day from the ledger.
  const xpByDay = new Map<string, number>();
  let xpThisPeriod = 0;
  const bySource = new Map<LedgerType, number>();
  for (const e of ledger) {
    const d = ledgerLocalDay(e.timestamp);
    if (inPeriod(d)) {
      xpThisPeriod += e.delta;
      bySource.set(e.type, (bySource.get(e.type) ?? 0) + e.delta);
    }
    if (days.includes(d)) xpByDay.set(d, (xpByDay.get(d) ?? 0) + e.delta);
  }

  const sumByDay = (kind: string, field: "calories" | "minutes" | "steps") => {
    const map = new Map<string, number>();
    for (const l of store.dayLogs) {
      if (l.kind !== kind) continue;
      if (!days.includes(l.date)) continue;
      map.set(l.date, (map.get(l.date) ?? 0) + ((l[field] as number | undefined) ?? 0));
    }
    return map;
  };
  const cals = sumByDay("food", "calories");
  const sleep = sumByDay("sleep", "minutes");
  const focus = sumByDay("focus", "minutes");

  const activeTasks = store.tasks.filter((t) => !t.archived).length;
  const label = (d: string) => d.slice(5); // MM-DD

  const maxOf = (m: Map<string, number>) => Math.max(1, ...days.map((d) => Math.abs(m.get(d) ?? 0)));

  const sources = [...bySource.entries()].filter(([, v]) => v !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const maxSource = Math.max(1, ...sources.map(([, v]) => Math.abs(v)));

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box>
        <Text bold color={theme.primary}>
          Analytics
        </Text>
        <Text color={theme.inkFaint}>{`   period: ${period}  ·  h/l change`}</Text>
      </Box>
      <Box marginTop={1} gap={2}>
        <Tile label="Level" value={String(store.level.level)} />
        <Tile label="Total XP" value={store.level.totalXp.toLocaleString()} />
        <Tile label="XP this period" value={`${xpThisPeriod >= 0 ? "+" : ""}${xpThisPeriod}`} />
        <Tile label="Active tasks" value={String(activeTasks)} />
      </Box>

      <Section title="XP / day">
        {days.map((d) => (
          <BarRow key={d} label={label(d)} value={xpByDay.get(d) ?? 0} max={maxOf(xpByDay)} color={theme.done} />
        ))}
      </Section>

      <Section title="Calories / day">
        {days.map((d) => (
          <BarRow key={d} label={label(d)} value={cals.get(d) ?? 0} max={maxOf(cals)} color={theme.must} />
        ))}
      </Section>

      <Box flexDirection="row" gap={4}>
        <Box flexDirection="column">
          <Text color={theme.inkSoft}>Sleep / day</Text>
          {days.slice(-7).map((d) => (
            <BarRow key={d} label={label(d)} value={sleep.get(d) ?? 0} max={maxOf(sleep)} color={theme.cool} suffix="m" />
          ))}
        </Box>
        <Box flexDirection="column">
          <Text color={theme.inkSoft}>Focus / day</Text>
          {days.slice(-7).map((d) => (
            <BarRow key={d} label={label(d)} value={focus.get(d) ?? 0} max={maxOf(focus)} color={theme.accent} suffix="m" />
          ))}
        </Box>
      </Box>

      <Section title="XP by source">
        {sources.length === 0 ? (
          <Text color={theme.inkFaint}>No XP events in this period.</Text>
        ) : (
          sources.map(([type, v]) => (
            <BarRow
              key={type}
              label={SOURCE_LABEL[type] ?? type}
              value={v}
              max={maxSource}
              color={v >= 0 ? theme.done : theme.warn}
            />
          ))
        )}
      </Section>
    </Box>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.inkFaint} paddingX={1}>
      <Text color={theme.inkFaint}>{label}</Text>
      <Text bold color={theme.accent}>
        {value}
      </Text>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.inkSoft}>{title}</Text>
      {children}
    </Box>
  );
}
