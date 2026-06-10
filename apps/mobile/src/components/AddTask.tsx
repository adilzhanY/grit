import { useState } from "react";
import { Modal, Pressable, TextInput, View } from "react-native";
import {
  addDays,
  dayLabel,
  localDay,
  recurrenceLabel,
  weekdayOf,
  type Recurrence,
  type RecurrenceType,
} from "@grit/core";
import { useStore } from "../lib/store";
import { C, FONT, R, claySm, clay } from "../theme";
import { Icon } from "./Icon";
import { Txt, PrimaryButton } from "./ui";
import { PopIn } from "./anim";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const REPEAT_PRESETS: { label: string; rec: Recurrence }[] = [
  { label: "Daily", rec: { type: "daily", weekdays: [] } },
  { label: "Weekdays", rec: { type: "weekly", weekdays: [1, 2, 3, 4, 5] } },
  { label: "Weekly", rec: { type: "weekly", weekdays: [] } },
  { label: "Monthly", rec: { type: "monthly", weekdays: [] } },
  { label: "Yearly", rec: { type: "yearly", weekdays: [] } },
];

const UNITS: { value: RecurrenceType; label: string }[] = [
  { value: "daily", label: "days" },
  { value: "weekly", label: "weeks" },
  { value: "monthly", label: "months" },
  { value: "yearly", label: "years" },
];

/** A bottom sheet wrapper. */
function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }} onPress={onClose}>
        <PopIn>
          <Pressable onPress={(e) => e.stopPropagation()} style={[{ backgroundColor: C.page, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, padding: 18, paddingBottom: 32, gap: 8 }, clay()]}>
            <Txt size={12} weight="bold" color={C.inkFaint} style={{ textAlign: "center", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
              {title}
            </Txt>
            {children}
          </Pressable>
        </PopIn>
      </Pressable>
    </Modal>
  );
}

function Row({ icon, label, hint, onPress, danger }: { icon: string; label: string; hint?: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: R.sm, paddingHorizontal: 12, paddingVertical: 12 }}>
      <Icon name={icon} size={18} color={danger ? C.badAcc : C.inkSoft} />
      <Txt weight="semibold" size={15} color={danger ? C.badAcc : C.ink} style={{ flex: 1 }}>{label}</Txt>
      {hint ? <Txt size={12} weight="medium" color={C.inkFaint}>{hint}</Txt> : null}
    </Pressable>
  );
}

export function AddTask({ listType = "custom", listId, myDay = true }: { listType?: "custom"; listId?: string; myDay?: boolean }) {
  const { addTask } = useStore();
  const today = localDay();
  const tomorrow = addDays(today, 1);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(""); // "" = today
  const [repeat, setRepeat] = useState<Recurrence | null>(null);
  const [dueOpen, setDueOpen] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);

  // Custom repeat builder
  const [custom, setCustom] = useState(false);
  const [interval, setIntervalN] = useState("1");
  const [unit, setUnit] = useState<RecurrenceType>("weekly");
  const [weekdays, setWeekdays] = useState<number[]>([]);

  const dateToTs = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  };

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    const planned = myDay && due && due > today ? due : undefined;
    await addTask({
      listType,
      title: t,
      recurrence: (myDay && repeat) || undefined,
      listId: listType === "custom" ? listId : undefined,
      starredMyDay: (myDay && !planned && !repeat) || undefined,
      plannedFor: planned,
    });
    setTitle("");
    setDue("");
    setRepeat(null);
  };

  const pickRepeat = (rec: Recurrence | null) => {
    setRepeat(rec);
    setRepeatOpen(false);
    setCustom(false);
  };
  const saveCustom = () =>
    pickRepeat({
      type: unit,
      interval: Math.max(1, Math.round(Number(interval)) || 1),
      weekdays: unit === "weekly" ? weekdays : [],
    });

  return (
    <View style={[{ backgroundColor: C.surface, borderRadius: R.md, padding: 10 }, claySm()]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <IconBtn icon="CalendarDays" active={!!due && due !== today} onPress={() => setDueOpen(true)} />
        <IconBtn icon="Repeat" active={!!repeat} onPress={() => setRepeatOpen(true)} />
        <TextInput
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={submit}
          placeholder="Add a task for today…"
          placeholderTextColor={C.inkFaint}
          returnKeyType="done"
          style={{ flex: 1, fontFamily: FONT.medium, fontSize: 15, color: C.ink, paddingHorizontal: 4 }}
        />
        <Pressable
          onPress={submit}
          disabled={!title.trim()}
          style={[{ backgroundColor: C.primary, borderRadius: R.sm, paddingHorizontal: 16, paddingVertical: 9, opacity: title.trim() ? 1 : 0.4 }, claySm()]}
        >
          <Txt weight="bold" color="#fff" size={13}>Add</Txt>
        </Pressable>
      </View>

      {/* active selections summary */}
      {(due && due !== today) || repeat ? (
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 8, paddingHorizontal: 2 }}>
          {due && due !== today ? <Txt size={12} weight="bold" color={C.primary}>📅 {dayLabel(due, today)}</Txt> : null}
          {repeat ? <Txt size={12} weight="bold" color={C.primary}>🔁 {recurrenceLabel({ recurrence: repeat })}</Txt> : null}
        </View>
      ) : null}

      {/* Due sheet */}
      <Sheet open={dueOpen} onClose={() => setDueOpen(false)} title="Due">
        <Row icon="CalendarCheck" label="Today" hint={WD[weekdayOf(today)]} onPress={() => { setDue(today); setDueOpen(false); }} />
        <Row icon="CalendarDays" label="Tomorrow" hint={WD[weekdayOf(tomorrow)]} onPress={() => { setDue(tomorrow); setDueOpen(false); }} />
        <View style={{ height: 1, backgroundColor: "rgba(0,0,0,0.08)", marginVertical: 4 }} />
        <View style={{ paddingHorizontal: 12 }}>
          <Txt size={12} weight="bold" color={C.inkSoft} style={{ marginBottom: 4 }}>Pick a date</Txt>
          <TextInput
            value={due}
            onChangeText={setDue}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={C.inkFaint}
            onSubmitEditing={() => setDueOpen(false)}
            style={{ backgroundColor: C.page2, borderRadius: R.sm, paddingHorizontal: 12, paddingVertical: 9, fontFamily: FONT.semibold, color: C.ink }}
          />
        </View>
      </Sheet>

      {/* Repeat sheet */}
      <Sheet open={repeatOpen} onClose={() => { setRepeatOpen(false); setCustom(false); }} title="Repeat">
        {!custom ? (
          <>
            {REPEAT_PRESETS.map((p) => (
              <Row key={p.label} icon="CalendarDays" label={p.label} onPress={() => pickRepeat(p.rec)} />
            ))}
            <View style={{ height: 1, backgroundColor: "rgba(0,0,0,0.08)", marginVertical: 4 }} />
            <Row icon="CalendarClock" label="Custom" onPress={() => setCustom(true)} />
            {repeat ? <Row icon="Trash2" label="Never repeat" danger onPress={() => pickRepeat(null)} /> : null}
          </>
        ) : (
          <View style={{ gap: 12, padding: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Txt weight="semibold" color={C.inkSoft}>Every</Txt>
              <TextInput value={interval} onChangeText={setIntervalN} keyboardType="numeric" style={{ width: 56, backgroundColor: C.page2, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 8, fontFamily: FONT.semibold, color: C.ink, textAlign: "center" }} />
              <View style={{ flexDirection: "row", gap: 6, flex: 1, flexWrap: "wrap" }}>
                {UNITS.map((u) => (
                  <Pressable key={u.value} onPress={() => setUnit(u.value)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.pill, backgroundColor: unit === u.value ? C.primary : C.page2 }}>
                    <Txt size={12} weight="bold" color={unit === u.value ? "#fff" : C.inkSoft}>{u.label}</Txt>
                  </Pressable>
                ))}
              </View>
            </View>
            {unit === "weekly" ? (
              <View style={{ flexDirection: "row", gap: 4 }}>
                {WD.map((w, d) => {
                  const on = weekdays.includes(d);
                  return (
                    <Pressable
                      key={d}
                      onPress={() => setWeekdays((arr) => (arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d]))}
                      style={{ flex: 1, height: 34, borderRadius: R.sm, alignItems: "center", justifyContent: "center", backgroundColor: on ? C.primary : C.page2 }}
                    >
                      <Txt size={11} weight="bold" color={on ? "#fff" : C.inkSoft}>{w.slice(0, 2)}</Txt>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <PrimaryButton label="Save" onPress={saveCustom} />
          </View>
        )}
      </Sheet>
    </View>
  );
}

function IconBtn({ icon, active, onPress }: { icon: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[{ width: 40, height: 40, borderRadius: R.sm, alignItems: "center", justifyContent: "center", backgroundColor: C.page2 }, claySm()]}>
      <Icon name={icon} size={20} color={active ? C.primary : C.inkSoft} />
    </Pressable>
  );
}
