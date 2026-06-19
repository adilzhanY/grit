/** Must — recurring habits. List view + a week/month/year completion heatmap. */
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { type Task, type Recurrence } from "@grit/core";
import { useStore } from "../../store/store";
import { useUI } from "../ui";
import { theme } from "../theme";
import { TaskListView, taskDone } from "../components/TaskListView";
import { Heatmap } from "../components/Heatmap";

const RECURRENCE_CHOICES: { label: string; value: string; rec: Recurrence }[] = [
  { label: "Every day", value: "daily", rec: { type: "daily", weekdays: [] } },
  { label: "Weekdays (Mon–Fri)", value: "weekdays", rec: { type: "weekly", weekdays: [1, 2, 3, 4, 5] } },
  { label: "Weekly (anchor day)", value: "weekly", rec: { type: "weekly", weekdays: [] } },
];

export function MustView() {
  const store = useStore();
  const ui = useUI();
  const [heatmap, setHeatmap] = useState(false);
  const isActive = !ui.inputCaptured && ui.view === "must";

  const all = store.tasks.filter((t) => t.listType === "must" && !t.archived);
  const list: Task[] = [
    ...all.filter((t) => !taskDone(t, store.today, store.completedOn)),
    ...all.filter((t) => taskDone(t, store.today, store.completedOn)),
  ];

  // 'H' toggles the heatmap; runs alongside the list keymap (non-overlapping).
  useInput(
    (input) => {
      if (input === "H") setHeatmap((h) => !h);
    },
    { isActive },
  );

  const onAdd = () => {
    void (async () => {
      const title = await ui.prompt({ label: "New habit", placeholder: "what must you do?" });
      if (!title) return;
      const recVal = await ui.choose({
        title: "Repeat",
        items: RECURRENCE_CHOICES.map((c) => ({ label: c.label, value: c.value })),
      });
      const rec = RECURRENCE_CHOICES.find((c) => c.value === recVal)?.rec;
      const xp = await ui.prompt({ label: "XP per completion", initial: "10" });
      await store.addTask({
        listType: "must",
        title,
        points: Math.max(0, Math.round(Number(xp) || 10)),
        recurrence: rec,
      });
    })();
  };

  if (heatmap) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box>
          <Text bold color={theme.must}>
            Must · Heatmap
          </Text>
          <Text color={theme.inkFaint}>{"   H back to list"}</Text>
        </Box>
        <Heatmap tasks={all} isActive={isActive} />
      </Box>
    );
  }

  const doneCount = all.filter((t) => taskDone(t, store.today, store.completedOn)).length;
  return (
    <TaskListView
      title="Must"
      subtitle={`${all.length} habits · ${doneCount} done today · H heatmap`}
      color={theme.must}
      tasks={list}
      day={store.today}
      isActive={isActive}
      onAdd={onAdd}
      emptyHint="No habits yet. Press a to add one."
    />
  );
}
