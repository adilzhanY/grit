"use client";

import { useEffect, useState } from "react";
import type { BodySex, DayLog, DayLogKind, FoodItem, GaitActivity, WeightUnit } from "@/lib/types";
import {
  fmtMinutes,
  fmtWeight,
  fmtXp,
  focusXp,
  focusRemainingMs,
  focusElapsedMs,
  focusPhaseEnd,
  focusElapsed,
  foodTotal,
  calorieGoals,
  type CalorieGoals,
  kgToUnit,
  unitToKg,
  weightLossXp,
  XP_PER_100G_LOST,
  logStreak,
  walkCalories,
  ageFromBirthday,
  readingXp,
  sleepXp,
  stepsXp,
  FOCUS_SET_SIZE,
  FOCUS_SET_XP,
  SLEEP_GOLD_XP,
  XP_PER_FOCUS_MIN,
  XP_PER_READING_MIN,
} from "@/lib/daylog";
import { addDays, dayLabel } from "@/lib/schedule";
import { useNow, useStore } from "@/lib/store";
import { useUi } from "@/lib/ui";
import { useConfirm } from "./ConfirmDialog";
import { Icon } from "./Icon";

const TRACKERS: {
  kind: DayLogKind;
  label: string;
  icon: string;
  blurb: string;
  acc: string;
}[] = [
  { kind: "food", label: "Food", icon: "Utensils", blurb: "Stay under your calorie budget.", acc: "var(--must-acc)" },
  { kind: "sleep", label: "Sleep", icon: "Moon", blurb: "7h 30m is the gold standard.", acc: "var(--imp-acc)" },
  { kind: "steps", label: "Steps", icon: "Footprints", blurb: "Every step counts.", acc: "var(--cool-acc)" },
  { kind: "reading", label: "Reading", icon: "BookOpen", blurb: "+2 XP per minute.", acc: "var(--primary)" },
  { kind: "focus", label: "Focus", icon: "Timer", blurb: "Pomodoro deep work.", acc: "var(--accent)" },
  { kind: "weight", label: "Weight", icon: "Scale", blurb: "Watch the trend.", acc: "var(--imp-acc)" },
];

const MACROS: { field: "protein" | "carbs" | "fat"; label: string; icon: string }[] = [
  { field: "protein", label: "Protein", icon: "Beef" },
  { field: "carbs", label: "Carbs", icon: "Wheat" },
  { field: "fat", label: "Fat", icon: "Droplets" },
];

const GOAL_TILES: {
  key: keyof CalorieGoals;
  label: string;
  rate: string;
  icon: string;
  color: string;
}[] = [
  { key: "maintain", label: "Maintain", rate: "Keep weight", icon: "Scale", color: "var(--ink-soft)" },
  { key: "gain", label: "Gain", rate: "+1 kg / week", icon: "TrendingUp", color: "var(--cool-acc)" },
  { key: "lose", label: "Lose", rate: "−0.5 kg / week", icon: "TrendingDown", color: "var(--primary)" },
  { key: "extremeLose", label: "Extreme", rate: "−1.1 kg / week", icon: "Flame", color: "var(--bad-acc)" },
];

/** Daily calorie targets per goal, from the latest weight + body profile. */
function GoalsCard({ goals }: { goals: CalorieGoals | null }) {
  return (
    <div className="clay flex flex-col gap-3 p-5" style={{ background: "var(--surface)" }}>
      <SectionTitle>Daily calorie targets</SectionTitle>
      {goals ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {GOAL_TILES.map((g) => (
            <div
              key={g.key}
              className="flex flex-col gap-0.5 rounded-2xl p-3"
              style={{ background: "var(--page-2)" }}
            >
              <span style={{ color: g.color }}>
                <Icon name={g.icon} className="h-4 w-4" />
              </span>
              <span className="text-xl font-extrabold tabular-nums">{goals[g.key]}</span>
              <span className="text-xs font-bold">{g.label}</span>
              <span className="text-[11px] font-medium text-ink-faint">{g.rate}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm font-medium text-ink-faint">
          Log your weight in the Weight tracker to see your calorie targets.
        </p>
      )}
    </div>
  );
}

function xpBadge(xp: number) {
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-extrabold"
      style={{
        background: "var(--page-2)",
        color: xp > 0 ? "var(--primary)" : xp < 0 ? "var(--bad-acc)" : "var(--ink-faint)",
      }}
    >
      {fmtXp(xp)} XP
    </span>
  );
}

/** One past-log row: icon, title, day + detail, XP badge, delete. */
function LogRow({
  log,
  icon,
  title,
  detail,
  hideDay,
  onSave,
  saved,
}: {
  log: DayLog;
  icon: string;
  title: string;
  detail?: string;
  /** Skip the "Today · " prefix — used when rows are grouped under a day header. */
  hideDay?: boolean;
  /** Food rows only: save this entry to the saved-foods library. */
  onSave?: () => void;
  /** Whether a saved food with this name already exists. */
  saved?: boolean;
}) {
  const { today, removeDayLog } = useStore();
  const confirm = useConfirm();
  return (
    <div
      className="group flex items-center gap-3 rounded-2xl px-4 py-3"
      style={{ background: "var(--page-2)" }}
    >
      <Icon name={icon} className="h-4.5 w-4.5 shrink-0 text-ink-soft" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="text-xs font-medium text-ink-faint">
          {hideDay ? detail : `${dayLabel(log.date, today)}${detail ? ` · ${detail}` : ""}`}
        </p>
      </div>
      {/* Weight logs only badge actual rewards — a "±0" would just be noise. */}
      {(log.kind !== "weight" || log.awardedXp !== 0) && xpBadge(log.awardedXp)}
      {onSave && (
        <button
          onClick={() => !saved && onSave()}
          disabled={saved}
          aria-label={saved ? "Already in saved foods" : "Save to saved foods"}
          title={saved ? "Already in saved foods" : "Save to saved foods"}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full transition-opacity focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-default"
          style={{
            color: saved ? "var(--cool-acc)" : "var(--ink-faint)",
            opacity: saved ? 1 : 0,
            cursor: saved ? "default" : "pointer",
          }}
        >
          <Icon name={saved ? "BookmarkCheck" : "BookmarkPlus"} className="h-4 w-4" />
        </button>
      )}
      <button
        onClick={async () => {
          if (
            await confirm({
              title: "Delete this log?",
              message: "Its XP will be reversed.",
              confirmLabel: "Delete",
            })
          )
            removeDayLog(log.id);
        }}
        aria-label="Delete log"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint opacity-0 transition-opacity hover:bg-black/5 focus-visible:opacity-100 group-hover:opacity-100"
        style={{ cursor: "pointer" }}
      >
        <Icon name="Trash2" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-ink-faint">
      {children}
    </h3>
  );
}

function NumberField({
  label,
  icon,
  value,
  onChange,
  suffix,
  width = "w-full",
}: {
  label: string;
  icon: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  width?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${width}`}>
      <span className="flex items-center gap-1.5 text-xs font-bold text-ink-soft">
        <Icon name={icon} className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="flex items-center gap-1 rounded-xl bg-page-2 px-3 py-2">
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="w-full bg-transparent text-sm font-semibold text-ink outline-none"
          placeholder="0"
        />
        {suffix && (
          <span className="text-xs font-medium text-ink-faint">{suffix}</span>
        )}
      </span>
    </label>
  );
}

function LogButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="clay-press px-5 py-2.5 text-sm font-bold disabled:opacity-40"
      style={{
        background: "var(--primary)",
        color: "#fff",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

const num = (s: string) => Math.max(0, Math.round(Number(s) || 0));

// ---------------- Food ----------------

function FoodPanel() {
  const { settings, foods, dayLogs, today, logFood, updateFood, removeFood, setCalorieLimit } =
    useStore();
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
  // Calories burnt from today's walks reduce the effective (net) intake.
  const burnt = dayLogs
    .filter((l) => l.kind === "steps" && l.date === today)
    .reduce((s, l) => s + (l.caloriesBurnt ?? 0), 0);
  const net = eaten - burnt;
  const limit = settings.calorieLimit;
  const over = Math.max(0, net - limit);
  const pct = limit > 0 ? Math.min(100, Math.max(0, (net / limit) * 100)) : 100;

  // Calorie goals from the latest weight log + body profile (recomputed daily).
  const weightKg = dayLogs.find((l) => l.kind === "weight")?.weightKg ?? null;
  const goals = weightKg
    ? calorieGoals({
        weightKg,
        heightCm: settings.heightCm,
        age: ageFromBirthday(settings.birthday, today),
        sex: settings.sex,
      })
    : null;

  const submit = () => {
    const n = name.trim();
    if (!n || !calories) return;
    void logFood(
      {
        name: n,
        calories: num(calories),
        protein: num(protein),
        carbs: num(carbs),
        fat: num(fat),
      },
      save,
    );
    setName("");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFat("");
    setSave(false);
  };

  const commitLimit = () => {
    const v = num(limitDraft);
    if (v > 0) void setCalorieLimit(v);
    setEditingLimit(false);
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* LEFT: goals, budget, saved foods, today's list, history */}
      <div className="flex flex-col gap-4">
      <GoalsCard goals={goals} />
      {/* Budget gauge */}
      <div className="clay flex flex-col gap-4 p-5" style={{ background: "var(--surface)" }}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="flex items-baseline gap-2 leading-none">
              <Icon name="Flame" className="h-7 w-7 self-center" />
              <span className="text-4xl font-extrabold tracking-tight tabular-nums">
                {net}
              </span>
              <span className="text-base font-bold text-ink-faint">
                / {limit} kcal
              </span>
            </p>
            <p className="mt-1 text-xs font-semibold text-ink-faint">
              {eaten} eaten{burnt > 0 ? ` − ${burnt} burnt` : ""}
            </p>
            {over > 0 ? (
              <p className="mt-0.5 text-xs font-extrabold" style={{ color: "var(--bad-acc)" }}>
                {over} kcal over
              </p>
            ) : (
              <p className="mt-0.5 text-xs font-semibold text-ink-faint">
                {limit - net} kcal left
              </p>
            )}
          </div>
          {editingLimit ? (
            <span className="flex items-center gap-1">
              <input
                autoFocus
                type="number"
                min={1}
                value={limitDraft}
                onChange={(e) => setLimitDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitLimit();
                  if (e.key === "Escape") setEditingLimit(false);
                }}
                onBlur={commitLimit}
                aria-label="Daily calorie limit"
                className="w-24 rounded-lg bg-page-2 px-2 py-1 text-sm font-semibold text-ink outline-none"
              />
              <span className="text-xs font-medium text-ink-faint">kcal</span>
            </span>
          ) : (
            <button
              onClick={() => {
                setLimitDraft(String(limit));
                setEditingLimit(true);
              }}
              className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-bold text-ink-soft hover:bg-black/5"
              style={{ cursor: "pointer" }}
            >
              <Icon name="Pencil" className="h-3 w-3" />
              Edit limit
            </button>
          )}
        </div>
        <div className="h-3 overflow-hidden rounded-full" style={{ background: "var(--page-2)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: over > 0 ? "var(--bad-acc)" : "var(--primary)",
            }}
          />
        </div>
        {/* Today's macros — big stat blocks */}
        <div className="grid grid-cols-3 gap-3">
          {MACROS.map((m) => (
            <div
              key={m.field}
              className="flex flex-col items-center gap-0.5 rounded-2xl py-3"
              style={{ background: "var(--page-2)" }}
            >
              <Icon name={m.icon} className="h-4 w-4 text-ink-soft" />
              <span className="text-2xl font-extrabold tabular-nums">
                {foodTotal(todays, m.field)}
                <span className="text-sm font-bold text-ink-faint">g</span>
              </span>
              <span className="text-xs font-semibold text-ink-faint">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Saved foods — one-tap re-add */}
      {foods.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionTitle>Saved foods</SectionTitle>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {foods.map((f: FoodItem) => (
              <div
                key={f.id}
                className="group relative flex flex-col gap-2 rounded-2xl p-3"
                style={{ background: "var(--surface)", boxShadow: "var(--clay-sm)" }}
              >
                <button
                  onClick={() =>
                    logFood({
                      name: f.name,
                      calories: f.calories,
                      protein: f.protein,
                      carbs: f.carbs,
                      fat: f.fat,
                    })
                  }
                  aria-label={`Add ${f.name}`}
                  className="flex items-center gap-1.5 pr-12 text-left text-sm font-bold hover:opacity-70"
                  style={{ cursor: "pointer" }}
                >
                  <Icon name="Plus" className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{f.name}</span>
                </button>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-semibold text-ink-faint">
                  <span className="flex items-center gap-1" title="Calories">
                    <Icon name="Flame" className="h-3.5 w-3.5" />
                    {f.calories}
                  </span>
                  <span className="flex items-center gap-1" title="Protein">
                    <Icon name="Beef" className="h-3.5 w-3.5" />
                    {f.protein}g
                  </span>
                  <span className="flex items-center gap-1" title="Carbs">
                    <Icon name="Wheat" className="h-3.5 w-3.5" />
                    {f.carbs}g
                  </span>
                  <span className="flex items-center gap-1" title="Fat">
                    <Icon name="Droplets" className="h-3.5 w-3.5" />
                    {f.fat}g
                  </span>
                </div>
                <div className="absolute right-2 top-2 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    onClick={() => setEditing(f)}
                    aria-label={`Edit ${f.name}`}
                    className="grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:bg-black/5"
                    style={{ cursor: "pointer" }}
                  >
                    <Icon name="Pencil" className="h-3 w-3" />
                  </button>
                  <button
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `Remove "${f.name}" from saved foods?`,
                          confirmLabel: "Remove",
                        })
                      )
                        removeFood(f.id);
                    }}
                    aria-label={`Remove ${f.name} from saved foods`}
                    className="grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:bg-black/5"
                    style={{ cursor: "pointer" }}
                  >
                    <Icon name="X" className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <FoodHistory />
      </div>

      {/* RIGHT: the log form, sticky so it stays in view while scrolling logs */}
      <div
        className="clay flex flex-col gap-3 p-5 lg:sticky lg:top-4"
        style={{ background: "var(--surface)" }}
      >
        <SectionTitle>Log a food</SectionTitle>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What did you eat?"
          aria-label="Food name"
          className="rounded-xl bg-page-2 px-3 py-2.5 text-sm font-semibold text-ink outline-none placeholder:text-ink-faint"
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Calories" icon="Flame" value={calories} onChange={setCalories} suffix="kcal" />
          <NumberField label="Protein" icon="Beef" value={protein} onChange={setProtein} suffix="g" />
          <NumberField label="Carbs" icon="Wheat" value={carbs} onChange={setCarbs} suffix="g" />
          <NumberField label="Fat" icon="Droplets" value={fat} onChange={setFat} suffix="g" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setSave((s) => !s)}
            aria-pressed={save}
            className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold"
            style={{
              background: save ? "var(--primary)" : "var(--page-2)",
              color: save ? "#fff" : "var(--ink-soft)",
              cursor: "pointer",
            }}
          >
            <Icon name="BookmarkPlus" className="h-4 w-4" />
            Save for later
          </button>
          <LogButton onClick={submit} disabled={!name.trim() || !calories}>
            Log food
          </LogButton>
        </div>
      </div>

      {editing && (
        <EditFoodModal
          food={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await updateFood(editing.id, patch);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** "Thu, June 17" for a YYYY-MM-DD that isn't today/yesterday. */
function foodDayHeading(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "long",
    day: "numeric",
  });
}

/** Net-calorie green — signals "under budget after the burn", a good thing. */
const GOOD_GREEN = "#1f9d55";

/** A day's macro totals as a compact horizontal badge of icons + numbers. */
function DayMacroTotals({ rows, burnt }: { rows: DayLog[]; burnt: number }) {
  const sum = (k: "calories" | "protein" | "carbs" | "fat") =>
    rows.reduce((n, l) => n + (l[k] ?? 0), 0);
  const eaten = sum("calories");
  const macros: { icon: string; value: string; color: string }[] = [
    { icon: "Beef", value: `${sum("protein")}g`, color: "var(--bad-acc)" },
    { icon: "Wheat", value: `${sum("carbs")}g`, color: "var(--cool-acc)" },
    { icon: "Droplets", value: `${sum("fat")}g`, color: "var(--imp-acc)" },
  ];
  return (
    <div
      className="flex shrink-0 flex-wrap items-center justify-end gap-x-2.5 gap-y-1 rounded-full px-3 py-1"
      style={{ background: "var(--page-2)" }}
    >
      <span className="flex items-center gap-1" style={{ color: "var(--must-acc)" }}>
        <Icon name="Flame" className="h-3.5 w-3.5" />
        <span className="text-xs font-extrabold tabular-nums text-ink">
          {burnt > 0 ? (
            <>
              {eaten} − {burnt} ={" "}
              <span style={{ color: GOOD_GREEN }}>{eaten - burnt}</span>
            </>
          ) : (
            eaten
          )}
        </span>
      </span>
      {macros.map((s) => (
        <span key={s.icon} className="flex items-center gap-1" style={{ color: s.color }}>
          <Icon name={s.icon} className="h-3.5 w-3.5" />
          <span className="text-xs font-extrabold tabular-nums text-ink">{s.value}</span>
        </span>
      ))}
    </div>
  );
}

/** Food log grouped by day, capped to the 5 most recent days. */
function FoodHistory() {
  const { dayLogs, today, foods, saveFood } = useStore();
  const logs = dayLogs.filter((l) => l.kind === "food");
  const savedNames = new Set(foods.map((f) => f.name.trim().toLowerCase()));

  const byDate = new Map<string, DayLog[]>();
  for (const l of logs) {
    const arr = byDate.get(l.date) ?? [];
    arr.push(l);
    byDate.set(l.date, arr);
  }
  // Calories burnt that day (from steps logs) net out of the day's intake.
  const burntByDate = new Map<string, number>();
  for (const l of dayLogs) {
    if (l.kind !== "steps") continue;
    burntByDate.set(l.date, (burntByDate.get(l.date) ?? 0) + (l.caloriesBurnt ?? 0));
  }
  const dates = [...byDate.keys()].sort().reverse().slice(0, 5);
  if (dates.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {dates.map((date) => {
        const rows = [...byDate.get(date)!].sort((a, b) => b.loggedAt - a.loggedAt);
        return (
          <div key={date} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <SectionTitle>{foodDayHeading(date, today)}</SectionTitle>
              <DayMacroTotals rows={rows} burnt={burntByDate.get(date) ?? 0} />
            </div>
            {rows.map((l) => {
              const name = l.name ?? "Food";
              return (
                <LogRow
                  key={l.id}
                  log={l}
                  icon="Utensils"
                  hideDay
                  title={name}
                  detail={`${fmtClock(l.loggedAt)} · ${l.calories ?? 0} kcal · P${l.protein ?? 0} C${l.carbs ?? 0} F${l.fat ?? 0}`}
                  saved={savedNames.has(name.trim().toLowerCase())}
                  onSave={() =>
                    saveFood({
                      name,
                      calories: l.calories ?? 0,
                      protein: l.protein ?? 0,
                      carbs: l.carbs ?? 0,
                      fat: l.fat ?? 0,
                    })
                  }
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Edit a saved food's name + macros in a pop-in modal. */
function EditFoodModal({
  food,
  onClose,
  onSave,
}: {
  food: FoodItem;
  onClose: () => void;
  onSave: (patch: {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }) => void;
}) {
  const [name, setName] = useState(food.name);
  const [calories, setCalories] = useState(String(food.calories));
  const [protein, setProtein] = useState(String(food.protein));
  const [carbs, setCarbs] = useState(String(food.carbs));
  const [fat, setFat] = useState(String(food.fat));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      calories: num(calories),
      protein: num(protein),
      carbs: num(carbs),
      fat: num(fat),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${food.name}`}
      onClick={onClose}
    >
      <div
        className="animate-pop flex w-full max-w-sm flex-col gap-3 p-6 clay"
        style={{ background: "var(--surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-lg font-extrabold tracking-tight">Edit food</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Food name"
          aria-label="Food name"
          className="rounded-xl bg-page-2 px-3 py-2.5 text-sm font-semibold text-ink outline-none placeholder:text-ink-faint"
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Calories" icon="Flame" value={calories} onChange={setCalories} suffix="kcal" />
          <NumberField label="Protein" icon="Beef" value={protein} onChange={setProtein} suffix="g" />
          <NumberField label="Carbs" icon="Wheat" value={carbs} onChange={setCarbs} suffix="g" />
          <NumberField label="Fat" icon="Droplets" value={fat} onChange={setFat} suffix="g" />
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="clay-press px-4 py-2 text-sm font-bold"
            style={{ background: "var(--page-2)", color: "var(--ink-soft)", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!name.trim()}
            className="clay-press px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            style={{ background: "var(--primary)", cursor: "pointer" }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Sleep ----------------

function SleepPanel() {
  const { logSleep } = useStore();
  const [hours, setHours] = useState("");
  const [mins, setMins] = useState("");
  const minutes = num(hours) * 60 + num(mins);
  const xp = minutes > 0 ? sleepXp(minutes) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="clay flex flex-col gap-3 p-5" style={{ background: "var(--surface)" }}>
        <SectionTitle>Log last night&apos;s sleep</SectionTitle>
        <div className="flex items-end gap-3">
          <NumberField label="Hours" icon="Moon" value={hours} onChange={setHours} suffix="h" width="w-28" />
          <NumberField label="Minutes" icon="Moon" value={mins} onChange={setMins} suffix="m" width="w-28" />
          <div className="flex-1" />
          {minutes > 0 && xpBadge(xp)}
          <LogButton
            onClick={() => {
              void logSleep(minutes);
              setHours("");
              setMins("");
            }}
            disabled={minutes <= 0}
          >
            Log sleep
          </LogButton>
        </div>
        <p className="text-xs font-medium text-ink-faint">
          Gold standard 7h 30m (±1h) earns +{SLEEP_GOLD_XP} XP. Below 6h or past
          9h costs 1 XP per minute.
        </p>
      </div>

      <PastLogs
        kind="sleep"
        icon="Moon"
        title={(l) => fmtMinutes(l.minutes ?? 0)}
      />
    </div>
  );
}

// ---------------- Steps ----------------

/** Editable body profile — height, sex, birthday — that powers the burn calc. */
function BodyProfileCard() {
  const { settings, setProfile, today } = useStore();
  const age = ageFromBirthday(settings.birthday, today);

  return (
    <div
      className="clay flex flex-col gap-3 p-5"
      style={{ background: "var(--surface)" }}
    >
      <div className="flex items-center justify-between">
        <SectionTitle>Body profile</SectionTitle>
        <span className="text-xs font-bold text-ink-faint">{age} yrs</span>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <NumberField
          label="Height"
          icon="Ruler"
          value={String(settings.heightCm)}
          onChange={(v) => void setProfile({ heightCm: num(v) })}
          suffix="cm"
          width="w-28"
        />
        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs font-bold text-ink-soft">
            <Icon name="Cake" className="h-3.5 w-3.5" />
            Birthday
          </span>
          <input
            type="date"
            value={settings.birthday}
            onChange={(e) => void setProfile({ birthday: e.target.value })}
            aria-label="Birthday"
            className="rounded-xl bg-page-2 px-3 py-2 text-sm font-semibold text-ink outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-ink-soft">Sex</span>
          <div className="flex gap-1 rounded-full p-1" style={{ background: "var(--page-2)" }}>
            {(["male", "female"] as BodySex[]).map((s) => (
              <button
                key={s}
                onClick={() => void setProfile({ sex: s })}
                aria-pressed={settings.sex === s}
                className="rounded-full px-3 py-1 text-sm font-bold capitalize"
                style={{
                  background: settings.sex === s ? "var(--surface)" : "transparent",
                  boxShadow: settings.sex === s ? "var(--clay-sm)" : "none",
                  color: settings.sex === s ? "var(--ink)" : "var(--ink-soft)",
                  cursor: "pointer",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </label>
      </div>
      <p className="text-xs font-medium text-ink-faint">
        Weight comes from your latest Weight log. Used to estimate how many
        calories each walk burns.
      </p>
    </div>
  );
}

function StepsPanel() {
  const { dayLogs, logSteps, settings, today } = useStore();
  const [activity, setActivity] = useState<GaitActivity>("walk");
  const [mode, setMode] = useState<"steps" | "meters">("steps");
  const [amount, setAmount] = useState("");
  const [hours, setHours] = useState("");
  const [mins, setMins] = useState("");
  const [burn, setBurn] = useState("");
  const burnVal = num(burn);
  const value = num(amount);
  const minutes = num(hours) * 60 + num(mins);
  const xp = mode === "steps" ? stepsXp(value, 0) : stepsXp(0, value);
  const isRun = activity === "run";

  // Latest weight (dayLogs are newest-first) drives the calorie estimate.
  const weightKg = dayLogs.find((l) => l.kind === "weight")?.weightKg ?? null;
  const age = ageFromBirthday(settings.birthday, today);

  // Runners think in distance — default to meters when switching to Run.
  const chooseActivity = (a: GaitActivity) => {
    setActivity(a);
    if (a === "run") setMode("meters");
  };

  // Live preview of speed + calories for what's currently typed.
  const preview =
    value > 0 && minutes > 0 && weightKg
      ? walkCalories({
          steps: mode === "steps" ? value : undefined,
          meters: mode === "meters" ? value : undefined,
          minutes,
          weightKg,
          heightCm: settings.heightCm,
          age,
          sex: settings.sex,
          mode: activity,
        })
      : null;

  const all = dayLogs.filter((l) => l.kind === "steps");
  const totalSteps = all.reduce((s, l) => s + (l.steps ?? 0), 0);
  const totalMeters = all.reduce((s, l) => s + (l.meters ?? 0), 0);
  const totalKcal = all.reduce((s, l) => s + (l.caloriesBurnt ?? 0), 0);
  const totalXpFarmed = all.reduce((s, l) => s + l.awardedXp, 0);

  return (
    <div className="flex flex-col gap-4">
      <BodyProfileCard />

      <div className="clay flex flex-col gap-3 p-5" style={{ background: "var(--surface)" }}>
        <SectionTitle>Log a walk or run</SectionTitle>
        {/* Walk vs Run — running burns far more for the same distance */}
        <div className="flex gap-1 self-start rounded-full p-1" style={{ background: "var(--page-2)" }}>
          {(["walk", "run"] as const).map((a) => (
            <button
              key={a}
              onClick={() => chooseActivity(a)}
              aria-pressed={activity === a}
              className="flex items-center gap-1.5 rounded-full px-4 py-1 text-sm font-bold capitalize"
              style={{
                background: activity === a ? "var(--cool-acc)" : "transparent",
                color: activity === a ? "#fff" : "var(--ink-soft)",
                cursor: "pointer",
              }}
            >
              <Icon name={a === "walk" ? "Footprints" : "Zap"} className="h-3.5 w-3.5" />
              {a}
            </button>
          ))}
        </div>
        <div className="flex gap-1 self-start rounded-full p-1" style={{ background: "var(--page-2)" }}>
          {(["steps", "meters"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold capitalize"
              style={{
                background: mode === m ? "var(--surface)" : "transparent",
                boxShadow: mode === m ? "var(--clay-sm)" : "none",
                color: mode === m ? "var(--ink)" : "var(--ink-soft)",
                cursor: "pointer",
              }}
            >
              <Icon name={m === "steps" ? "Footprints" : "Ruler"} className="h-3.5 w-3.5" />
              {m}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <NumberField
            label={mode === "steps" ? "Steps" : "Meters"}
            icon={mode === "steps" ? "Footprints" : "Ruler"}
            value={amount}
            onChange={setAmount}
            suffix={mode === "steps" ? "steps" : "m"}
            width="w-40"
          />
          <NumberField label="Hours" icon="Clock" value={hours} onChange={setHours} suffix="h" width="w-24" />
          <NumberField label="Minutes" icon="Clock" value={mins} onChange={setMins} suffix="m" width="w-24" />
          <div className="flex-1" />
          {value > 0 && xpBadge(xp)}
          <LogButton
            onClick={() => {
              void logSteps({
                ...(mode === "steps" ? { steps: value } : { meters: value }),
                minutes,
                activity,
              });
              setAmount("");
              setHours("");
              setMins("");
            }}
            disabled={value <= 0}
          >
            Log
          </LogButton>
        </div>

        {/* Calorie + speed estimate for the entered walk */}
        {preview && (
          <div
            className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl px-4 py-3"
            style={{ background: "var(--page-2)" }}
          >
            <span className="flex items-center gap-1.5 text-sm font-extrabold" style={{ color: "var(--cool-acc)" }}>
              <Icon name="Flame" className="h-4.5 w-4.5" />
              {preview.calories} kcal burnt
            </span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
              <Icon name="Gauge" className="h-4 w-4" />
              {preview.speedKmh} km/h
            </span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
              <Icon name="Route" className="h-4 w-4" />
              {preview.distanceKm} km
            </span>
            <span className="text-xs font-medium text-ink-faint">{preview.met} MET</span>
          </div>
        )}
        {value > 0 && minutes > 0 && !weightKg && (
          <p className="text-xs font-semibold" style={{ color: "var(--bad-acc)" }}>
            Log your weight once in the Weight tracker to estimate calories burnt.
          </p>
        )}

        <p className="text-xs font-medium text-ink-faint">
          +0.01 XP per step · +0.015 XP per meter. Add the time spent to estimate
          calories burnt — a run of the same distance burns roughly twice a walk.
        </p>
      </div>

      {/* Manual burnt-calorie entry — for workouts the step model can't cover. */}
      <div className="clay flex flex-col gap-3 p-5" style={{ background: "var(--surface)" }}>
        <SectionTitle>Log burnt calories</SectionTitle>
        <div className="flex flex-wrap items-end gap-3">
          <NumberField
            label="Calories burnt"
            icon="Flame"
            value={burn}
            onChange={setBurn}
            suffix="kcal"
            width="w-44"
          />
          <div className="flex-1" />
          <LogButton
            onClick={() => {
              void logSteps({ caloriesBurnt: burnVal });
              setBurn("");
            }}
            disabled={burnVal <= 0}
          >
            Log
          </LogButton>
        </div>
        <p className="text-xs font-medium text-ink-faint">
          Counts straight toward today&apos;s net calories. No XP — just the burn.
        </p>
      </div>

      {all.length > 0 && (
        <div
          className="flex items-center justify-around rounded-2xl p-4 text-center"
          style={{ background: "var(--page-2)" }}
        >
          <div>
            <p className="text-lg font-extrabold">{totalSteps.toLocaleString()}</p>
            <p className="text-xs font-semibold text-ink-faint">steps done</p>
          </div>
          {totalMeters > 0 && (
            <div>
              <p className="text-lg font-extrabold">{totalMeters.toLocaleString()}</p>
              <p className="text-xs font-semibold text-ink-faint">meters</p>
            </div>
          )}
          {totalKcal > 0 && (
            <div>
              <p className="text-lg font-extrabold" style={{ color: "var(--cool-acc)" }}>
                {totalKcal.toLocaleString()}
              </p>
              <p className="text-xs font-semibold text-ink-faint">kcal burnt</p>
            </div>
          )}
          <div>
            <p className="text-lg font-extrabold text-primary">+{totalXpFarmed}</p>
            <p className="text-xs font-semibold text-ink-faint">XP farmed</p>
          </div>
        </div>
      )}

      <PastLogs
        kind="steps"
        icon="Footprints"
        title={(l) => {
          // A burn-only entry (manual calories) has no steps or meters.
          if (!l.steps && !l.meters) return "Calories burnt";
          const base = l.steps
            ? `${l.steps.toLocaleString()} steps`
            : `${(l.meters ?? 0).toLocaleString()} m`;
          return l.activity === "run" ? `${base} · Run` : base;
        }}
        detail={(l) =>
          [
            l.minutes ? fmtMinutes(l.minutes) : "",
            l.caloriesBurnt ? `${l.caloriesBurnt} kcal` : "",
          ]
            .filter(Boolean)
            .join(" · ")
        }
      />
    </div>
  );
}

// ---------------- Reading ----------------

function ReadingPanel() {
  const { dayLogs, logReading } = useStore();
  const [mins, setMins] = useState("");
  const minutes = num(mins);

  const all = dayLogs.filter((l) => l.kind === "reading");
  const totalMin = all.reduce((s, l) => s + (l.minutes ?? 0), 0);
  const totalXpFarmed = all.reduce((s, l) => s + l.awardedXp, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="clay flex flex-col gap-3 p-5" style={{ background: "var(--surface)" }}>
        <SectionTitle>Log a reading session</SectionTitle>
        <div className="flex items-end gap-3">
          <NumberField label="Minutes" icon="BookOpen" value={mins} onChange={setMins} suffix="min" width="w-36" />
          <div className="flex-1" />
          {minutes > 0 && xpBadge(readingXp(minutes))}
          <LogButton
            onClick={() => {
              void logReading(minutes);
              setMins("");
            }}
            disabled={minutes <= 0}
          >
            Log reading
          </LogButton>
        </div>
        <p className="text-xs font-medium text-ink-faint">
          +{XP_PER_READING_MIN} XP per minute of reading.
        </p>
      </div>

      {all.length > 0 && (
        <div
          className="flex items-center justify-around rounded-2xl p-4 text-center"
          style={{ background: "var(--page-2)" }}
        >
          <div>
            <p className="text-lg font-extrabold">{fmtMinutes(totalMin)}</p>
            <p className="text-xs font-semibold text-ink-faint">time read</p>
          </div>
          <div>
            <p className="text-lg font-extrabold text-primary">+{totalXpFarmed}</p>
            <p className="text-xs font-semibold text-ink-faint">XP farmed</p>
          </div>
        </div>
      )}

      <PastLogs
        kind="reading"
        icon="BookOpen"
        title={(l) => fmtMinutes(l.minutes ?? 0)}
      />
    </div>
  );
}

// ---------------- Focus (Pomodoro) ----------------

const FOCUS_PRESETS = [
  { label: "Classic", focus: 25, rest: 5 },
  { label: "Deep", focus: 50, rest: 10 },
];

type FocusPeriod = "today" | "week" | "month" | "year" | "all" | "custom";

const FOCUS_PERIODS: { value: FocusPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

/** Colours cycled across the focus-task list icons. */
const TASK_COLORS = [
  "var(--must-acc)",
  "var(--imp-acc)",
  "var(--cool-acc)",
  "var(--primary)",
  "var(--accent)",
  "var(--bad-acc)",
];

/** "13:05" for a timestamp (24h, always colon-separated). */
function fmtClock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "May 14" for a YYYY-MM-DD day string. */
function fmtDayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** SVG progress ring with the countdown in the center. */
function FocusRing({
  fraction,
  color,
  children,
}: {
  fraction: number;
  color: string;
  children: React.ReactNode;
}) {
  const R = 110;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative h-64 w-64">
      <svg viewBox="0 0 256 256" className="h-full w-full -rotate-90">
        <circle
          cx="128"
          cy="128"
          r={R}
          fill="none"
          stroke="var(--page-2)"
          strokeWidth="14"
        />
        <circle
          cx="128"
          cy="128"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - Math.min(1, Math.max(0, fraction)))}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        {children}
      </div>
    </div>
  );
}

/** A focus block placed on the day timeline. */
type FocusBlock = { start: number; end: number; label: string; running: boolean };

const hourFloor = (ms: number) => {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.getTime();
};

/** Today's focus sessions laid out on a vertical 24h timeline. */
function FocusTimeline({
  blocks,
  now,
}: {
  blocks: FocusBlock[];
  now: number;
}) {
  const HOUR = 3_600_000;
  const PX_PER_HOUR = 72;

  // Window: from the first block (or now) to the last end (or now), padded to
  // whole hours, with a 4-hour minimum so a lone block isn't cramped.
  const starts = blocks.map((b) => b.start);
  const ends = blocks.map((b) => b.end);
  let rangeStart = hourFloor(Math.min(now, ...starts));
  let rangeEnd = hourFloor(Math.max(now, ...ends)) + HOUR;
  while (rangeEnd - rangeStart < 4 * HOUR) rangeEnd += HOUR;

  const hours: number[] = [];
  for (let t = rangeStart; t <= rangeEnd; t += HOUR) hours.push(t);
  const y = (ms: number) => ((ms - rangeStart) / HOUR) * PX_PER_HOUR;

  return (
    <div
      className="clay flex flex-col gap-3 p-5"
      style={{ background: "var(--surface)" }}
    >
      <SectionTitle>Today</SectionTitle>
      <div
        className="relative ml-9"
        style={{ height: (hours.length - 1) * PX_PER_HOUR }}
      >
        {/* Hour gridlines + 24h labels */}
        {hours.map((h) => (
          <div
            key={h}
            className="absolute left-0 right-0 flex items-center"
            style={{ top: y(h) }}
          >
            <span className="absolute -left-9 -translate-y-1/2 text-xs font-bold text-ink-faint tabular-nums">
              {String(new Date(h).getHours()).padStart(2, "0")}
            </span>
            <span className="h-px w-full" style={{ background: "var(--page-2)" }} />
          </div>
        ))}

        {/* Focus blocks */}
        {blocks.map((b, i) => {
          const top = y(b.start);
          const height = Math.max(18, y(b.end) - top);
          return (
            <div
              key={i}
              className="absolute left-1 right-1 overflow-hidden rounded-xl px-3 py-1.5"
              style={{
                top,
                height,
                background: b.running
                  ? "color-mix(in srgb, var(--accent) 30%, var(--surface))"
                  : "color-mix(in srgb, var(--accent) 18%, var(--surface))",
                border: `2px solid ${b.running ? "var(--accent)" : "color-mix(in srgb, var(--accent) 40%, transparent)"}`,
              }}
            >
              <p className="truncate text-sm font-extrabold">{b.label}</p>
              <p className="truncate text-xs font-semibold text-ink-soft">
                {fmtClock(b.start)} – {fmtClock(b.end)}
              </p>
            </div>
          );
        })}

        {/* Now line */}
        <div
          className="absolute left-0 right-0 flex items-center"
          style={{ top: y(now) }}
        >
          <span
            className="absolute -left-1 h-2 w-2 -translate-y-1/2 rounded-full"
            style={{ background: "var(--bad-acc)" }}
          />
          <span className="h-0.5 w-full" style={{ background: "var(--bad-acc)" }} />
        </div>
      </div>
    </div>
  );
}

/** Overview stat tile (e.g. "Total Pomo · 163"). */
function OverviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl p-3" style={{ background: "var(--page-2)" }}>
      <span className="text-xs font-semibold text-ink-faint">{label}</span>
      <span className="text-2xl font-extrabold tabular-nums">{value}</span>
    </div>
  );
}

/** Right-rail overview + scrollable per-day record of every focus session. */
function FocusRecord({ logs, today }: { logs: DayLog[]; today: string }) {
  const { removeDayLog } = useStore();
  const confirm = useConfirm();
  const [days, setDays] = useState(10);

  const todays = logs.filter((l) => l.date === today);
  const sumMin = (ls: DayLog[]) => ls.reduce((s, l) => s + (l.minutes ?? 0), 0);

  // Group sessions by day, newest day first; within a day, newest first.
  const byDate = new Map<string, DayLog[]>();
  for (const l of logs) {
    const arr = byDate.get(l.date) ?? [];
    arr.push(l);
    byDate.set(l.date, arr);
  }
  const dates = [...byDate.keys()].sort().reverse();
  const shown = dates.slice(0, days);

  return (
    <div
      className="clay flex flex-col gap-4 p-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)]"
      style={{ background: "var(--surface)" }}
    >
      <div className="flex flex-col gap-3">
        <SectionTitle>Overview</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <OverviewStat label="Today's Pomo" value={String(todays.length)} />
          <OverviewStat label="Today's Focus" value={fmtMinutes(sumMin(todays)) || "0m"} />
          <OverviewStat label="Total Pomo" value={String(logs.length)} />
          <OverviewStat label="Total Focus" value={fmtMinutes(sumMin(logs)) || "0m"} />
        </div>
      </div>

      <SectionTitle>Focus Record</SectionTitle>
      {dates.length === 0 ? (
        <p className="text-sm font-medium text-ink-faint">
          No sessions yet. Finish a pomodoro to see it here.
        </p>
      ) : (
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
          {shown.map((date) => {
            const sessions = [...byDate.get(date)!].sort(
              (a, b) => b.loggedAt - a.loggedAt,
            );
            return (
              <div key={date} className="flex flex-col gap-2">
                <p className="text-xs font-bold text-ink-faint">{fmtDayLabel(date)}</p>
                {sessions.map((l) => {
                  const start = l.loggedAt - (l.minutes ?? 0) * 60_000;
                  return (
                    <div key={l.id} className="group flex items-start gap-3">
                      <span
                        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white"
                        style={{ background: "var(--accent)" }}
                      >
                        <Icon name="Timer" className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium text-ink-faint tabular-nums">
                            {fmtClock(start)} – {fmtClock(l.loggedAt)}
                          </span>
                          <span className="shrink-0 text-sm font-bold text-ink-soft">
                            {fmtMinutes(l.minutes ?? 0)}
                          </span>
                        </div>
                        <p className="truncate text-sm font-extrabold">
                          {l.name ?? "Focus"}
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          if (
                            await confirm({
                              title: "Delete this focus session?",
                              message: "Its XP will be reversed.",
                              confirmLabel: "Delete",
                            })
                          )
                            removeDayLog(l.id);
                        }}
                        aria-label="Delete focus session"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint opacity-0 transition-opacity hover:bg-black/5 focus-visible:opacity-100 group-hover:opacity-100"
                        style={{ cursor: "pointer" }}
                      >
                        <Icon name="Trash2" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {dates.length > days && (
            <button
              onClick={() => setDays((d) => d + 10)}
              className="clay-press self-center px-4 py-2 text-sm font-bold"
              style={{ background: "var(--page-2)", cursor: "pointer" }}
            >
              View more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FocusPanel() {
  const {
    dayLogs,
    today,
    settings,
    activeFocus,
    startFocusSession,
    cancelFocusSession,
    saveFocusSession,
    pauseFocusSession,
    resumeFocusSession,
    addFocusTask,
    removeFocusTask,
  } = useStore();
  const confirm = useConfirm();
  const now = useNow(1000);
  const [focusMin, setFocusMin] = useState("25");
  const [restMin, setRestMin] = useState("5");
  const [task, setTask] = useState<string | null>(null);
  const [newTask, setNewTask] = useState("");
  const [period, setPeriod] = useState<FocusPeriod>("today");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);

  const phaseEnd = activeFocus ? focusPhaseEnd(activeFocus) : null;

  // Countdown in the tab title while a session runs (frozen while paused).
  useEffect(() => {
    if (!activeFocus) return;
    const left = focusRemainingMs(activeFocus, now);
    const m = Math.floor(left / 60_000);
    const s = Math.floor((left % 60_000) / 1000);
    const paused = activeFocus.pausedAt != null;
    document.title = `${paused ? "⏸" : activeFocus.phase === "focus" ? "🔥" : "☕"} ${m}:${String(s).padStart(2, "0")} · grit`;
    return () => {
      document.title = "grit";
    };
  }, [activeFocus, now]);

  const focusLogs = dayLogs.filter((l) => l.kind === "focus");
  const todays = focusLogs.filter((l) => l.date === today);
  const doneToday = todays.length;

  // Created tasks first, then any logged-only labels (e.g. deleted tasks).
  const loggedNames = [
    ...new Set(focusLogs.map((l) => l.name).filter(Boolean) as string[]),
  ];
  const loggedOnly = loggedNames.filter((n) => !settings.focusTasks.includes(n));
  const allTasks = [...settings.focusTasks, ...loggedOnly];

  const submitNewTask = () => {
    const n = newTask.trim();
    if (!n) return;
    void addFocusTask(n);
    setTask(n);
    setNewTask("");
  };

  // Monday of the current week, for the "This week" period filter.
  const monday = addDays(today, -((new Date().getDay() + 6) % 7));

  // ---- Running session ----
  if (activeFocus && phaseEnd !== null) {
    const isFocus = activeFocus.phase === "focus";
    const paused = activeFocus.pausedAt != null;
    const elapsed = focusElapsed(activeFocus, now);
    const totalMs =
      (isFocus ? activeFocus.focusMin : activeFocus.restMin) * 60_000;
    const leftMs = focusRemainingMs(activeFocus, now);
    const leftMin = Math.floor(leftMs / 60_000);
    const leftSec = Math.floor((leftMs % 60_000) / 1000);
    const canSave = Math.floor(focusElapsedMs(activeFocus, now) / 60_000) >= 1;
    const color = isFocus ? "var(--accent)" : "var(--cool-acc)";

    // Today's finished blocks + the one in progress (only during a focus phase).
    const blocks: FocusBlock[] = todays
      .map((l) => ({
        start: l.loggedAt - (l.minutes ?? 0) * 60_000,
        end: l.loggedAt,
        label: l.name ?? "Focus",
        running: false,
      }))
      .concat(
        isFocus
          ? [
              {
                start: activeFocus.startedAt,
                end: Math.min(now, phaseEnd),
                label: activeFocus.label ?? "Focus",
                running: true,
              },
            ]
          : [],
      );

    return (
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <div
        className="clay flex flex-col items-center gap-4 p-8"
        style={{ background: "var(--surface)" }}
      >
        <span
          className="flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-extrabold uppercase tracking-wider text-white"
          style={{ background: paused ? "var(--ink-soft)" : color }}
        >
          <Icon name={paused ? "Pause" : isFocus ? "Timer" : "Coffee"} className="h-4 w-4" />
          {paused ? "Paused" : isFocus ? "Focus" : "Rest"}
        </span>

        {activeFocus.label && (
          <span className="text-lg font-extrabold tracking-tight">
            {activeFocus.label}
          </span>
        )}

        <FocusRing fraction={1 - leftMs / totalMs} color={color}>
          <span className="font-mono text-5xl font-extrabold tabular-nums tracking-tight">
            {leftMin}:{String(leftSec).padStart(2, "0")}
          </span>
          <span className="text-sm font-bold text-ink-soft">
            {fmtClock(activeFocus.startedAt)} – {fmtClock(phaseEnd)}
          </span>
          {isFocus && (
            <span className="text-xs font-semibold text-ink-faint">
              +{focusXp(activeFocus.focusMin)} XP on finish
            </span>
          )}
        </FocusRing>

        {/* While the alarm is ringing the overlay owns the choices. */}
        {!elapsed && (
          <div className="flex items-center gap-3">
            {/* Pause / Resume */}
            <button
              onClick={() => (paused ? resumeFocusSession() : pauseFocusSession())}
              aria-label={paused ? "Resume" : "Pause"}
              className="clay-press grid h-12 w-12 place-items-center rounded-full text-white"
              style={{ background: color, cursor: "pointer" }}
            >
              <Icon name={paused ? "Play" : "Pause"} className="h-5 w-5" />
            </button>

            {isFocus && canSave && (
              <button
                onClick={async () => {
                  const mins = Math.floor(focusElapsedMs(activeFocus, Date.now()) / 60_000);
                  if (
                    await confirm({
                      title: "Save this focus session?",
                      message: `${fmtMinutes(mins)} of focus will be logged.`,
                      confirmLabel: "Save",
                    })
                  )
                    void saveFocusSession();
                }}
                className="clay-press px-5 py-2.5 text-sm font-bold"
                style={{ background: "var(--accent)", color: "#fff", cursor: "pointer" }}
              >
                Save
              </button>
            )}

            <button
              onClick={async () => {
                if (!isFocus) return void cancelFocusSession();
                if (
                  await confirm({
                    title: "Give up this pomodoro?",
                    message: "An abandoned session earns no XP.",
                    confirmLabel: "Give up",
                  })
                )
                  void cancelFocusSession();
              }}
              className="clay-press px-5 py-2.5 text-sm font-bold"
              style={{
                background: isFocus ? "var(--bad-acc)" : "var(--primary)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              {isFocus ? "Give up" : "Skip rest"}
            </button>
          </div>
        )}
      </div>

      <FocusTimeline blocks={blocks} now={now} />
    </div>
    );
  }

  // ---- Idle: presets + stats + history ----
  const f = num(focusMin);
  const r = num(restMin);

  // Selected period → inclusive [rangeStart, rangeEnd] day window.
  let rangeStart = today;
  let rangeEnd = today;
  if (period === "week") rangeStart = monday;
  else if (period === "month") rangeStart = `${today.slice(0, 8)}01`;
  else if (period === "year") rangeStart = `${today.slice(0, 4)}-01-01`;
  else if (period === "all") {
    rangeStart = "0000-01-01";
    rangeEnd = "9999-12-31";
  } else if (period === "custom") {
    rangeStart = customFrom;
    rangeEnd = customTo;
  }
  const periodLogs = focusLogs.filter(
    (l) => l.date >= rangeStart && l.date <= rangeEnd,
  );
  const taskPeriodMin = (name: string) =>
    periodLogs
      .filter((l) => (l.name ?? "") === name)
      .reduce((s, l) => s + (l.minutes ?? 0), 0);

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* LEFT: start a pomodoro + working hours + history */}
      <div className="flex flex-col gap-4">
      <div
        className="clay flex flex-col gap-4 p-5"
        style={{ background: "var(--surface)" }}
      >
        <SectionTitle>Start a pomodoro</SectionTitle>

        {/* Focus task chooser */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setTask(null)}
              aria-pressed={task === null}
              className="rounded-full px-3 py-1.5 text-sm font-bold"
              style={{
                background: task === null ? "var(--accent)" : "var(--page-2)",
                color: task === null ? "#fff" : "var(--ink-soft)",
                cursor: "pointer",
              }}
            >
              No task
            </button>
            {allTasks.map((t) => {
              const on = task === t;
              return (
                <span
                  key={t}
                  className="group flex items-center rounded-full"
                  style={{
                    background: on ? "var(--accent)" : "var(--page-2)",
                    color: on ? "#fff" : "var(--ink)",
                  }}
                >
                  <button
                    onClick={() => setTask(on ? null : t)}
                    aria-pressed={on}
                    className="rounded-full py-1.5 pl-3 pr-2 text-sm font-bold"
                    style={{ cursor: "pointer" }}
                  >
                    {t}
                  </button>
                  <button
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `Delete focus task "${t}"?`,
                          message: "Past sessions keep their time.",
                          confirmLabel: "Delete",
                        })
                      ) {
                        if (task === t) setTask(null);
                        void removeFocusTask(t);
                      }
                    }}
                    aria-label={`Delete ${t}`}
                    className="grid h-6 w-6 place-items-center rounded-full opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100"
                    style={{ cursor: "pointer" }}
                  >
                    <Icon name="X" className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNewTask();
              }}
              placeholder="New focus task (e.g. Learn German)"
              aria-label="New focus task"
              className="min-w-0 flex-1 rounded-xl bg-page-2 px-3 py-2 text-sm font-semibold text-ink outline-none placeholder:text-ink-faint"
            />
            <button
              onClick={submitNewTask}
              disabled={!newTask.trim()}
              aria-label="Add focus task"
              className="clay-press grid h-9 w-9 shrink-0 place-items-center disabled:opacity-40"
              style={{
                background: "var(--accent)",
                color: "#fff",
                cursor: newTask.trim() ? "pointer" : "not-allowed",
              }}
            >
              <Icon name="Plus" className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {FOCUS_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setFocusMin(String(p.focus));
                setRestMin(String(p.rest));
              }}
              aria-pressed={f === p.focus && r === p.rest}
              className="flex flex-col items-start gap-0.5 rounded-2xl px-4 py-2.5 text-left"
              style={{
                background:
                  f === p.focus && r === p.rest ? "var(--accent)" : "var(--page-2)",
                color: f === p.focus && r === p.rest ? "#fff" : "var(--ink)",
                cursor: "pointer",
              }}
            >
              <span className="text-sm font-extrabold">{p.label}</span>
              <span className="text-xs font-semibold opacity-80">
                {p.focus} / {p.rest} min
              </span>
            </button>
          ))}
          <NumberField label="Focus" icon="Timer" value={focusMin} onChange={setFocusMin} suffix="min" width="w-28" />
          <NumberField label="Rest" icon="Coffee" value={restMin} onChange={setRestMin} suffix="min" width="w-28" />
          <div className="flex-1" />
          <button
            onClick={() => startFocusSession(f, r, task ?? undefined)}
            disabled={f <= 0}
            className="clay-press flex items-center gap-2 px-5 py-2.5 text-sm font-bold disabled:opacity-40"
            style={{
              background: "var(--accent)",
              color: "#fff",
              cursor: f > 0 ? "pointer" : "not-allowed",
            }}
          >
            <Icon name="Play" className="h-4 w-4" />
            Start
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-ink-faint">
          <span>
            +{XP_PER_FOCUS_MIN} XP per focused minute — paid only when the
            session finishes. Every {FOCUS_SET_SIZE}th pomodoro of the day:
            +{FOCUS_SET_XP} bonus.
          </span>
          <span className="ml-auto flex items-center gap-1" aria-label="Set progress">
            {Array.from({ length: FOCUS_SET_SIZE }, (_, i) => {
              const filled =
                doneToday > 0 && doneToday % FOCUS_SET_SIZE === 0
                  ? FOCUS_SET_SIZE
                  : doneToday % FOCUS_SET_SIZE;
              return (
                <span
                  key={i}
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    background: i < filled ? "var(--accent)" : "var(--page-2)",
                  }}
                />
              );
            })}
            <span className="ml-1 font-bold text-ink-soft">{doneToday} today</span>
          </span>
        </div>
      </div>

      {/* Focus tasks with total time for the selected period */}
      <div className="clay flex flex-col gap-3 p-5" style={{ background: "var(--surface)" }}>
        <div className="flex items-center justify-between gap-2">
          <SectionTitle>Focus tasks</SectionTitle>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as FocusPeriod)}
            aria-label="Time period"
            className="rounded-xl bg-page-2 px-3 py-1.5 text-sm font-bold text-ink-soft outline-none"
            style={{ cursor: "pointer" }}
          >
            {FOCUS_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {period === "custom" && (
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-soft">
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              aria-label="From date"
              className="rounded-xl bg-page-2 px-3 py-1.5 text-sm font-semibold text-ink outline-none"
            />
            <span>–</span>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              onChange={(e) => setCustomTo(e.target.value)}
              aria-label="To date"
              className="rounded-xl bg-page-2 px-3 py-1.5 text-sm font-semibold text-ink outline-none"
            />
          </div>
        )}

        {allTasks.length === 0 ? (
          <p className="text-sm font-medium text-ink-faint">
            Create a focus task above to track time here.
          </p>
        ) : (
          <div className="flex flex-col">
            {allTasks.map((t, i) => (
              <div
                key={t}
                className="flex items-center gap-3 border-t border-black/5 py-3 first:border-t-0"
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white"
                  style={{ background: TASK_COLORS[i % TASK_COLORS.length] }}
                >
                  <Icon name="Timer" className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{t}</span>
                <span className="shrink-0 text-sm font-bold text-ink-soft tabular-nums">
                  {fmtMinutes(taskPeriodMin(t)) || "0m"}
                </span>
                <button
                  onClick={() => startFocusSession(f, r, t)}
                  disabled={f <= 0}
                  aria-label={`Start a pomodoro for ${t}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-black/5 disabled:opacity-40"
                  style={{
                    color: "var(--accent)",
                    cursor: f > 0 ? "pointer" : "not-allowed",
                  }}
                >
                  <Icon name="Play" className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      </div>

      {/* RIGHT: overview + scrollable focus record */}
      <FocusRecord logs={focusLogs} today={today} />
    </div>
  );
}

// ---------------- Weight ----------------

function WeightPanel() {
  const { settings, dayLogs, today, logWeight, setWeightUnit } = useStore();
  const unit = settings.weightUnit;
  const [value, setValue] = useState("");

  // Newest first (dayLogs are sorted by loggedAt desc). One log per day:
  // logging again today overwrites today's entry.
  const logs = dayLogs.filter((l) => l.kind === "weight");
  const latest = logs[0];
  const todays = logs.find((l) => l.date === today);
  /** XP baseline: the newest log from a previous day (matches the repository). */
  const baseline = logs.find((l) => l.date !== today);
  const deltaKg =
    latest && baseline && latest !== baseline
      ? (latest.weightKg ?? 0) - (baseline.weightKg ?? 0)
      : null;
  const deltaUnit = deltaKg !== null ? kgToUnit(Math.abs(deltaKg), unit) : 0;

  const entered = Number(value);
  const valid = Number.isFinite(entered) && entered > 0;
  // Live preview of the loss reward for the entered value.
  const previewXp =
    valid && baseline
      ? weightLossXp(baseline.weightKg ?? 0, unitToKg(entered, unit))
      : 0;

  const submit = () => {
    if (!valid) return;
    void logWeight(unitToKg(entered, unit));
    setValue("");
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* LEFT: log form + history */}
      <div className="flex flex-col gap-4">
      <div
        className="clay flex flex-col gap-4 p-5"
        style={{ background: "var(--surface)" }}
      >
        <div className="flex items-center justify-between">
          <SectionTitle>Log your weight</SectionTitle>
          {/* Unit switch: logs are stored in kg, only the display changes. */}
          <div
            className="flex gap-1 rounded-full p-1"
            style={{ background: "var(--page-2)" }}
          >
            {(["kg", "lbs"] as WeightUnit[]).map((u) => (
              <button
                key={u}
                onClick={() => setWeightUnit(u)}
                aria-pressed={unit === u}
                className="rounded-full px-3 py-1 text-sm font-bold"
                style={{
                  background: unit === u ? "var(--surface)" : "transparent",
                  boxShadow: unit === u ? "var(--clay-sm)" : "none",
                  color: unit === u ? "var(--ink)" : "var(--ink-soft)",
                  cursor: "pointer",
                }}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end gap-3">
          <label className="flex w-40 flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs font-bold text-ink-soft">
              <Icon name="Scale" className="h-3.5 w-3.5" />
              Weight
            </span>
            <span className="flex items-center gap-1 rounded-xl bg-page-2 px-3 py-2">
              <input
                type="number"
                min={0}
                step={0.1}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                aria-label={`Weight in ${unit}`}
                className="w-full bg-transparent text-sm font-semibold text-ink outline-none"
                placeholder={latest ? String(kgToUnit(latest.weightKg ?? 0, unit)) : "0.0"}
              />
              <span className="text-xs font-medium text-ink-faint">{unit}</span>
            </span>
          </label>
          <div className="flex-1" />
          {previewXp > 0 && xpBadge(previewXp)}
          <LogButton onClick={submit} disabled={!valid}>
            {todays ? "Update weight" : "Log weight"}
          </LogButton>
        </div>
        <p className="text-xs font-medium text-ink-faint">
          +{XP_PER_100G_LOST} XP for every 100g lost since your previous day&apos;s
          log. Gains cost nothing. One entry per day — logging again replaces
          today&apos;s entry and re-computes its XP.
        </p>
      </div>

      <PastLogs
        kind="weight"
        icon="Scale"
        title={(l) => fmtWeight(l.weightKg ?? 0, unit)}
      />
      </div>

      {/* RIGHT: current weight + delta since previous day */}
      {latest && (
        <div
          className="clay flex flex-col gap-5 p-6 text-center lg:sticky lg:top-4"
          style={{ background: "var(--surface)" }}
        >
          <div>
            <p className="text-4xl font-extrabold tracking-tight">
              {fmtWeight(latest.weightKg ?? 0, unit)}
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-ink-faint">
              current
            </p>
          </div>
          {deltaKg !== null && (
            <div>
              <p
                className="flex items-center justify-center gap-1.5 text-3xl font-extrabold"
                style={{
                  color:
                    deltaKg === 0
                      ? "var(--ink-soft)"
                      : deltaKg < 0
                        ? "var(--cool-acc)"
                        : "var(--bad-acc)",
                }}
              >
                {deltaKg !== 0 && (
                  <Icon
                    name={deltaKg < 0 ? "TrendingDown" : "TrendingUp"}
                    className="h-6 w-6"
                  />
                )}
                {deltaKg === 0 ? "—" : `${deltaKg < 0 ? "−" : "+"}${deltaUnit} ${unit}`}
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                since previous day
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------- Shared past-log list ----------------

function PastLogs({
  kind,
  icon,
  title,
  detail,
  excludeToday = false,
}: {
  kind: DayLogKind;
  icon: string;
  title: (l: DayLog) => string;
  detail?: (l: DayLog) => string;
  excludeToday?: boolean;
}) {
  const { dayLogs, today } = useStore();
  const logs = dayLogs.filter(
    (l) => l.kind === kind && (!excludeToday || l.date !== today),
  );
  if (logs.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>{excludeToday ? "Earlier" : "Past logs"}</SectionTitle>
      {logs.map((l) => (
        <LogRow key={l.id} log={l} icon={icon} title={title(l)} detail={detail?.(l)} />
      ))}
    </div>
  );
}

// ---------------- Page ----------------

export function DailyLog() {
  const { dailyLogTab: active, setDailyLogTab: setActive } = useUi();
  const { dayLogs, today, settings } = useStore();

  /** Today's one-line summary per tracker, shown on its chooser tile. */
  const summary = (kind: DayLogKind): string => {
    const todays = dayLogs.filter((l) => l.kind === kind && l.date === today);
    switch (kind) {
      case "food":
        return `${foodTotal(todays, "calories")} / ${settings.calorieLimit} kcal`;
      case "sleep": {
        const m = todays.reduce((s, l) => s + (l.minutes ?? 0), 0);
        return m > 0 ? fmtMinutes(m) : "Not logged";
      }
      case "steps": {
        const s = todays.reduce((n, l) => n + (l.steps ?? 0), 0);
        const m = todays.reduce((n, l) => n + (l.meters ?? 0), 0);
        if (s === 0 && m === 0) return "Not logged";
        return [s > 0 ? `${s.toLocaleString()} steps` : "", m > 0 ? `${m.toLocaleString()} m` : ""]
          .filter(Boolean)
          .join(" · ");
      }
      case "reading": {
        const m = todays.reduce((s, l) => s + (l.minutes ?? 0), 0);
        return m > 0 ? fmtMinutes(m) : "Not logged";
      }
      case "focus": {
        const m = todays.reduce((s, l) => s + (l.minutes ?? 0), 0);
        return m > 0
          ? `${fmtMinutes(m)} · ${todays.length} done`
          : "No sessions yet";
      }
      case "weight": {
        const latest = dayLogs.find((l) => l.kind === "weight");
        return latest
          ? fmtWeight(latest.weightKg ?? 0, settings.weightUnit)
          : "Not logged";
      }
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex items-center gap-4 p-5 clay"
        style={{ background: "var(--surface)" }}
      >
        <div
          className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white"
          style={{ background: "var(--primary)" }}
        >
          <Icon name="NotebookPen" className="h-7 w-7" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight">Daily Log</h1>
          <p className="text-sm font-medium text-ink-soft">
            Track food, sleep, steps and reading — earn (or lose) XP.
          </p>
        </div>
      </div>

      {/* Tracker chooser */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {TRACKERS.map((t) => {
          const on = active === t.kind;
          const { current, best } = logStreak(
            dayLogs.filter((l) => l.kind === t.kind).map((l) => l.date),
            today,
          );
          const live = current > 0;
          return (
            <button
              key={t.kind}
              onClick={() => setActive(t.kind)}
              aria-pressed={on}
              className="clay relative flex flex-col items-start gap-2 p-4 text-left transition-transform"
              style={{
                background: "var(--surface)",
                outline: on ? `3px solid ${t.acc}` : "none",
                outlineOffset: "-3px",
                cursor: "pointer",
              }}
            >
              {/* Streak chip — current run; hover shows best */}
              {best > 0 && (
                <span
                  className="absolute right-2 top-2 flex items-center gap-1 rounded-full px-2 py-1 text-sm font-extrabold leading-none tabular-nums"
                  style={{
                    background: live ? t.acc : "var(--page-2)",
                    color: live ? "#fff" : "var(--ink-faint)",
                  }}
                  title={`Current ${current} · best ${best} days`}
                >
                  <Icon name="Flame" className="h-3.5 w-3.5" />
                  {current}
                </span>
              )}
              <span
                className="grid h-9 w-9 place-items-center rounded-xl text-white"
                style={{ background: t.acc }}
              >
                <Icon name={t.icon} className="h-4.5 w-4.5" />
              </span>
              <span className="text-sm font-extrabold">{t.label}</span>
              <span className="text-xs font-medium text-ink-faint">
                {summary(t.kind)}
              </span>
            </button>
          );
        })}
      </div>

      {active === "food" && <FoodPanel />}
      {active === "sleep" && <SleepPanel />}
      {active === "steps" && <StepsPanel />}
      {active === "reading" && <ReadingPanel />}
      {active === "focus" && <FocusPanel />}
      {active === "weight" && <WeightPanel />}
    </div>
  );
}
