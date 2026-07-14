"use client";

import { useEffect, useState } from "react";
import type { BodySex, DayLog, DayLogKind, FoodItem, GaitActivity, WeightUnit } from "@/lib/types";
import {
  fmtMinutes,
  fmtWeight,
  fmtXp,
  foodTotal,
  lastFoodLoggedAt,
  fmtElapsed,
  calorieGoals,
  type CalorieGoals,
  kgToUnit,
  unitToKg,
  weightLossXp,
  XP_PER_100G_LOST,
  logStreak,
  sortFoodsByUsage,
  walkCalories,
  ageFromBirthday,
  readingXp,
  sleepXp,
  stepsXp,
  SLEEP_GOLD_XP,
  XP_PER_READING_MIN,
} from "@/lib/daylog";
import { addDays, dayLabel } from "@/lib/schedule";
import { useNow, useStore } from "@/lib/store";
import { useConfirm } from "./ConfirmDialog";
import { Icon } from "./Icon";

/** Focus has its own page now, so the chooser covers every other log kind. */
type TrackerKind = Exclude<DayLogKind, "focus">;

const TRACKERS: {
  kind: TrackerKind;
  label: string;
  icon: string;
  blurb: string;
  acc: string;
}[] = [
  { kind: "food", label: "Food", icon: "Utensils", blurb: "Stay under your calorie budget.", acc: "var(--must-acc)" },
  { kind: "sleep", label: "Sleep", icon: "Moon", blurb: "7h 30m is the gold standard.", acc: "var(--imp-acc)" },
  { kind: "steps", label: "Steps", icon: "Footprints", blurb: "Every step counts.", acc: "var(--cool-acc)" },
  { kind: "reading", label: "Reading", icon: "BookOpen", blurb: "+2 XP per minute.", acc: "var(--primary)" },
  { kind: "weight", label: "Weight", icon: "Scale", blurb: "Watch the trend.", acc: "var(--imp-acc)" },
];

/** "13:05" for a timestamp (24h, always colon-separated). */
function fmtClock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

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
function GoalsModal({
  goals,
  onClose,
}: {
  goals: CalorieGoals | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 dark:bg-black/60 px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Daily calorie targets"
      onClick={onClose}
    >
      <div
        className="animate-pop flex w-full max-w-md flex-col gap-3 p-6 clay"
        style={{ background: "var(--surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <SectionTitle>Daily calorie targets</SectionTitle>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-ink-faint hover:bg-black/5 dark:hover:bg-white/10"
            style={{ cursor: "pointer" }}
          >
            <Icon name="X" className="h-4 w-4" />
          </button>
        </div>
        {goals ? (
          <div className="grid grid-cols-2 gap-3">
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
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint opacity-0 transition-opacity hover:bg-black/5 dark:hover:bg-white/10 focus-visible:opacity-100 group-hover:opacity-100"
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
        color: "var(--on-accent)",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

const num = (s: string) => Math.max(0, Math.round(Number(s) || 0));

// ---------------- Food ----------------

/**
 * Fasting clock — time since the most recent food log, ticking every second.
 * A leaf component so the 1 s tick re-renders only this line, never the panel.
 * Hidden until a first food is ever logged.
 */
function FastingTimer({ since }: { since: number | null }) {
  const now = useNow(1000);
  if (since == null) return null;
  return (
    <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-ink-faint">
      <Icon name="Timer" className="h-3 w-3" />
      Fasting
      <span className="tabular-nums">{fmtElapsed(now - since)}</span>
    </p>
  );
}

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
  const [goalsOpen, setGoalsOpen] = useState(false);

  const todays = dayLogs.filter((l) => l.kind === "food" && l.date === today);
  const savedFoods = sortFoodsByUsage(foods, dayLogs);
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
      {goalsOpen && <GoalsModal goals={goals} onClose={() => setGoalsOpen(false)} />}
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
            <FastingTimer since={lastFoodLoggedAt(dayLogs)} />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <button
              onClick={() => setGoalsOpen(true)}
              aria-label="Daily calorie targets"
              title="Daily calorie targets"
              className="grid h-9 w-9 place-items-center rounded-full hover:brightness-95"
              style={{ background: "var(--page-2)", cursor: "pointer" }}
            >
              <Icon name="Target" className="h-5 w-5" />
            </button>
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
                className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-bold text-ink-soft hover:bg-black/5 dark:hover:bg-white/10"
                style={{ cursor: "pointer" }}
              >
                <Icon name="Pencil" className="h-3 w-3" />
                Edit limit
              </button>
            )}
          </div>
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
            {savedFoods.map((f: FoodItem) => (
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
                    className="grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:bg-black/5 dark:hover:bg-white/10"
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
                    className="grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:bg-black/5 dark:hover:bg-white/10"
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
              color: save ? "var(--on-accent)" : "var(--ink-soft)",
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
const GOOD_GREEN = "var(--good)";

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
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 dark:bg-black/60 px-6 backdrop-blur-sm"
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
            className="clay-press px-4 py-2 text-sm font-bold text-(--on-accent) disabled:opacity-40"
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
                color: activity === a ? "var(--on-accent)" : "var(--ink-soft)",
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
  const [active, setActive] = useState<TrackerKind>("food");
  const { dayLogs, today, settings } = useStore();

  /** Today's one-line summary per tracker, shown on its chooser tile. */
  const summary = (kind: TrackerKind): string => {
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
          className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-(--on-accent)"
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
                    color: live ? "var(--on-accent)" : "var(--ink-faint)",
                  }}
                  title={`Current ${current} · best ${best} days`}
                >
                  <Icon name="Flame" className="h-3.5 w-3.5" />
                  {current}
                </span>
              )}
              <span
                className="grid h-9 w-9 place-items-center rounded-xl text-(--on-accent)"
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
      {active === "weight" && <WeightPanel />}
    </div>
  );
}
