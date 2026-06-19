import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import {
  byXp,
  currentMilestone,
  formatStreak,
  nextMilestone,
  streakMs,
  type ListType,
  type Task,
} from "@grit/core";
import { useStore } from "../lib/store";
import { C, FONT, LIST_TINT, R, claySm } from "../theme";
import { TaskCard } from "../components/TaskCard";
import { Icon } from "../components/Icon";
import { SectionTitle, TextField, Txt } from "../components/ui";
import { useConfirm } from "../components/ConfirmDialog";

const TABS: { type: ListType; label: string; icon: string }[] = [
  { type: "must", label: "Must", icon: "Flame" },
  { type: "bad", label: "Bad", icon: "Skull" },
  { type: "cool", label: "Cool", icon: "Sparkles" },
  { type: "impossible", label: "Impossible", icon: "Mountain" },
];

export function Habits() {
  const { tasks, lists, today, completedOn, addList, renameList, removeList, addTask, now } = useStore();
  const confirm = useConfirm();
  const [sel, setSel] = useState<string>("must");
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [newList, setNewList] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const listId = sel.startsWith("list:") ? sel.slice(5) : null;
  const list = listId ? lists.find((l) => l.id === listId) : null;
  const isList = !!list;
  // Safe even for a just-deleted list (falls back to a valid tint this frame).
  const type: ListType = isList
    ? "custom"
    : (["must", "bad", "cool", "impossible"].includes(sel) ? (sel as ListType) : "custom");
  const tint = LIST_TINT[type];

  // If the selected list disappears (deleted here or via sync), reset.
  useEffect(() => {
    if (sel.startsWith("list:") && !lists.some((l) => `list:${l.id}` === sel)) setSel("must");
  }, [sel, lists]);

  const all = isList
    ? tasks.filter((t) => t.listId === listId)
    : tasks.filter((t) => t.listType === sel);
  // Recurring tasks are "done" when completed today; one-shots when archived.
  const isDone = (t: Task) =>
    t.recurrence ? completedOn.has(`${t.id}:${today}`) : t.archived;
  // Bad habits have no XP, so they keep their natural order; everything else
  // sorts by XP, highest first.
  const active =
    type === "bad" ? all.filter((t) => !t.archived) : byXp(all.filter((t) => !isDone(t)));
  const achieved = type === "bad" ? [] : byXp(all.filter(isDone));

  const submit = () => {
    const n = draft.trim();
    if (!n) return;
    void addTask({ listType: type, title: n, ...(isList && listId ? { listId } : {}) });
    setDraft("");
  };

  // onSubmitEditing + onBlur can both fire — guard so we create exactly once.
  const creatingRef = useRef(false);
  const createList = async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    const n = newList.trim();
    setNewList("");
    setCreating(false);
    if (n) {
      const l = await addList(n);
      setSel(`list:${l.id}`);
    }
    creatingRef.current = false;
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
      <Txt size={24} weight="extrabold">Habits & Lists</Txt>

      {/* Selector: gamified types + custom lists + new */}
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {TABS.map((t) => {
          const on = sel === t.type;
          const tt = LIST_TINT[t.type];
          return (
            <Chip key={t.type} icon={t.icon} label={t.label} on={on} color={tt.acc} onPress={() => setSel(t.type)} />
          );
        })}
        {lists.map((l) => (
          <Chip
            key={l.id}
            icon="ListChecks"
            label={l.name}
            on={sel === `list:${l.id}`}
            color={C.primary}
            onPress={() => setSel(`list:${l.id}`)}
          />
        ))}
        {creating ? (
          <TextInput
            autoFocus
            value={newList}
            onChangeText={setNewList}
            onBlur={createList}
            onSubmitEditing={createList}
            placeholder="List name"
            placeholderTextColor={C.inkFaint}
            style={{ minWidth: 130, backgroundColor: C.surface, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 8, fontFamily: FONT.bold, fontSize: 13, color: C.ink }}
          />
        ) : (
          <Pressable onPress={() => setCreating(true)} style={[{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill, backgroundColor: C.surface }, claySm()]}>
            <Icon name="Plus" size={16} color={C.primary} />
            <Txt weight="bold" size={13} color={C.primary}>New list</Txt>
          </Pressable>
        )}
      </View>

      {/* Custom list header: rename + delete */}
      {isList && list ? (
        <View style={[{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: R.md, backgroundColor: C.surface }, claySm()]}>
          <View style={{ width: 40, height: 40, borderRadius: R.sm, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" }}>
            <Icon name="ListChecks" color="#fff" size={20} />
          </View>
          {editingName ? (
            <TextInput
              autoFocus
              value={nameDraft}
              onChangeText={setNameDraft}
              onBlur={() => { void renameList(list.id, nameDraft); setEditingName(false); }}
              onSubmitEditing={() => { void renameList(list.id, nameDraft); setEditingName(false); }}
              style={{ flex: 1, fontFamily: FONT.extrabold, fontSize: 18, color: C.ink }}
            />
          ) : (
            <Pressable style={{ flex: 1 }} onPress={() => { setNameDraft(list.name); setEditingName(true); }}>
              <Txt size={18} weight="extrabold" numberOfLines={1}>{list.name}</Txt>
              <Txt size={11} weight="medium" color={C.inkFaint}>{active.length} {active.length === 1 ? "task" : "tasks"} · tap to rename</Txt>
            </Pressable>
          )}
          <Pressable
            onPress={async () => {
              if (await confirm({ title: `Delete list "${list.name}"?`, message: "Its tasks will be deleted too.", confirmLabel: "Delete" })) {
                setSel("must");
                void removeList(list.id);
              }
            }}
            style={{ padding: 6 }}
          >
            <Icon name="Trash2" size={18} color={C.inkFaint} />
          </Pressable>
        </View>
      ) : null}

      {/* Add task */}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <TextField value={draft} onChange={setDraft} placeholder={`Add to ${isList && list ? list.name : type}…`} onSubmit={submit} />
        </View>
        <Pressable onPress={submit} style={{ width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: tint.acc }}>
          <Icon name="Plus" color="#fff" size={20} />
        </Pressable>
      </View>

      {active.length === 0 && achieved.length === 0 ? (
        <Txt color={C.inkFaint} weight="medium" style={{ paddingVertical: 12 }}>
          Nothing here yet — add your first one above.
        </Txt>
      ) : null}

      {/* Active + achieved are kept as siblings of one parent (no Fragment) so
          a one-shot task completing — which moves it across the divider —
          keeps its card mounted and its +XP float animation plays. */}
      {type === "bad"
        ? active.map((t) => <BadCard key={t.id} task={t} now={now} />)
        : active.map((t) => <TaskCard key={t.id} task={t} />)}

      {achieved.length > 0 ? (
        <View key="__achieved_header" style={{ marginTop: 8 }}>
          <SectionTitle>{type === "cool" || type === "impossible" ? "Achieved" : "Done"}</SectionTitle>
        </View>
      ) : null}
      {achieved.map((t) => (
        <TaskCard key={t.id} task={t} />
      ))}
    </ScrollView>
  );
}

function Chip({ icon, label, on, color, onPress }: { icon: string; label: string; on: boolean; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill, backgroundColor: on ? color : C.surface, maxWidth: 200 },
        claySm(),
      ]}
    >
      <Icon name={icon} size={16} color={on ? "#fff" : color} />
      <Txt weight="bold" size={13} color={on ? "#fff" : C.inkSoft} numberOfLines={1}>
        {label}
      </Txt>
    </Pressable>
  );
}

function BadCard({ task, now }: { task: Task; now: number }) {
  const { recordSlip, removeTask, updateTask } = useStore();
  const confirm = useConfirm();
  const tint = LIST_TINT.bad;
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [penaltyDraft, setPenaltyDraft] = useState("");

  const streak = streakMs(now, task.lastSlipAt, task.createdAt);
  // Personal best: stored best (set on slip) or the live streak if it's longer.
  const best = Math.max(task.bestStreakMs ?? 0, streak);
  const reached = currentMilestone(streak);
  const next = nextMilestone(streak);
  const floor = reached?.ms ?? 0;
  const ceil = next?.ms ?? streak;
  const span = ceil - floor;
  const progress = span > 0 ? Math.min(1, (streak - floor) / span) : 1;

  const startEdit = () => {
    setTitleDraft(task.title);
    setPenaltyDraft(String(task.slipPenalty ?? 0));
    setEditing(true);
  };
  const commitEdit = () => {
    const title = titleDraft.trim();
    const slipPenalty = Math.max(0, Math.round(Number(penaltyDraft)));
    void updateTask(task.id, {
      ...(title ? { title } : {}),
      ...(Number.isFinite(slipPenalty) ? { slipPenalty } : {}),
    });
    setEditing(false);
  };

  return (
    <View style={[{ backgroundColor: tint.surf, borderRadius: R.md, padding: 14, gap: 10 }, claySm()]}>
      {/* Header: icon + title/penalty + actions */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: C.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="Skull" color={tint.acc} size={20} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <>
              <TextInput
                autoFocus
                value={titleDraft}
                onChangeText={setTitleDraft}
                placeholder="Task name"
                placeholderTextColor={C.inkFaint}
                style={{ fontFamily: FONT.bold, fontSize: 15, color: C.ink, paddingVertical: 0 }}
              />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                <Txt size={12} weight="semibold" color={C.inkSoft}>−</Txt>
                <TextInput
                  value={penaltyDraft}
                  onChangeText={setPenaltyDraft}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={C.inkFaint}
                  style={{ fontFamily: FONT.semibold, fontSize: 12, color: C.ink, minWidth: 36, paddingVertical: 0 }}
                />
                <Txt size={12} weight="semibold" color={C.inkSoft}>XP if you slip</Txt>
              </View>
            </>
          ) : (
            <>
              <Txt weight="bold" size={15} numberOfLines={1}>
                {task.title}
              </Txt>
              <Txt size={12} weight="semibold" color={C.inkSoft}>
                −{task.slipPenalty} XP if you slip
              </Txt>
            </>
          )}
        </View>
        {editing ? (
          <Pressable
            onPress={commitEdit}
            style={[
              { width: 34, height: 34, borderRadius: R.sm, backgroundColor: tint.acc, alignItems: "center", justifyContent: "center" },
              claySm(),
            ]}
          >
            <Icon name="Check" size={18} color="#fff" strokeWidth={3} />
          </Pressable>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Pressable onPress={startEdit} style={{ padding: 4 }} hitSlop={6}>
              <Icon name="Pencil" size={16} color={C.inkFaint} />
            </Pressable>
            <Pressable
              onPress={async () => {
                if (await confirm({ title: `Delete "${task.title}"?`, confirmLabel: "Delete" }))
                  void removeTask(task.id);
              }}
              style={{ padding: 4 }}
              hitSlop={6}
            >
              <Icon name="Trash2" size={16} color={C.inkFaint} />
            </Pressable>
          </View>
        )}
      </View>

      {/* Streak readout */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Icon name="Shield" color={tint.acc} size={18} />
            <Txt size={22} weight="extrabold" color={tint.acc}>
              {formatStreak(streak)}
            </Txt>
          </View>
          <Txt size={11} weight="semibold" color={C.inkSoft}>
            {reached ? `${reached.label} clean` : "clean streak"}
          </Txt>
          {(task.bestStreakMs ?? 0) >= 60_000 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 }}>
              <Icon name="Trophy" color={C.gold} size={13} />
              <Txt size={11} weight="bold" color={C.gold}>
                {formatStreak(best)} best
              </Txt>
            </View>
          )}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Txt size={11} weight="semibold" color={C.inkSoft}>
            {next ? `Next: ${next.label}` : "Maxed out 🏆"}
          </Txt>
          {next && (
            <Txt size={11} weight="medium" color={C.inkFaint}>
              +{Math.round(next.baseXp * (task.rewardMultiplier ?? 1))} XP
            </Txt>
          )}
        </View>
      </View>

      {/* Progress to next milestone */}
      <View style={{ height: 10, borderRadius: 999, backgroundColor: C.surface, overflow: "hidden" }}>
        <View
          style={{
            height: "100%",
            width: `${Math.round(progress * 100)}%`,
            backgroundColor: tint.acc,
            borderRadius: 999,
          }}
        />
      </View>

      <Pressable
        onPress={() => recordSlip(task)}
        style={[
          { backgroundColor: tint.acc, borderRadius: R.sm, paddingVertical: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
          claySm(),
        ]}
      >
        <Icon name="Skull" size={16} color="#fff" />
        <Txt weight="bold" color="#fff">
          I slipped
        </Txt>
      </Pressable>
    </View>
  );
}
