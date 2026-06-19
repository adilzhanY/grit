import { ScrollView, View } from "react-native";
import { byMyDayPriority, myDayTasks, showsInMyDayDone, type Task } from "@grit/core";
import { useStore } from "../lib/store";
import { C } from "../theme";
import { XpHero } from "../components/XpHero";
import { TaskCard } from "../components/TaskCard";
import { AddTask } from "../components/AddTask";
import { SectionTitle, Txt } from "../components/ui";

export function Today() {
  const { tasks, today, completedToday } = useStore();

  // My Day orders by its own priority ladder (Important → Repeated → Must → rest).
  const all = byMyDayPriority(myDayTasks(tasks, today));
  const isDone = (t: Task) => (t.recurrence ? completedToday.has(t.id) : t.archived);
  const active = all.filter((t) => !isDone(t));
  // Done lists only what the day owns: Musts done today + My-Day-native one-shots
  // done today. Pinned Important/Impossible/Cool/custom-list tasks leave My Day
  // when done (they show on their own page), and yesterday's completions drop off.
  const done = all.filter((t) => isDone(t) && showsInMyDayDone(t, today));

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 140 }}
      keyboardShouldPersistTaps="handled"
    >
      <XpHero />

      <Txt size={24} weight="extrabold" style={{ marginTop: 4 }}>
        My Day
      </Txt>

      <AddTask />

      {all.length === 0 ? (
        <Txt color={C.inkFaint} weight="medium" style={{ paddingVertical: 12 }}>
          Nothing in My Day yet. Add a task above, or pin one with the sun.
        </Txt>
      ) : null}

      {/* Flat siblings (no Fragment) so a task moving to Done keeps its card
          mounted and the +XP float animation plays. */}
      {active.map((t) => (
        <TaskCard key={t.id} task={t} showMustBadge />
      ))}

      {done.length > 0 ? (
        <View key="__done_header" style={{ marginTop: 8 }}>
          <SectionTitle>Done</SectionTitle>
        </View>
      ) : null}
      {done.map((t) => (
        <TaskCard key={t.id} task={t} showMustBadge />
      ))}
    </ScrollView>
  );
}
