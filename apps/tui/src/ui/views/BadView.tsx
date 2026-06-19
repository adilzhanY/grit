/** Bad — habits to quit. Live clean-streak, milestone progress, and "I slipped". */
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import {
  type Task,
  streakMs,
  currentMilestone,
  nextMilestone,
  formatStreak,
} from "@grit/core";
import { useStore, useNow } from "../../store/store";
import { useUI } from "../ui";
import { theme, bar } from "../theme";
import { applyMotion } from "../components/motion";
import { XpHero } from "../components/XpHero";

export function BadView() {
  const store = useStore();
  const ui = useUI();
  const now = useNow(1000);
  const isActive = !ui.inputCaptured && ui.view === "bad";
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState<"" | "c" | "d">("");

  const tasks = store.tasks.filter((t) => t.listType === "bad" && !t.archived);
  const sel = Math.min(index, Math.max(0, tasks.length - 1));

  const onAdd = () => {
    void (async () => {
      const title = await ui.prompt({ label: "Habit to quit", placeholder: "e.g. doomscrolling" });
      if (!title) return;
      const pen = await ui.prompt({ label: "Slip penalty (XP)", initial: "100" });
      await store.addTask({ listType: "bad", title, slipPenalty: Math.max(0, Math.round(Number(pen) || 100)) });
    })();
  };

  useInput(
    (input, key) => {
      const m = applyMotion(input, key, sel, tasks.length);
      if (m !== null) {
        setIndex(m);
        setPending("");
        return;
      }
      if (key.ctrl || key.meta) return;
      const t = tasks[sel];

      if (pending === "c") {
        setPending("");
        if (!t) return;
        if (input === "c")
          void (async () => {
            const v = await ui.prompt({ label: "Rename", initial: t.title });
            if (v) await store.updateTask(t.id, { title: v });
          })();
        else if (input === "p")
          void (async () => {
            const v = await ui.prompt({ label: "Slip penalty", initial: String(t.slipPenalty ?? 100) });
            if (v != null) await store.updateTask(t.id, { slipPenalty: Math.max(0, Math.round(Number(v) || 0)) });
          })();
        return;
      }
      if (pending === "d") {
        setPending("");
        if (input === "d" && t)
          void (async () => {
            const ok = await ui.confirm({ title: `Delete "${t.title}"?`, danger: true, confirmLabel: "delete" });
            if (ok) await store.removeTask(t.id);
          })();
        return;
      }
      if (input === "c") return setPending("c");
      if (input === "d") return setPending("d");
      if (input === "a") return onAdd();
      if (!t) return;
      if (input === "!") {
        void (async () => {
          const ok = await ui.confirm({
            title: `Slip on "${t.title}"?`,
            message: `Costs ${t.slipPenalty ?? 100} XP and resets the streak.`,
            danger: true,
            confirmLabel: "I slipped",
          });
          if (ok) await store.slip(t);
        })();
      }
      if (input === "*") void store.toggleImportant(t);
      if (input === "p") void store.toggleMyDay(t);
    },
    { isActive },
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      <XpHero />
      <Box marginTop={1}>
        <Text bold color={theme.bad}>
          Bad
        </Text>
        <Text color={theme.inkFaint}>{`   ${tasks.length} tracked · ! I slipped`}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {tasks.length === 0 ? (
          <Text color={theme.inkFaint}>No bad habits tracked. Press a to add one.</Text>
        ) : (
          tasks.map((t, i) => <BadCard key={t.id} task={t} selected={i === sel} now={now} />)
        )}
      </Box>
      {pending ? (
        <Text color={theme.accent}>{pending === "c" ? "c… (c rename · p penalty)" : "d… (d delete)"}</Text>
      ) : null}
    </Box>
  );
}

function BadCard({ task, selected, now }: { task: Task; selected: boolean; now: number }) {
  const streak = streakMs(now, task.lastSlipAt, task.createdAt);
  const cur = currentMilestone(streak);
  const next = nextMilestone(streak);
  const prevMs = cur?.ms ?? 0;
  const frac = next ? (streak - prevMs) / (next.ms - prevMs) : 1;
  // Personal best: stored best (set on slip) or the live streak if it's longer.
  const best = Math.max(task.bestStreakMs ?? 0, streak);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={selected ? theme.accent : theme.ink}>
        {selected ? "❯ " : "  "}
        <Text bold>{`💀 ${task.title}`}</Text>
        {task.important ? <Text color={theme.accent}>{" ★"}</Text> : null}
        <Text color={theme.inkFaint}>{`   −${task.slipPenalty ?? 0} XP/slip`}</Text>
        <Text color={theme.done}>{`   🛡 ${formatStreak(streak)} clean`}</Text>
        {(task.bestStreakMs ?? 0) >= 60_000 ? (
          <Text color={theme.accent}>{`   🏆 ${formatStreak(best)} best`}</Text>
        ) : null}
      </Text>
      <Text color={theme.inkFaint}>
        {"     "}
        {cur ? `${cur.label} ✓` : "no milestone yet"}
        {next ? (
          <Text>
            {"  "}
            <Text color={theme.done}>{bar(frac, 16)}</Text>
            {`  next: ${next.label} (+${Math.round(next.baseXp * (task.rewardMultiplier ?? 1))} XP)`}
          </Text>
        ) : (
          <Text color={theme.accent}>{"  Maxed out 🏆"}</Text>
        )}
      </Text>
    </Box>
  );
}
