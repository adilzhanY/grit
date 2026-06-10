import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { formatStreak, streakMs, type ListType, type Task } from "@grit/core";
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
  const { tasks, lists, addList, renameList, removeList, addTask, now } = useStore();
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
  const active = all.filter((t) => !t.archived);
  const achieved = all.filter((t) => t.archived);

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
          <SectionTitle>{isList ? "Done" : "Achieved"}</SectionTitle>
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
  const { recordSlip, removeTask } = useStore();
  const confirm = useConfirm();
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
        <Pressable
          onPress={async () => {
            if (await confirm({ title: `Delete "${task.title}"?`, confirmLabel: "Delete" }))
              void removeTask(task.id);
          }}
          style={{ padding: 4 }}
        >
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
