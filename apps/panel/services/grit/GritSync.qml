pragma Singleton

import QtQuick
import Quickshell
import qs
import qs.modules.common
import "GritCore.js" as Core

/**
 * Delta sync between GritStore and Supabase, ported from the web app's
 * sync.ts. Last-write-wins per row; push local rows dirtied since the push
 * cursor (device clock), pull rows past the pull cursor (server clock),
 * tombstones carry deletes. The append-only ledger makes real conflicts rare.
 */
Singleton {
    id: root

    property bool syncing: false
    property real lastSyncAt: 0
    property string errorMessage: ""
    property bool everSynced: false

    // local table -> remote table
    readonly property var remoteNames: ({
        tasks: "tasks", completions: "completions", ledger: "ledger",
        settings: "settings", lists: "lists", foods: "foods",
        dayLogs: "day_logs", focus: "focus", spendings: "spendings",
        subscriptions: "subscriptions", measurements: "measurements"
    })
    readonly property var tableList: ["tasks", "completions", "ledger", "settings", "lists", "foods", "dayLogs", "focus", "spendings", "subscriptions", "measurements"]

    /**
     * Tables the server does not have yet. A table added to the app before its
     * SQL is applied used to abort the whole cycle on the first 404, which took
     * every other table's sync down with it. Now the missing one is skipped and
     * named, and the push cursor is held back (see below) so nothing written
     * during the gap is lost once the table finally appears.
     */
    property var missingTables: []

    function noteMissing(name) {
        if (root.missingTables.indexOf(name) < 0)
            root.missingTables = root.missingTables.concat([name]);
    }

    /** PostgREST answers 404 (PGRST205) for a table that is not in its schema cache. */
    function isMissingTable(status) {
        return status === 404;
    }

    // Largest epoch-ms a Date can represent; guards cursor corruption (see web sync.ts)
    readonly property real maxTs: 8.64e15

    function cursorGet(key) {
        const n = Number(GritStore.cursors[key] ?? 0);
        return (isFinite(n) && n >= 0 && n <= root.maxTs) ? n : 0;
    }

    function cursorSet(key, ms) {
        const c = GritStore.cursors;
        c[key] = ms;
        GritStore.cursors = c;
        // Debounced: this fires two or three times a cycle and each save is a
        // stringify of the whole database. A cursor lost to a crash only costs
        // one redundant push or pull, which both sides already tolerate.
        GritStore.saveSoon();
    }

    function resetCursors() {
        const uid = GritApi.userId;
        root.cursorSet(`push.${uid}`, 0);
        root.cursorSet(`pull.${uid}`, 0);
    }

    // ---------- The sync cycle ----------

    function sync() {
        if (!GritApi.loggedIn || !GritStore.loaded || root.syncing)
            return;
        root.syncing = true;
        root.errorMessage = "";
        root.missingTables = [];

        const userId = GritApi.userId;
        const pushSince = root.cursorGet(`push.${userId}`);
        const startedAt = Date.now();

        // Backfill missing updatedAt + clamp future stamps (clock-skew repair),
        // suppressed so values are written verbatim.
        GritStore.suppress = true;
        try {
            for (const name of root.tableList) {
                for (const row of GritStore.db[name]) {
                    if (row.updatedAt === undefined || row.updatedAt > startedAt)
                        row.updatedAt = startedAt;
                }
            }
        } finally {
            GritStore.suppress = false;
        }

        const steps = [];

        // ---- Push dirty rows per table ----
        for (const name of root.tableList) {
            steps.push(next => {
                const dirty = GritStore.db[name].filter(r => (r.updatedAt ?? 0) > pushSince);
                if (dirty.length === 0)
                    return next(null);
                const payload = dirty.map(r => ({
                    id: String(r.id),
                    user_id: userId,
                    data: r,
                    updated_at: new Date(r.updatedAt ?? Date.now()).toISOString(),
                    deleted: false
                }));
                GritApi.upsert(root.remoteNames[name], payload, (status, resp) => {
                    if (root.isMissingTable(status)) {
                        root.noteMissing(name);
                        return next(null);
                    }
                    next(status >= 200 && status < 300 ? null : `push ${name}: HTTP ${status}`);
                });
            });
        }

        // ---- Push tombstones per table ----
        for (const name of root.tableList) {
            steps.push(next => {
                const tombs = GritStore.db.tombstones.filter(t => t.table === name && t.updatedAt > pushSince);
                if (tombs.length === 0)
                    return next(null);
                const payload = tombs.map(t => ({
                    id: String(t.id),
                    user_id: userId,
                    data: {},
                    updated_at: new Date(t.updatedAt).toISOString(),
                    deleted: true
                }));
                GritApi.upsert(root.remoteNames[name], payload, (status, resp) => {
                    if (root.isMissingTable(status)) {
                        root.noteMissing(name);
                        return next(null);
                    }
                    next(status >= 200 && status < 300 ? null : `push tombstones ${name}: HTTP ${status}`);
                });
            });
        }

        // ---- Advance the push cursor, then pull ----
        let pullSince = 0;
        let maxSeen = 0;
        steps.push(next => {
            // Holding the cursor back while a table is missing means every dirty
            // row is offered again next cycle. Upserts are idempotent, so the
            // only cost is bandwidth until the schema catches up, and the gain
            // is that no local write is silently dropped from sync.
            if (root.missingTables.length === 0)
                root.cursorSet(`push.${userId}`, startedAt);
            pullSince = root.cursorGet(`pull.${userId}`);
            maxSeen = pullSince;
            next(null);
        });

        for (const name of root.tableList) {
            steps.push(next => {
                GritApi.pullSince(root.remoteNames[name], new Date(pullSince).toISOString(), (status, rows) => {
                    if (root.isMissingTable(status)) {
                        root.noteMissing(name);
                        return next(null);
                    }
                    if (status !== 200)
                        return next(`pull ${name}: HTTP ${status}`);
                    if (!rows || rows.length === 0)
                        return next(null);
                    GritStore.suppress = true;
                    GritStore.beginBatch();
                    try {
                        for (const row of rows) {
                            const remoteMs = new Date(row.updated_at).getTime();
                            if (isFinite(remoteMs) && remoteMs > maxSeen && remoteMs <= root.maxTs)
                                maxSeen = remoteMs;
                            if (row.deleted) {
                                GritStore.deleteRow(name, row.id);
                                continue;
                            }
                            const existing = GritStore.getRow(name, row.id);
                            // Keep our copy only if we hold an unpushed local edit
                            const locallyDirty = !!existing && (existing.updatedAt ?? 0) > pushSince;
                            if (!locallyDirty) {
                                // Stamp with OUR cycle-start time (device clock domain)
                                const applied = Object.assign({}, row.data, { updatedAt: startedAt });
                                GritStore.putRow(name, applied);
                            }
                        }
                    } finally {
                        // endBatch first, so the single coalesced recompute still
                        // runs under suppress, exactly as each per-row one did.
                        GritStore.endBatch();
                        GritStore.suppress = false;
                    }
                    next(null);
                });
            });
        }

        root.runSteps(steps, err => {
            if (err) {
                root.errorMessage = err;
                console.log("[GritSync]", err);
            } else {
                root.cursorSet(`pull.${userId}`, Math.max(pullSince, maxSeen));
                root.lastSyncAt = Date.now();
                root.everSynced = true;
                if (root.missingTables.length > 0) {
                    root.errorMessage = `No cloud table yet: ${root.missingTables.join(", ")}. ` +
                        `Run supabase/schema.sql.`;
                }
            }
            root.syncing = false;
        });
    }

    /** Run async steps sequentially; abort on first error. */
    function runSteps(steps, done) {
        let i = 0;
        function nextStep(err) {
            if (err)
                return done(err);
            if (i >= steps.length)
                return done(null);
            const step = steps[i++];
            step(nextStep);
        }
        nextStep(null);
    }

    // ---------- Triggers ----------

    Connections {
        target: GritApi
        function onSignedIn() {
            root.sync();
        }
    }

    // Debounced push after local mutations (mirrors the web app's 700ms)
    Timer {
        id: changeDebounce
        interval: 700
        repeat: false
        onTriggered: root.sync()
    }

    Connections {
        target: GritStore
        function onLocalChange() {
            if (GritApi.loggedIn)
                changeDebounce.restart();
        }
    }

    // Pull poll: fast while the panel is open, relaxed otherwise
    Timer {
        interval: GlobalStates.gritOpen ? 10000 : 60000
        running: GritApi.loggedIn && GritStore.loaded
        repeat: true
        onTriggered: root.sync()
    }

    Connections {
        target: GlobalStates
        function onGritOpenChanged() {
            if (GlobalStates.gritOpen)
                root.sync();
        }
    }
}
