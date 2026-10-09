pragma Singleton
pragma ComponentBehavior: Bound

import qs
import qs.services
import qs.modules.common
import qs.modules.common.models
import qs.modules.iris
import QtQuick
import Quickshell
import Quickshell.Wayland
import "GritCore.js" as Core
import "GritQuickLogic.js" as Logic

/**
 * Grit inside the Super launcher (modules/spotlight). rows(query) returns
 * launcher results:
 *   while typing: saved foods to log, open list tasks (every list but Bad) to
 *     mark done, focus tasks to start as a Deep 50/10 block;
 *   during a focus session: its controls (pause, save early, cancel, take
 *     rest...) with the live timer, shown even before anything is typed.
 * Every action confirms with a toast in the middle of the screen. Ranking and
 * session states live in GritQuickLogic.js, which is unit tested.
 */
Singleton {
    id: root

    // The launcher's monitor, so the toast appears where the user looked
    property var hostScreen: null

    // ---------------- Session state ----------------

    readonly property var session: GritStore.activeFocus
    property real nowTick: Date.now()
    Timer {
        interval: 1000
        running: root.session !== null && GlobalStates.overviewOpen
        repeat: true
        triggeredOnStart: true
        onTriggered: root.nowTick = Date.now()
    }

    readonly property bool paused: Logic.isPaused(root.session)
    readonly property bool phaseOver: root.session !== null && Core.focusElapsed(root.session, root.nowTick)
    readonly property string mode: Logic.resolveMode(root.session, root.phaseOver)
    readonly property string sessionLabel: root.session?.label ?? Translation.tr("Focus")

    readonly property string timeText: {
        if (!root.session)
            return "";
        const s = Math.floor(Core.focusRemainingMs(root.session, root.nowTick) / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const pad = n => String(n).padStart(2, "0");
        return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
    }

    // Subtitle of every session row, ticking with the timer
    readonly property string statusText: {
        const a = root.session;
        switch (root.mode) {
        case "focus":
            return (root.paused ? Translation.tr("Grit · paused · %1 left") : Translation.tr("Grit · focusing · %1 left")).arg(root.timeText);
        case "focusDone":
            return Translation.tr("Grit · focus done · %1 waiting").arg(root.xpText(Core.focusXp(a.focusMin)));
        case "rest":
            return (root.paused ? Translation.tr("Grit · rest paused · %1 left") : Translation.tr("Grit · resting · %1 left")).arg(root.timeText);
        case "restDone":
            return Translation.tr("Grit · rest is over");
        }
        return "";
    }

    // Tasks that can be logged: every list but Bad, not done yet (a repeating
    // Must task counts as done once it is done today)
    function openTasks() {
        const lists = {};
        for (const l of GritStore.customLists)
            lists[l.id] = l.name;
        const names = { must: Translation.tr("Must"), cool: Translation.tr("Cool"), impossible: Translation.tr("Impossible") };
        return GritStore.db.tasks
            .filter(t => t.listType !== "bad" && !t.archived && !GritStore.isDoneToday(t))
            .map(t => ({ task: t, listName: t.listType === "custom" ? (lists[t.listId] ?? Translation.tr("List")) : (names[t.listType] ?? Translation.tr("Task")) }));
    }

    function xpText(xp) {
        const n = Math.round(xp ?? 0);
        return n >= 0 ? `+${n} XP` : `${n} XP`;
    }

    // ---------------- Rows for the launcher ----------------

    function hasLauncherPrefix(query) {
        const p = Config.options?.search?.prefix ?? {};
        return [p.action, p.app, p.clipboard, p.emojis, p.math, p.shellCommand, p.webSearch]
            .some(x => x && query.startsWith(x));
    }

    function rows(query) {
        GritStore.revision; // re-run when Grit's data changes
        const q = String(query ?? "");
        // Prefixed queries (clipboard, emoji, math, shell, web) are not ours
        if (root.hasLauncherPrefix(q))
            return [];
        const out = [];

        if (root.mode !== "search") {
            // Session controls: all of them before typing, then the ones whose
            // name or the session's task matches
            const typed = q.trim().length > 0;
            for (const action of Logic.actionsFor(root.mode, root.session)) {
                const label = Translation.tr(action.label);
                if (typed && Logic.scoreMatch(label, q) < 0 && Logic.scoreMatch(root.sessionLabel, q) < 0
                        && Logic.scoreMatch(Translation.tr("Focus"), q) < 0)
                    continue;
                out.push(resultComp.createObject(null, {
                    name: `${label} · ${root.sessionLabel}`,
                    type: Qt.binding(() => root.statusText),
                    iconName: action.icon,
                    iconType: LauncherSearchResult.IconType.Material,
                    execute: () => root.run(action.id)
                }));
            }
        }

        if (q.trim().length === 0)
            return out;

        for (const item of Logic.search(q, GritStore.foods, GritStore.settings.focusTasks, 6, root.openTasks())) {
            // One block at a time: starting a second session is not offered
            if (item.type === "focus" && root.session)
                continue;
            out.push(resultComp.createObject(null, {
                name: item.name,
                type: item.type === "food"
                    ? Translation.tr("Grit · log food · %1 kcal").arg(Math.round(item.food.calories ?? 0))
                    : item.type === "task"
                    ? Translation.tr("Grit · %1 · mark done · %2").arg(item.listName).arg(root.xpText(item.task.points ?? 0))
                    : Translation.tr("Grit · start focus 50/10"),
                iconName: item.type === "food" ? "restaurant" : item.type === "task" ? "check_circle" : "timer",
                iconType: LauncherSearchResult.IconType.Material,
                execute: () => root.activate(item)
            }));
        }
        return out;
    }

    Component {
        id: resultComp
        LauncherSearchResult {}
    }

    // ---------------- Actions ----------------

    function activate(item) {
        if (item.type === "task") {
            const t = item.task;
            GritStore.toggleDone(t);
            GritSounds.play(t.listType === "impossible" ? "epic" : t.listType === "cool" ? "cool" : "good");
            root.toast(Translation.tr("%1 done · %2").arg(item.name).arg(root.xpText(t.points ?? 0)), "check_circle");
            return;
        }

        if (item.type === "food") {
            const f = item.food;
            const log = GritStore.addFoodLog({
                name: f.name,
                calories: f.calories,
                protein: f.protein,
                carbs: f.carbs,
                fat: f.fat
            });
            let message = Translation.tr("%1 logged · %2 kcal").arg(f.name).arg(Math.round(f.calories ?? 0));
            if ((log?.awardedXp ?? 0) < 0)
                message += " · " + Translation.tr("over limit %1").arg(root.xpText(log.awardedXp));
            root.toast(message, "restaurant");
            return;
        }

        // A session can start between showing the row and pressing Enter
        // (from the bar, the panel or Loy). Never stomp it.
        if (GritStore.activeFocus) {
            root.toast(Translation.tr("A focus session is already running"), "timer");
            return;
        }
        GritStore.startFocus(50, 10, item.name);
        GritSounds.play("focusStart");
        root.toast(Translation.tr("%1 · 50/10 started").arg(item.name), "timer");
    }

    function run(actionId) {
        const a = root.session;
        if (!a)
            return;
        const label = root.sessionLabel;

        switch (actionId) {
        case "pause":
            GritStore.pauseFocus();
            root.toast(Translation.tr("%1 paused").arg(label), "pause");
            return;
        case "resume":
            GritStore.resumeFocus();
            root.toast(Translation.tr("%1 resumed").arg(label), "play_arrow");
            return;
        case "saveEarly": {
            const log = GritStore.saveFocusEarly();
            if (log) {
                GritSounds.play("focusEnd");
                root.toast(Translation.tr("%1 saved · %2 min · %3").arg(label).arg(log.minutes).arg(root.xpText(log.awardedXp)), "check");
            } else {
                // saveFocusEarly logs nothing under one minute; the block keeps running
                root.toast(Translation.tr("Under a minute, nothing to save yet"), "hourglass_empty");
            }
            return;
        }
        case "cancel":
            GritStore.cancelFocus();
            root.toast(a.phase === "rest" ? Translation.tr("Session ended") : Translation.tr("%1 cancelled").arg(label), "close");
            return;
        case "takeRest": {
            const xp = GritStore.finishFocus(true);
            root.toast(Translation.tr("%1 saved · %2 · %3 min rest").arg(label).arg(root.xpText(xp)).arg(a.restMin), "coffee");
            return;
        }
        case "save": {
            const xp = GritStore.finishFocus(false);
            root.toast(Translation.tr("%1 saved · %2 min · %3").arg(label).arg(a.focusMin).arg(root.xpText(xp)), "check");
            return;
        }
        case "goOn": {
            // Log the finished block, then start the next one right away with
            // the same length, rest and task
            const xp = GritStore.finishFocus(false);
            GritStore.startFocus(a.focusMin, a.restMin, a.label);
            GritSounds.play("focusStart");
            root.toast(Translation.tr("%1 · next %2 min block started").arg(root.xpText(xp)).arg(a.focusMin), "fast_forward");
            return;
        }
        case "skipRest":
        case "keepGoing":
            GritStore.continueFocus();
            GritSounds.play("focusStart");
            root.toast(Translation.tr("%1 started").arg(label), "timer");
            return;
        }
    }

    // ---------------- Toast ----------------

    property string toastMessage: ""
    property string toastIcon: "check"
    property bool toastShown: false
    // Keeps the toast window alive while the pill fades out
    property bool toastHeld: false
    property var toastScreen: null

    function toast(message, icon) {
        root.toastMessage = message;
        root.toastIcon = icon ?? "check";
        root.toastScreen = root.hostScreen ?? Quickshell.screens[0];
        root.toastHeld = true;
        root.toastShown = true;
        toastReleaseTimer.stop();
        toastTimer.restart();
    }

    Timer {
        id: toastTimer
        interval: Iris.toastDuration
        onTriggered: {
            root.toastShown = false;
            toastReleaseTimer.restart();
        }
    }
    Timer {
        id: toastReleaseTimer
        interval: 400
        onTriggered: root.toastHeld = false
    }

    Loader {
        id: toastLoader
        active: root.toastHeld

        sourceComponent: PanelWindow {
            id: toastWindow
            screen: root.toastScreen
            visible: toastLoader.active

            exclusionMode: ExclusionMode.Ignore
            exclusiveZone: 0
            WlrLayershell.namespace: "quickshell:gritToast"
            WlrLayershell.layer: WlrLayer.Overlay
            WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
            color: "transparent"
            // Only the pill takes input, the rest of the screen stays clickable
            mask: Region {
                item: toastPill
            }

            anchors {
                top: true
                left: true
                right: true
                bottom: true
            }

            // Set after the first frame, so the pill animates in instead of
            // appearing at full opacity
            property bool live: false
            Component.onCompleted: live = true

            Item {
                anchors.centerIn: parent
                width: parent.width - UiScale.px(80)
                height: UiScale.px(80)

                IrisToast {
                    id: toastPill
                    bottomMargin: UiScale.px(20)
                    icon: root.toastIcon
                    text: toastWindow.live && root.toastShown ? root.toastMessage : ""
                }
            }
        }
    }
}
