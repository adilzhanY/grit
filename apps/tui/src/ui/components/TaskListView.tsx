/**
 * The reusable task list — shared by My Day, Important, Must, Cool, Impossible
 * and custom lists. Tasks and their subtasks are flattened into one navigable
 * column; every Vim action (toggle, add, rename, change-XP, delete, star, pin)
 * is dispatched from a single keymap and routed to the right entity by row type.
 */
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import {
  type Task,
  type Subtask,
  recurrenceLabel,
} from "@grit/core";
import { useStore, useNow } from "../../store/store";
import { subtaskDone } from "../../data/repository";
import { useUI } from "../ui";
import { theme, listColor } from "../theme";
import { applyMotion } from "./motion";
import { XpHero } from "./XpHero";

type RowT =
  | { type: "task"; task: Task; done: boolean; partial: boolean }
  | { type: "subtask"; task: Task; sub: Subtask; done: boolean };

export function taskDone(task: Task, day: string, completedOn: Set<string>): boolean {
  const subs = task.subtasks ?? [];
  if (subs.length > 0) return subs.every((s) => subtaskDone(task, s, day));
  if (task.recurrence) return completedOn.has(`${task.id}:${day}`);
  return task.archived;
}

export function taskPartial(task: Task, day: string): boolean {
  const subs = task.subtasks ?? [];
  if (subs.length === 0) return false;
  const done = subs.filter((s) => subtaskDone(task, s, day)).length;
  return done > 0 && done < subs.length;
}

export function TaskListView({
  title,
  subtitle,
  color = theme.primary,
  tasks,
  day,
  isActive,
  onAdd,
  showHero = true,
  emptyHint = "Nothing here yet. Press a to add.",
}: {
  title: string;
  subtitle?: string;
  color?: string;
  tasks: Task[];
  day: string;
  isActive: boolean;
  onAdd: () => void;
  showHero?: boolean;
  emptyHint?: string;
}) {
  const store = useStore();
  const ui = useUI();
  useNow(60_000); // keep relative labels fresh
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState<"" | "c" | "d">("");

  const completedOn = store.completedOn;
  const rows: RowT[] = [];
  for (const t of tasks) {
    const done = taskDone(t, day, completedOn);
    rows.push({ type: "task", task: t, done, partial: taskPartial(t, day) });
    if (expanded.has(t.id)) {
      for (const s of t.subtasks ?? []) {
        rows.push({ type: "subtask", task: t, sub: s, done: subtaskDone(t, s, day) });
      }
    }
  }
  const sel = Math.min(index, Math.max(0, rows.length - 1));

  const toggleTask = (t: Task) => {
    const hasSubs = (t.subtasks?.length ?? 0) > 0;
    const done = taskDone(t, day, completedOn);
    if (hasSubs) return store.setAllSubtasks(t, !done);
    if (t.recurrence) return store.toggleMust(t, day);
    return done ? store.unachieve(t) : store.achieve(t);
  };

  useInput(
    (input, key) => {
      const m = applyMotion(input, key, sel, rows.length);
      if (m !== null) {
        setIndex(m);
        setPending("");
        return;
      }
      // Let global Ctrl/Meta chords (e.g. Ctrl-p) through to App.
      if (key.ctrl || key.meta) return;
      const row = rows[sel];

      if (pending === "c") {
        setPending("");
        if (!row) return;
        if (input === "c") {
          // rename
          void (async () => {
            if (row.type === "task") {
              const v = await ui.prompt({ label: "Rename task", initial: row.task.title });
              if (v) await store.updateTask(row.task.id, { title: v });
            } else {
              const v = await ui.prompt({ label: "Rename subtask", initial: row.sub.title });
              if (v) await store.editSubtask(row.task, row.sub.id, { title: v });
            }
          })();
        } else if (input === "p") {
          // change XP
          void (async () => {
            if (row.type === "task") {
              const v = await ui.prompt({ label: "XP", initial: String(row.task.points) });
              if (v != null) await store.updateTask(row.task.id, { points: Math.max(0, Math.round(Number(v) || 0)) });
            } else {
              const v = await ui.prompt({ label: "Subtask XP", initial: String(row.sub.xp ?? "") });
              if (v != null) await store.editSubtask(row.task, row.sub.id, { xp: Math.max(0, Math.round(Number(v) || 0)) });
            }
          })();
        }
        return;
      }

      if (pending === "d") {
        setPending("");
        if (input === "d" && row) {
          void (async () => {
            if (row.type === "task") {
              const ok = await ui.confirm({ title: `Delete "${row.task.title}"?`, danger: true, confirmLabel: "delete" });
              if (ok) await store.removeTask(row.task.id);
            } else {
              await store.removeSubtask(row.task, row.sub.id);
            }
          })();
        }
        return;
      }

      if (input === "c") return setPending("c");
      if (input === "d") return setPending("d");

      if (input === "a") return onAdd();

      if (!row) return;

      if (input === " " || input === "x") {
        if (row.type === "task") void toggleTask(row.task);
        else void store.toggleSubtask(row.task, row.sub.id);
        return;
      }
      if (key.return || input === "o") {
        if (row.type === "task" && (row.task.subtasks?.length ?? 0) > 0) {
          setExpanded((s) => {
            const n = new Set(s);
            if (n.has(row.task.id)) n.delete(row.task.id);
            else n.add(row.task.id);
            return n;
          });
        }
        return;
      }
      if (input === "s" && row.type === "task") {
        void (async () => {
          const v = await ui.prompt({ label: "New subtask", placeholder: "step…" });
          if (v) {
            await store.addSubtask(row.task, v);
            setExpanded((s) => new Set(s).add(row.task.id));
          }
        })();
        return;
      }
      if (input === "*") {
        if (row.type === "task") void store.toggleImportant(row.task);
        return;
      }
      if (input === "p") {
        if (row.type === "task") void store.toggleMyDay(row.task);
        return;
      }
    },
    { isActive },
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      {showHero ? <XpHero /> : null}
      <Box marginTop={showHero ? 1 : 0}>
        <Text bold color={color}>
          {title}
        </Text>
        {subtitle ? <Text color={theme.inkFaint}>{"   " + subtitle}</Text> : null}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {rows.length === 0 ? (
          <Text color={theme.inkFaint}>{emptyHint}</Text>
        ) : (
          rows.map((r, i) => <Row key={rowKey(r)} row={r} selected={i === sel} />)
        )}
      </Box>
      {pending ? (
        <Text color={theme.accent}>{pending === "c" ? "c… (c rename · p XP)" : "d… (d delete)"}</Text>
      ) : null}
    </Box>
  );
}

function rowKey(r: RowT): string {
  return r.type === "task" ? `t:${r.task.id}` : `s:${r.task.id}:${r.sub.id}`;
}

function Row({ row, selected }: { row: RowT; selected: boolean }) {
  const cursor = selected ? "❯ " : "  ";
  if (row.type === "subtask") {
    const box = row.done ? "[x]" : "[ ]";
    return (
      <Text color={selected ? theme.accent : theme.inkSoft}>
        {cursor}
        {"  ├─ "}
        <Text color={row.done ? theme.done : theme.inkSoft}>{box}</Text>{" "}
        <Text strikethrough={row.done}>{row.sub.title}</Text>
      </Text>
    );
  }
  const t = row.task;
  const box = row.done ? "[x]" : row.partial ? "[~]" : "[ ]";
  const hasSubs = (t.subtasks?.length ?? 0) > 0;
  const caret = hasSubs ? "▾" : " ";
  return (
    <Text color={selected ? theme.accent : theme.ink}>
      {cursor}
      <Text color={row.done ? theme.done : row.partial ? theme.accent : listColor(t.listType)}>{box}</Text>{" "}
      <Text strikethrough={row.done}>{t.title}</Text>
      {t.important ? <Text color={theme.accent}>{" ★"}</Text> : null}
      {t.starredMyDay ? <Text color={theme.primary}>{" ☼"}</Text> : null}
      {t.recurrence ? <Text color={theme.inkFaint}>{"  " + recurrenceLabel(t)}</Text> : null}
      <Text color={theme.inkFaint}>{`  +${t.points}`}</Text>
      {hasSubs ? <Text color={theme.inkFaint}>{`  ${caret}${t.subtasks!.length}`}</Text> : null}
    </Text>
  );
}
