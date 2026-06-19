/** Must completion heatmap: Week / Month grids + a Year completion-rate view. */
import { useState, type ReactNode } from "react";
import { Box, Text, useInput } from "ink";
import { type Task, isDueOn, addDays, weekdayOf } from "@grit/core";
import { useStore } from "../../store/store";
import { theme } from "../theme";

type Mode = "week" | "month" | "year";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function monthDays(year: number, monthIdx0: number): string[] {
  const count = new Date(year, monthIdx0 + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${year}-${pad(monthIdx0 + 1)}-${pad(i + 1)}`);
}

function weekDays(today: string, offset: number): string[] {
  const wd = weekdayOf(today); // 0=Sun..6=Sat
  const mondayDelta = ((wd + 6) % 7) * -1; // back to Monday
  const start = addDays(today, mondayDelta + offset * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const RATE = [" ", "░", "▒", "▓", "█"];

export function Heatmap({ tasks, isActive }: { tasks: Task[]; isActive: boolean }) {
  const store = useStore();
  const [mode, setMode] = useState<Mode>("week");
  const [offset, setOffset] = useState(0);
  const today = store.today;
  const completed = store.completedOn;

  useInput(
    (input, key) => {
      if (input === "m") {
        setMode((mo) => (mo === "week" ? "month" : mo === "month" ? "year" : "week"));
        setOffset(0);
      }
      if (input === "l" || key.rightArrow) setOffset((o) => Math.min(0, o + 1));
      if (input === "h" || key.leftArrow) setOffset((o) => o - 1);
    },
    { isActive },
  );

  const done = (t: Task, d: string) => completed.has(`${t.id}:${d}`);
  const nameCol = (t: Task) => t.title.slice(0, 13).padEnd(13);

  let header: string;
  let body: ReactNode;

  if (mode === "year") {
    const [y] = today.split("-").map(Number);
    const year = y + offset;
    header = `${year}`;
    body = (
      <Box flexDirection="column">
        <Text color={theme.inkFaint}>{"             J F M A M J J A S O N D"}</Text>
        {tasks.map((t) => {
          const cells = Array.from({ length: 12 }, (_, mi) => {
            const days = monthDays(year, mi).filter((d) => d <= today);
            const due = days.filter((d) => isDueOn(t, d));
            if (due.length === 0) return " ";
            const rate = due.filter((d) => done(t, d)).length / due.length;
            return RATE[Math.min(4, Math.round(rate * 4))];
          });
          return (
            <Text key={t.id}>
              <Text color={theme.inkSoft}>{nameCol(t)}</Text>
              <Text color={theme.done}>{cells.join(" ")}</Text>
            </Text>
          );
        })}
      </Box>
    );
  } else {
    const days = mode === "week" ? weekDays(today, offset) : monthOffsetDays(today, offset);
    header =
      mode === "week"
        ? `Week of ${days[0]}`
        : `${new Date(`${days[0]}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
    const colHead =
      mode === "week"
        ? " ".repeat(13) + "Mo Tu We Th Fr Sa Su"
        : " ".repeat(13) + days.map((d) => pad(Number(d.slice(8)))).join("").replace(/(\d\d)/g, "$1");
    body = (
      <Box flexDirection="column">
        {mode === "week" ? <Text color={theme.inkFaint}>{colHead}</Text> : null}
        {tasks.map((t) => (
          <Text key={t.id}>
            <Text color={theme.inkSoft}>{nameCol(t)}</Text>
            {days.map((d) => {
              const future = d > today;
              const isDone = done(t, d);
              const due = isDueOn(t, d);
              const ch = isDone ? "■" : due && !future ? "■" : "·";
              const color = isDone ? theme.done : due && !future ? theme.warn : theme.inkFaint;
              return (
                <Text key={d} color={color}>
                  {mode === "week" ? ` ${ch} ` : ch}
                </Text>
              );
            })}
          </Text>
        ))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color={theme.inkSoft}>
        {`${mode}  ·  ${header}`}
        <Text color={theme.inkFaint}>{"   m mode · h/l period"}</Text>
      </Text>
      <Box marginTop={1}>{tasks.length === 0 ? <Text color={theme.inkFaint}>No habits to chart.</Text> : body}</Box>
      <Text color={theme.inkFaint}>{"\n"}■ done · <Text color={theme.warn}>■</Text> missed · · not scheduled</Text>
    </Box>
  );
}

function monthOffsetDays(today: string, offset: number): string[] {
  const [y, m] = today.split("-").map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return monthDays(d.getFullYear(), d.getMonth());
}
