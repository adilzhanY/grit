import type { BodySex, DayLog, WeightUnit } from "./types";

/**
 * Daily Log XP rules — pure functions so the UI can preview exactly what the
 * repository will award.
 */

// ---- Sleep ----
/** The golden standard: 7h30m. */
export const SLEEP_GOLD_MIN = 450;
/** Within ±1h of gold earns this. */
export const SLEEP_GOLD_XP = 50;
export const SLEEP_GOLD_TOLERANCE = 60;
/** Past 9h every minute costs 1 XP. */
export const SLEEP_MAX_MIN = 540;
/** Under 6h every minute costs 1 XP. */
export const SLEEP_MIN_MIN = 360;

export function sleepXp(minutes: number): number {
  if (minutes > SLEEP_MAX_MIN) return -(minutes - SLEEP_MAX_MIN);
  if (minutes < SLEEP_MIN_MIN) return -(SLEEP_MIN_MIN - minutes);
  if (Math.abs(minutes - SLEEP_GOLD_MIN) <= SLEEP_GOLD_TOLERANCE)
    return SLEEP_GOLD_XP;
  return 0;
}

// ---- Steps ----
export const XP_PER_STEP = 0.01;
export const XP_PER_METER = 0.015;

export function stepsXp(steps: number, meters: number): number {
  return Math.round(steps * XP_PER_STEP + meters * XP_PER_METER);
}

// ---- Reading ----
export const XP_PER_READING_MIN = 2;

export function readingXp(minutes: number): number {
  return minutes * XP_PER_READING_MIN;
}

// ---- Focus (Pomodoro) ----
/** XP per completed focus minute — paid only when the session finishes. */
export const XP_PER_FOCUS_MIN = 3;
/** Completed pomodoros per set. */
export const FOCUS_SET_SIZE = 4;
/** Bonus for finishing a full set in one day. */
export const FOCUS_SET_XP = 50;

export function focusXp(minutes: number): number {
  return minutes * XP_PER_FOCUS_MIN;
}

// ---- Food ----
/**
 * Penalty for pushing today's calories from `prevTotal` to `newTotal` against
 * `limit`: -1 XP per calorie past the limit (only the newly-exceeded part).
 */
/** XP lost per calorie eaten beyond the daily limit. */
export const XP_PER_OVER_CALORIE = 0.1;

export function foodPenalty(
  prevTotal: number,
  newTotal: number,
  limit: number,
): number {
  const overCalories =
    Math.max(0, newTotal - limit) - Math.max(0, prevTotal - limit);
  return Math.round(overCalories * XP_PER_OVER_CALORIE);
}

// ---- Weight ----
export const KG_PER_LB = 0.45359237;

/** XP per 100g lost vs the previous log. Gains cost nothing. */
export const XP_PER_100G_LOST = 10;

export function weightLossXp(prevKg: number, newKg: number): number {
  const lostKg = prevKg - newKg;
  if (lostKg <= 0) return 0;
  // 100g granularity: round to the nearest tenth of a kg.
  return Math.round(lostKg * 10) * XP_PER_100G_LOST;
}

/** kg → display value in the chosen unit, 1 decimal. */
export function kgToUnit(kg: number, unit: WeightUnit): number {
  const v = unit === "kg" ? kg : kg / KG_PER_LB;
  return Math.round(v * 10) / 10;
}

/** Entered value in the chosen unit → canonical kg. */
export function unitToKg(value: number, unit: WeightUnit): number {
  return unit === "kg" ? value : value * KG_PER_LB;
}

/** "82.4 kg" / "181.7 lbs". */
export function fmtWeight(kg: number, unit: WeightUnit): string {
  return `${kgToUnit(kg, unit)} ${unit}`;
}

// ---- Formatting ----
/** 462 → "7h 42m". */
export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Signed XP badge text: 50 → "+50", -12 → "−12", 0 → "±0". */
export function fmtXp(xp: number): string {
  if (xp > 0) return `+${xp}`;
  if (xp < 0) return `−${-xp}`;
  return "±0";
}

/** Sum a numeric field over food logs. */
export function foodTotal(
  logs: DayLog[],
  field: "calories" | "protein" | "carbs" | "fat",
): number {
  return logs.reduce((s, l) => s + (l[field] ?? 0), 0);
}

// ---- Walking: speed + calories burnt ----

/**
 * Stride length as a fraction of height. Men's gait is marginally longer than
 * women's. stride(m) = factor × height(cm) / 100.
 */
export const STRIDE_FACTOR: Record<BodySex, number> = {
  male: 0.415,
  female: 0.413,
};

/** Whole years from `birthday` (YYYY-MM-DD) to `today` (YYYY-MM-DD). */
export function ageFromBirthday(birthday: string, today: string): number {
  const [by, bm, bd] = birthday.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return Math.max(0, age);
}

/**
 * Resting metabolic rate (kcal/day) via the Mifflin–St Jeor equation — the
 * modern standard, more accurate than Harris–Benedict.
 */
export function mifflinBmr(p: {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: BodySex;
}): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return base + (p.sex === "male" ? 5 : -161);
}

/** Energy in 1 kg of body mass — the classic "7700 kcal per kg" rule. */
export const KCAL_PER_KG = 7700;

export interface CalorieGoals {
  /** Eat this to hold your current weight. */
  maintain: number;
  /** Surplus for +1 kg per week. */
  gain: number;
  /** Deficit for −0.5 kg per week. */
  lose: number;
  /** Aggressive deficit for ~−1.1 kg per week. */
  extremeLose: number;
}

/**
 * Daily calorie targets for each goal, from the Mifflin–St Jeor BMR scaled by a
 * sedentary 1.2 activity factor. Logged steps/walks are tracked separately and
 * subtracted from intake, so the baseline deliberately excludes exercise to
 * avoid double-counting. A weekly weight delta is turned into a daily surplus or
 * deficit via 7700 kcal/kg. Deficit goals are floored at a safe minimum.
 */
export function calorieGoals(p: {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: BodySex;
}): CalorieGoals {
  const maintain = mifflinBmr(p) * 1.2;
  const perDay = (kgPerWeek: number) => (kgPerWeek * KCAL_PER_KG) / 7;
  const floor = p.sex === "male" ? 1500 : 1200;
  const r = Math.round;
  return {
    maintain: r(maintain),
    gain: r(maintain + perDay(1)),
    lose: Math.max(floor, r(maintain - perDay(0.5))),
    extremeLose: Math.max(floor, r(maintain - perDay(1.1))),
  };
}

export type WalkEstimate = {
  /** Net active calories burnt by the walk (gross minus resting). */
  calories: number;
  speedKmh: number;
  distanceKm: number;
  /** Metabolic equivalent of the effort. */
  met: number;
};

/**
 * Estimate the calories burnt by a walk from steps + time, personalised to the
 * body profile. Pipeline:
 *
 *   1. Stride length from height & sex → distance from step count.
 *   2. distance / time → walking speed.
 *   3. ACSM gait equations map speed → VO₂ → MET (walking below ~7 km/h,
 *      running model above it).
 *   4. Gross burn = MET × 3.5 × kg / 200 per minute.
 *   5. Subtract resting burn (Mifflin–St Jeor BMR / 1440) so the result is the
 *      *active* calories attributable to the walk, not calories you'd burn
 *      sitting still.
 */
export function walkCalories(p: {
  steps?: number;
  meters?: number;
  minutes: number;
  weightKg: number;
  heightCm: number;
  age: number;
  sex: BodySex;
}): WalkEstimate {
  const zero: WalkEstimate = { calories: 0, speedKmh: 0, distanceKm: 0, met: 0 };
  if (p.minutes <= 0 || p.weightKg <= 0) return zero;

  const stride = STRIDE_FACTOR[p.sex] * (p.heightCm / 100);
  const distanceM =
    p.meters && p.meters > 0 ? p.meters : (p.steps ?? 0) * stride;
  if (distanceM <= 0) return zero;

  const speedMmin = distanceM / p.minutes;
  const speedKmh = (speedMmin * 60) / 1000;

  // ACSM VO₂ (ml/kg/min): the running gait kicks in around 7 km/h.
  const vo2 =
    speedKmh < 7 ? 3.5 + 0.1 * speedMmin : 3.5 + 0.2 * speedMmin;
  const met = vo2 / 3.5;

  const grossPerMin = (met * 3.5 * p.weightKg) / 200;
  const restPerMin =
    mifflinBmr({ weightKg: p.weightKg, heightCm: p.heightCm, age: p.age, sex: p.sex }) /
    1440;
  const calories = Math.max(0, Math.round((grossPerMin - restPerMin) * p.minutes));

  return {
    calories,
    speedKmh: Math.round(speedKmh * 10) / 10,
    distanceKm: Math.round((distanceM / 1000) * 100) / 100,
    met: Math.round(met * 10) / 10,
  };
}

// ---- Streaks ----

/** Whole days between two YYYY-MM-DD local day strings (DST-safe). */
function dayGap(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  );
}

/** The current streak resets to zero once this many days pass with no log. */
export const STREAK_GRACE_DAYS = 3;

export type LogStreak = { current: number; best: number };

/**
 * Daily logging streak for one tracker, derived from the days it was logged.
 *
 * `best` is the longest run of consecutive calendar days ever logged.
 * `current` is the run ending on the most recent log day — but it counts as
 * broken (0) once the latest log is `STREAK_GRACE_DAYS` or more days behind
 * `today`, i.e. nothing was logged for 3 straight days.
 */
export function logStreak(days: string[], today: string): LogStreak {
  // Unique calendar days, ascending.
  const uniq = Array.from(new Set(days)).sort();
  if (uniq.length === 0) return { current: 0, best: 0 };

  let best = 1;
  let run = 1;
  let trailing = 1; // length of the run ending at the last day
  for (let i = 1; i < uniq.length; i++) {
    run = dayGap(uniq[i - 1], uniq[i]) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    trailing = run;
  }

  const last = uniq[uniq.length - 1];
  const behind = dayGap(last, today);
  const current = behind >= STREAK_GRACE_DAYS ? 0 : trailing;
  return { current, best: Math.max(best, current) };
}
