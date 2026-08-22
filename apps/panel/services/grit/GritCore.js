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
    focusTasks: []
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

function recurrenceLabel(task) {
    const rec = task.recurrence;
    if (!rec) return "";
    const every = Math.max(1, rec.interval || 1);
    if (rec.type === "daily") return every === 1 ? "Every day" : `Every ${every} days`;
    if (rec.type === "weekly") {
        const days = rec.weekdays.slice().sort((a, b) => a - b);
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
