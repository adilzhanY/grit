/**
 * Habits & Lists — "Library" (hub-and-spoke; Adilzhan picked it from the
 * lavish review `.lavish/grit-habits-redesign.html`, 2026-08-09).
 *
 * The old screen selected lists with a wrapping chip cloud; at 12 lists that
 * was three rows of look-alike pills with the content below the fold. Now the
 * screen is an INDEX worth reading on its own — the four game types as stat
 * tiles (progress today, clean streak) and each custom list as a row with its
 * count and next task — and tapping anything pushes a full-screen DETAIL for
 * that one list (slide-in, back arrow, Android back pops it). Custom lists
 * order by most recent task activity, like saved foods.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, BackHandler, Easing, Pressable, ScrollView, TextInput, View } from "react-native";
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
import { C, EDGE, FONT, LIST_TINT, R, TOP_BAR_SPACE, claySm, glow } from "../theme";
import { TaskCard } from "../components/TaskCard";
import { Icon } from "../components/Icon";
import { SectionTitle, TextField, Txt } from "../components/ui";
import { useConfirm } from "../components/ConfirmDialog";

const TYPES: { type: ListType; label: string; icon: string }[] = [
  { type: "must", label: "Must", icon: "Flame" },
  { type: "bad", label: "Bad", icon: "Skull" },
  { type: "cool", label: "Cool", icon: "Sparkles" },
  { type: "impossible", label: "Impossible", icon: "Mountain" },
];

export function Habits() {
  const { lists } = useStore();
  /** null = index; "must"…"impossible" or "list:<id>" = detail. */
  const [open, setOpen] = useState<string | null>(null);

  // Hardware back pops the detail instead of leaving the app.
  useEffect(() => {
    if (open === null) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setOpen(null);
      return true;
    });
    return () => sub.remove();
  }, [open]);

  // If the open list disappears (deleted here or via sync), fall back.
  useEffect(() => {
    if (open?.startsWith("list:") && !lists.some((l) => `list:${l.id}` === open)) setOpen(null);
  }, [open, lists]);

  return open === null ? (
    <ListIndex onOpen={setOpen} />
  ) : (
    <SlideIn>
      <ListDetail sel={open} onBack={() => setOpen(null)} />
    </SlideIn>
  );
}

/** Short slide-from-the-right so the detail reads as a pushed sub-screen. */
function SlideIn({ children }: { children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v]);
  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: v,
        transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [56, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

// ---------------------------------------------------------------- index ----

function ListIndex({ onOpen }: { onOpen: (sel: string) => void }) {
  const { tasks, lists, today, completedOn, addList, now } = useStore();
  const [creating, setCreating] = useState(false);
  const [newList, setNewList] = useState("");

  const isDone = (t: Task) => (t.recurrence ? completedOn.has(`${t.id}:${today}`) : t.archived);

  // Custom lists by most recent task activity (created or achieved), newest
  // first — the list you touched last is the one you'll want next.
  const ordered = useMemo(() => {
    const latest = new Map<string, number>();
    for (const t of tasks) {
      if (!t.listId) continue;
      const ts = Math.max(t.createdAt ?? 0, t.achievedAt ?? 0);
      latest.set(t.listId, Math.max(latest.get(t.listId) ?? 0, ts));
    }
    return [...lists].sort((a, b) => (latest.get(b.id) ?? 0) - (latest.get(a.id) ?? 0));
  }, [lists, tasks]);

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
      onOpen(`list:${l.id}`);
    }
    creatingRef.current = false;
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingTop: TOP_BAR_SPACE + 16, gap: 12, paddingBottom: 140 }}
      keyboardShouldPersistTaps="handled"
    >
      <Txt size={24} weight="extrabold">Habits & Lists</Txt>

      <SectionTitle>The four games</SectionTitle>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {TYPES.map((t) => (
          <TypeTile key={t.type} type={t.type} label={t.label} icon={t.icon} onPress={() => onOpen(t.type)} />
        ))}
      </View>

      <View style={{ marginTop: 6 }}>
        <SectionTitle>Your lists</SectionTitle>
      </View>
      {ordered.map((l) => {
        const its = tasks.filter((t) => t.listId === l.id);
        const active = byXp(its.filter((t) => !isDone(t)));
        return (
          <Pressable
            key={l.id}
            onPress={() => onOpen(`list:${l.id}`)}
            style={[
              {
                flexDirection: "row",
                alignItems: "center",
                gap: 13,
                backgroundColor: C.surface,
                borderWidth: 1,
                borderColor: EDGE,
                borderRadius: 20,
                padding: 13,
              },
              claySm(),
            ]}
          >
            <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: "rgba(255,122,26,0.10)", alignItems: "center", justifyContent: "center" }}>
              <Icon name="ListChecks" size={20} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt size={14.5} weight="bold" numberOfLines={1}>{l.name}</Txt>
              <Txt size={11} weight="medium" color={C.inkFaint} numberOfLines={1}>
                {active.length > 0 ? `Next: ${active[0].title}` : its.length > 0 ? "All done 🎉" : "Empty"}
              </Txt>
            </View>
            <View style={{ backgroundColor: "rgba(255,255,255,0.06)", borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
              <Txt size={11} weight="bold" color={C.inkFaint}>{active.length}</Txt>
            </View>
            <Icon name="ChevronRight" size={17} color={C.inkFaint} />
          </Pressable>
        );
      })}

      {/* New list — same row shape, dashed intent */}
      {creating ? (
        <TextInput
          autoFocus
          value={newList}
          onChangeText={setNewList}
          onBlur={createList}
          onSubmitEditing={createList}
          placeholder="List name"
          placeholderTextColor={C.inkFaint}
          style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: EDGE, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 15, fontFamily: FONT.bold, fontSize: 14, color: C.ink }}
        />
      ) : (
        <Pressable
          onPress={() => setCreating(true)}
          style={{ flexDirection: "row", alignItems: "center", gap: 13, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", borderStyle: "dashed", borderRadius: 20, padding: 13 }}
        >
          <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" }}>
            <Icon name="Plus" size={20} color={C.inkFaint} />
          </View>
          <Txt size={14.5} weight="bold" color={C.inkFaint}>New list</Txt>
        </Pressable>
      )}
    </ScrollView>
  );
}

/** One of the four game types: live stat line + progress bar in its accent. */
function TypeTile({ type, label, icon, onPress }: { type: ListType; label: string; icon: string; onPress: () => void }) {
  const { tasks, today, completedOn, now } = useStore();
  const tint = LIST_TINT[type];
  const its = tasks.filter((t) => t.listType === type && !t.listId);

  let meta = "";
  let progress = 0;
  if (type === "bad") {
    const live = its.filter((t) => !t.archived);
    const best = live.reduce((m, t) => Math.max(m, streakMs(now, t.lastSlipAt, t.createdAt)), 0);
    if (live.length === 0) {
      meta = "Quit something";
    } else {
      meta = `${formatStreak(best)} clean`;
      const reached = currentMilestone(best);
      const next = nextMilestone(best);
      const floor = reached?.ms ?? 0;
      const span = (next?.ms ?? best) - floor;
      progress = span > 0 ? Math.min(1, (best - floor) / span) : 1;
    }
  } else {
    const done = its.filter((t) => (t.recurrence ? completedOn.has(`${t.id}:${today}`) : t.archived));
    const openCount = its.length - done.length;
    if (type === "must") {
      meta = its.length === 0 ? "No habits yet" : `${done.length}/${its.length} done today`;
    } else {
      const xp = its.filter((t) => !t.archived).reduce((s, t) => s + t.points, 0);
      meta = its.length === 0 ? "Nothing yet" : `${openCount} open · +${xp} XP`;
    }
    progress = its.length > 0 ? done.length / its.length : 0;
  }

  return (
    <Pressable
      onPress={onPress}
      style={[
        {
          flexGrow: 1,
          flexBasis: "45%",
          backgroundColor: C.surface,
          borderWidth: 1,
          borderColor: EDGE,
          borderRadius: 20,
          padding: 13,
        },
        claySm(),
      ]}
    >
      <Icon name={icon} size={19} color={tint.acc} />
      <Txt size={13.5} weight="bold" color={tint.acc} style={{ marginTop: 7 }}>{label}</Txt>
      <Txt size={10.5} weight="medium" color={C.inkFaint} numberOfLines={1}>{meta}</Txt>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 9, overflow: "hidden" }}>
        <View style={[{ height: "100%", width: `${Math.round(progress * 100)}%`, borderRadius: 2, backgroundColor: tint.acc }, glow(tint.acc, 5)]} />
      </View>
    </Pressable>
  );
}

// --------------------------------------------------------------- detail ----

function ListDetail({ sel, onBack }: { sel: string; onBack: () => void }) {
  const { tasks, lists, today, completedOn, renameList, removeList, addTask, now } = useStore();
  const confirm = useConfirm();
  const [draft, setDraft] = useState("");
  /** Bad only: "YYYY-MM-DD" the habit was quit; empty = starting now. */
  const [cleanSince, setCleanSince] = useState("");
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
  const typeMeta = TYPES.find((t) => t.type === sel);

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

  // Local midnight of the typed clean-since date; undefined unless it parses
  // to a real calendar day in the past (free-form input, no native picker).
  const cleanTs = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanSince)) return undefined;
    const [y, m, d] = cleanSince.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const real = dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
    return real && dt.getTime() < now ? dt.getTime() : undefined;
  }, [cleanSince, now]);

  const submit = () => {
    const n = draft.trim();
    if (!n) return;
    void addTask({
      listType: type,
      title: n,
      ...(isList && listId ? { listId } : {}),
      ...(type === "bad" && cleanTs ? { cleanSince: cleanTs } : {}),
    });
    setDraft("");
    setCleanSince("");
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: TOP_BAR_SPACE + 16, gap: 12, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
      {/* Back + title header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable
          onPress={onBack}
          hitSlop={8}
          style={{ width: 38, height: 38, borderRadius: 13, borderWidth: 1, borderColor: EDGE, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="ChevronLeft" size={20} color={C.ink} />
        </Pressable>
        {typeMeta ? (
          <>
            <Icon name={typeMeta.icon} size={20} color={tint.acc} />
            <Txt size={22} weight="extrabold" color={tint.acc}>{typeMeta.label}</Txt>
          </>
        ) : (
          <Txt size={22} weight="extrabold" numberOfLines={1}>{list?.name}</Txt>
        )}
      </View>

      {/* Custom list header: rename + delete */}
      {isList && list ? (
        <View style={[{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: R.md, borderWidth: 1, borderColor: EDGE, backgroundColor: C.surface }, claySm()]}>
          <View style={{ width: 40, height: 40, borderRadius: R.sm, backgroundColor: "rgba(255,122,26,0.10)", alignItems: "center", justifyContent: "center" }}>
            <Icon name="ListChecks" color={C.accent} size={20} />
          </View>
          {editingName ? (
            <TextInput
              autoFocus
              value={nameDraft}
              onChangeText={setNameDraft}
              onBlur={() => { void renameList(list.id, nameDraft); setEditingName(false); }}
              onSubmitEditing={() => { void renameList(list.id, nameDraft); setEditingName(false); }}
              style={{ flex: 1, fontFamily: FONT.extrabold, fontSize: 16, color: C.ink }}
            />
          ) : (
            <Pressable style={{ flex: 1 }} onPress={() => { setNameDraft(list.name); setEditingName(true); }}>
              <Txt size={14} weight="bold" numberOfLines={1}>{active.length} {active.length === 1 ? "task" : "tasks"} open</Txt>
              <Txt size={11} weight="medium" color={C.inkFaint}>tap to rename</Txt>
            </Pressable>
          )}
          <Pressable
            onPress={async () => {
              if (await confirm({ title: `Delete list "${list.name}"?`, message: "Its tasks will be deleted too.", confirmLabel: "Delete" })) {
                onBack();
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
        <Pressable onPress={submit} style={[{ width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: tint.acc }, glow(tint.acc, 8)]}>
          <Icon name="Plus" color={C.primaryDeep} size={20} />
        </Pressable>
      </View>

      {/* Bad only: backdate the clean streak ("I quit on …"), like the web's
          "Clean since" field. Empty = the streak starts now. */}
      {type === "bad" ? (
        <View style={[{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: EDGE, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 8 }, claySm()]}>
          <Icon name="Shield" size={16} color={tint.acc} />
          <Txt size={13} weight="semibold" color={C.inkSoft}>
            Clean since
          </Txt>
          <TextInput
            value={cleanSince}
            onChangeText={setCleanSince}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={C.inkFaint}
            keyboardType="numbers-and-punctuation"
            style={{ flex: 1, backgroundColor: C.page2, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 7, fontFamily: FONT.semibold, fontSize: 13, color: C.ink }}
          />
          <Txt size={12} weight="bold" color={cleanTs ? tint.acc : C.inkFaint}>
            {cleanTs ? `${formatStreak(now - cleanTs)} clean` : cleanSince ? "…" : "now"}
          </Txt>
        </View>
      ) : null}

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
    <View style={[{ backgroundColor: tint.surf, borderWidth: 1, borderColor: EDGE, borderRadius: R.md, padding: 14, gap: 10 }, claySm()]}>
      {/* Header: icon + title/penalty + actions */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "rgba(255,77,87,0.12)",
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
            <Icon name="Check" size={18} color={C.primaryDeep} strokeWidth={3} />
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
      <View style={{ height: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <View
          style={[
            {
              height: "100%",
              width: `${Math.round(progress * 100)}%`,
              backgroundColor: tint.acc,
              borderRadius: 999,
            },
            glow(tint.acc, 6),
          ]}
        />
      </View>

      <Pressable
        onPress={() => recordSlip(task)}
        style={[
          { backgroundColor: tint.acc, borderRadius: R.sm, paddingVertical: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
          claySm(),
        ]}
      >
        <Icon name="Skull" size={16} color={C.primaryDeep} />
        <Txt weight="bold" color={C.primaryDeep}>
          I slipped
        </Txt>
      </Pressable>
    </View>
  );
}
