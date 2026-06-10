import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { dayLabel, plannedDays, type Task } from "@grit/core";
import { useStore } from "../lib/store";
import { C } from "../theme";
import { TaskCard } from "../components/TaskCard";
import { Icon } from "../components/Icon";
import { Txt } from "../components/ui";

export function Planned() {
  const { tasks, today } = useStore();
  const days = plannedDays(tasks, today);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 140 }}>
      <Txt size={24} weight="extrabold">Planned</Txt>
      <Txt size={13} weight="medium" color={C.inkSoft} style={{ marginTop: -4 }}>
        What&apos;s coming up over the next 10 days.
      </Txt>

      {days.length === 0 ? (
        <Txt color={C.inkFaint} weight="medium" style={{ paddingVertical: 12 }}>
          Nothing planned. Add a task in My Day with a future date, or set up recurring Must tasks.
        </Txt>
      ) : null}

      {days.map((d) => (
        <PlannedDay key={d.day} day={d.day} today={today} tasks={d.tasks} />
      ))}
    </ScrollView>
  );
}

function PlannedDay({ day, today, tasks }: { day: string; today: string; tasks: Task[] }) {
  const [open, setOpen] = useState(true);
  return (
    <View style={{ gap: 8 }}>
      <Pressable onPress={() => setOpen((o) => !o)} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 2 }}>
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={16} color={C.inkFaint} />
        <Txt weight="bold" size={14}>{dayLabel(day, today)}</Txt>
        <Txt weight="bold" size={14} color={C.inkFaint}>{tasks.length}</Txt>
      </Pressable>
      {open
        ? tasks.map((t) => <TaskCard key={`${day}:${t.id}`} task={t} forDay={day} />)
        : null}
    </View>
  );
}
