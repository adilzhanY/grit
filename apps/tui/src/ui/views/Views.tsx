/** View router: picks the dataset + add-flow for the current nav target. */
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import {
  type Task,
  myDayTasks,
  importantTasks,
  byMyDayPriority,
  byXp,
  plannedDays,
  dayLabel,
} from "@grit/core";
import { useStore } from "../../store/store";
import { useUI, type ViewId } from "../ui";
import { theme } from "../theme";
import { TaskListView, taskDone } from "../components/TaskListView";
import { applyMotion } from "../components/motion";
import { DailyLog } from "./DailyLog";
import { BadView } from "./BadView";
import { Analytics } from "./Analytics";
import { MustView } from "./MustView";

function activeFirst(tasks: Task[], day: string, completedOn: Set<string>): Task[] {
  const notDone = tasks.filter((t) => !taskDone(t, day, completedOn));
  const done = tasks.filter((t) => taskDone(t, day, completedOn));
  return [...notDone, ...done];
}

export function MainView() {
  const ui = useUI();
  const v = ui.view;
  if (v === "dailylog") return <DailyLog />;
  if (v === "analytics") return <Analytics />;
  if (v === "bad") return <BadView />;
  if (v === "must") return <MustView />;
  if (v === "planned") return <PlannedView />;
  if (v === "myday") return <MyDayView />;
  if (v === "important") return <ImportantView />;
  if (v === "cool") return <AchieveView kind="cool" />;
  if (v === "impossible") return <AchieveView kind="impossible" />;
  if (v.startsWith("list:")) return <CustomListView listId={v.slice(5)} />;
  return <Text>Unknown view</Text>;
}

function MyDayView() {
  const store = useStore();
  const ui = useUI();
  const isActive = !ui.inputCaptured && ui.view === "myday";
  const list = activeFirst(
    byMyDayPriority(myDayTasks(store.tasks, store.today)),
    store.today,
    store.completedOn,
  );
  const done = list.filter((t) => taskDone(t, store.today, store.completedOn)).length;
  const onAdd = () => {
    void (async () => {
      const title = await ui.prompt({ label: "Add to My Day", placeholder: "what needs doing today?" });
      if (title) await store.addTask({ listType: "custom", title, starredMyDay: true });
    })();
  };
  return (
    <TaskListView
      title="My Day"
      subtitle={`${list.length - done} active · ${done} done · ${store.today}`}
      color={theme.primary}
      tasks={list}
      day={store.today}
      isActive={isActive}
      onAdd={onAdd}
    />
  );
}

function ImportantView() {
  const store = useStore();
  const ui = useUI();
  const isActive = !ui.inputCaptured && ui.view === "important";
  const list = activeFirst(byXp(importantTasks(store.tasks)), store.today, store.completedOn);
  return (
    <TaskListView
      title="Important"
      subtitle={`everything you starred · ${list.length}`}
      color={theme.accent}
      tasks={list}
      day={store.today}
      isActive={isActive}
      onAdd={() => ui.notify("Star tasks with * from any list.")}
      emptyHint="No starred tasks. Press * on any task to star it."
    />
  );
}

function AchieveView({ kind }: { kind: "cool" | "impossible" }) {
  const store = useStore();
  const ui = useUI();
  const isActive = !ui.inputCaptured && ui.view === kind;
  const all = store.tasks.filter((t) => t.listType === kind);
  const list = [...all.filter((t) => !t.archived), ...all.filter((t) => t.archived)];
  const achieved = all.filter((t) => t.archived).length;
  const onAdd = () => {
    void (async () => {
      const res = await ui.form({
        title: kind === "cool" ? "New Cool goal" : "New Impossible goal",
        fields: [
          { name: "title", label: "Title", placeholder: "what to chase" },
          { name: "xp", label: "XP", initial: kind === "cool" ? "100" : "1000" },
        ],
      });
      if (res?.title) {
        await store.addTask({ listType: kind, title: res.title, points: Math.max(0, Math.round(Number(res.xp) || 0)) });
      }
    })();
  };
  return (
    <TaskListView
      title={kind === "cool" ? "Cool" : "Impossible"}
      subtitle={`${achieved}/${all.length} achieved`}
      color={kind === "cool" ? theme.cool : theme.impossible}
      tasks={list}
      day={store.today}
      isActive={isActive}
      onAdd={onAdd}
    />
  );
}

function CustomListView({ listId }: { listId: string }) {
  const store = useStore();
  const ui = useUI();
  const list = store.lists.find((l) => l.id === listId);
  const viewId: ViewId = `list:${listId}`;
  const isActive = !ui.inputCaptured && ui.view === viewId;
  const all = store.tasks.filter((t) => t.listType === "custom" && t.listId === listId);
  const ordered = activeFirst(all, store.today, store.completedOn);

  // List-management keys layered alongside the task list (non-overlapping).
  useInput(
    (input) => {
      if (input === "r") {
        void (async () => {
          const v = await ui.prompt({ label: "Rename list", initial: list?.name ?? "" });
          if (v) await store.renameList(listId, v);
        })();
      } else if (input === "X") {
        void (async () => {
          const ok = await ui.confirm({
            title: `Delete list "${list?.name}"?`,
            message: "All its tasks are deleted too.",
            danger: true,
            confirmLabel: "delete list",
          });
          if (ok) {
            await store.removeList(listId);
            ui.setView("myday");
          }
        })();
      }
    },
    { isActive },
  );

  const onAdd = () => {
    void (async () => {
      const res = await ui.form({
        title: `Add to ${list?.name ?? "list"}`,
        fields: [
          { name: "title", label: "Title", placeholder: "task" },
          { name: "xp", label: "XP", initial: "15" },
        ],
      });
      if (res?.title)
        await store.addTask({
          listType: "custom",
          title: res.title,
          listId,
          points: Math.max(0, Math.round(Number(res.xp) || 0)),
        });
    })();
  };

  if (!list) return <Text color={theme.warn}>List not found.</Text>;
  const doneCount = ordered.filter((t) => taskDone(t, store.today, store.completedOn)).length;
  return (
    <TaskListView
      title={list.name}
      subtitle={`${ordered.length - doneCount} active · ${doneCount} done · r rename · X delete list`}
      color={theme.custom}
      tasks={ordered}
      day={store.today}
      isActive={isActive}
      onAdd={onAdd}
    />
  );
}

function PlannedView() {
  const store = useStore();
  const ui = useUI();
  const isActive = !ui.inputCaptured && ui.view === "planned";
  const groups = plannedDays(store.tasks, store.today);
  // Flatten to a single navigable list with day headers.
  return <PlannedList groups={groups} isActive={isActive} />;
}

function PlannedList({
  groups,
  isActive,
}: {
  groups: { day: string; tasks: Task[] }[];
  isActive: boolean;
}) {
  const store = useStore();
  const ui = useUI();
  const [index, setIndex] = useState(0);
  const flat: { day: string; task: Task }[] = [];
  for (const g of groups) for (const t of g.tasks) flat.push({ day: g.day, task: t });
  const sel = Math.min(index, Math.max(0, flat.length - 1));

  useInput(
    (input, key) => {
      const m = applyMotion(input, key, sel, flat.length);
      if (m !== null) return setIndex(m);
      const row = flat[sel];
      if (!row) return;
      if (input === " " || input === "x") {
        const done = store.completedOn.has(`${row.task.id}:${row.day}`);
        if (row.task.recurrence) {
          if (done) void store.toggleMust(row.task, row.day);
          else void store.toggleMust(row.task, row.day);
        } else {
          void (row.task.archived ? store.unachieve(row.task) : store.achieve(row.task));
        }
      }
    },
    { isActive },
  );

  let lastDay = "";
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color={theme.primary}>
        Planned
      </Text>
      <Text color={theme.inkFaint}>what&apos;s coming up over the next 10 days</Text>
      <Box flexDirection="column" marginTop={1}>
        {flat.length === 0 ? (
          <Text color={theme.inkFaint}>Nothing scheduled. Plan tasks with a due date.</Text>
        ) : (
          flat.map((r, i) => {
            const header = r.day !== lastDay ? dayLabel(r.day, store.today) : null;
            lastDay = r.day;
            const done = store.completedOn.has(`${r.task.id}:${r.day}`);
            return (
              <Box key={`${r.day}:${r.task.id}`} flexDirection="column">
                {header ? <Text color={theme.accent}>{`\n${header}`}</Text> : null}
                <Text color={i === sel ? theme.accent : theme.ink}>
                  {i === sel ? "❯ " : "  "}
                  <Text color={done ? theme.done : theme.inkSoft}>{done ? "[x]" : "[ ]"}</Text>{" "}
                  <Text strikethrough={done}>{r.task.title}</Text>
                  <Text color={theme.inkFaint}>{`  +${r.task.points}`}</Text>
                </Text>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
