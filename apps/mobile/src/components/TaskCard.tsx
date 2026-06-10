import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import type { Subtask, Task } from "@grit/core";
import { recurrenceLabel } from "@grit/core";
import { subtaskDone, subtaskShares, useStore } from "../lib/store";
import { C, FONT, LIST_TINT, R, claySm } from "../theme";
import { Txt } from "./ui";
import { Icon } from "./Icon";
import { useConfirm } from "./ConfirmDialog";
import { Collapsible, FloatUp, Squish } from "./anim";

/** A positive task (Must / Cool / Impossible / custom), with subtasks. */
export function TaskCard({
  task,
  showMustBadge,
  forDay,
}: {
  task: Task;
  showMustBadge?: boolean;
  forDay?: string;
}) {
  const {
    today,
    completedOn,
    toggleMust,
    achieve,
    unachieve,
    toggleImportant,
    toggleMyDay,
    removeTask,
    addSubtask,
    setAllSubtasks,
  } = useStore();
  const tint = LIST_TINT[task.listType];
  const confirm = useConfirm();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [float, setFloat] = useState<number | null>(null);
  const inputRef = useRef<TextInput>(null);

  const day = forDay ?? today;
  const future = day !== today;
  const subs = task.subtasks ?? [];
  const hasSubs = subs.length > 0;
  const isSubDone = (s: Subtask) => subtaskDone(task, s, day);
  const doneCount = subs.filter(isSubDone).length;
  const shares = subtaskShares(task, day);

  const done = task.recurrence ? completedOn.has(`${task.id}:${day}`) : task.archived;
  const partial = hasSubs && !done && doneCount > 0 && !future;

  const floatXp = hasSubs && !future
    ? subs.filter((s) => !isSubDone(s)).reduce((sum, s) => sum + (shares.get(s.id) ?? 0), 0)
    : task.points;

  const onToggle = () => {
    if (!done) setFloat(Date.now());
    if (hasSubs && !future) return void setAllSubtasks(task, !done);
    if (task.recurrence) return void toggleMust(task, day);
    return void (task.archived ? unachieve(task) : achieve(task));
  };

  const startAdd = () => {
    setAdding(true);
    setExpanded(true);
    setActionsOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const submitSub = () => {
    const t = draft.trim();
    if (!t) return;
    void addSubtask(task, t);
    setDraft("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const open = (expanded && hasSubs) || adding;
  const showInput = !done && (adding || (expanded && hasSubs));

  return (
    <View style={[{ backgroundColor: tint.surf, borderRadius: R.md, padding: 12 }, claySm()]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View>
          {float !== null ? (
            <FloatUp key={float} style={{ position: "absolute", top: -18, left: 0, right: 0, alignItems: "center", zIndex: 5 }}>
              <Txt weight="extrabold" size={16} color={tint.acc}>+{floatXp}</Txt>
            </FloatUp>
          ) : null}
          <Squish
            onPress={onToggle}
            style={[
              {
                width: 40,
                height: 40,
                borderRadius: R.sm,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: done ? tint.acc : C.surface,
                borderWidth: partial ? 3 : 0,
                borderColor: partial ? tint.acc : "transparent",
              },
              claySm(),
            ]}
          >
            <Icon name="Check" color={done ? "#fff" : "rgba(20,26,24,0.22)"} size={20} strokeWidth={3.2} />
          </Squish>
        </View>

        <Pressable style={{ flex: 1 }} onPress={() => setActionsOpen((o) => !o)}>
          <Txt
            weight="semibold"
            size={15}
            color={C.ink}
            style={done ? { textDecorationLine: "line-through", opacity: 0.55 } : undefined}
          >
            {task.title}
          </Txt>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
            {hasSubs && !future ? (
              <Pressable
                onPress={() => setExpanded((e) => !e)}
                style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
              >
                <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} color={tint.acc} />
                <Txt size={11} weight="bold" color={tint.acc}>{doneCount}/{subs.length}</Txt>
              </Pressable>
            ) : null}
            {task.recurrence ? <Txt size={11} weight="medium" color={C.inkSoft}>{recurrenceLabel(task)}</Txt> : null}
            {!task.recurrence && task.archived ? <Txt size={11} weight="medium" color={C.inkSoft}>Achieved</Txt> : null}
          </View>
        </Pressable>

        <View style={{ backgroundColor: C.surface, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Txt size={12} weight="extrabold" color={tint.acc}>+{task.points}</Txt>
        </View>
      </View>

      {/* Action row */}
      {actionsOpen ? (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
          {!done && !future ? <ActionBtn name="ListPlus" color={C.inkFaint} onPress={startAdd} /> : null}
          <ActionBtn name="Star" active={!!task.important} color={tint.acc} onPress={() => toggleImportant(task)} />
          <ActionBtn name="Sun" active={!!task.starredMyDay} color={tint.acc} onPress={() => toggleMyDay(task)} />
          <ActionBtn
            name="Trash2"
            color={C.inkFaint}
            onPress={async () => {
              if (await confirm({ title: `Delete "${task.title}"?`, confirmLabel: "Delete" })) void removeTask(task.id);
            }}
          />
        </View>
      ) : null}

      {/* Subtask thread — animated expand/collapse */}
      {(hasSubs || adding) && !future ? (
        <Collapsible open={open}>
          <View style={{ gap: 8, paddingTop: 10, paddingLeft: 8 }}>
            {subs.map((s, i) => (
              <SubtaskRow
                key={s.id}
                task={task}
                sub={s}
                share={shares.get(s.id) ?? 0}
                done={isSubDone(s)}
                parentDone={done}
                isLast={i === subs.length - 1 && !showInput}
              />
            ))}
            {showInput ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 18 }}>
                <TextInput
                  ref={inputRef}
                  value={draft}
                  onChangeText={setDraft}
                  onSubmitEditing={submitSub}
                  onBlur={() => { if (!draft.trim()) setAdding(false); }}
                  placeholder="Add a subtask…"
                  placeholderTextColor={C.inkFaint}
                  style={{ flex: 1, backgroundColor: C.surface, borderRadius: R.sm, paddingHorizontal: 12, paddingVertical: 8, fontFamily: FONT.medium, fontSize: 14, color: C.ink }}
                />
                <Pressable
                  onPress={submitSub}
                  disabled={!draft.trim()}
                  style={[{ width: 36, height: 36, borderRadius: R.sm, alignItems: "center", justifyContent: "center", backgroundColor: tint.acc, opacity: draft.trim() ? 1 : 0.4 }, claySm()]}
                >
                  <Icon name="Plus" color="#fff" size={16} />
                </Pressable>
              </View>
            ) : null}
          </View>
        </Collapsible>
      ) : null}
    </View>
  );
}

function SubtaskRow({
  task,
  sub,
  share,
  done,
  parentDone,
  isLast,
}: {
  task: Task;
  sub: Subtask;
  share: number;
  done: boolean;
  parentDone: boolean;
  isLast: boolean;
}) {
  const { toggleSubtask, removeSubtask } = useStore();
  const tint = LIST_TINT[task.listType];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      {/* connector rail */}
      <View style={{ width: 10, alignItems: "center", alignSelf: "stretch" }}>
        <View style={{ width: 2, flex: 1, backgroundColor: isLast ? "transparent" : "rgba(20,26,24,0.12)" }} />
      </View>
      <Squish
        onPress={() => toggleSubtask(task, sub.id)}
        style={[
          { width: 30, height: 30, borderRadius: R.sm, alignItems: "center", justifyContent: "center", backgroundColor: done ? tint.acc : C.surface },
          claySm(),
        ]}
      >
        <Icon name="Check" color={done ? "#fff" : "rgba(20,26,24,0.22)"} size={15} strokeWidth={3.2} />
      </Squish>
      <Txt
        weight="medium"
        size={13}
        color={C.ink}
        numberOfLines={2}
        style={[{ flex: 1 }, done ? { textDecorationLine: "line-through", opacity: 0.55 } : undefined]}
      >
        {sub.title}
      </Txt>
      <View style={{ backgroundColor: C.surface, borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
        <Txt size={11} weight="extrabold" color={tint.acc}>+{share}</Txt>
      </View>
      {!parentDone ? (
        <Pressable onPress={() => removeSubtask(task, sub.id)} style={{ padding: 4 }}>
          <Icon name="Trash2" size={14} color={C.inkFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ActionBtn({ name, onPress, active, color }: { name: string; onPress: () => void; active?: boolean; color: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ width: 36, height: 36, borderRadius: R.pill, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.04)" }}
    >
      <Icon name={name} size={18} color={active ? color : C.inkFaint} />
    </Pressable>
  );
}
