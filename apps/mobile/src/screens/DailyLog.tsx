import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import {
  ageFromBirthday,
  fmtMinutes,
  fmtWeight,
  foodTotal,
  kgToUnit,
  logStreak,
  readingXp,
  sleepXp,
  stepsXp,
  unitToKg,
  walkCalories,
  weightLossXp,
  type BodySex,
  type DayLog,
  type DayLogKind,
  type FoodItem,
  type WeightUnit,
} from "@grit/core";
import { useStore } from "../lib/store";
import { useUi } from "../lib/ui";
import { C, R, claySm } from "../theme";
import { Card, NumberField, Pill, PrimaryButton, SectionTitle, TextField, Txt } from "../components/ui";
import { Icon } from "../components/Icon";
import { PopIn } from "../components/anim";
import { useConfirm } from "../components/ConfirmDialog";

const num = (s: string) => Math.max(0, Math.round(Number(s) || 0));

/** "07:47" for a timestamp (24h, colon-separated). */
const fmtClock = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const FOOD_MACROS: { field: "calories" | "protein" | "carbs" | "fat"; icon: string; suffix: string }[] = [
  { field: "calories", icon: "Flame", suffix: "" },
  { field: "protein", icon: "Beef", suffix: "g" },
  { field: "carbs", icon: "Wheat", suffix: "g" },
  { field: "fat", icon: "Droplets", suffix: "g" },
];

const TRACKERS: { kind: DayLogKind; label: string; icon: string; acc: string }[] = [
  { kind: "food", label: "Food", icon: "Flame", acc: C.mustAcc },
  { kind: "sleep", label: "Sleep", icon: "Moon", acc: C.impAcc },
  { kind: "steps", label: "Steps", icon: "Footprints", acc: C.coolAcc },
  { kind: "reading", label: "Reading", icon: "BookOpen", acc: C.primary },
  { kind: "weight", label: "Weight", icon: "Scale", acc: C.impAcc },
];

export function DailyLog() {
  const { dayLogs, today } = useStore();
  const { logTab, setLogTab } = useUi();

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
      <Txt size={24} weight="extrabold">
        Daily Log
      </Txt>

      {/* Tracker chooser */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {TRACKERS.map((t) => {
          const on = logTab === t.kind;
          const { current, best } = logStreak(
            dayLogs.filter((l) => l.kind === t.kind).map((l) => l.date),
            today,
          );
          return (
            <Pressable
              key={t.kind}
              onPress={() => setLogTab(t.kind)}
              style={[
                {
                  width: "31%",
                  borderRadius: R.md,
                  padding: 12,
                  backgroundColor: C.surface,
                  borderWidth: on ? 2 : 0,
                  borderColor: t.acc,
                },
                claySm(),
              ]}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: t.acc, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={t.icon} color="#fff" size={18} />
                </View>
                {best > 0 ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: current > 0 ? t.acc : C.page2, borderRadius: R.pill, paddingHorizontal: 7, paddingVertical: 3 }}>
                    <Icon name="Flame" size={12} color={current > 0 ? "#fff" : C.inkFaint} />
                    <Txt size={12} weight="extrabold" color={current > 0 ? "#fff" : C.inkFaint}>
                      {current}
                    </Txt>
                  </View>
                ) : null}
              </View>
              <Txt weight="extrabold" size={13} style={{ marginTop: 8 }}>
                {t.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      {logTab === "food" && <FoodPanel />}
      {logTab === "sleep" && <SleepPanel />}
      {logTab === "steps" && <StepsPanel />}
      {logTab === "reading" && <ReadingPanel />}
      {logTab === "weight" && <WeightPanel />}
    </ScrollView>
  );
}

function xpPillProps(xp: number) {
  return {
    text: `${xp > 0 ? "+" : xp < 0 ? "−" : "±"}${Math.abs(xp)} XP`,
    color: xp > 0 ? C.primary : xp < 0 ? C.badAcc : C.inkFaint,
    bg: C.page2,
  };
}

function HistoryRow({ log, title, detail }: { log: DayLog; title: string; detail?: string }) {
  const { removeDayLog } = useStore();
  const confirm = useConfirm();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.page2, borderRadius: R.sm, paddingHorizontal: 12, paddingVertical: 10 }}>
      <View style={{ flex: 1 }}>
        <Txt weight="semibold" size={13} numberOfLines={1}>
          {title}
        </Txt>
        {detail ? (
          <Txt size={11} weight="medium" color={C.inkFaint}>
            {detail}
          </Txt>
        ) : null}
      </View>
      {log.awardedXp !== 0 ? <Pill {...xpPillProps(log.awardedXp)} /> : null}
      <Pressable
        onPress={async () => {
          if (await confirm({ title: "Delete this log?", message: "Its XP will be reversed.", confirmLabel: "Delete" }))
            void removeDayLog(log.id);
        }}
        style={{ padding: 4 }}
      >
        <Icon name="Trash2" size={15} color={C.inkFaint} />
      </Pressable>
    </View>
  );
}

function History({ kind, render }: { kind: DayLogKind; render: (l: DayLog) => { title: string; detail?: string } }) {
  const { dayLogs } = useStore();
  const logs = dayLogs.filter((l) => l.kind === kind);
  if (logs.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      <SectionTitle>History</SectionTitle>
      {logs.slice(0, 30).map((l) => {
        const { title, detail } = render(l);
        return <HistoryRow key={l.id} log={l} title={title} detail={detail} />;
      })}
    </View>
  );
}

// ---------------- Food ----------------
function FoodPanel() {
  const { settings, foods, dayLogs, today, logFood, updateFood, removeFood, setCalorieLimit } = useStore();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<FoodItem | null>(null);
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [save, setSave] = useState(false);
  const [editingLimit, setEditingLimit] = useState(false);
  const [limitDraft, setLimitDraft] = useState("");

  const todays = dayLogs.filter((l) => l.kind === "food" && l.date === today);
  const eaten = foodTotal(todays, "calories");
  const limit = settings.calorieLimit;
  const over = Math.max(0, eaten - limit);
  const pct = limit > 0 ? Math.min(100, (eaten / limit) * 100) : 100;

  const submit = () => {
    if (!name.trim() || !calories) return;
    void logFood({ name: name.trim(), calories: num(calories), protein: num(protein), carbs: num(carbs), fat: num(fat) }, save);
    setName(""); setCalories(""); setProtein(""); setCarbs(""); setFat(""); setSave(false);
  };

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
              <Icon name="Flame" size={22} />
              <Txt size={32} weight="extrabold">{eaten}</Txt>
              <Txt size={15} weight="bold" color={C.inkFaint}>/ {limit} kcal</Txt>
            </View>
            <Txt size={12} weight={over > 0 ? "extrabold" : "semibold"} color={over > 0 ? C.badAcc : C.inkFaint} style={{ marginTop: 2 }}>
              {over > 0 ? `${over} kcal over · −${over} XP` : `${limit - eaten} kcal left`}
            </Txt>
          </View>
          {editingLimit ? (
            <View style={{ width: 90 }}>
              <NumberField value={limitDraft} onChange={setLimitDraft} suffix="kcal" />
              <Pressable onPress={() => { if (num(limitDraft) > 0) void setCalorieLimit(num(limitDraft)); setEditingLimit(false); }}>
                <Txt size={12} weight="bold" color={C.primary} style={{ marginTop: 4 }}>Save</Txt>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => { setLimitDraft(String(limit)); setEditingLimit(true); }} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Icon name="Pencil" size={12} color={C.inkSoft} />
              <Txt size={12} weight="bold" color={C.inkSoft}>Edit limit</Txt>
            </Pressable>
          )}
        </View>
        <View style={{ height: 12, borderRadius: R.pill, backgroundColor: C.page2, overflow: "hidden", marginTop: 12 }}>
          <View style={{ height: "100%", width: `${pct}%`, backgroundColor: over > 0 ? C.badAcc : C.primary, borderRadius: R.pill }} />
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          {(["protein", "carbs", "fat"] as const).map((m) => (
            <View key={m} style={{ flex: 1, alignItems: "center", backgroundColor: C.page2, borderRadius: R.sm, paddingVertical: 10 }}>
              <Txt size={22} weight="extrabold">
                {foodTotal(todays, m)}
                <Txt size={13} weight="bold" color={C.inkFaint}>g</Txt>
              </Txt>
              <Txt size={11} weight="semibold" color={C.inkFaint} style={{ textTransform: "capitalize" }}>{m}</Txt>
            </View>
          ))}
        </View>
      </Card>

      {foods.length > 0 ? (
        <View style={{ gap: 6 }}>
          <SectionTitle>Saved foods</SectionTitle>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {foods.map((f) => (
              <View
                key={f.id}
                style={[{ width: "48%", backgroundColor: C.surface, borderRadius: R.md, padding: 12, gap: 8 }, claySm()]}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                  <Pressable
                    onPress={() => logFood({ name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat })}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}
                  >
                    <Icon name="Plus" size={15} color={C.primary} />
                    <Txt weight="bold" size={14} numberOfLines={1} style={{ flex: 1 }}>{f.name}</Txt>
                  </Pressable>
                  <View style={{ flexDirection: "row", gap: 2 }}>
                    <Pressable onPress={() => setEditing(f)} hitSlop={8}>
                      <Icon name="Pencil" size={13} color={C.inkFaint} />
                    </Pressable>
                    <Pressable
                      onPress={async () => {
                        if (await confirm({ title: `Remove "${f.name}" from saved foods?`, confirmLabel: "Remove" }))
                          void removeFood(f.id);
                      }}
                      hitSlop={8}
                    >
                      <Icon name="X" size={14} color={C.inkFaint} />
                    </Pressable>
                  </View>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {FOOD_MACROS.map((m) => (
                    <View key={m.field} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      <Icon name={m.icon} size={13} color={C.inkSoft} />
                      <Txt size={12} weight="semibold" color={C.inkFaint}>{f[m.field]}{m.suffix}</Txt>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <Card>
        <SectionTitle>Log a food</SectionTitle>
        <View style={{ marginTop: 8, gap: 10 }}>
          <TextField value={name} onChange={setName} placeholder="What did you eat?" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <NumberField label="Calories" value={calories} onChange={setCalories} suffix="kcal" width={120} />
            <NumberField label="Protein" value={protein} onChange={setProtein} suffix="g" width={88} />
            <NumberField label="Carbs" value={carbs} onChange={setCarbs} suffix="g" width={88} />
            <NumberField label="Fat" value={fat} onChange={setFat} suffix="g" width={88} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Pressable onPress={() => setSave((s) => !s)} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: save ? C.primary : C.page2, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 7 }}>
              <Icon name="Save" size={15} color={save ? "#fff" : C.inkSoft} />
              <Txt weight="semibold" size={13} color={save ? "#fff" : C.inkSoft}>Save</Txt>
            </Pressable>
            <PrimaryButton label="Log food" onPress={submit} disabled={!name.trim() || !calories} />
          </View>
        </View>
      </Card>

      <History kind="food" render={(l) => ({ title: l.name ?? "Food", detail: `${fmtClock(l.loggedAt)} · ${l.calories ?? 0} kcal · P${l.protein ?? 0} C${l.carbs ?? 0} F${l.fat ?? 0}` })} />

      <EditFoodModal
        food={editing}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          if (editing) await updateFood(editing.id, patch);
          setEditing(null);
        }}
      />
    </View>
  );
}

/** Edit a saved food's name + macros in a pop-in modal (matches the web). */
function EditFoodModal({
  food,
  onClose,
  onSave,
}: {
  food: FoodItem | null;
  onClose: () => void;
  onSave: (patch: { name: string; calories: number; protein: number; carbs: number; fat: number }) => void;
}) {
  return (
    <Modal visible={!!food} transparent animationType="fade" onRequestClose={onClose}>
      {food ? <EditFoodForm food={food} onClose={onClose} onSave={onSave} /> : null}
    </Modal>
  );
}

function EditFoodForm({
  food,
  onClose,
  onSave,
}: {
  food: FoodItem;
  onClose: () => void;
  onSave: (patch: { name: string; calories: number; protein: number; carbs: number; fat: number }) => void;
}) {
  const [name, setName] = useState(food.name);
  const [calories, setCalories] = useState(String(food.calories));
  const [protein, setProtein] = useState(String(food.protein));
  const [carbs, setCarbs] = useState(String(food.carbs));
  const [fat, setFat] = useState(String(food.fat));

  return (
    <Pressable
      onPress={onClose}
      style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <PopIn>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[{ width: "100%", maxWidth: 380, backgroundColor: C.surface, borderRadius: R.md, padding: 22, gap: 12 }, claySm()]}
        >
          <Txt size={18} weight="extrabold">Edit food</Txt>
          <TextField value={name} onChange={setName} placeholder="Food name" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <NumberField label="Calories" value={calories} onChange={setCalories} suffix="kcal" width={120} />
            <NumberField label="Protein" value={protein} onChange={setProtein} suffix="g" width={88} />
            <NumberField label="Carbs" value={carbs} onChange={setCarbs} suffix="g" width={88} />
            <NumberField label="Fat" value={fat} onChange={setFat} suffix="g" width={88} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <Pressable onPress={onClose} style={{ borderRadius: R.sm, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: C.page2 }}>
              <Txt weight="bold" size={13} color={C.inkSoft}>Cancel</Txt>
            </Pressable>
            <PrimaryButton
              label="Save"
              disabled={!name.trim()}
              onPress={() =>
                onSave({ name: name.trim(), calories: num(calories), protein: num(protein), carbs: num(carbs), fat: num(fat) })
              }
            />
          </View>
        </Pressable>
      </PopIn>
    </Pressable>
  );
}

// ---------------- Sleep ----------------
function SleepPanel() {
  const { logSleep } = useStore();
  const [h, setH] = useState("");
  const [m, setM] = useState("");
  const minutes = num(h) * 60 + num(m);
  const xp = minutes > 0 ? sleepXp(minutes) : 0;
  return (
    <View style={{ gap: 12 }}>
      <Card>
        <SectionTitle>Log last night&apos;s sleep</SectionTitle>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 8 }}>
          <NumberField label="Hours" value={h} onChange={setH} suffix="h" width={90} />
          <NumberField label="Minutes" value={m} onChange={setM} suffix="m" width={90} />
          <View style={{ flex: 1 }} />
          {minutes > 0 ? <Pill {...xpPillProps(xp)} /> : null}
        </View>
        <View style={{ marginTop: 12, alignItems: "flex-end" }}>
          <PrimaryButton label="Log sleep" onPress={() => { void logSleep(minutes); setH(""); setM(""); }} disabled={minutes <= 0} />
        </View>
      </Card>
      <History kind="sleep" render={(l) => ({ title: fmtMinutes(l.minutes ?? 0) })} />
    </View>
  );
}

// ---------------- Steps ----------------
function StepsPanel() {
  const { dayLogs, settings, today, setProfile, logSteps } = useStore();
  const [mode, setMode] = useState<"steps" | "meters">("steps");
  const [amount, setAmount] = useState("");
  const [h, setH] = useState("");
  const [m, setM] = useState("");
  const value = num(amount);
  const minutes = num(h) * 60 + num(m);
  const weightKg = dayLogs.find((l) => l.kind === "weight")?.weightKg ?? null;
  const age = ageFromBirthday(settings.birthday, today);

  const preview =
    value > 0 && minutes > 0 && weightKg
      ? walkCalories({
          steps: mode === "steps" ? value : undefined,
          meters: mode === "meters" ? value : undefined,
          minutes, weightKg, heightCm: settings.heightCm, age, sex: settings.sex,
        })
      : null;

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <SectionTitle>Body profile</SectionTitle>
          <Txt size={12} weight="bold" color={C.inkFaint}>{age} yrs</Txt>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8, alignItems: "flex-end" }}>
          <NumberField label="Height" value={String(settings.heightCm)} onChange={(v) => void setProfile({ heightCm: num(v) })} suffix="cm" width={90} />
          <View style={{ gap: 4 }}>
            <Txt size={12} weight="bold" color={C.inkSoft}>Birthday</Txt>
            <View style={{ backgroundColor: C.page2, borderRadius: R.sm, paddingHorizontal: 12, paddingVertical: 8, width: 140 }}>
              <TextField value={settings.birthday} onChange={(v) => void setProfile({ birthday: v })} placeholder="YYYY-MM-DD" />
            </View>
          </View>
          <View style={{ gap: 4 }}>
            <Txt size={12} weight="bold" color={C.inkSoft}>Sex</Txt>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {(["male", "female"] as BodySex[]).map((s) => (
                <Pressable key={s} onPress={() => void setProfile({ sex: s })} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: R.pill, backgroundColor: settings.sex === s ? C.primary : C.page2 }}>
                  <Txt weight="bold" size={13} color={settings.sex === s ? "#fff" : C.inkSoft} style={{ textTransform: "capitalize" }}>{s}</Txt>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Card>

      <Card>
        <SectionTitle>Log a walk</SectionTitle>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 8, alignSelf: "flex-start", backgroundColor: C.page2, borderRadius: R.pill, padding: 4 }}>
          {(["steps", "meters"] as const).map((md) => (
            <Pressable key={md} onPress={() => setMode(md)} style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: R.pill, backgroundColor: mode === md ? C.surface : "transparent" }}>
              <Txt weight="bold" size={13} color={mode === md ? C.ink : C.inkSoft} style={{ textTransform: "capitalize" }}>{md}</Txt>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10, alignItems: "flex-end" }}>
          <NumberField label={mode === "steps" ? "Steps" : "Meters"} value={amount} onChange={setAmount} suffix={mode} width={120} />
          <NumberField label="Hours" value={h} onChange={setH} suffix="h" width={80} />
          <NumberField label="Minutes" value={m} onChange={setM} suffix="m" width={80} />
        </View>
        {preview ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 12, backgroundColor: C.page2, borderRadius: R.sm, padding: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><Icon name="Flame" size={16} color={C.coolAcc} /><Txt weight="extrabold" size={14} color={C.coolAcc}>{preview.calories} kcal</Txt></View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><Icon name="Gauge" size={15} color={C.inkSoft} /><Txt weight="semibold" size={13} color={C.inkSoft}>{preview.speedKmh} km/h</Txt></View>
            <Txt size={12} weight="medium" color={C.inkFaint}>{preview.met} MET</Txt>
          </View>
        ) : null}
        {value > 0 && minutes > 0 && !weightKg ? (
          <Txt size={12} weight="semibold" color={C.badAcc} style={{ marginTop: 8 }}>Log your weight once to estimate calories burnt.</Txt>
        ) : null}
        <View style={{ marginTop: 12, alignItems: "flex-end" }}>
          <PrimaryButton label="Log" onPress={() => { void logSteps(mode === "steps" ? { steps: value, minutes } : { meters: value, minutes }); setAmount(""); setH(""); setM(""); }} disabled={value <= 0} />
        </View>
      </Card>

      <History kind="steps" render={(l) => ({
        title: l.steps ? `${l.steps.toLocaleString()} steps` : `${(l.meters ?? 0).toLocaleString()} m`,
        detail: [l.minutes ? fmtMinutes(l.minutes) : "", l.caloriesBurnt ? `${l.caloriesBurnt} kcal` : ""].filter(Boolean).join(" · "),
      })} />
    </View>
  );
}

// ---------------- Reading ----------------
function ReadingPanel() {
  const { logReading } = useStore();
  const [m, setM] = useState("");
  const minutes = num(m);
  return (
    <View style={{ gap: 12 }}>
      <Card>
        <SectionTitle>Log a reading session</SectionTitle>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 8 }}>
          <NumberField label="Minutes" value={m} onChange={setM} suffix="min" width={110} />
          <View style={{ flex: 1 }} />
          {minutes > 0 ? <Pill {...xpPillProps(readingXp(minutes))} /> : null}
        </View>
        <View style={{ marginTop: 12, alignItems: "flex-end" }}>
          <PrimaryButton label="Log reading" onPress={() => { void logReading(minutes); setM(""); }} disabled={minutes <= 0} />
        </View>
      </Card>
      <History kind="reading" render={(l) => ({ title: fmtMinutes(l.minutes ?? 0) })} />
    </View>
  );
}

// ---------------- Weight ----------------
function WeightPanel() {
  const { settings, dayLogs, today, logWeight, setWeightUnit } = useStore();
  const unit = settings.weightUnit;
  const [value, setValue] = useState("");
  const logs = dayLogs.filter((l) => l.kind === "weight");
  const latest = logs[0];
  const todays = logs.find((l) => l.date === today);
  const baseline = logs.find((l) => l.date !== today);
  const deltaKg = latest && baseline && latest !== baseline ? (latest.weightKg ?? 0) - (baseline.weightKg ?? 0) : null;
  const entered = Number(value);
  const valid = Number.isFinite(entered) && entered > 0;
  const previewXp = valid && baseline ? weightLossXp(baseline.weightKg ?? 0, unitToKg(entered, unit)) : 0;

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <SectionTitle>Log your weight</SectionTitle>
          <View style={{ flexDirection: "row", gap: 6, backgroundColor: C.page2, borderRadius: R.pill, padding: 4 }}>
            {(["kg", "lbs"] as WeightUnit[]).map((u) => (
              <Pressable key={u} onPress={() => void setWeightUnit(u)} style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: R.pill, backgroundColor: unit === u ? C.surface : "transparent" }}>
                <Txt weight="bold" size={13} color={unit === u ? C.ink : C.inkSoft}>{u}</Txt>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 10 }}>
          <NumberField label="Weight" value={value} onChange={setValue} suffix={unit} width={130} />
          <View style={{ flex: 1 }} />
          {previewXp > 0 ? <Pill {...xpPillProps(previewXp)} /> : null}
        </View>
        <View style={{ marginTop: 12, alignItems: "flex-end" }}>
          <PrimaryButton label={todays ? "Update weight" : "Log weight"} onPress={() => { if (valid) { void logWeight(unitToKg(entered, unit)); setValue(""); } }} disabled={!valid} />
        </View>
      </Card>

      {latest ? (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
            <View style={{ alignItems: "center" }}>
              <Txt size={28} weight="extrabold">{fmtWeight(latest.weightKg ?? 0, unit)}</Txt>
              <Txt size={11} weight="semibold" color={C.inkFaint} style={{ textTransform: "uppercase" }}>current</Txt>
            </View>
            {deltaKg !== null ? (
              <View style={{ alignItems: "center" }}>
                <Txt size={26} weight="extrabold" color={deltaKg === 0 ? C.inkSoft : deltaKg < 0 ? C.coolAcc : C.badAcc}>
                  {deltaKg === 0 ? "—" : `${deltaKg < 0 ? "−" : "+"}${kgToUnit(Math.abs(deltaKg), unit)} ${unit}`}
                </Txt>
                <Txt size={11} weight="semibold" color={C.inkFaint} style={{ textTransform: "uppercase" }}>since prev day</Txt>
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}

      <History kind="weight" render={(l) => ({ title: fmtWeight(l.weightKg ?? 0, unit) })} />
    </View>
  );
}
