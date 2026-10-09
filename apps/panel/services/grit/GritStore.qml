pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import qs.modules.common
import qs.modules.common.functions
import "GritCore.js" as Core

/**
 * Local-first Grit state: the 8 synced tables mirrored from the web app's
 * Dexie schema, persisted as one JSON file, with a mutation API ported from
 * apps/web/src/lib/repository.ts. Every XP change lands in the append-only
 * ledger so XP/level/streaks stay derivable and sync-safe.
 */
Singleton {
    id: root

    property bool loaded: false
    property var db: ({
        tasks: [], completions: [], ledger: [], settings: [],
        lists: [], foods: [], dayLogs: [], focus: [], spendings: [], subscriptions: [], measurements: [],
        // Local-only: the Shop catalogue has no Supabase table, so it never
        // syncs. Purchases still ride the ledger, so XP agrees everywhere.
        rewards: [],
        tombstones: []
    })
    // Sync cursors, owned by GritSync but persisted alongside the data
    property var cursors: ({})

    property int revision: 0
    // UI-only, not persisted: which task cards have their subtask list open.
    // Lives here (keyed by task id) so it survives delegate recreation when
    // revision bumps rebuild the task lists.
    property var subtasksExpandedIds: ({})
    // Set while applying remote rows: skips updatedAt stamping + tombstones + localChange
    property bool suppress: false
    property int lastKnownLevel: -1

    signal localChange()
    signal focusMustCompleted(string title, int xp)
    signal levelUp(int newLevel)
    signal xpEvent(string kind, real delta, string label)
    signal milestoneReached(string label, int xp)
    signal focusRankUp(string title, int hours, int xp)
    signal questCompleted(string label, int xp)
    signal quotaMet(int quota, int streak)
    signal weeklyGoalMet(int xp)
    signal rewardBought(string name, int cost)

    readonly property string dbDir: Directories.state + "/user/grit"
    readonly property string dbPath: dbDir + "/db.json"

    // ---------- Derived state ----------

    readonly property string today: {
        dayTick.running; // re-eval trigger
        return Core.localDay(dateNowRefresh);
    }
    property real dateNowRefresh: Date.now()
    Timer {
        id: dayTick
        interval: 60000
        running: true
        repeat: true
        onTriggered: root.dateNowRefresh = Date.now()
    }

    readonly property var settings: {
        revision;
        const row = root.db.settings.find(s => s.id === "singleton");
        return Object.assign({}, Core.DEFAULT_SETTINGS, row ?? {});
    }
    /** Spendable balance. Purchases come out of this one. */
    readonly property real xp: {
        revision;
        return Core.walletXp(root.db.ledger);
    }
    /** Level XP: ignores wallet spending, so buying a reward never demotes you. */
    readonly property real lifetimeXp: {
        revision;
        return Core.lifetimeXp(root.db.ledger);
    }
    readonly property var levelInfo: {
        revision;
        return Core.computeLevel(root.lifetimeXp, root.settings.levelBase, root.settings.levelGrowth);
    }
    readonly property real xpToday: {
        revision;
        return Core.xpGainedOn(root.db.ledger, root.today);
    }
    readonly property var customLists: {
        revision;
        return root.db.lists.slice().sort((a, b) => a.order - b.order);
    }
    // Deliberately a fresh copy per revision: patchRow mutates the stored row
    // in place, and a `var` property that re-evaluates to the *same* object
    // never notifies. Every binding reading only the session (FocusView's
    // phase checks, GritFocusAlarm.sessionKey) would keep the pre-patch value
    // until something else forced it to re-evaluate.
    readonly property var activeFocus: {
        revision;
        const row = root.db.focus.find(f => f.id === "active");
        return row ? Object.assign({}, row) : null;
    }
    /** Subscriptions, newest first. Status filtering is the page's job. */
    readonly property var subscriptions: {
        root.revision;
        return root.db.subscriptions.slice().sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    }

    /** Spendings newest first: every list on the page reads them this way. */
    readonly property var spendings: {
        root.revision;
        return root.db.spendings.slice().sort((a, b) => (b.spentAt ?? 0) - (a.spentAt ?? 0));
    }

    readonly property var foods: {
        revision;
        return root.db.foods.slice().sort((a, b) => b.createdAt - a.createdAt);
    }

    function tasksOf(listType, listId) {
        revision;
        return root.db.tasks
            .filter(t => t.listType === listType && (listId === undefined || t.listId === listId))
            .sort((a, b) => a.order - b.order);
    }

    function isDoneOn(task, date) {
        if (task.recurrence)
            return root.db.completions.some(c => c.taskId === task.id && c.date === date);
        return task.archived;
    }

    function isDoneToday(task) {
        return root.isDoneOn(task, root.today);
    }

    function foodLogsToday() {
        return root.db.dayLogs.filter(l => l.kind === "food" && l.date === root.today);
    }

    function focusLogsToday() {
        return root.db.dayLogs.filter(l => l.kind === "focus" && l.date === root.today);
    }

    // ---------- Internals ----------

    function now() {
        return Date.now();
    }

    function stamp(row) {
        if (!root.suppress)
            row.updatedAt = Date.now();
        return row;
    }

    function getRow(table, id) {
        return root.db[table].find(r => r.id === id);
    }

    function putRow(table, row) {
        root.stamp(row);
        const arr = root.db[table];
        const i = arr.findIndex(r => r.id === row.id);
        if (i >= 0)
            arr[i] = row;
        else
            arr.push(row);
        // A row written again after a delete is alive: drop its tombstone, or
        // sync pushes the delete after the row and the pull removes it again
        // ("Go without rest" deletes the "active" focus row, then recreates it).
        const tombs = root.db.tombstones;
        const ti = tombs.findIndex(t => t.table === table && t.id === row.id);
        if (ti >= 0)
            tombs.splice(ti, 1);
        root.afterMutation();
    }

    function patchRow(table, id, patch) {
        const row = root.getRow(table, id);
        if (!row)
            return;
        for (const key in patch) {
            if (patch[key] === undefined)
                delete row[key];
            else
                row[key] = patch[key];
        }
        root.stamp(row);
        root.afterMutation();
    }

    function deleteRow(table, id) {
        const arr = root.db[table];
        const i = arr.findIndex(r => r.id === id);
        if (i < 0)
            return;
        arr.splice(i, 1);
        if (!root.suppress) {
            const tombs = root.db.tombstones;
            const ti = tombs.findIndex(t => t.table === table && t.id === id);
            const tomb = { table: table, id: id, updatedAt: Date.now() };
            if (ti >= 0)
                tombs[ti] = tomb;
            else
                tombs.push(tomb);
        }
        root.afterMutation();
    }

    /**
     * Coalesce a run of writes into one revision bump. Every derived property
     * here and every list in the views hangs off `revision`, so a bump is a full
     * recompute of the whole app state; a sync pull applying 300 rows one at a
     * time paid for 300 of them. Reentrant, and endBatch() is only ever reached
     * through a finally, so an exception mid-run cannot wedge the depth.
     *
     * The one rule: inside a batch the revision-derived properties (xp,
     * settings, streak, levelInfo, ...) hold their pre-batch values, because
     * nothing has told them to re-read. Batched code must read root.db and the
     * Core functions directly, which every current caller does. Never batch a
     * loop whose steps depend on what the previous step derived.
     */
    property int batchDepth: 0
    property bool batchDirty: false

    function beginBatch() {
        root.batchDepth++;
    }

    /** Run fn as one batch: many writes, a single revision bump. Reentrant. */
    function batch(fn) {
        root.beginBatch();
        try {
            return fn();
        } finally {
            root.endBatch();
        }
    }

    function endBatch() {
        if (root.batchDepth > 0)
            root.batchDepth--;
        if (root.batchDepth > 0 || !root.batchDirty)
            return;
        root.batchDirty = false;
        root.afterMutation();
    }

    function afterMutation() {
        // The aggregates memoise per ledger array; an in-place row edit leaves
        // the array identity and length alone, so the write is announced here.
        Core.invalidateLedger();
        if (root.batchDepth > 0) {
            root.batchDirty = true;
            return;
        }
        root.revision++;
        saveDebounce.restart();
        if (!root.suppress) {
            const level = Core.computeLevel(Core.lifetimeXp(root.db.ledger),
                root.settings.levelBase, root.settings.levelGrowth).level;
            if (root.lastKnownLevel >= 0 && level > root.lastKnownLevel)
                root.levelUp(level);
            root.lastKnownLevel = level;
            if (root.loaded && !root.awardingDaily)
                dailyDebounce.restart();
            root.localChange();
        }
    }

    /** Append an XP event. Negative deltas are clamped so XP floors at 0. */
    function addLedger(entry) {
        let delta = entry.delta;
        if (delta < 0) {
            const current = Core.walletXp(root.db.ledger);
            delta = -Math.min(-delta, current);
        }
        // Streak / comeback bonus on effort only. Baked into the delta and
        // recorded on the row, so it is a fact about the moment it was earned
        // and never recomputed if the streak later breaks.
        let mult = 1;
        if (delta > 0 && Core.isMultipliedType(entry.type) && !entry.noMultiplier) {
            const m = Core.xpMultiplier(root.db.ledger, root.today);
            if (m.mult > 1) {
                mult = m.mult;
                delta = Math.round(delta * mult);
            }
        }
        const row = {
            id: entry.id ?? Core.uid(),
            timestamp: entry.timestamp ?? Date.now(),
            type: entry.type,
            delta: delta,
            taskId: entry.taskId,
            meta: entry.meta
        };
        if (mult > 1)
            row.mult = mult;
        if (entry.restDate)
            row.restDate = entry.restDate;
        if (entry.milestoneId)
            row.milestoneId = entry.milestoneId;
        root.putRow("ledger", row);
        root.xpEvent(entry.type, delta, entry.meta ?? "");
    }

    // ---------- Settings ----------

    function updateSettings(patch) {
        const merged = Object.assign({}, root.settings, patch, { id: "singleton" });
        root.putRow("settings", merged);
    }

    // ---------- Tasks ----------

    function addTask(input) {
        const siblings = root.db.tasks.filter(t => t.listType === input.listType);
        const ts = Date.now();
        const task = {
            id: Core.uid(),
            listType: input.listType,
            title: input.title.trim(),
            points: input.points ?? Core.DEFAULT_POINTS[input.listType],
            order: siblings.length,
            archived: false,
            createdAt: ts
        };
        if (input.notes)
            task.notes = input.notes;
        if (input.listType === "must") {
            task.recurrence = input.recurrence ?? { type: "daily", weekdays: [] };
            task.starredMyDay = false;
        } else if (input.recurrence) {
            task.recurrence = input.recurrence;
        }
        if (input.listType === "bad") {
            task.slipPenalty = input.slipPenalty ?? Core.DEFAULT_SLIP_PENALTY;
            task.rewardMultiplier = input.rewardMultiplier ?? 1;
            if (input.cleanSince && input.cleanSince < ts) {
                task.lastSlipAt = input.cleanSince;
                task.awardedMilestoneIds = Core.pendingMilestones(ts - input.cleanSince, []).map(m => m.id);
            } else {
                task.awardedMilestoneIds = [];
            }
        }
        if (input.listType === "custom" && input.listId)
            task.listId = input.listId;
        if (input.starredMyDay)
            task.starredMyDay = true;
        if (input.plannedFor)
            task.plannedFor = input.plannedFor;
        root.putRow("tasks", task);
        return task;
    }

    function updateTask(id, patch) {
        root.patchRow("tasks", id, patch);
    }

    function deleteTask(id) {
        const completions = root.db.completions.filter(c => c.taskId === id);
        root.beginBatch();
        try {
            for (const c of completions)
                root.deleteRow("completions", c.id);
            root.deleteRow("tasks", id);
        } finally {
            root.endBatch();
        }
    }

    // ---------- Must completions ----------

    function getCompletion(taskId, date) {
        return root.db.completions.find(c => c.taskId === taskId && c.date === date);
    }

    function completeMust(task, date) {
        date = date ?? root.today;
        if (root.getCompletion(task.id, date))
            return;
        root.putRow("completions", {
            id: Core.uid(),
            taskId: task.id,
            date: date,
            completedAt: Date.now()
        });
        root.addLedger({
            type: Core.completeLedgerType(task.listType),
            delta: task.points,
            taskId: task.id,
            meta: task.title
        });
    }

    function uncompleteMust(task, date) {
        date = date ?? root.today;
        const existing = root.getCompletion(task.id, date);
        if (!existing)
            return;
        root.deleteRow("completions", existing.id);
        root.addLedger({
            type: "adjust",
            delta: -task.points,
            taskId: task.id,
            meta: `undo: ${task.title}`
        });
    }

    // ---------- Bad slips & milestones ----------

    function recordSlip(task) {
        return root.batch(() => {
            const penalty = task.slipPenalty ?? Core.DEFAULT_SLIP_PENALTY;
            const ts = Date.now();
            const ended = Core.streakMs(ts, task.lastSlipAt, task.createdAt);
            root.addLedger({
                type: "bad_slip",
                delta: -penalty,
                taskId: task.id,
                meta: task.title
            });
            root.updateTask(task.id, {
                lastSlipAt: ts,
                awardedMilestoneIds: [],
                bestStreakMs: Math.max(task.bestStreakMs ?? 0, ended)
            });
            return penalty;
        });
    }

    /** Idempotent, ledger-deduped milestone sweep. Never writes the task row. */
    function awardMilestones(task, ts) {
        return root.batch(() => {
            if (task.listType !== "bad")
                return [];
            ts = ts ?? Date.now();
            const runStart = task.lastSlipAt ?? task.createdAt;
            const streak = Core.streakMs(ts, task.lastSlipAt, task.createdAt);
            const awarded = new Set(task.awardedMilestoneIds ?? []);
            for (const e of root.db.ledger) {
                if (e.type === "streak_milestone" && e.taskId === task.id
                        && e.timestamp >= runStart && e.milestoneId)
                    awarded.add(e.milestoneId);
            }
            const pending = Core.pendingMilestones(streak, [...awarded]);
            if (pending.length === 0)
                return [];
            const mult = task.rewardMultiplier ?? 1;
            const granted = [];
            for (const m of pending) {
                const id = `m:${task.id}:${m.id}:${runStart}`;
                if (root.db.ledger.some(e => e.id === id))
                    continue;
                const mxp = Math.round(m.baseXp * mult);
                root.addLedger({
                    id: id,
                    type: "streak_milestone",
                    delta: mxp,
                    taskId: task.id,
                    milestoneId: m.id,
                    meta: `${task.title} · ${m.label} clean`
                });
                granted.push({ label: m.label, xp: mxp });
                root.milestoneReached(m.label, mxp);
            }
            return granted;
        });
    }

    /**
     * Idempotent focus rank payout. Deduped purely by ledger id ("fr:<hours>"),
     * which is stable across devices, so a rank can never be paid twice even if
     * the web app awarded it first. Runs off the current total, so ranks passed
     * before this existed are back-paid on the first sweep.
     */
    function awardFocusRanks(ts) {
        return root.batch(() => {
            ts = ts ?? Date.now();
            const minutes = root.db.dayLogs
                .filter(l => l.kind === "focus")
                .reduce((s, l) => s + (l.minutes ?? 0), 0);
            const granted = [];
            for (const r of Core.pendingFocusRanks(minutes / 60)) {
                const id = `fr:${r.hours}`;
                if (root.db.ledger.some(e => e.id === id))
                    continue;
                root.addLedger({
                    id: id,
                    type: "focus_rank",
                    delta: r.xp,
                    milestoneId: `focus:${r.hours}`,
                    meta: `${r.title} · ${r.hours}h focus`,
                    timestamp: ts
                });
                granted.push(r);
                root.milestoneReached(r.title, r.xp);
                root.focusRankUp(r.title, r.hours, r.xp);
            }
            return granted;
        });
    }

    Timer {
        id: milestoneSweep
        interval: 30000
        running: root.loaded
        repeat: true
        triggeredOnStart: false
        onTriggered: {
            root.beginBatch();
            try {
                for (const t of root.db.tasks.filter(t => t.listType === "bad" && !t.archived))
                    root.awardMilestones(t);
                root.awardFocusRanks();
                root.awardDailyLoop();
            } finally {
                root.endBatch();
            }
        }
    }

    // ---------- Cool / Impossible / custom achievements ----------

    function achieve(task) {
        if (task.archived)
            return;
        root.addLedger({
            type: Core.achieveLedgerType(task.listType),
            delta: task.points,
            taskId: task.id,
            meta: task.title
        });
        root.updateTask(task.id, { archived: true, achievedAt: Date.now() });
    }

    function unachieve(task) {
        if (!task.archived)
            return;
        root.addLedger({
            type: "adjust",
            delta: -task.points,
            taskId: task.id,
            meta: `undo: ${task.title}`
        });
        root.updateTask(task.id, { archived: false, achievedAt: undefined });
    }

    /** Complete/uncomplete from the UI checkbox, dispatching on task shape.
     *  Recurring toggles apply to `date` (defaults to today; Planned passes
     *  the card's day) so one occurrence never affects the others. */
    function toggleDone(task, date) {
        return root.batch(() => {
            if (task.recurrence) {
                date = date ?? root.today;
                if (root.isDoneOn(task, date))
                    root.uncompleteMust(task, date);
                else
                    root.completeMust(task, date);
            } else if (task.archived) {
                root.unachieve(task);
            } else {
                root.achieve(task);
            }
        });
    }

    // ---------- Custom lists ----------

    function addCustomList(name) {
        const list = {
            id: Core.uid(),
            name: name.trim() || "Untitled list",
            order: root.db.lists.length,
            createdAt: Date.now()
        };
        root.putRow("lists", list);
        return list;
    }

    function renameCustomList(id, name) {
        const trimmed = name.trim();
        if (trimmed)
            root.patchRow("lists", id, { name: trimmed });
    }

    function deleteCustomList(id) {
        const tasks = root.db.tasks.filter(t => t.listId === id);
        root.beginBatch();
        try {
            for (const t of tasks)
                root.deleteTask(t.id);
            root.deleteRow("lists", id);
        } finally {
            root.endBatch();
        }
    }

    // ---------- Subtasks ----------

    function subtaskDone(task, sub) {
        return Core.subtaskDone(task, sub, root.today);
    }

    function parentDone(task, date) {
        if (task.recurrence)
            return !!root.getCompletion(task.id, date);
        const fresh = root.getRow("tasks", task.id) ?? task;
        return !!fresh.archived;
    }

    function maybeCompleteParent(task, date) {
        const subs = task.subtasks ?? [];
        if (subs.length === 0)
            return false;
        if (!subs.every(s => Core.subtaskDone(task, s, date)))
            return false;
        if (root.parentDone(task, date))
            return false;
        const leftover = Math.max(0, task.points - subs.reduce((sum, s) => sum + (s.awardedXp ?? 0), 0));
        if (task.recurrence) {
            root.putRow("completions", {
                id: Core.uid(),
                taskId: task.id,
                date: date,
                completedAt: Date.now()
            });
        } else {
            root.patchRow("tasks", task.id, { archived: true, achievedAt: Date.now() });
        }
        if (leftover > 0) {
            root.addLedger({
                type: Core.completeLedgerType(task.listType),
                delta: leftover,
                taskId: task.id,
                meta: task.title
            });
        }
        root.patchRow("tasks", task.id, { subtaskRemainderXp: leftover > 0 ? leftover : undefined });
        return true;
    }

    function uncompleteParent(task, date) {
        const fresh = root.getRow("tasks", task.id) ?? task;
        const remainder = fresh.subtaskRemainderXp ?? 0;
        if (remainder > 0) {
            root.addLedger({
                type: "adjust",
                delta: -remainder,
                taskId: task.id,
                meta: `undo: ${task.title}`
            });
            root.patchRow("tasks", task.id, { subtaskRemainderXp: undefined });
        }
        if (task.recurrence) {
            const existing = root.getCompletion(task.id, date);
            if (existing)
                root.deleteRow("completions", existing.id);
        } else if (fresh.archived) {
            root.patchRow("tasks", task.id, { archived: false, achievedAt: undefined });
        }
    }

    function addSubtask(task, title) {
        const t = title.trim();
        if (!t)
            return;
        const subs = [...(task.subtasks ?? []), { id: Core.uid(), title: t }];
        root.updateTask(task.id, { subtasks: subs });
    }

    function deleteSubtask(task, subId) {
        return root.batch(() => {
            const date = root.today;
            const subs = task.subtasks ?? [];
            const sub = subs.find(s => s.id === subId);
            if (!sub)
                return;
            if (Core.subtaskDone(task, sub, date) && (sub.awardedXp ?? 0) > 0) {
                root.addLedger({
                    type: "adjust",
                    delta: -(sub.awardedXp ?? 0),
                    taskId: task.id,
                    meta: `undo: ${task.title} · ${sub.title}`
                });
            }
            const rest = subs.filter(s => s.id !== subId);
            root.updateTask(task.id, { subtasks: rest });
            root.maybeCompleteParent(Object.assign({}, task, { subtasks: rest }), date);
        });
    }

    function editSubtask(task, subId, patch) {
        const fresh = root.getRow("tasks", task.id) ?? task;
        const date = root.today;
        let subs = (fresh.subtasks ?? []).map(s => Object.assign({}, s));
        const target = subs.find(s => s.id === subId);
        if (!target)
            return;
        if (patch.title !== undefined) {
            const t = patch.title.trim();
            if (t)
                subs = subs.map(s => s.id === subId ? Object.assign({}, s, { title: t }) : s);
        }
        if (patch.xp === null && !Core.subtaskDone(fresh, target, date)) {
            subs = subs.map(s => {
                if (s.id !== subId)
                    return s;
                const copy = Object.assign({}, s);
                delete copy.xp;
                return copy;
            });
        } else if (patch.xp !== undefined && !Core.subtaskDone(fresh, target, date)) {
            const doneAwarded = subs.reduce((sum, s) =>
                sum + (Core.subtaskDone(fresh, s, date) ? (s.awardedXp ?? 0) : 0), 0);
            const otherPins = subs.reduce((sum, s) =>
                s.id !== subId && !Core.subtaskDone(fresh, s, date) && s.xp != null ? sum + s.xp : sum, 0);
            const maxXp = Math.max(0, fresh.points - doneAwarded - otherPins);
            const xpVal = Math.min(maxXp, Math.max(0, Math.round(patch.xp)));
            subs = subs.map(s => s.id === subId ? Object.assign({}, s, { xp: xpVal }) : s);
        }
        root.updateTask(task.id, { subtasks: subs });
    }

    function setSubtasksExpanded(taskId, expanded) {
        const m = Object.assign({}, root.subtasksExpandedIds);
        if (expanded)
            m[taskId] = true;
        else
            delete m[taskId];
        root.subtasksExpandedIds = m;
    }

    function toggleSubtask(task, subId) {
        return root.batch(() => {
            const date = root.today;
            const subs = (task.subtasks ?? []).map(s => Object.assign({}, s));
            const i = subs.findIndex(s => s.id === subId);
            if (i === -1)
                return { checked: false, parentCompleted: false };
            const sub = subs[i];

            if (Core.subtaskDone(task, sub, date)) {
                const wasDone = root.parentDone(task, date);
                if ((sub.awardedXp ?? 0) > 0) {
                    root.addLedger({
                        type: "adjust",
                        delta: -(sub.awardedXp ?? 0),
                        taskId: task.id,
                        meta: `undo: ${task.title} · ${sub.title}`
                    });
                }
                delete subs[i].doneAt;
                delete subs[i].awardedXp;
                root.updateTask(task.id, { subtasks: subs });
                if (wasDone)
                    root.uncompleteParent(task, date);
                return { checked: false, parentCompleted: false };
            }

            const share = Core.subtaskShares(task, date)[subId] ?? 0;
            subs[i].doneAt = Date.now();
            subs[i].awardedXp = share;
            root.updateTask(task.id, { subtasks: subs });
            if (share > 0) {
                root.addLedger({
                    type: Core.completeLedgerType(task.listType),
                    delta: share,
                    taskId: task.id,
                    meta: `${task.title} · ${sub.title}`
                });
            }
            const parentCompleted = root.maybeCompleteParent(
                Object.assign({}, task, { subtasks: subs }), date);
            return { checked: true, parentCompleted: parentCompleted };
        });
    }

    // ---------- Foods & daily log ----------

    function saveFood(input) {
        const food = Object.assign({ id: Core.uid(), createdAt: Date.now() }, input);
        root.putRow("foods", food);
        return food;
    }

    function deleteFood(id) {
        root.deleteRow("foods", id);
    }

    function addDayLog(log) {
        const full = Object.assign({ id: Core.uid(), loggedAt: Date.now() }, log);
        root.putRow("dayLogs", full);
        return full;
    }

    function addFoodLog(input) {
        return root.batch(() => {
            const date = root.today;
            const todays = root.foodLogsToday();
            const prevTotal = todays.reduce((s, l) => s + (l.calories ?? 0), 0);
            const steps = root.db.dayLogs.filter(l => l.kind === "steps" && l.date === date);
            const burnt = steps.reduce((s, l) => s + (l.caloriesBurnt ?? 0), 0);
            const penalty = Core.foodPenalty(prevTotal, prevTotal + input.calories,
                root.settings.calorieLimit + burnt);
            if (penalty > 0) {
                root.addLedger({
                    type: "food_penalty",
                    delta: -penalty,
                    meta: `${input.name} · over limit`
                });
            }
            return root.addDayLog(Object.assign({ kind: "food", date: date, awardedXp: -penalty }, input));
        });
    }

    // Manual burnt-calories entry. Stored as a "steps" day-log (the web's
    // burn-only path) so the food budget and day_logs sync pick it up as-is.
    function addBurntLog(input) {
        return root.addDayLog(Object.assign({
            kind: "steps",
            date: root.today,
            awardedXp: 0
        }, input));
    }

    function latestWeightKg() {
        const all = root.db.dayLogs.filter(l => l.kind === "weight");
        if (all.length === 0)
            return null;
        all.sort((a, b) => b.loggedAt - a.loggedAt);
        return all[0].weightKg ?? null;
    }

    function addWeightLog(weightKg) {
        return root.batch(() => {
            const date = root.today;
            const all = root.db.dayLogs.filter(l => l.kind === "weight")
                .sort((a, b) => b.loggedAt - a.loggedAt);
            const todays = all.find(l => l.date === date);
            const prev = all.find(l => l.date !== date);
            const wxp = prev ? Core.weightLossXp(prev.weightKg ?? 0, weightKg) : 0;

            if (todays && todays.awardedXp !== 0) {
                root.addLedger({ type: "adjust", delta: -todays.awardedXp, meta: "undo log: weight" });
            }
            if (wxp > 0) {
                root.addLedger({
                    type: "weight_log",
                    delta: wxp,
                    meta: `lost ${Math.round(((prev.weightKg ?? 0) - weightKg) * 10) / 10} kg`
                });
            }
            if (todays) {
                root.patchRow("dayLogs", todays.id, { weightKg: weightKg, awardedXp: wxp, loggedAt: Date.now() });
                return root.getRow("dayLogs", todays.id);
            }
            return root.addDayLog({ kind: "weight", date: date, awardedXp: wxp, weightKg: weightKg });
        });
    }

    function deleteDayLog(id) {
        return root.batch(() => {
            const log = root.getRow("dayLogs", id);
            if (!log)
                return;
            if (log.awardedXp !== 0) {
                root.addLedger({
                    type: "adjust",
                    delta: -log.awardedXp,
                    meta: `undo log: ${log.name ?? log.kind}`
                });
            }
            root.deleteRow("dayLogs", id);
        });
    }

    // ---------- Spendings ----------

    /**
     * One purchase: an amount, where it happened, and what it was for.
     * `date` is the local day the money left, kept denormalised alongside
     * `spentAt` so every range query is a string compare and never has to
     * re-derive a local day from a timestamp for thousands of rows.
     *
     * Deliberately outside the ledger: money is not XP, and routing spending
     * through the XP economy would make a grocery run change your level.
     */
    function addSpending(input) {
        const at = input.spentAt ?? Date.now();
        const row = Object.assign({
            id: Core.uid(),
            createdAt: Date.now(),
            currency: root.settings.currency ?? "EUR"
        }, input, {
            amount: Number(input.amount) || 0,
            place: (input.place ?? "").trim(),
            category: input.category ?? "other",
            note: (input.note ?? "").trim(),
            spentAt: at,
            date: input.date ?? Core.localDay(at)
        });
        root.putRow("spendings", row);
        return row;
    }

    function updateSpending(id, patch) {
        const clean = Object.assign({}, patch);
        if (clean.amount !== undefined)
            clean.amount = Number(clean.amount) || 0;
        if (clean.place !== undefined)
            clean.place = String(clean.place).trim();
        if (clean.note !== undefined)
            clean.note = String(clean.note).trim();
        // Moving a spending to another day has to move both stamps together,
        // or the list would show it on the old day and the charts on the new.
        if (clean.date !== undefined && patch.spentAt === undefined) {
            const row = root.getRow("spendings", id);
            const old = new Date(row ? (row.spentAt ?? Date.now()) : Date.now());
            const p = String(clean.date).split("-").map(Number);
            clean.spentAt = new Date(p[0], p[1] - 1, p[2],
                old.getHours(), old.getMinutes(), old.getSeconds()).getTime();
        }
        root.patchRow("spendings", id, clean);
    }

    function deleteSpending(id) {
        root.deleteRow("spendings", id);
    }

    /** Places already visited, most-used first, for the form's quick picks. */
    readonly property var spendPlaces: {
        root.revision;
        return Core.spendPlacesByUsage(root.db.spendings);
    }

    // ---------- Body measurements ----------

    /** Tape sessions, oldest first. One row per day, each site's cm under its id. */
    readonly property var measurements: {
        root.revision;
        return root.db.measurements.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    }

    readonly property var weightLogs: {
        root.revision;
        return root.db.dayLogs.filter(l => l.kind === "weight");
    }

    /**
     * Save some sites for one day. The id is the date, so a second session
     * the same day (or the same day logged on another device) merges into one
     * row instead of making a duplicate point on the chart.
     */
    function saveMeasurements(date, values) {
        const id = `body:${date}`;
        const row = Object.assign({ id: id, date: date, createdAt: Date.now() },
            root.getRow("measurements", id) ?? {}, values);
        root.putRow("measurements", row);
    }

    function deleteMeasurementDay(date) {
        root.deleteRow("measurements", `body:${date}`);
    }

    // ---------- Subscriptions ----------

    /**
     * A recurring charge. The amount is kept in BOTH the currency it is billed
     * in and in euro, together with the rate used and when that rate was read.
     * Converting once at write time is deliberate: charts and history must not
     * silently rewrite what past months cost every time the euro moves, and a
     * row that carries its own rate can still be audited later.
     */
    function addSubscription(input) {
        const currency = input.currency ?? "EUR";
        const amount = Number(input.amount) || 0;
        const row = Object.assign({
            id: Core.uid(),
            createdAt: Date.now(),
            status: "active",
            reminderDays: Core.DEFAULT_REMINDER_DAYS.slice(),
            notified: {},
            note: ""
        }, input, {
            name: (input.name ?? "").trim(),
            amount: amount,
            currency: currency,
            amountEur: GritFx.toEur(amount, currency),
            fxRate: GritFx.rateOf(currency),
            fxAt: Date.now(),
            startDate: input.startDate || root.today
        });
        root.putRow("subscriptions", row);
        return row;
    }

    function updateSubscription(id, patch) {
        const row = root.getRow("subscriptions", id);
        if (!row)
            return;
        const clean = Object.assign({}, patch);
        if (clean.name !== undefined)
            clean.name = String(clean.name).trim();
        // Re-price whenever either half of the price changes, so amountEur can
        // never be left describing a different number than `amount` does.
        if (clean.amount !== undefined || clean.currency !== undefined) {
            const currency = clean.currency ?? row.currency ?? "EUR";
            const amount = Number(clean.amount ?? row.amount) || 0;
            clean.amount = amount;
            clean.currency = currency;
            clean.amountEur = GritFx.toEur(amount, currency);
            clean.fxRate = GritFx.rateOf(currency);
            clean.fxAt = Date.now();
        }
        // Any change to the schedule invalidates which reminders were sent:
        // the dates they referred to no longer exist.
        if (clean.startDate !== undefined || clean.cycle !== undefined
            || clean.trialDays !== undefined || clean.trialThen !== undefined
            || clean.renewalAnchor !== undefined)
            clean.notified = {};
        root.patchRow("subscriptions", id, clean);
    }

    /**
     * Cancelling keeps the row: the history list, the time held and the money
     * spent are all derived from it. `cancelledOn` is a local day because every
     * charge calculation works in days.
     */
    function cancelSubscription(id, onDay) {
        root.patchRow("subscriptions", id, {
            status: "cancelled",
            cancelledOn: onDay || root.today,
            cancelledAt: Date.now()
        });
    }

    function resumeSubscription(id) {
        root.patchRow("subscriptions", id, {
            status: "active",
            cancelledOn: undefined,
            cancelledAt: undefined,
            notified: {}
        });
    }

    function deleteSubscription(id) {
        root.deleteRow("subscriptions", id);
    }

    /** Record that a reminder for `key` went out, so it is never sent twice. */
    function markSubNotified(id, key) {
        const row = root.getRow("subscriptions", id);
        if (!row)
            return;
        const notified = Object.assign({}, row.notified ?? {});
        notified[key] = true;
        root.patchRow("subscriptions", id, { notified: notified });
    }

    // ---------- Focus (Pomodoro) ----------

    function startFocus(focusMin, restMin, label) {
        const session = {
            id: "active",
            phase: "focus",
            startedAt: Date.now(),
            focusMin: focusMin,
            restMin: restMin
        };
        if (label)
            session.label = label;
        root.putRow("focus", session);
    }

    function cancelFocus() {
        root.deleteRow("focus", "active");
    }

    function pauseFocus() {
        const a = root.activeFocus;
        if (!a || a.pausedAt != null)
            return;
        root.patchRow("focus", "active", { pausedAt: Date.now() });
    }

    function resumeFocus() {
        const a = root.activeFocus;
        if (!a || a.pausedAt == null)
            return;
        root.patchRow("focus", "active", {
            startedAt: a.startedAt + (Date.now() - a.pausedAt),
            pausedAt: undefined
        });
    }

    function completeFocusBlock(a, endTs) {
        return root.batch(() => {
            const date = Core.localDay(endTs);
            const base = Core.focusXp(a.focusMin);
            root.addLedger({ type: "focus_log", delta: base, meta: `focus ${a.focusMin}m`, timestamp: endTs });
            const before = root.db.dayLogs.filter(l => l.kind === "focus" && l.date === date).length;
            let bonus = 0;
            if ((before + 1) % Core.FOCUS_SET_SIZE === 0) {
                bonus = Core.FOCUS_SET_XP;
                root.addLedger({
                    type: "focus_log",
                    delta: bonus,
                    meta: `pomodoro set ×${Core.FOCUS_SET_SIZE}`,
                    timestamp: endTs
                });
            }
            const log = {
                id: Core.uid(),
                kind: "focus",
                date: date,
                loggedAt: endTs,
                awardedXp: base + bonus,
                minutes: a.focusMin
            };
            if (a.label)
                log.name = a.label;
            root.putRow("dayLogs", log);
            root.applyFocusMustLinks(date);
            root.awardFocusRanks(endTs);
            return base + bonus;
        });
    }

    function finishFocus(startRest) {
        return root.batch(() => {
            const a = root.activeFocus;
            if (!a || a.phase !== "focus")
                return 0;
            const fxp = root.completeFocusBlock(a, Core.focusPhaseEnd(a));
            if (startRest && a.restMin > 0) {
                root.patchRow("focus", "active", {
                    phase: "rest",
                    startedAt: Date.now(),
                    pausedAt: undefined
                });
            } else {
                root.deleteRow("focus", "active");
            }
            return fxp;
        });
    }

    function continueFocus() {
        const a = root.activeFocus;
        if (!a)
            return;
        root.patchRow("focus", "active", {
            phase: "focus",
            startedAt: Date.now(),
            pausedAt: undefined
        });
    }

    function saveFocusEarly() {
        return root.batch(() => {
            const a = root.activeFocus;
            if (!a || a.phase !== "focus")
                return null;
            const ts = Date.now();
            const elapsedMin = Math.floor(Core.focusElapsedMs(a, ts) / 60000);
            if (elapsedMin < 1)
                return null;
            const fxp = Core.focusXp(elapsedMin);
            if (fxp !== 0) {
                root.addLedger({ type: "focus_log", delta: fxp, meta: `focus ${elapsedMin}m`, timestamp: ts });
            }
            const log = {
                id: Core.uid(),
                kind: "focus",
                date: Core.localDay(ts),
                loggedAt: ts,
                awardedXp: fxp,
                minutes: elapsedMin
            };
            if (a.label)
                log.name = a.label;
            root.putRow("dayLogs", log);
            root.applyFocusMustLinks(log.date);
            root.awardFocusRanks(ts);
            root.deleteRow("focus", "active");
            return log;
        });
    }

    function addFocusTask(name) {
        const n = name.trim();
        if (!n)
            return;
        const s = root.settings;
        if (s.focusTasks.some(t => t.toLowerCase() === n.toLowerCase()))
            return;
        root.updateSettings({ focusTasks: [...s.focusTasks, n] });
    }

    function removeFocusTask(name) {
        root.updateSettings({ focusTasks: root.settings.focusTasks.filter(t => t !== name) });
    }

    // ---------- Focus → Must links ----------

    /**
     * Tick the Must tasks wired to a focus task once the day's focused time on
     * it reaches the threshold. Called only when a focus block is logged, since a
     * standing sweep would re-tick a task the user had deliberately un-checked
     * and there would be no way to keep it undone.
     */
    function applyFocusMustLinks(date) {
        for (const link of Core.FOCUS_MUST_LINKS) {
            if (Core.focusMinutesOn(root.db.dayLogs, date, link.focusTask) < link.minutes)
                continue;
            const task = root.db.tasks.find(t => t.listType === "must" && t.recurrence
                && t.title.trim().toLowerCase() === link.mustTitle.toLowerCase());
            // completeMust is a no-op when it is already done, so a second
            // block on the same day never awards the XP twice.
            if (!task || root.isDoneOn(task, date))
                continue;
            root.completeMust(task, date);
            root.focusMustCompleted(task.title, task.points);
        }
    }

    /**
     * Flatten the level curve from 1.3 to 1.15, once. At 1.3 a level took 16 to
     * 61 days at the measured pace, which is far outside the window any single
     * day can influence. levelGrowth lives in the synced settings row and the
     * web app and TUI both read it from there, so this reaches every client
     * without a deploy. The marker stops it re-applying after a manual change.
     */
    function migrateLevelCurve() {
        const s = root.settings;
        if (s.curveV2)
            return;
        root.updateSettings({ levelGrowth: 1.15, curveV2: true });
        root.lastKnownLevel = Core.computeLevel(Core.lifetimeXp(root.db.ledger),
            1500, 1.15).level;
    }

    /** Keep every linked focus task in the saved chip list. Idempotent. */
    function ensureLinkedFocusTasks() {
        for (const link of Core.FOCUS_MUST_LINKS)
            root.addFocusTask(link.focusTask);
    }


    // ---------- Daily loop: quota, streak, rest days, quests, weekly, shop ----------

    /** Today's target. Recalibrates nightly from the last 14 active days. */
    readonly property int dailyQuota: {
        revision;
        return Core.dailyQuota(root.db.ledger, root.today);
    }
    readonly property real quotaProgress: {
        revision;
        return Core.quotaProgress(root.db.ledger, root.today);
    }
    readonly property bool quotaDone: root.quotaProgress >= root.dailyQuota
    readonly property int streak: {
        revision;
        return Core.streakDays(root.db.ledger, root.today);
    }
    readonly property int restDaysBanked: {
        revision;
        return Core.restDaysBanked(root.db.ledger, root.today);
    }
    readonly property bool restDayUsedToday: {
        revision;
        return Core.restDaysSpent(root.db.ledger).indexOf(root.today) >= 0;
    }
    /** Fresh object per revision: bindings on a mutated-in-place var never notify. */
    readonly property var xpMultiplier: {
        revision;
        return Object.assign({}, Core.xpMultiplier(root.db.ledger, root.today));
    }

    /** Today's three quests, each with its live done/paid state. */
    readonly property var todayQuests: {
        revision;
        const date = root.today;
        return Core.questsFor(date).map(q => ({
            id: q.id,
            label: q.label,
            xp: q.xp,
            done: Core.questDone(q, root.db, date),
            paid: root.db.ledger.some(e => e.id === `q:${date}:${q.id}`)
        }));
    }

    readonly property var weekInfo: {
        revision;
        const monday = Core.mondayOf(root.today);
        return {
            monday: monday,
            progress: Core.weekProgress(root.db.ledger, monday),
            target: Core.weeklyTarget(root.db.ledger, monday),
            reward: Core.weeklyReward(root.db.ledger, monday),
            paid: root.db.ledger.some(e => e.id === `wk:${monday}`)
        };
    }

    /**
     * Pay every quest finished today and close out any finished week. Deduped by
     * ledger id, so it is safe to run on every sweep, and nothing before
     * Core.DAILY_EPOCH is ever paid: the ledger reaches back to June and
     * back-paying it would hand out thousands of XP for days never played.
     */
    function awardDailyLoop() {
        return root.batch(() => {
            const date = root.today;
            if (date < Core.DAILY_EPOCH)
                return;

            for (const q of Core.questsFor(date)) {
                const id = `q:${date}:${q.id}`;
                if (root.db.ledger.some(e => e.id === id))
                    continue;
                if (!Core.questDone(q, root.db, date))
                    continue;
                root.addLedger({ id: id, type: "quest", delta: q.xp, meta: q.label });
                root.questCompleted(q.label, q.xp);
            }

            // The week that just ended, settled once, on or after its Monday+7.
            const lastMonday = Core.addDays(Core.mondayOf(date), -7);
            if (lastMonday >= Core.DAILY_EPOCH) {
                const id = `wk:${lastMonday}`;
                const progress = Core.weekProgress(root.db.ledger, lastMonday);
                const target = Core.weeklyTarget(root.db.ledger, lastMonday);
                if (progress >= target && !root.db.ledger.some(e => e.id === id)) {
                    const reward = Core.weeklyReward(root.db.ledger, lastMonday);
                    root.addLedger({
                        id: id,
                        type: "weekly_goal",
                        delta: reward,
                        meta: `week of ${Core.fmtDay(lastMonday)} · ${progress}/${target} XP`
                    });
                    root.weeklyGoalMet(reward);
                }
            }
        });
    }

    /** Spend a banked rest day on a date, holding the streak across it. */
    function spendRestDay(date) {
        return root.batch(() => {
            const day = date ?? root.today;
            const id = `rest:${day}`;
            if (root.db.ledger.some(e => e.id === id))
                return false;
            if (root.restDaysBanked <= 0)
                return false;
            root.addLedger({
                id: id, type: "rest_day", delta: 0,
                restDate: day, meta: `rest day · ${Core.fmtDay(day)}`
            });
            return true;
        });
    }

    /** No rest day banked: buy one outright. Deliberately expensive. */
    function buyRestDay(date) {
        return root.batch(() => {
            const day = date ?? root.today;
            const id = `rest:${day}`;
            if (root.db.ledger.some(e => e.id === id))
                return false;
            if (root.xp < Core.REST_BUY_COST)
                return false;
            root.addLedger({
                id: id, type: "buyout", delta: -Core.REST_BUY_COST,
                restDate: day, meta: `bought a rest day · ${Core.fmtDay(day)}`
            });
            return true;
        });
    }

    /**
     * Tick a Must off without doing it, for wallet XP. The completion is real so
     * the task stops nagging, but it pays no XP of its own: you already paid.
     */
    function buyMustCompletion(task) {
        return root.batch(() => {
            if (root.xp < Core.MUST_BUY_COST)
                return false;
            const date = root.today;
            if (root.db.completions.some(c => c.taskId === task.id && c.date === date))
                return false;
            root.addLedger({
                id: `mb:${task.id}:${date}`,
                type: "buyout",
                delta: -Core.MUST_BUY_COST,
                taskId: task.id,
                meta: `bought off: ${task.title}`
            });
            root.putRow("completions", {
                id: Core.uid(), taskId: task.id, date: date, completedAt: Date.now()
            });
            return true;
        });
    }

    // ---------- Shop ----------

    readonly property var rewards: {
        revision;
        return root.db.rewards.slice().sort((a, b) => a.cost - b.cost);
    }

    function addReward(name, cost) {
        const n = (name ?? "").trim();
        const c = Math.max(0, Math.round(cost));
        if (n.length === 0 || c <= 0)
            return null;
        const row = { id: Core.uid(), name: n, cost: c, createdAt: Date.now(), bought: 0 };
        root.putRow("rewards", row);
        return row;
    }

    function updateReward(id, patch) {
        root.patchRow("rewards", id, patch);
    }

    function deleteReward(id) {
        root.deleteRow("rewards", id);
    }

    /** Buy a reward: wallet down, level untouched. */
    function buyReward(id) {
        return root.batch(() => {
            const reward = root.getRow("rewards", id);
            if (!reward || root.xp < reward.cost)
                return false;
            root.addLedger({ type: "spend", delta: -reward.cost, meta: reward.name });
            root.patchRow("rewards", id, {
                bought: (reward.bought ?? 0) + 1,
                lastBoughtAt: Date.now()
            });
            root.rewardBought(reward.name, reward.cost);
            return true;
        });
    }

    // ---------- Persistence ----------

    property bool awardingDaily: false
    Timer {
        id: dailyDebounce
        interval: 1200
        repeat: false
        onTriggered: {
            root.awardingDaily = true;
            root.awardDailyLoop();
            root.awardingDaily = false;
        }
    }

    Timer {
        id: saveDebounce
        interval: 300
        repeat: false
        onTriggered: root.save()
    }

    function save() {
        dbFileView.setText(JSON.stringify({ db: root.db, cursors: root.cursors }));
    }

    /** Debounced save, for writes that do not need to hit disk this instant. */
    function saveSoon() {
        saveDebounce.restart();
    }

    Component.onCompleted: {
        Quickshell.execDetached(["mkdir", "-p", FileUtils.trimFileProtocol(root.dbDir)]); // the dir is a file:// URL
    }

    FileView {
        id: dbFileView
        path: Qt.resolvedUrl(root.dbPath)
        onLoaded: {
            try {
                const parsed = JSON.parse(dbFileView.text());
                const fresh = root.db;
                for (const key in fresh) {
                    if (parsed.db && Array.isArray(parsed.db[key]))
                        fresh[key] = parsed.db[key];
                }
                root.db = fresh;
                root.cursors = parsed.cursors ?? {};
            } catch (e) {
                console.log("[GritStore] Failed to parse db:", e);
            }
            Core.invalidateLedger();
            root.lastKnownLevel = Core.computeLevel(Core.lifetimeXp(root.db.ledger),
                root.settings.levelBase, root.settings.levelGrowth).level;
            root.revision++;
            root.loaded = true;
            root.ensureLinkedFocusTasks();
            root.migrateLevelCurve();
        }
        onLoadFailed: error => {
            if (error == FileViewError.FileNotFound) {
                root.lastKnownLevel = 0;
                root.loaded = true;
                root.save();
            }
        }
    }
}
