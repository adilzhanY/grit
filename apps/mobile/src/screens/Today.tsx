import { useState } from "react";
import { ScrollView, View } from "react-native";
import { myDayTasks, type Task } from "@grit/core";
import { useStore } from "../lib/store";
import { C } from "../theme";
import { XpHero } from "../components/XpHero";
import { TaskCard } from "../components/TaskCard";
import { Icon } from "../components/Icon";
import { SectionTitle, TextField, Txt } from "../components/ui";
import { Pressable } from "react-native";

export function Today() {
  const { tasks, today, completedToday, addTask } = useStore();
  const [draft, setDraft] = useState("");

  const all = myDayTasks(tasks, today);
  const isDone = (t: Task) => (t.recurrence ? completedToday.has(t.id) : t.archived);
  const active = all.filter((t) => !isDone(t));
  const done = all.filter(isDone);

  const submit = () => {
    const n = draft.trim();
    if (!n) return;
    void addTask({ listType: "custom", title: n, starredMyDay: true });
    setDraft("");
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 140 }}
      keyboardShouldPersistTaps="handled"
    >
      <XpHero />

      <Txt size={24} weight="extrabold" style={{ marginTop: 4 }}>
        My Day
      </Txt>

      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <TextField value={draft} onChange={setDraft} placeholder="Add a task to today…" onSubmit={submit} />
        </View>
        <Pressable
          onPress={submit}
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: C.primary,
          }}
        >
          <Icon name="Plus" color="#fff" size={20} />
        </Pressable>
      </View>

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
