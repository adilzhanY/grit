import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { formatStreak, streakMs, type ListType, type Task } from "@grit/core";
import { useStore } from "../lib/store";
import { C, LIST_TINT, R, claySm } from "../theme";
import { TaskCard } from "../components/TaskCard";
import { Icon } from "../components/Icon";
import { SectionTitle, TextField, Txt } from "../components/ui";

const TABS: { type: ListType; label: string; icon: string }[] = [
  { type: "must", label: "Must", icon: "Flame" },
  { type: "bad", label: "Bad", icon: "Skull" },
  { type: "cool", label: "Cool", icon: "Sparkles" },
  { type: "impossible", label: "Impossible", icon: "Mountain" },
];

export function Habits() {
  const { tasks, addTask, now } = useStore();
  const [type, setType] = useState<ListType>("must");
  const [draft, setDraft] = useState("");
  const tint = LIST_TINT[type];

  const all = tasks.filter((t) => t.listType === type);
  const active = all.filter((t) => !t.archived);
  const achieved = all.filter((t) => t.archived);

  const submit = () => {
    const n = draft.trim();
    if (!n) return;
    void addTask({ listType: type, title: n });
    setDraft("");
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
      <Txt size={24} weight="extrabold">
        Habits
      </Txt>

      {/* Segmented tabs */}
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {TABS.map((t) => {
          const on = type === t.type;
          const tt = LIST_TINT[t.type];
          return (
            <Pressable
              key={t.type}
              onPress={() => setType(t.type)}
              style={[
                {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: R.pill,
                  backgroundColor: on ? tt.acc : C.surface,
                },
                claySm(),
              ]}
            >
              <Icon name={t.icon} size={16} color={on ? "#fff" : tt.acc} />
              <Txt weight="bold" size={13} color={on ? "#fff" : C.inkSoft}>
                {t.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <TextField value={draft} onChange={setDraft} placeholder={`Add to ${type}…`} onSubmit={submit} />
        </View>
        <Pressable
          onPress={submit}
          style={{ width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: tint.acc }}
        >
          <Icon name="Plus" color="#fff" size={20} />
        </Pressable>
      </View>

      {active.length === 0 && achieved.length === 0 ? (
        <Txt color={C.inkFaint} weight="medium" style={{ paddingVertical: 12 }}>
          Nothing here yet — add your first one above.
        </Txt>
      ) : null}

      {type === "bad"
        ? active.map((t) => <BadCard key={t.id} task={t} now={now} />)
        : active.map((t) => <TaskCard key={t.id} task={t} />)}

      {achieved.length > 0 ? (
        <>
          <View style={{ marginTop: 8 }}>
            <SectionTitle>Achieved</SectionTitle>
          </View>
          {achieved.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function BadCard({ task, now }: { task: Task; now: number }) {
  const { recordSlip, removeTask } = useStore();
  const tint = LIST_TINT.bad;
  const streak = streakMs(now, task.lastSlipAt, task.createdAt);
  return (
    <View style={[{ backgroundColor: tint.surf, borderRadius: R.md, padding: 14 }, claySm()]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <Icon name="Skull" color={tint.acc} size={20} />
          <Txt weight="bold" size={15} numberOfLines={1} style={{ flex: 1 }}>
            {task.title}
          </Txt>
        </View>
        <Pressable onPress={() => removeTask(task.id)} style={{ padding: 4 }}>
          <Icon name="Trash2" size={16} color={C.inkFaint} />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 10 }}>
        <View>
          <Txt size={22} weight="extrabold" color={tint.acc}>
            {formatStreak(streak)}
          </Txt>
          <Txt size={11} weight="semibold" color={C.inkFaint}>
            clean streak
          </Txt>
        </View>
        <Pressable
          onPress={() => recordSlip(task)}
          style={[{ backgroundColor: tint.acc, borderRadius: R.sm, paddingHorizontal: 16, paddingVertical: 9 }, claySm()]}
        >
          <Txt weight="bold" color="#fff">
            I slipped
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}
