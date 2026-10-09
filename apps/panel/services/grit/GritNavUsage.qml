pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import qs
import qs.modules.common
import qs.modules.common.functions

/**
 * How often each Grit view actually gets *edited*, so the nav rail can float
 * the busy tabs to the top instead of holding one hand-written order forever.
 *
 * Local-only and deliberately outside GritStore. This is desktop UI state: it
 * would be noise in the synced settings row the web app and the TUI also read,
 * and routing it through the store would bump `revision` (a full recompute of
 * every derived property in the app) every time a checkbox moved.
 *
 * Scores halve every HALF_LIFE, so "often" means lately. A tab you lived in
 * last month slides behind the one you are working in this week, but never
 * snaps to zero, so a week off does not wipe what the rail learned.
 */
Singleton {
    id: root

    readonly property real halfLifeMs: 14 * 24 * 60 * 60 * 1000

    /** viewId -> { score, at }. `at` is when `score` was last brought current. */
    property var usage: ({})
    property bool loaded: false

    readonly property string dir: Directories.state + "/user/grit"
    readonly property string path: dir + "/nav-usage.json"

    /** A stored score, aged forward to `now`. */
    function decayed(entry, now) {
        if (!entry)
            return 0;
        const score = entry.score ?? 0;
        const dt = now - (entry.at ?? now);
        if (!(dt > 0))
            return score;
        return score * Math.pow(0.5, dt / root.halfLifeMs);
    }

    function scoreOf(viewId, now) {
        return root.decayed(root.usage[viewId], now ?? Date.now());
    }

    /** One edit landed in `viewId`. */
    function record(viewId) {
        if (!root.loaded || !viewId)
            return;
        const now = Date.now();
        const next = Object.assign({}, root.usage);
        next[viewId] = { score: root.decayed(next[viewId], now) + 1, at: now };
        root.usage = next;
        saveDebounce.restart();
    }

    /**
     * Every score aged to one instant. The rail sorts on a snapshot rather than
     * live values so the list cannot reshuffle under the pointer mid-click.
     */
    function snapshot() {
        const now = Date.now();
        const out = ({});
        for (const id in root.usage)
            out[id] = root.decayed(root.usage[id], now);
        return out;
    }

    /** Drop a view's history, for when its list is deleted. */
    function forget(viewId) {
        if (root.usage[viewId] === undefined)
            return;
        const next = Object.assign({}, root.usage);
        delete next[viewId];
        root.usage = next;
        saveDebounce.restart();
    }

    function reset() {
        root.usage = ({});
        saveDebounce.restart();
    }

    // Any local mutation counts as an edit to whatever view is on screen.
    // Gated on the panel being open because the background sweeps (milestone
    // payouts, daily quests) fire localChange too, and crediting those to
    // whichever tab happened to be showing would rank views nobody touched.
    Connections {
        target: GritStore
        function onLocalChange() {
            if (GlobalStates.gritOpen)
                root.record(GlobalStates.gritView);
        }
    }

    // ---------- Persistence ----------

    Timer {
        id: saveDebounce
        interval: 400
        repeat: false
        onTriggered: root.save()
    }

    function save() {
        usageFileView.setText(JSON.stringify({ usage: root.usage }));
    }

    Component.onCompleted: {
        Quickshell.execDetached(["mkdir", "-p", FileUtils.trimFileProtocol(root.dir)]); // the dir is a file:// URL
    }

    FileView {
        id: usageFileView
        path: Qt.resolvedUrl(root.path)
        onLoaded: {
            try {
                const parsed = JSON.parse(usageFileView.text());
                root.usage = parsed.usage ?? ({});
            } catch (e) {
                console.log("[GritNavUsage] Failed to parse usage:", e);
            }
            root.loaded = true;
        }
        onLoadFailed: error => {
            if (error == FileViewError.FileNotFound)
                root.loaded = true;
        }
    }
}
