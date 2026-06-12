import { useRef, useState } from "react";
import { Modal, Pressable, TextInput, View } from "react-native";
import type { Subtask, Task } from "@grit/core";
import { recurrenceLabel } from "@grit/core";
import { subtaskDone, subtaskShares, useStore } from "../lib/store";
import { C, FONT, LIST_TINT, R, clay, claySm } from "../theme";
import { NumberField, PrimaryButton, TextField, Txt } from "./ui";
import { Icon } from "./Icon";
import { useConfirm } from "./ConfirmDialog";
import { Collapsible, FloatUp, PopIn, Squish } from "./anim";

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
  const [editOpen, setEditOpen] = useState(false);
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

  // `expanded` is the single source of truth for the thread. Collapsing also
  // cancels an in-progress add so it can never get stuck open.
  const open = expanded;
  const showInput = !done && adding;
  const toggleExpand = () =>
    setExpanded((e) => {
      const next = !e;
      if (!next) setAdding(false);
      return next;
    });

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

        {/* Title toggles the action row; the chevron (separate, NOT nested)
            toggles the subtask thread — so the two never conflict. */}
        <View style={{ flex: 1 }}>
          <Pressable onPress={() => setActionsOpen((o) => !o)}>
            <Txt
              weight="semibold"
              size={15}
              color={C.ink}
              style={done ? { textDecorationLine: "line-through", opacity: 0.55 } : undefined}
            >
              {task.title}
            </Txt>
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
            {hasSubs && !future ? (
              <Pressable
                onPress={toggleExpand}
                hitSlop={10}
                style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
              >
                <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} color={tint.acc} />
                <Txt size={11} weight="bold" color={tint.acc}>{doneCount}/{subs.length}</Txt>
              </Pressable>
            ) : null}
            {task.recurrence ? <Txt size={11} weight="medium" color={C.inkSoft}>{recurrenceLabel(task)}</Txt> : null}
            {!task.recurrence && task.archived ? <Txt size={11} weight="medium" color={C.inkSoft}>Achieved</Txt> : null}
          </View>
        </View>

        <View style={{ backgroundColor: C.surface, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Txt size={12} weight="extrabold" color={tint.acc}>+{task.points}</Txt>
        </View>
      </View>

      {/* Action row */}
      {actionsOpen ? (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
          {!done && !future ? <ActionBtn name="ListPlus" color={C.inkFaint} onPress={startAdd} /> : null}
          <ActionBtn name="Pencil" color={C.inkFaint} onPress={() => { setEditOpen(true); setActionsOpen(false); }} />
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

      <EditTaskSheet task={task} open={editOpen} onClose={() => setEditOpen(false)} />

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

/** Bottom-anchored sheet to rename a task and set its XP. */
function EditTaskSheet({ task, open, onClose }: { task: Task; open: boolean; onClose: () => void }) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      {open ? <EditTaskForm task={task} onClose={onClose} /> : null}
    </Modal>
  );
}

function EditTaskForm({ task, onClose }: { task: Task; onClose: () => void }) {
  const { updateTask } = useStore();
  const tint = LIST_TINT[task.listType];
  const hasSubs = (task.subtasks ?? []).length > 0;
  const [title, setTitle] = useState(task.title);
  const [xp, setXp] = useState(String(task.points));

  const save = () => {
    const t = title.trim();
    if (!t) return;
    const xpVal = Math.max(0, Math.round(Number(xp) || 0));
    void updateTask(task.id, { title: t, points: xpVal });
    onClose();
  };

  return (
    <Pressable
      onPress={onClose}
      style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <PopIn>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[{ width: "100%", maxWidth: 360, backgroundColor: C.surface, borderRadius: R.md, padding: 22, gap: 14 }, clay()]}
        >
          <Txt size={18} weight="extrabold">Edit task</Txt>
          <View style={{ gap: 6 }}>
            <Txt size={12} weight="bold" color={C.inkSoft}>Name</Txt>
            <TextField value={title} onChange={setTitle} placeholder="Task name" onSubmit={save} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
            <NumberField label="XP" value={xp} onChange={setXp} suffix="XP" width={120} />
            {hasSubs ? (
              <Txt size={12} weight="medium" color={C.inkFaint} style={{ flex: 1, paddingBottom: 8 }}>
                Splits across its subtasks.
              </Txt>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 4 }}>
            <PrimaryButton label="Save" background={tint.acc} onPress={save} disabled={!title.trim()} />
          </View>
        </Pressable>
      </PopIn>
    </Pressable>
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
  const { toggleSubtask } = useStore();
  const tint = LIST_TINT[task.listType];
  const [editOpen, setEditOpen] = useState(false);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      {/* connector rail */}
      <View style={{ width: 10, alignItems: "center", alignSelf: "stretch" }}>
        <View style={{ width: 2, flex: 1, backgroundColor: isLast ? "transparent" : "rgba(20,26,24,0.12)" }} />
      </View>
      <Squish
        onPress={() => toggleSubtask(task, sub.id)}
        style={[
          { width: 32, height: 32, borderRadius: R.sm, alignItems: "center", justifyContent: "center", backgroundColor: done ? tint.acc : C.surface },
          claySm(),
        ]}
      >
        <Icon name="Check" color={done ? "#fff" : "rgba(20,26,24,0.22)"} size={16} strokeWidth={3.2} />
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
      <View style={{ backgroundColor: C.surface, borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
        <Txt size={11} weight="extrabold" color={tint.acc}>+{share}</Txt>
      </View>
      {/* One roomy touch target (name/XP/delete live in the sheet) */}
      {!parentDone ? (
        <Pressable
          onPress={() => setEditOpen(true)}
          hitSlop={10}
          style={{ width: 34, height: 34, borderRadius: R.pill, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="Pencil" size={16} color={C.inkFaint} />
        </Pressable>
      ) : null}
      <EditSubtaskSheet task={task} sub={sub} share={share} done={done} open={editOpen} onClose={() => setEditOpen(false)} />
    </View>
  );
}

/** Bottom-anchored sheet to rename a subtask, set its XP, or delete it. */
function EditSubtaskSheet({
  task,
  sub,
  share,
  done,
  open,
  onClose,
}: {
  task: Task;
  sub: Subtask;
  share: number;
  done: boolean;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      {open ? <EditSubtaskForm task={task} sub={sub} share={share} done={done} onClose={onClose} /> : null}
    </Modal>
  );
}

function EditSubtaskForm({
  task,
  sub,
  share,
  done,
  onClose,
}: {
  task: Task;
  sub: Subtask;
  share: number;
  done: boolean;
  onClose: () => void;
}) {
  const { editSubtask, removeSubtask } = useStore();
  const confirm = useConfirm();
  const tint = LIST_TINT[task.listType];
  const [title, setTitle] = useState(sub.title);
  const [xp, setXp] = useState(String(share));

  const save = () => {
    const t = title.trim();
    if (!t) return;
    const xpVal = Math.max(0, Math.round(Number(xp) || 0));
    // Only pin the XP if it changed (and the subtask is still open) — a plain
    // rename leaves an auto-split subtask auto.
    void editSubtask(task, sub.id, { title: t, ...(!done && xpVal !== share ? { xp: xpVal } : {}) });
    onClose();
  };

  return (
    <Pressable
      onPress={onClose}
      style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <PopIn>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[{ width: "100%", maxWidth: 360, backgroundColor: C.surface, borderRadius: R.md, padding: 22, gap: 14 }, clay()]}
        >
          <Txt size={18} weight="extrabold">Edit subtask</Txt>
          <View style={{ gap: 6 }}>
            <Txt size={12} weight="bold" color={C.inkSoft}>Name</Txt>
            <TextField value={title} onChange={setTitle} placeholder="Subtask name" onSubmit={save} />
          </View>
          {!done ? (
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
              <NumberField label="XP" value={xp} onChange={setXp} suffix="XP" width={120} />
              <Txt size={12} weight="medium" color={C.inkFaint} style={{ flex: 1, paddingBottom: 8 }}>
                of {task.points} — the rest rebalances.
              </Txt>
            </View>
          ) : (
            <Txt size={12} weight="medium" color={C.inkFaint}>This subtask is done — its {share} XP is locked.</Txt>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
            <Pressable
              onPress={async () => {
                onClose();
                if (await confirm({ title: `Delete "${sub.title}"?`, confirmLabel: "Delete" })) void removeSubtask(task, sub.id);
              }}
              hitSlop={8}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 9, paddingHorizontal: 12, borderRadius: R.sm, backgroundColor: C.page2 }}
            >
              <Icon name="Trash2" size={16} color={C.badAcc} />
              <Txt weight="bold" size={13} color={C.badAcc}>Delete</Txt>
            </Pressable>
            <PrimaryButton label="Save" background={tint.acc} onPress={save} disabled={!title.trim()} />
          </View>
        </Pressable>
      </PopIn>
    </Pressable>
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
