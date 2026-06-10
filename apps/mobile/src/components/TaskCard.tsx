import { useState } from "react";
import { Pressable, View } from "react-native";
import { recurrenceLabel, type Task } from "@grit/core";
import { useStore } from "../lib/store";
import { C, LIST_TINT, R, claySm } from "../theme";
import { Txt } from "./ui";
import { Icon } from "./Icon";
import { useConfirm } from "./ConfirmDialog";

/** A positive task (Must / Cool / Impossible / custom). */
export function TaskCard({ task, showMustBadge }: { task: Task; showMustBadge?: boolean }) {
  const { today, completedOn, toggleMust, achieve, unachieve, toggleImportant, toggleMyDay, removeTask } =
    useStore();
  const tint = LIST_TINT[task.listType];
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);

  const done = task.recurrence ? completedOn.has(`${task.id}:${today}`) : task.archived;

  const onToggle = () => {
    if (task.recurrence) return void toggleMust(task);
    return void (task.archived ? unachieve(task) : achieve(task));
  };

  return (
    <View
      style={[
        { backgroundColor: tint.surf, borderRadius: R.md, padding: 12 },
        claySm(),
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable
          onPress={onToggle}
          style={[
            {
              width: 40,
              height: 40,
              borderRadius: R.sm,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: done ? tint.acc : C.surface,
            },
            claySm(),
          ]}
        >
          <Icon name="Check" color={done ? "#fff" : "rgba(20,26,24,0.22)"} size={20} strokeWidth={3.2} />
        </Pressable>

        <Pressable style={{ flex: 1 }} onPress={() => setOpen((o) => !o)}>
          <Txt
            weight="semibold"
            size={15}
            color={C.ink}
            style={done ? { textDecorationLine: "line-through", opacity: 0.55 } : undefined}
          >
            {task.title}
            {showMustBadge && task.listType === "must" ? "  " : ""}
          </Txt>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
            {task.recurrence ? (
              <Txt size={11} weight="medium" color={C.inkSoft}>
                {recurrenceLabel(task)}
              </Txt>
            ) : null}
            {!task.recurrence && task.archived ? (
              <Txt size={11} weight="medium" color={C.inkSoft}>
                Achieved
              </Txt>
            ) : null}
          </View>
        </Pressable>

        <View style={{ backgroundColor: C.surface, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Txt size={12} weight="extrabold" color={tint.acc}>
            +{task.points}
          </Txt>
        </View>
      </View>

      {open ? (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
          <ActionBtn name="Star" active={!!task.important} color={tint.acc} onPress={() => toggleImportant(task)} />
          <ActionBtn name="Sun" active={!!task.starredMyDay} color={tint.acc} onPress={() => toggleMyDay(task)} />
          <ActionBtn
            name="Trash2"
            color={C.inkFaint}
            onPress={async () => {
              if (await confirm({ title: `Delete "${task.title}"?`, confirmLabel: "Delete" }))
                void removeTask(task.id);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

function ActionBtn({
  name,
  onPress,
  active,
  color,
}: {
  name: string;
  onPress: () => void;
  active?: boolean;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 36,
        height: 36,
        borderRadius: R.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.04)",
      }}
    >
      <Icon name={name} size={18} color={active ? color : C.inkFaint} />
    </Pressable>
  );
}
