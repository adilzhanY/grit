.pragma library

/**
 * Pure Grit domain math, ported verbatim from ~/dev/grit/packages/core/src.
 * Keep formulas identical to the web app or devices will disagree on XP.
 */

// ---------- ids / days ----------

function uid() {
    // RFC4122-ish v4, no crypto dependency
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === "x" ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Memoised because the daily loop calls this on every ledger row, dozens of
 * times over, for a single UI recompute: a Date allocation plus three string
 * builds each. A timestamp's local day never changes (a DST shift moves the
 * offset for an instant, not the instant's calendar day), so the answer keeps
 * forever. The cap only exists so a very long uptime cannot grow it without
 * bound; dropping the table costs nothing but the next rebuild.
 */
const _localDayCache = new Map();
const _LOCAL_DAY_CACHE_MAX = 50000;

function localDay(ts) {
    if (ts === undefined)
        return _formatLocalDay(new Date());
    const hit = _localDayCache.get(ts);
    if (hit !== undefined)
        return hit;
    const day = _formatLocalDay(new Date(ts));
    if (_localDayCache.size >= _LOCAL_DAY_CACHE_MAX)
        _localDayCache.clear();
    _localDayCache.set(ts, day);
    return day;
}

function _formatLocalDay(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

// ---------- defaults ----------

const DEFAULT_SETTINGS = {
    id: "singleton",
    name: "",
    levelBase: 1500,
    levelGrowth: 1.3,
    soundsEnabled: true,
    calorieLimit: 2000,
    weightUnit: "kg",
    heightCm: 177,
    sex: "male",
    birthday: "2005-01-28",
    focusTasks: [],
    currency: "EUR",
    monthlyBudget: 0
};

const DEFAULT_POINTS = { must: 10, bad: 0, cool: 100, impossible: 1000, custom: 15 };
const DEFAULT_SLIP_PENALTY = 100;

// ---------- leveling ----------

function xpToReachLevel(level, base, growth) {
    if (level <= 0) return 0;
    return Math.round((base * (Math.pow(growth, level) - 1)) / (growth - 1));
}

function computeLevel(totalXpRaw, base, growth) {
    const totalXp = Math.max(0, Math.round(totalXpRaw));
    let level = 0;
    while (level < 1000 && xpToReachLevel(level + 1, base, growth) <= totalXp) level++;
    const thisLevelStart = xpToReachLevel(level, base, growth);
    const nextLevelAt = xpToReachLevel(level + 1, base, growth);
    const xpForThisLevel = nextLevelAt - thisLevelStart;
    const xpIntoLevel = totalXp - thisLevelStart;
    const progress = xpForThisLevel > 0 ? Math.min(1, xpIntoLevel / xpForThisLevel) : 0;
    return { level, totalXp, xpIntoLevel, xpForThisLevel, progress, nextLevelAt };
}

// ---------- milestones (bad tasks) ----------

const MS_H = 3600000;
const MS_D = 24 * MS_H;

const MILESTONES = [
    { id: "h24", label: "24 hours", ms: 1 * MS_D, baseXp: 25 },
    { id: "d3", label: "3 days", ms: 3 * MS_D, baseXp: 50 },
    { id: "w1", label: "1 week", ms: 7 * MS_D, baseXp: 100 },
    { id: "w2", label: "2 weeks", ms: 14 * MS_D, baseXp: 200 },
    { id: "m1", label: "1 month", ms: 30 * MS_D, baseXp: 400 },
    { id: "m2", label: "2 months", ms: 60 * MS_D, baseXp: 600 },
    { id: "m3", label: "3 months", ms: 90 * MS_D, baseXp: 900 },
    { id: "m6", label: "6 months", ms: 182 * MS_D, baseXp: 1500 },
    { id: "m9", label: "9 months", ms: 273 * MS_D, baseXp: 2200 },
    { id: "y1", label: "1 year", ms: 365 * MS_D, baseXp: 3500 },
    { id: "y2", label: "2 years", ms: 730 * MS_D, baseXp: 5000 },
    { id: "y3", label: "3 years", ms: 1095 * MS_D, baseXp: 7000 },
    { id: "y5", label: "5 years", ms: 1825 * MS_D, baseXp: 10000 }
];

function streakMs(now, lastSlipAt, createdAt) {
    return Math.max(0, now - (lastSlipAt !== undefined && lastSlipAt !== null ? lastSlipAt : createdAt));
}

function currentMilestone(streak) {
    let reached = null;
    for (const m of MILESTONES) {
        if (streak >= m.ms) reached = m;
        else break;
    }
    return reached;
}

function nextMilestone(streak) {
    for (const m of MILESTONES) {
        if (streak < m.ms) return m;
    }
    return null;
}

function pendingMilestones(streak, awardedIds) {
    return MILESTONES.filter(m => streak >= m.ms && !awardedIds.includes(m.id));
}

function formatStreak(ms) {
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / (60 * 24));
    const hours = Math.floor((totalMin % (60 * 24)) / 60);
    const mins = totalMin % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

// ---------- schedule / recurrence ----------

function weekdayOf(day) {
    const p = day.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]).getDay();
}

function diffDays(a, b) {
    const ap = a.split("-").map(Number);
    const bp = b.split("-").map(Number);
    return Math.round((Date.UTC(bp[0], bp[1] - 1, bp[2]) - Date.UTC(ap[0], ap[1] - 1, ap[2])) / 86400000);
}

function anchorDay(task) {
    return task.plannedFor !== undefined && task.plannedFor !== null ? task.plannedFor : localDay(task.createdAt);
}

function isDueOn(task, day) {
    const rec = task.recurrence;
    if (!rec) return false;
    const anchor = anchorDay(task);
    const days = diffDays(anchor, day);
    if (days < 0) return false;
    const every = Math.max(1, rec.interval || 1);

    switch (rec.type) {
    case "daily":
        return days % every === 0;
    case "weekly": {
        if (rec.weekdays && rec.weekdays.length > 0) {
            if (!rec.weekdays.includes(weekdayOf(day))) return false;
            const weekIndex = Math.floor((days + weekdayOf(anchor)) / 7);
            return weekIndex % every === 0;
        }
        return days % 7 === 0 && (days / 7) % every === 0;
    }
    case "monthly": {
        const a = anchor.split("-").map(Number);
        const d = day.split("-").map(Number);
        const months = (d[0] - a[0]) * 12 + (d[1] - a[1]);
        return d[2] === a[2] && months >= 0 && months % every === 0;
    }
    case "yearly": {
        const a = anchor.split("-").map(Number);
        const d = day.split("-").map(Number);
        return d[1] === a[1] && d[2] === a[2] && (d[0] - a[0]) % every === 0;
    }
    }
    return false;
}

function isEveryday(rec) {
    const every = Math.max(1, rec.interval || 1);
    if (rec.type === "daily") return every === 1;
    return rec.type === "weekly" && every === 1 && rec.weekdays.length === 7;
}

function myDayTasks(tasks, day) {
    return tasks.filter(t => {
        if (t.recurrence) return !t.archived && (isDueOn(t, day) || t.starredMyDay);
        if (t.plannedFor && t.plannedFor <= day) return true;
        return !!t.starredMyDay;
    });
}

function importantTasks(tasks) {
    return tasks.filter(t => !t.archived && t.important);
}

function isMyDayOneShot(t) {
    return !t.recurrence && t.listType === "custom" && !t.listId;
}

function showsInMyDayDone(t, today) {
    // Diverges from the web app: ALL recurring tasks checked off today stay in
    // Today's Done section (web keeps only Musts). Per-day completions mean
    // they still reset and reappear as active on their next due day.
    if (t.recurrence) return true;
    if (!isMyDayOneShot(t)) return false;
    return t.achievedAt !== undefined && t.achievedAt !== null && localDay(t.achievedAt) === today;
}

function taskXp(t) {
    return t.points || 0;
}

function byXp(tasks) {
    return tasks.slice().sort((a, b) => taskXp(b) - taskXp(a) || a.order - b.order);
}

function myDayRank(t) {
    if (!t.recurrence && (t.starredMyDay || t.plannedFor)) return 0;
    if (t.important) return 1;
    if (t.recurrence) return 2;
    if (t.listType === "must") return 3;
    return 4;
}

function byMyDayPriority(tasks) {
    return tasks.slice().sort((a, b) =>
        myDayRank(a) - myDayRank(b) || taskXp(b) - taskXp(a) || a.order - b.order);
}

function addDays(day, n) {
    const p = day.split("-").map(Number);
    const dt = new Date(p[0], p[1] - 1, p[2] + n);
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${dt.getFullYear()}-${mm}-${dd}`;
}

function dayLabel(day, today) {
    if (day === today) return "Today";
    if (day === addDays(today, 1)) return "Tomorrow";
    const p = day.split("-").map(Number);
    const dt = new Date(p[0], p[1] - 1, p[2]);
    const opts = { weekday: "short", month: "long", day: "numeric" };
    if (String(p[0]) !== today.slice(0, 4)) opts.year = "numeric";
    return dt.toLocaleDateString("en-US", opts);
}

function plannedDays(tasks, today, horizon) {
    if (horizon === undefined) horizon = 10;
    const out = [];
    for (let i = 1; i <= horizon; i++) {
        const day = addDays(today, i);
        const due = tasks.filter(t => {
            if (t.archived) return false;
            if (t.recurrence) return !isEveryday(t.recurrence) && isDueOn(t, day);
            return t.plannedFor === day;
        });
        if (due.length > 0) out.push({ day: day, tasks: due });
    }
    return out;
}

/** "2026-07-12" -> "12/07/2026" (dd/mm/yyyy). */
function fmtDay(day) {
    if (!day || day.length < 10) return day || "";
    const p = day.split("-");
    return `${p[2]}/${p[1]}/${p[0]}`;
}

/** Parse "dd/mm/yyyy" or "yyyy-mm-dd" into an ISO day string, or null. */
function parseDayInput(text) {
    const t = text.trim();
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return t;
    m = t.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
    if (m) {
        const dd = String(m[1]).padStart(2, "0");
        const mm = String(m[2]).padStart(2, "0");
        return `${m[3]}-${mm}-${dd}`;
    }
    return null;
}

/** Monday of the week containing `day`. */
function mondayOf(day) {
    return addDays(day, -((weekdayOf(day) + 6) % 7));
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * When the current clean run started: the last slip, or the day the habit was
 * created if it has never been slipped. The same anchor streakMs() counts from,
 * so the card's "clean for" and "since" can never disagree.
 */
function cleanSince(task) {
    if (!task)
        return null;
    return task.lastSlipAt !== undefined && task.lastSlipAt !== null
        ? task.lastSlipAt : task.createdAt;
}

/**
 * "16 Aug, 21:39", or just "16 Aug" at exactly midnight: a habit started from
 * the date picker carries no time of day, and printing 00:00 for it claims a
 * precision that was never entered. The year only appears when it is not this one.
 */
function fmtDateTimeShort(ts, nowTs) {
    if (ts === undefined || ts === null)
        return "";
    const d = new Date(ts);
    const thisYear = new Date(nowTs ?? Date.now()).getFullYear();
    const year = d.getFullYear() === thisYear ? "" : ` ${d.getFullYear()}`;
    const date = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${year}`;
    if (d.getHours() === 0 && d.getMinutes() === 0)
        return date;
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${date}, ${hh}:${mm}`;
}

/**
 * Focus progression ladder by total focus hours: [hours, title, rank-up XP].
 * The bonus is deliberately generous (roughly a third to half of the raw
 * XP_PER_FOCUS_MIN grind it took to get there) because a rank is rare, and it
 * grows with the hours so late ranks stay worth chasing. Novice is the
 * starting rank, so it pays nothing.
 */
const FOCUS_TITLES = [
    [50000, "Singularity", 7500000], [25000, "Quasar", 3500000],
    [15000, "Nova", 2000000], [10000, "Polaris", 1250000],
    [7500, "Eclipse", 900000], [5000, "Lodestar", 600000],
    [3500, "Ascendant", 400000], [2500, "Archon", 280000],
    [1750, "Paragon", 190000], [1250, "Luminary", 130000],
    [1000, "Zenith", 100000], [750, "Virtuoso", 70000],
    [500, "Sage", 45000], [350, "Oracle", 30000],
    [250, "Master", 20000], [150, "Artisan", 12000],
    [100, "Expert", 7500], [50, "Scholar", 3000],
    [25, "Adept", 1500], [10, "Apprentice", 500], [0, "Novice", 0]
];

function focusTitle(hours) {
    for (const t of FOCUS_TITLES) {
        if (hours >= t[0]) return t[1];
    }
    return "Novice";
}

function nextFocusTitle(hours) {
    let next = null;
    for (const t of FOCUS_TITLES) {
        if (hours < t[0]) next = { hours: t[0], title: t[1], xp: t[2] };
    }
    return next;
}

/** Ranks reached at `hours` that have not been paid out yet, lowest first. */
function pendingFocusRanks(hours, awardedHours) {
    const done = awardedHours ?? [];
    return FOCUS_TITLES
        .filter(t => t[0] > 0 && hours >= t[0] && !done.includes(t[0]))
        .map(t => ({ hours: t[0], title: t[1], xp: t[2] }))
        .sort((a, b) => a.hours - b.hours);
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Weekdays are stored as JS getDay() numbers, so Sunday is 0, but the week
// starts on Monday everywhere it is shown. WEEK_ORDER is that display order.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function recurrenceLabel(task) {
    const rec = task.recurrence;
    if (!rec) return "";
    const every = Math.max(1, rec.interval || 1);
    if (rec.type === "daily") return every === 1 ? "Every day" : `Every ${every} days`;
    if (rec.type === "weekly") {
        const days = rec.weekdays.slice().sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));
        if (days.length === 7 && every === 1) return "Every day";
        const dayPart = days.length === 5 && days.join() === "1,2,3,4,5"
            ? "Weekdays" : days.map(d => WEEKDAY_NAMES[d]).join(" · ");
        const prefix = every === 1 ? "" : `Every ${every} weeks · `;
        return days.length === 0
            ? (every === 1 ? "Weekly" : `Every ${every} weeks`)
            : prefix + dayPart;
    }
    const UNIT = { monthly: "month", yearly: "year" };
    if (every === 1) return rec.type === "monthly" ? "Monthly" : "Yearly";
    return `Every ${every} ${UNIT[rec.type]}s`;
}

// ---------- daylog XP ----------

const XP_PER_FOCUS_MIN = 3;
const FOCUS_SET_SIZE = 4;
const FOCUS_SET_XP = 50;
const XP_PER_OVER_CALORIE = 0.1;
const XP_PER_100G_LOST = 10;
const KG_PER_LB = 0.45359237;

function focusXp(minutes) {
    return minutes * XP_PER_FOCUS_MIN;
}

function focusPhaseMs(a) {
    return (a.phase === "focus" ? a.focusMin : a.restMin) * 60000;
}

function focusPhaseEnd(a) {
    return a.startedAt + focusPhaseMs(a);
}

function focusRemainingMs(a, now) {
    return Math.max(0, focusPhaseEnd(a) - (a.pausedAt !== undefined && a.pausedAt !== null ? a.pausedAt : now));
}

function focusElapsedMs(a, now) {
    return Math.max(0, (a.pausedAt !== undefined && a.pausedAt !== null ? a.pausedAt : now) - a.startedAt);
}

function focusElapsed(a, now) {
    return (a.pausedAt === undefined || a.pausedAt === null) && now >= focusPhaseEnd(a);
}

// ---------- focus → Must links ----------

/**
 * Must tasks that tick themselves once enough focused time is logged on the
 * matching focus task the same day. Desktop-only (the web app has no such
 * rule), so this lives here rather than on the synced task rows. Must titles
 * are matched case-insensitively; edit this list to add or retune a pair.
 */
const FOCUS_MUST_LINKS = [
    { mustTitle: "Reading", focusTask: "Reading", minutes: 30 },
    { mustTitle: "Learn German", focusTask: "German", minutes: 30 },
    { mustTitle: "Learn English", focusTask: "English", minutes: 30 }
];

/** Minutes focused on one focus task on a given local day. */
function focusMinutesOn(dayLogs, date, focusTask) {
    return dayLogs
        .filter(l => l.kind === "focus" && l.date === date && l.name === focusTask)
        .reduce((s, l) => s + (l.minutes ?? 0), 0);
}

/** The link that drives `mustTitle`, if that Must task has one. */
function focusMustLinkFor(mustTitle) {
    const key = (mustTitle ?? "").trim().toLowerCase();
    return FOCUS_MUST_LINKS.find(l => l.mustTitle.toLowerCase() === key) ?? null;
}

function foodPenalty(prevTotal, newTotal, limit) {
    const overCalories = Math.max(0, newTotal - limit) - Math.max(0, prevTotal - limit);
    return Math.round(overCalories * XP_PER_OVER_CALORIE);
}

/**
 * Saved foods ordered by how often each has been logged, so the foods eaten
 * most often surface first for one-tap re-adding. Usage is counted by matching
 * log names case-insensitively (logs don't store the saved food's id). Ties,
 * including never-logged foods, fall back to newest-saved first.
 */
function sortFoodsByUsage(foods, logs) {
    const counts = new Map();
    for (const l of logs) {
        if (l.kind !== "food" || !l.name) continue;
        const key = l.name.trim().toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const used = f => counts.get(f.name.trim().toLowerCase()) ?? 0;
    return foods.slice().sort((a, b) => used(b) - used(a) || b.createdAt - a.createdAt);
}

function lastFoodLoggedAt(logs) {
    let last = null;
    for (const l of logs) {
        if (l.kind === "food" && (last === null || l.loggedAt > last)) last = l.loggedAt;
    }
    return last;
}

function fmtElapsed(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const pad = n => String(n).padStart(2, "0");
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

function weightLossXp(prevKg, newKg) {
    const lostKg = prevKg - newKg;
    if (lostKg <= 0) return 0;
    return Math.round(lostKg * 10) * XP_PER_100G_LOST;
}

function kgToUnit(kg, unit) {
    const v = unit === "kg" ? kg : kg / KG_PER_LB;
    return Math.round(v * 10) / 10;
}

function unitToKg(value, unit) {
    return unit === "kg" ? value : value * KG_PER_LB;
}

function fmtWeight(kg, unit) {
    return `${kgToUnit(kg, unit)} ${unit}`;
}

function fmtMinutes(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m}m`;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtXp(xp) {
    if (xp > 0) return `+${xp}`;
    if (xp < 0) return `−${-xp}`;
    return "±0";
}

function foodTotal(logs, field) {
    return logs.reduce((s, l) => s + (l[field] || 0), 0);
}

function ageFromBirthday(birthday, today) {
    const b = birthday.split("-").map(Number);
    const t = today.split("-").map(Number);
    let age = t[0] - b[0];
    if (t[1] < b[1] || (t[1] === b[1] && t[2] < b[2])) age -= 1;
    return Math.max(0, age);
}

function mifflinBmr(p) {
    const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
    return base + (p.sex === "male" ? 5 : -161);
}

const KCAL_PER_KG = 7700;

function calorieGoals(p) {
    const maintain = mifflinBmr(p) * 1.2;
    const perDay = kgPerWeek => (kgPerWeek * KCAL_PER_KG) / 7;
    const floor = p.sex === "male" ? 1500 : 1200;
    const r = Math.round;
    return {
        maintain: r(maintain),
        gain: r(maintain + perDay(1)),
        lose: Math.max(floor, r(maintain - perDay(0.5))),
        extremeLose: Math.max(floor, r(maintain - perDay(1.1)))
    };
}

// ---------- subtasks ----------

function subtaskDone(task, sub, date) {
    if (sub.doneAt === undefined || sub.doneAt === null) return false;
    return task.recurrence ? localDay(sub.doneAt) === date : true;
}

function subtaskShares(task, date) {
    const subs = task.subtasks || [];
    const shares = {};
    const auto = [];
    let pool = task.points;
    for (const s of subs) {
        if (subtaskDone(task, s, date)) {
            shares[s.id] = s.awardedXp || 0;
            pool -= s.awardedXp || 0;
        } else if (s.xp !== undefined && s.xp !== null) {
            shares[s.id] = s.xp;
            pool -= s.xp;
        } else {
            auto.push(s);
        }
    }
    pool = Math.max(0, pool);
    auto.forEach((s, i) => {
        shares[s.id] = Math.floor(pool / auto.length) + (i < pool % auto.length ? 1 : 0);
    });
    return shares;
}

// ---------- ledger helpers ----------

function achieveLedgerType(listType) {
    if (listType === "impossible") return "impossible_achieve";
    if (listType === "custom") return "custom_complete";
    return "cool_achieve";
}

function completeLedgerType(listType) {
    return listType === "must" ? "must_complete" : achieveLedgerType(listType);
}

/** Current XP: walk ledger in time order, flooring at 0 after each event. */
function totalXp(ledger) {
    return ledgerIndex(ledger).wallet;
}

function xpGainedOn(ledger, date) {
    return _dayBucket(ledger, date).gained;
}

// ============================================================================
// Daily loop: quota, streak, rest days, quests, weekly goal, wallet.
// ============================================================================
//
// Desktop-only. The web app and the TUI know none of this, but every payout is
// an ordinary ledger row, so their XP totals stay correct without any change.

/**
 * The daily loop ignores everything before this day. The ledger reaches back to
 * June, and back-paying weeks of quotas, quests and streaks would hand out
 * thousands of XP for days that were never played under these rules.
 */
const DAILY_EPOCH = "2026-08-16";

/** Wallet movement, not effort. Buying something never dents today's quota. */
const SPEND_TYPES = ["spend", "buyout"];

/**
 * Bonuses the loop itself pays. Excluded when calibrating the quota, so the
 * target can never inflate itself, and never scaled by the streak multiplier.
 */
const BONUS_TYPES = ["quest", "weekly_goal", "streak_milestone", "focus_rank",
    "rest_day", "comeback"];

/** Effort the streak multiplier scales. Penalties are never scaled. */
const MULTIPLIED_TYPES = ["must_complete", "cool_achieve", "impossible_achieve",
    "custom_complete", "focus_log", "weight_log"];

function isSpendType(type) {
    return SPEND_TYPES.indexOf(type) >= 0;
}

function isBonusType(type) {
    return BONUS_TYPES.indexOf(type) >= 0;
}

function isMultipliedType(type) {
    return MULTIPLIED_TYPES.indexOf(type) >= 0;
}

// ============================================================================
// Ledger index
// ============================================================================
//
// Every aggregate below buckets the ledger by local day, and the daily loop
// asks for those buckets a great many times: one dailyQuota is 14 calibration
// passes, one quotaMet is a quota plus a progress pass, and streakDays /
// quotaMetSince run a quotaMet per day since the epoch. Straight off the array
// that made a single revision bump ~190k localDay() calls and 200ms of blocking
// JS, growing by another day's worth every day the epoch recedes.
//
// So the whole ledger is folded into a per-day table once and every aggregate
// reads it. The table is reused only while the ledger array is the same object
// at the same length and no edit has been announced; GritStore.afterMutation()
// calls invalidateLedger() for in-place edits that change neither. Being wrong
// in the safe direction is cheap: a needless rebuild is one pass.

let _ledgerIndexCache = null;
let _ledgerEpoch = 0;

/** Drop the memoised aggregates. Call after any write to the ledger. */
function invalidateLedger() {
    _ledgerEpoch++;
    _ledgerIndexCache = null;
}

function ledgerIndex(ledger) {
    const cached = _ledgerIndexCache;
    if (cached && cached.src === ledger && cached.len === ledger.length
            && cached.epoch === _ledgerEpoch)
        return cached;

    const days = new Map();     // date -> { gained, progress, calibration }
    const restDates = [];
    const activeDays = [];      // sorted, days holding at least one non-spend row

    for (const e of ledger) {
        if (e.type === "rest_day" && e.restDate)
            restDates.push(e.restDate);
        const day = localDay(e.timestamp);
        let bucket = days.get(day);
        if (bucket === undefined) {
            bucket = { gained: 0, progress: 0, calibration: 0, active: false };
            days.set(day, bucket);
        }
        bucket.gained += e.delta;
        if (!isSpendType(e.type)) {
            bucket.progress += e.delta;
            bucket.active = true;
            if (!isBonusType(e.type))
                bucket.calibration += e.delta;
        }
    }
    for (const [day, bucket] of days) {
        if (bucket.active)
            activeDays.push(day);
    }
    activeDays.sort();

    // Both balance walks are order-dependent, so they keep their sort, but they
    // only run once per ledger change instead of once per binding.
    const byTime = ledger.slice().sort((a, b) => a.timestamp - b.timestamp);
    let wallet = 0;
    let lifetime = 0;
    for (const e of byTime) {
        wallet = Math.max(0, wallet + e.delta);
        if (!isSpendType(e.type))
            lifetime = Math.max(0, lifetime + e.delta);
    }

    const index = {
        src: ledger,
        len: ledger.length,
        epoch: _ledgerEpoch,
        days: days,
        activeDays: activeDays,
        restDates: restDates,
        wallet: wallet,
        lifetime: lifetime,
        quotaMemo: new Map(),
        metMemo: new Map()
    };
    _ledgerIndexCache = index;
    return index;
}

const _EMPTY_DAY = { gained: 0, progress: 0, calibration: 0, active: false };

function _dayBucket(ledger, date) {
    return ledgerIndex(ledger).days.get(date) ?? _EMPTY_DAY;
}

// ---------- wallet vs lifetime ----------

/**
 * Level XP. Walks the ledger ignoring wallet spending, so buying a reward can
 * never demote you. Penalties still count, exactly like the old totalXp.
 */
function lifetimeXp(ledger) {
    return ledgerIndex(ledger).lifetime;
}

/** Spendable balance: everything, including purchases. Same walk as totalXp. */
function walletXp(ledger) {
    return totalXp(ledger);
}

// ---------- quota ----------

const QUOTA_WINDOW = 14;
const QUOTA_FRACTION = 0.7;
const QUOTA_MIN = 150;
const QUOTA_MAX = 2000;
const QUOTA_STEP = 25;

/** XP counting toward a day's quota: everything except wallet spending. */
function quotaProgress(ledger, date) {
    return _dayBucket(ledger, date).progress;
}

/** A day's earned XP with loop bonuses stripped out, used only to set the bar. */
function calibrationXp(ledger, date) {
    return _dayBucket(ledger, date).calibration;
}

/**
 * The target for `today`: 70% of the median of the last 14 active days, rounded
 * to 25. The fraction is what turns a coin flip into a streak worth keeping.
 * Measured on this ledger, the raw median cleared only 40% of days while 70% of
 * it clears about 63%. Yesterday and back only, so the bar cannot move under
 * you while you are chasing it.
 */
function dailyQuota(ledger, today) {
    const memo = ledgerIndex(ledger).quotaMemo;
    const hit = memo.get(today);
    if (hit !== undefined) return hit;
    const vals = [];
    for (let i = 1; i <= QUOTA_WINDOW; i++) {
        const xp = calibrationXp(ledger, addDays(today, -i));
        if (xp > 0) vals.push(xp);
    }
    let quota;
    if (vals.length === 0) {
        quota = 300;
    } else {
        vals.sort((a, b) => a - b);
        const mid = Math.floor(vals.length / 2);
        const median = vals.length % 2 === 1 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
        const stepped = Math.round(median * QUOTA_FRACTION / QUOTA_STEP) * QUOTA_STEP;
        quota = Math.max(QUOTA_MIN, Math.min(QUOTA_MAX, stepped));
    }
    memo.set(today, quota);
    return quota;
}

function quotaMet(ledger, date) {
    const memo = ledgerIndex(ledger).metMemo;
    const hit = memo.get(date);
    if (hit !== undefined) return hit;
    const met = quotaProgress(ledger, date) >= dailyQuota(ledger, date);
    memo.set(date, met);
    return met;
}

// ---------- rest days ----------

const REST_EARN_EVERY = 7;
const REST_MAX_BANKED = 3;
const REST_BUY_COST = 2000;
const MUST_BUY_COST = 800;

/** Days a rest day was spent on, as a plain array of date strings. */
function restDaysSpent(ledger) {
    return ledgerIndex(ledger).restDates.slice();
}

/** A day survives if its quota was met or a rest day covered it. */
function dayHeld(ledger, date, spent) {
    if (spent.indexOf(date) >= 0) return true;
    return quotaMet(ledger, date);
}

/**
 * Consecutive held days ending today. An unfinished today never breaks a run,
 * it simply does not extend it yet, so the streak reads the same at 09:00 as it
 * did at midnight.
 */
function streakDays(ledger, today) {
    const spent = restDaysSpent(ledger);
    let day = dayHeld(ledger, today, spent) ? today : addDays(today, -1);
    let n = 0;
    while (day >= DAILY_EPOCH && dayHeld(ledger, day, spent)) {
        n++;
        day = addDays(day, -1);
    }
    return n;
}

/** Quota-met days since the epoch. Rest days do not earn further rest days. */
function quotaMetSince(ledger, today, from) {
    let day = from ?? DAILY_EPOCH;
    let n = 0;
    while (day <= today) {
        if (quotaMet(ledger, day)) n++;
        day = addDays(day, 1);
    }
    return n;
}

/** Rest days available to spend: one per 7 quota-met days, holding at most 3. */
function restDaysBanked(ledger, today) {
    const earned = Math.floor(quotaMetSince(ledger, today) / REST_EARN_EVERY);
    const spent = restDaysSpent(ledger).length;
    return Math.max(0, Math.min(REST_MAX_BANKED, earned - spent));
}

// ---------- streak multiplier and comeback ----------

const STREAK_STEP = 0.02;
const STREAK_CAP = 0.5;
const COMEBACK_MULT = 2;
const COMEBACK_GAP = 2;

/** The last day before `today` that earned anything at all, or null. */
function lastActiveDay(ledger, today) {
    const active = ledgerIndex(ledger).activeDays;
    for (let i = active.length - 1; i >= 0; i--) {
        if (active[i] < today) return active[i];
    }
    return null;
}

/**
 * Today's XP multiplier on effort. A streak pays 2% per day up to +50%, and the
 * first day back after a break of two days or more pays double instead. They do
 * not stack: the day after a long silence is worth double, full stop.
 *
 * Deliberately measured on the streak through YESTERDAY. Reading today's streak
 * would make the rate jump the instant you crossed the quota, so the same task
 * would be worth more at 21:00 than at 09:00 and the ledger would be impossible
 * to reason about after the fact.
 */
function xpMultiplier(ledger, today) {
    const last = lastActiveDay(ledger, today);
    if (last !== null && diffDays(last, today) >= COMEBACK_GAP)
        return { mult: COMEBACK_MULT, reason: "comeback" };
    const streak = streakDays(ledger, addDays(today, -1));
    if (streak <= 0) return { mult: 1, reason: "" };
    const mult = 1 + Math.min(STREAK_CAP, STREAK_STEP * streak);
    return { mult: Math.round(mult * 100) / 100, reason: "streak" };
}

// ---------- daily quests ----------

// Labels are short on purpose: three chips share one narrow row in DailyPanel,
// and a full sentence elides down to nothing readable there.
const QUEST_POOL = [
    { id: "musts", label: "All Musts done", xp: 150 },
    { id: "focus3", label: "3 focus blocks", xp: 200 },
    { id: "focus60", label: "60 min of focus", xp: 150 },
    { id: "set", label: "Full pomodoro set", xp: 250 },
    { id: "calories", label: "Under calorie limit", xp: 120 },
    { id: "noslip", label: "No slips today", xp: 100 },
    { id: "stale", label: "Clear a stale task", xp: 180 },
    { id: "early", label: "Earn before 10:00", xp: 100 },
    { id: "weight", label: "Log your weight", xp: 80 },
    { id: "musts3", label: "Finish 3 Musts", xp: 120 }
];

/** FNV-1a over the date string, so every device draws the same three quests. */
function dayHash(date) {
    let h = 2166136261;
    for (let i = 0; i < date.length; i++) {
        h ^= date.charCodeAt(i);
        h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
}

const QUESTS_PER_DAY = 3;

/** The three quests for a day, drawn deterministically from the pool. */
function questsFor(date) {
    let seed = dayHash(date);
    const pool = QUEST_POOL.slice();
    const out = [];
    for (let i = 0; i < QUESTS_PER_DAY && pool.length > 0; i++) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        // Take the high bits: an LCG's low bits cycle far too regularly, and the
        // pool sizes here (10, 9, 8) are exactly where that bias shows up as the
        // same quest being drawn every single day.
        out.push(pool.splice(Math.floor(seed / 4294967296 * pool.length), 1)[0]);
    }
    return out;
}

/** Whether a quest's condition is satisfied by the day's data. */
function questDone(quest, db, date) {
    const focusLogs = db.dayLogs.filter(l => l.kind === "focus" && l.date === date);
    switch (quest.id) {
    case "musts": {
        const due = db.tasks.filter(t => t.listType === "must" && !t.archived
            && isDueOn(t, date));
        if (due.length === 0) return false;
        return due.every(t => db.completions.some(c => c.taskId === t.id && c.date === date));
    }
    case "focus3":
        return focusLogs.length >= 3;
    case "focus60":
        return focusLogs.reduce((s, l) => s + (l.minutes ?? 0), 0) >= 60;
    case "set":
        return focusLogs.length >= FOCUS_SET_SIZE;
    case "calories": {
        const food = db.dayLogs.filter(l => l.kind === "food" && l.date === date);
        if (food.length === 0) return false;
        const burnt = db.dayLogs
            .filter(l => l.kind === "steps" && l.date === date)
            .reduce((s, l) => s + (l.caloriesBurnt ?? 0), 0);
        const settings = db.settings.find(s => s.id === "singleton") ?? DEFAULT_SETTINGS;
        return foodTotal(food, "calories") <= settings.calorieLimit + burnt;
    }
    case "noslip": {
        const onDay = db.ledger.filter(e => localDay(e.timestamp) === date);
        if (onDay.length === 0) return false;
        return !onDay.some(e => e.type === "bad_slip");
    }
    case "stale": {
        const cutoff = addDays(date, -14);
        return db.ledger.some(e => localDay(e.timestamp) === date && e.taskId
            && ["must_complete", "cool_achieve", "impossible_achieve", "custom_complete"]
                .indexOf(e.type) >= 0
            && db.tasks.some(t => t.id === e.taskId && localDay(t.createdAt) <= cutoff));
    }
    case "early":
        return db.ledger.some(e => localDay(e.timestamp) === date && e.delta > 0
            && !isBonusType(e.type) && new Date(e.timestamp).getHours() < 10);
    case "weight":
        return db.dayLogs.some(l => l.date === date && l.weightKg !== undefined
            && l.weightKg !== null);
    case "musts3":
        return db.completions.filter(c => c.date === date).length >= 3;
    }
    return false;
}

// ---------- weekly goal ----------

const WEEKLY_TARGET_DAYS = 7;
const WEEKLY_REWARD_DAYS = 5;

/** Monday-to-Sunday XP, using the same rules as the daily quota. */
function weekProgress(ledger, monday) {
    let total = 0;
    for (let i = 0; i < 7; i++) total += quotaProgress(ledger, addDays(monday, i));
    return total;
}

function weeklyTarget(ledger, monday) {
    return dailyQuota(ledger, addDays(monday, 7)) * WEEKLY_TARGET_DAYS;
}

function weeklyReward(ledger, monday) {
    return dailyQuota(ledger, addDays(monday, 7)) * WEEKLY_REWARD_DAYS;
}

// ---------- spendings ----------

/**
 * The category rail. Ids are stable strings written into every spending row,
 * so a rename here only changes the label, never the stored data. "other" is
 * the fallback whenever a row carries an id this list has since dropped.
 */
const SPEND_CATEGORIES = [
    { id: "food", name: "Food", icon: "restaurant" },
    { id: "groceries", name: "Groceries", icon: "shopping_cart" },
    { id: "transport", name: "Transport", icon: "directions_bus" },
    { id: "rent", name: "Rent", icon: "home" },
    { id: "bills", name: "Bills", icon: "receipt_long" },
    { id: "health", name: "Health", icon: "medical_services" },
    { id: "fun", name: "Fun", icon: "sports_esports" },
    { id: "clothes", name: "Clothes", icon: "checkroom" },
    { id: "tech", name: "Tech", icon: "devices" },
    { id: "education", name: "Education", icon: "school" },
    { id: "gifts", name: "Gifts", icon: "featured_seasonal_and_gifts" },
    { id: "other", name: "Other", icon: "more_horiz" }
];

function spendCategory(id) {
    return SPEND_CATEGORIES.find(c => c.id === id)
        ?? { id: id || "other", name: id || "Other", icon: "more_horiz" };
}

const CURRENCY_SYMBOLS = {
    EUR: "€", USD: "$", GBP: "£", KZT: "₸", RUB: "₽",
    PLN: "zł", TRY: "₺", CHF: "CHF", SEK: "kr", JPY: "¥"
};

function currencySymbol(code) {
    return CURRENCY_SYMBOLS[code] ?? (code || "");
}

/**
 * Group digits for readability. The separator is a narrow no-break space
 * (U+202F) written as an escape: it must never be the place a long total
 * wraps, and an escape keeps the intent visible in the source.
 */
function groupDigits(intPart) {
    return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
}

/**
 * "40" -> "€40", "40.5" -> "€40.50". Cents only appear when there are cents:
 * a page of round numbers should not be a page of ".00".
 */
function fmtMoney(amount, currency) {
    const v = Number(amount) || 0;
    const neg = v < 0;
    const abs = Math.abs(v);
    const cents = Math.round(abs * 100) % 100;
    const whole = groupDigits(String(Math.floor(abs)));
    const body = cents === 0 ? whole : `${whole}.${String(cents).padStart(2, "0")}`;
    return `${neg ? "−" : ""}${currencySymbol(currency)}${body}`;
}

/** Compact form for axis ticks and bar captions: €1.2k, €14k, €1.1M. */
function fmtMoneyShort(amount, currency) {
    const v = Number(amount) || 0;
    const abs = Math.abs(v);
    const sym = currencySymbol(currency);
    const sign = v < 0 ? "−" : "";
    if (abs >= 1000000) {
        const m = abs / 1000000;
        return `${sign}${sym}${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10}M`;
    }
    if (abs >= 1000) {
        const k = abs / 1000;
        return `${sign}${sym}${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`;
    }
    return fmtMoney(v, currency);
}

/**
 * Parse a typed amount. Accepts "40", "40.5", "40,50" and a leading symbol,
 * so pasting "€12,90" from a receipt works. Returns null when there is no
 * number to read, which is what keeps the empty form from logging a zero.
 */
function parseAmount(text) {
    if (text === undefined || text === null)
        return null;
    const cleaned = String(text).replace(/[^0-9.,-]/g, "").replace(",", ".");
    if (cleaned === "" || cleaned === "-" || cleaned === ".")
        return null;
    const v = Number(cleaned);
    if (!isFinite(v) || v < 0)
        return null;
    return Math.round(v * 100) / 100;
}

/** Places already used, most-used first, for the quick-pick chips. */
function spendPlacesByUsage(spendings) {
    const counts = new Map();
    for (const s of spendings) {
        const name = (s.place ?? "").trim();
        if (name === "")
            continue;
        const key = name.toLowerCase();
        const hit = counts.get(key);
        if (hit)
            hit.count++;
        else
            counts.set(key, { name: name, category: s.category, count: 1, at: s.spentAt ?? 0 });
        if (hit && (s.spentAt ?? 0) > hit.at) {
            hit.at = s.spentAt ?? 0;
            hit.category = s.category; // the newest visit decides the suggested category
        }
    }
    return Array.from(counts.values()).sort((a, b) => (b.count - a.count) || (b.at - a.at));
}

// ---------- subscriptions ----------

/**
 * Billing cycles. `months` and `days` are the step used to walk renewal dates;
 * exactly one of them is set. A trial has no step of its own: it runs for
 * `trialDays` and then either converts to the cycle in `trialThen` or ends.
 */
const SUB_CYCLES = [
    { id: "monthly", name: "Monthly", months: 1, icon: "calendar_month" },
    { id: "annual", name: "Yearly", months: 12, icon: "event_repeat" },
    { id: "quarterly", name: "Quarterly", months: 3, icon: "calendar_view_month" },
    { id: "weekly", name: "Weekly", days: 7, icon: "date_range" },
    { id: "trial", name: "Trial", icon: "hourglass_top" }
];

/** Preset trial lengths; "custom" lets the user type any number of days. */
const TRIAL_PRESETS = [7, 14, 30];

const DEFAULT_REMINDER_DAYS = [7, 3, 1];

function subCycle(id) {
    return SUB_CYCLES.find(c => c.id === id) ?? SUB_CYCLES[0];
}

/** 1 -> "1st", 22 -> "22nd", 13 -> "13th". */
function ordinal(n) {
    const rem100 = n % 100;
    if (rem100 >= 11 && rem100 <= 13)
        return `${n}th`;
    return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/**
 * Human label for a subscription's cadence, e.g. "Monthly on the 22nd" or
 * "14 day trial, then Monthly". Naming the day back is what lets you spot a
 * typo in the renewal date from the list, without opening the row.
 */
function subCycleLabel(sub) {
    if (sub.cycle !== "trial") {
        const name = subCycle(sub.cycle).name;
        const anchor = subAnchorDay(sub);
        if (sub.cycle === "weekly")
            return `${name} on ${WEEKDAY_NAMES[weekdayOf(anchor)]}`;
        if (sub.cycle === "annual")
            return `${name} on ${Number(anchor.slice(8, 10))} ${MONTHS_SHORT[Number(anchor.slice(5, 7)) - 1]}`;
        return `${name} on the ${ordinal(Number(anchor.slice(8, 10)))}`;
    }
    const days = Number(sub.trialDays) || 0;
    const then = sub.trialThen && sub.trialThen !== "none"
        ? `, then ${subCycle(sub.trialThen).name.toLowerCase()}` : "";
    return `${days} day trial${then}`;
}

/**
 * Add whole months to an ISO day, clamping instead of rolling over: a
 * subscription started on the 31st bills on the 30th in a 30-day month, it does
 * not jump to the 1st of the month after and drift a day further every time.
 */
function addMonthsClamped(day, n) {
    const p = day.split("-").map(Number);
    const target = new Date(p[0], p[1] - 1 + n, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(p[2], lastDay));
    return _formatLocalDay(target);
}

/** The day a trial converts (or ends), or null when this is not a trial. */
function subTrialEnd(sub) {
    if (sub.cycle !== "trial")
        return null;
    return addDays(subStartDay(sub), Math.max(0, Number(sub.trialDays) || 0));
}

/**
 * When this subscription started COSTING you. Charges before this day are not
 * counted, so filling in a service you have had for years without knowing when
 * it began does not invent a history of spending you cannot verify.
 */
function subStartDay(sub) {
    return sub.startDate || localDay(sub.createdAt ?? Date.now());
}

/**
 * The day the billing cycle is phased from, which is a different question from
 * when you started paying. Entering a subscription you already have, you know
 * "it renews on the 22nd" but usually not the day you first subscribed, so the
 * renewal day is the anchor and the start day is optional.
 *
 * Falls back to the start day, which is exactly the old behaviour for every row
 * written before this existed.
 */
function subAnchorDay(sub) {
    return sub.renewalAnchor || subStartDay(sub);
}

/** Days in the month containing `day`. */
function daysInMonth(year, month1) {
    return new Date(year, month1, 0).getDate();
}

/**
 * The most recent day-of-month `dom` on or before `today`, as the anchor for a
 * monthly or quarterly cycle. Looking backwards rather than forwards keeps the
 * phase correct whichever side of the renewal date you happen to be on.
 */
function anchorFromDayOfMonth(dom, today) {
    const t = today.split("-").map(Number);
    const thisMonthLast = daysInMonth(t[0], t[1]);
    if (Math.min(dom, thisMonthLast) <= t[2]) {
        const d = String(Math.min(dom, thisMonthLast)).padStart(2, "0");
        return `${today.slice(0, 7)}-${d}`;
    }
    const prev = addMonthsClamped(`${today.slice(0, 7)}-01`, -1);
    const prevLast = daysInMonth(Number(prev.slice(0, 4)), Number(prev.slice(5, 7)));
    const d = String(Math.min(dom, prevLast)).padStart(2, "0");
    return `${prev.slice(0, 7)}-${d}`;
}

/** The most recent `month1`/`dom` on or before `today`, for a yearly cycle. */
function anchorFromMonthDay(month1, dom, today) {
    const year = Number(today.slice(0, 4));
    const build = y => {
        const d = String(Math.min(dom, daysInMonth(y, month1))).padStart(2, "0");
        return `${y}-${String(month1).padStart(2, "0")}-${d}`;
    };
    const thisYear = build(year);
    return thisYear <= today ? thisYear : build(year - 1);
}

/** The most recent `weekday` (0 = Sunday) on or before `today`. */
function anchorFromWeekday(weekday, today) {
    const back = (weekdayOf(today) - weekday + 7) % 7;
    return addDays(today, -back);
}

/** Which day of the month a subscription renews on, for showing it back. */
function subRenewalDom(sub) {
    return Number(subAnchorDay(sub).slice(8, 10));
}

/**
 * The next day money leaves the account, or null when the subscription is
 * cancelled or has already ended for good.
 *
 * Strictly AFTER today, because subChargeDays() already counts a charge dated
 * today as spent. Letting the same charge be both "spent so far" and "renews
 * today" double-counted it: adding a subscription that starts today showed the
 * money as already gone and simultaneously raised a red renewal alert for it.
 *
 * A trial's first charge is the day it converts; after that it bills on the
 * cadence it converted into.
 */
function subNextCharge(sub, today) {
    if (sub.status === "cancelled")
        return null;
    const tomorrow = addDays(today, 1);

    if (sub.cycle === "trial") {
        const end = subTrialEnd(sub);
        // A trial that just expires costs nothing, so it is never counted as
        // spent and cannot double-count. Its last day still matters today,
        // which is the alert worth having, so this one keeps "on or after".
        if (!sub.trialThen || sub.trialThen === "none")
            return end >= today ? end : null;
        if (end >= tomorrow)
            return end;
        return _walkCycle(end, sub.trialThen, tomorrow);
    }
    return _walkCycle(subAnchorDay(sub), sub.cycle, tomorrow);
}

/** First occurrence of `cycle` starting at `from` that is on or after `notBefore`. */
function _walkCycle(from, cycleId, notBefore) {
    const cycle = subCycle(cycleId);
    // Every step is measured from `from`, never from the previous result. Adding
    // one month at a time compounds the end-of-month clamp: the 31st becomes the
    // 30th in a short month and then stays there, walking the renewal date
    // backwards a day at a time for the life of the subscription.
    const at = k => cycle.months
        ? addMonthsClamped(from, k * cycle.months)
        : addDays(from, k * cycle.days);

    // Jump most of the distance at once, so a decade-old weekly subscription
    // does not cost five hundred iterations every time a binding re-evaluates.
    let k = 0;
    if (from < notBefore) {
        if (cycle.months) {
            const months = (Number(notBefore.slice(0, 4)) - Number(from.slice(0, 4))) * 12
                + (Number(notBefore.slice(5, 7)) - Number(from.slice(5, 7)));
            k = Math.max(0, Math.floor(months / cycle.months));
        } else {
            k = Math.max(0, Math.floor(diffDays(from, notBefore) / cycle.days));
        }
    }
    let guard = 0;
    while (at(k) < notBefore && guard++ < 400)
        k++;
    return at(k);
}

/**
 * Every day this subscription was actually charged, up to and including
 * `until`. Used for the history figure and for the charge timeline, so both
 * read from one definition of "was billed".
 *
 * A cancelled subscription stops at its cancellation day. A trial contributes
 * nothing while it runs: that is the whole point of a trial, and counting it
 * would tell the user they had spent money they had not.
 */
function subChargeDays(sub, until) {
    const out = [];
    const stop = sub.status === "cancelled" && sub.cancelledOn && sub.cancelledOn < until
        ? sub.cancelledOn : until;
    let from, cycleId;

    if (sub.cycle === "trial") {
        if (!sub.trialThen || sub.trialThen === "none")
            return out;
        from = subTrialEnd(sub);
        cycleId = sub.trialThen;
    } else {
        from = subAnchorDay(sub);
        cycleId = sub.cycle;
    }
    // The anchor can sit before tracking began, because it only fixes which day
    // of the month the cycle lands on. Charges earlier than the start day are
    // skipped rather than invented.
    const trackFrom = subStartDay(sub);
    const cycle = subCycle(cycleId);
    const at = k => cycle.months
        ? addMonthsClamped(from, k * cycle.months)
        : addDays(from, k * cycle.days);

    let k = 0;
    let guard = 0;
    while (at(k) <= stop && guard++ < 2000) {
        const day = at(k);
        if (day >= trackFrom)
            out.push(day);
        k++;
    }
    return out;
}

/** Euro actually spent on this subscription up to `until`. */
function subSpentEur(sub, until) {
    return subChargeDays(sub, until).length * (Number(sub.amountEur) || 0);
}

/**
 * What this subscription costs per month in euro, for the "you are committed to
 * X a month" headline. A trial that has not converted yet costs nothing today,
 * so it is reported separately rather than folded into the running total.
 */
function subMonthlyEur(sub) {
    const eur = Number(sub.amountEur) || 0;
    const cycleId = sub.cycle === "trial" ? sub.trialThen : sub.cycle;
    if (!cycleId || cycleId === "none")
        return 0;
    const cycle = subCycle(cycleId);
    if (cycle.months)
        return eur / cycle.months;
    return eur * (365.25 / 12) / cycle.days;
}

/** Whole days between two ISO days, `to` minus `from`. */
function daysBetween(from, to) {
    return diffDays(from, to);
}

/**
 * "2 years 3 months", "5 months", "12 days". Coarse on purpose: a subscription
 * held for years does not need its odd days spelled out.
 */
function fmtSpan(fromDay, toDay) {
    const days = Math.max(0, diffDays(fromDay, toDay));
    if (days < 31)
        return days === 1 ? "1 day" : `${days} days`;
    const f = fromDay.split("-").map(Number);
    const t = toDay.split("-").map(Number);
    let months = (t[0] - f[0]) * 12 + (t[1] - f[1]);
    if (t[2] < f[2])
        months -= 1;
    if (months < 12)
        return months === 1 ? "1 month" : `${months} months`;
    const years = Math.floor(months / 12);
    const rest = months % 12;
    const y = years === 1 ? "1 year" : `${years} years`;
    if (rest === 0)
        return y;
    return `${y} ${rest === 1 ? "1 month" : `${rest} months`}`;
}

/**
 * Should a reminder go out for this subscription today, and which one?
 * Returns { day, away, key, isTrialEnd } or null.
 *
 * Pure on purpose: the watcher that fires the notification is awkward to test
 * live (Quickshell keeps singletons across reloads), so the decision it makes
 * lives here where it can be checked directly.
 */
function subDueReminder(sub, today) {
    if (sub.status === "cancelled")
        return null;
    const day = subNextCharge(sub, today);
    if (!day)
        return null;
    const away = diffDays(today, day);
    const windows = (sub.reminderDays && sub.reminderDays.length > 0)
        ? sub.reminderDays : DEFAULT_REMINDER_DAYS;
    if (windows.indexOf(away) < 0)
        return null;
    const key = `${day}:${away}`;
    if ((sub.notified || {})[key])
        return null;
    return {
        day: day,
        away: away,
        key: key,
        isTrialEnd: sub.cycle === "trial" && subTrialEnd(sub) === day
    };
}

// ---------- body measurements ----------

/**
 * The tape sites on the Body page, with the measuring routine shown beside
 * every entry. `spotHint` asks for the user's own landmark distance: without
 * a fixed spot the tape lands a few cm higher or lower each time and the
 * "progress" is just a different spot. Stable ids, like SPEND_CATEGORIES.
 */
const BODY_SITES = [
    {
        id: "waist", name: "Waist", icon: "straighten",
        how: "Stand relaxed with your feet together. Put the tape around your belly at the height of your navel, level all the way round (check in the mirror). Breathe out normally and read the tape at the end of the breath. Do not suck in or push the belly out.",
        spotHint: "e.g. at the navel",
        firstTime: "Your spot is simply the navel. Write it down anyway, so you never drift to the narrowest point instead."
    },
    {
        id: "biceps", name: "Biceps", icon: "straighten",
        how: "Right arm hanging loose by your side, muscle relaxed, not flexed. Find the bony tip of your shoulder and measure your spot distance straight down the outside of the arm. Wrap the tape there, level, snug on the skin but not pressing in.",
        spotHint: "e.g. 17 cm below the shoulder tip",
        firstTime: "Bend the arm to 90 degrees. Measure from the bony tip of the shoulder to the tip of the elbow and halve it. That distance below the shoulder tip is your spot. Save it below and use it forever."
    },
    {
        id: "thigh", name: "Thigh", icon: "straighten",
        how: "Stand straight, feet hip width apart, weight on both legs, thigh relaxed. Measure your spot distance up from the top of the right kneecap. Wrap the tape there, level all the way round, snug but not pressing in.",
        spotHint: "e.g. 15 cm above the kneecap",
        firstTime: "Measure from the top of the kneecap up to the crease where the leg meets the hip and halve it. That distance above the kneecap is your spot. Save it below and use it forever."
    }
];

/** The rules that hold for every site; shown once at the top of the page. */
const BODY_RULES = [
    "Every 2 weeks, on the same weekday.",
    "Morning, after the toilet, before eating, drinking or training.",
    "Same tape every time. Snug on the skin, never pressing in.",
    "Measure twice and log the average. If the two reads differ by more than 0.5 cm, measure a third time.",
    "Weigh yourself daily if you like, but only trust the 7 day average."
];

const BODY_INTERVAL_DAYS = 14;

/**
 * One site's history from measurement rows (one row per day, the site's cm
 * stored under its id). Oldest first. `change` is last minus first, in cm.
 */
function bodySeries(rows, site) {
    const points = rows
        .filter(r => typeof r[site] === "number" && r[site] > 0)
        .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
        .map(r => ({ date: r.date, value: r[site] }));
    if (points.length === 0)
        return { points: [], first: null, last: null, change: 0 };
    const first = points[0].value, last = points[points.length - 1].value;
    return { points: points, first: first, last: last, change: Math.round((last - first) * 10) / 10 };
}

/** Mean weight over the 7 days ending on `today` (inclusive), or null. */
function weightAvg7(weightLogs, today) {
    const from = addDays(today, -6);
    const vals = weightLogs
        .filter(l => l.date >= from && l.date <= today && l.weightKg > 0)
        .map(l => l.weightKg);
    if (vals.length === 0)
        return null;
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 10) / 10;
}

/** Days until the next tape session is due; 0 or less means due now. */
function bodyDueIn(rows, today) {
    if (rows.length === 0)
        return 0;
    const last = rows.reduce((m, r) => r.date > m ? r.date : m, "");
    return BODY_INTERVAL_DAYS - diffDays(last, today);
}
