pragma ComponentBehavior: Bound
import qs
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import QtQuick
import Qt5Compat.GraphicalEffects
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.modules.ii.sidebarLeft
import "../../../services/grit/GritReadings.js" as Readings

/**
 * Grit life-tracker panel, built like the left sidebar "Wall": a full-height
 * strip of bezel joined to the top, left and bottom edges, fillets into the
 * top and bottom edges, a band of wallpaper as thick as Hyprland's outer gap.
 * It grows out of the left edge and goes back in faster; Ctrl+P pins it and
 * keeps the space free. The compositor animation is off for "quickshell:grit"
 * (no_anim), the reveal is drawn here.
 */
Scope {
    id: root

    // Touch the background services so they run from shell start even if the
    // panel is never opened: sync keeps polling, the focus alarm can fire, and
    // the nav ranking is read off disk before anything asks it to sort.
    Component.onCompleted: {
        GritSync.everSynced;
        GritFocusAlarm.armed;
        GritSubsAlarm.armed;
        GritFx.stale; // fetch rates now, so the first conversion is not on a cold cache
        GritNavUsage.loaded;
        GritKeys.mode; // instantiate, so the gritKeys IPC target exists
    }

    // Kept here so they outlive the window, which is made fresh per opening
    property bool pin: false
    function togglePin() {
        root.pin = !root.pin;
    }

    // One width, as on the Wall. Grit's two columns need more than its 440:
    // 620 of content plus the padding around it
    readonly property real pad: UiScale.px(8)
    readonly property real panelW: UiScale.px(620) + 2 * pad

    // Where and whether to show, decided before the window exists. A fresh
    // window is made for every opening, on the monitor under the cursor.
    property var targetScreen: null
    property bool wanted: false

    Connections {
        target: GlobalStates
        function onGritOpenChanged() {
            if (GlobalStates.gritOpen) {
                cursorQuery.running = true;
            } else {
                cursorQuery.running = false;
                root.wanted = false; // the window plays its exit, then unloads
            }
        }
    }
    Process {
        id: cursorQuery
        command: ["hyprctl", "cursorpos", "-j"]
        stdout: StdioCollector {
            onStreamFinished: {
                let sc = null;
                try {
                    const pos = JSON.parse(text);
                    sc = Quickshell.screens.find(s => pos.x >= s.x && pos.x < s.x + s.width && pos.y >= s.y && pos.y < s.y + s.height) ?? null;
                } catch (e) {}
                root.show(sc);
            }
        }
        onExited: code => { if (code !== 0) root.show(null); }
    }
    function show(sc) {
        if (!GlobalStates.gritOpen)
            return;
        const next = sc ?? root.targetScreen ?? Quickshell.screens[0] ?? null;
        if (gritLoader.active && next !== root.targetScreen)
            gritLoader.active = false;
        root.targetScreen = next;
        root.wanted = true;
        gritLoader.active = true;
    }

    Loader {
        id: gritLoader
        active: false

        sourceComponent: PanelWindow {
            id: panelWindow

            screen: root.targetScreen
            visible: true

            // Starts false so the entrance animates on load; a deferred binding
            // then makes it follow `wanted`, and the exit plays out before unload
            property bool shown: false
            Component.onCompleted: {
                if (!root.pin)
                    GlobalFocusGrab.addDismissable(panelWindow);
                Qt.callLater(() => {
                    panelWindow.shown = Qt.binding(() => root.wanted);
                    if (!root.wanted)
                        unloadTimer.restart();
                });
            }
            Component.onDestruction: GlobalFocusGrab.removeDismissable(panelWindow)
            onShownChanged: shown ? unloadTimer.stop() : unloadTimer.restart()
            // Pinned, a click on the desktop leaves it open
            Connections {
                target: root
                function onPinChanged() {
                    if (root.pin)
                        GlobalFocusGrab.removeDismissable(panelWindow);
                    else
                        GlobalFocusGrab.addDismissable(panelWindow);
                }
            }
            Timer {
                id: unloadTimer
                interval: 300 // just past the exit animation
                onTriggered: gritLoader.active = false
            }

            function hide() {
                GlobalStates.gritOpen = false;
            }

            // ---------------- Geometry ----------------
            readonly property real filletSize: Appearance.rounding.screenRounding // never scaled
            readonly property real gap: Appearance.sizes.hyprlandGapsOut // never scaled
            readonly property real panelW: root.panelW

            // Grows out of the left edge, leaves faster with no bounce
            property real rw: shown ? 1 : 0
            Behavior on rw {
                NumberAnimation {
                    duration: panelWindow.shown ? 440 : 220
                    easing.type: panelWindow.shown ? Easing.OutBack : Easing.InCubic
                    easing.overshoot: 1.3
                }
            }
            // The rows come in after the body, one by one, each out of the edge
            property real contentT: shown ? 1 : 0
            Behavior on contentT {
                NumberAnimation { duration: panelWindow.shown ? 820 : 140; easing.type: Easing.OutCubic }
            }
            readonly property real bodyW: rw * panelW

            exclusionMode: ExclusionMode.Ignore
            exclusiveZone: 0
            // Room for the overshoot and the fillets with their band
            implicitWidth: Math.ceil(panelW * 1.12) + filletSize + gap
            WlrLayershell.namespace: "quickshell:grit"
            WlrLayershell.keyboardFocus: GlobalStates.gritOpen ? WlrKeyboardFocus.OnDemand : WlrKeyboardFocus.None
            color: "transparent"

            anchors {
                top: true
                left: true
                bottom: true
            }

            mask: Region {
                item: bodyClip
            }

            Connections {
                target: GlobalFocusGrab
                function onDismissed() {
                    panelWindow.hide();
                }
            }

            // ---------------- The wallpaper band ----------------
            // The wallpaper exactly as the Background layer draws it (the
            // window sits at the screen origin), cut down to the grown outline
            readonly property var wallpaperGeometry: BackgroundBridge.wallpapers[panelWindow.screen?.name ?? ""] ?? null
            Item {
                anchors.fill: parent
                visible: panelWindow.bodyW > 0.5 && panelWindow.wallpaperGeometry !== null
                Item {
                    anchors.fill: parent
                    Rectangle {
                        anchors.fill: parent
                        color: panelWindow.wallpaperGeometry?.color ?? "#000000"
                    }
                    Image {
                        x: panelWindow.wallpaperGeometry?.x ?? 0
                        y: panelWindow.wallpaperGeometry?.y ?? 0
                        width: panelWindow.wallpaperGeometry?.width ?? parent.width
                        height: panelWindow.wallpaperGeometry?.height ?? parent.height
                        source: panelWindow.wallpaperGeometry?.source ?? ""
                        sourceSize: Qt.size(width, height)
                        fillMode: Image.PreserveAspectCrop
                        asynchronous: true
                        cache: true
                    }
                }
                layer.enabled: true
                layer.effect: OpacityMask { maskSource: bandShape }
            }
            // The band's outline stays visible, kept off screen by hideSource
            Item {
                id: bandShape
                anchors.fill: parent
                WallParts.WallShape {
                    width: parent.width
                    height: parent.height
                    bodyW: panelWindow.bodyW
                    fillet: panelWindow.filletSize
                    grow: panelWindow.gap
                    fill: "white"
                }
            }
            ShaderEffectSource {
                sourceItem: bandShape
                hideSource: true
                width: 0
                height: 0
            }

            // ---------------- The wall itself ----------------
            WallParts.WallShape {
                width: parent.width
                height: parent.height
                bodyW: panelWindow.bodyW
                fillet: panelWindow.filletSize
                fill: GritColors.ink
            }

            // The content rides the moving edge
            Item {
                id: bodyClip
                width: panelWindow.bodyW
                height: parent.height
                clip: true

                Item {
                    id: gritBackground
                    x: panelWindow.bodyW - panelWindow.panelW + root.pad
                    y: root.pad
                    width: panelWindow.panelW - 2 * root.pad
                    height: parent.height - 2 * root.pad

                    focus: GlobalStates.gritOpen

                    // INSERT is any text editor holding active focus. Duck-typed on
                    // cursorPosition, which every TextInput/TextEdit/TextField has,
                    // so new fields are covered without registration.
                    readonly property Item panelFocusItem: Window.activeFocusItem
                    Binding {
                        target: GritKeys
                        property: "insertActive"
                        value: !!(gritBackground.panelFocusItem
                            && gritBackground.panelFocusItem.cursorPosition !== undefined)
                    }

                    // The vim layer gets first refusal; an unconsumed Escape keeps
                    // its old meaning and closes the panel. Escape in INSERT only
                    // leaves the field (fields with their own Escape handling, like
                    // the card title editors, never let the event bubble this far).
                    Keys.onPressed: event => {
                        if (event.key === Qt.Key_Escape && GritKeys.insertActive) {
                            gritBackground.forceActiveFocus();
                            event.accepted = true;
                            return;
                        }
                        // Ctrl+P pins, as on the Wall
                        if (event.key === Qt.Key_P && (event.modifiers & Qt.ControlModifier)) {
                            root.togglePin();
                            event.accepted = true;
                            return;
                        }
                        if (GritKeys.handleKey(event.key, event.text)) {
                            event.accepted = true;
                            return;
                        }
                        if (event.key === Qt.Key_Escape) {
                            panelWindow.hide();
                            event.accepted = true;
                        }
                    }

                    GritContent {
                        anchors.fill: parent
                        t: panelWindow.contentT
                        pinned: root.pin
                        onPinToggled: root.togglePin()
                    }
                }
            }
        }
    }

    // Pinned: the space is kept free, windows tile beside the panel
    PanelWindow {
        visible: root.pin && GlobalStates.gritOpen
        screen: root.targetScreen
        exclusiveZone: root.panelW
        implicitWidth: 1
        color: "transparent"
        mask: Region {}
        WlrLayershell.namespace: "quickshell:gritReserve"
        anchors {
            top: true
            left: true
            bottom: true
        }
    }

    IpcHandler {
        target: "grit"

        function toggle(): void {
            GlobalStates.gritOpen = !GlobalStates.gritOpen;
        }
        function open(): void {
            GlobalStates.gritOpen = true;
        }
        function close(): void {
            GlobalStates.gritOpen = false;
        }
        function view(name: string): void {
            GlobalStates.gritView = name;
            GlobalStates.gritOpen = true;
        }
        // Open the reading overlay for whatever text a title maps to
        function read(title: string): string {
            const reading = Readings.readingFor(title);
            if (!reading)
                return "unknown";
            GritRead.open(reading);
            return "ok";
        }
        function closeRead(): void {
            GritRead.close();
        }
        function startFocus(focusMin: int, restMin: int): void {
            GritStore.startFocus(focusMin, restMin);
            GritSounds.play("focusStart");
        }

        // ---- Loy voice assistant -------------------------------------
        // Loy reads db.json directly for everything else, but a focus
        // session is live in-memory state, so it has to go through here.

        // The focus task names, so Loy can match what was spoken against
        // what actually exists instead of guessing.
        function focusTasks(): string {
            return JSON.stringify(GritStore.settings.focusTasks ?? []);
        }

        // Start a session on a NAMED focus task. Returns a status string
        // rather than failing silently, because Loy has to say out loud
        // what happened: "unknown" is what triggers the offer to create it.
        function startFocusTask(label: string, focusMin: int, restMin: int): string {
            const tasks = GritStore.settings.focusTasks ?? [];
            const found = tasks.find(t => t.toLowerCase() === String(label).toLowerCase());
            if (!found)
                return "unknown";
            if (GritStore.activeFocus)
                return "busy";
            GritStore.startFocus(focusMin, restMin, found);
            GritSounds.play("focusStart");
            // Point the panel at Focus for when it IS opened, but do not open
            // it: a session started by voice is reported by Loy's own notch,
            // and throwing a full-width panel over the screen is not what
            // "start a timer" should do to whatever you were looking at.
            GlobalStates.gritView = "focus";
            return "ok:" + found;
        }

        function addFocusTask(name: string): string {
            GritStore.addFocusTask(name);
            return "ok";
        }

        function removeFocusTask(name: string): string {
            GritStore.removeFocusTask(name);
            return "ok";
        }

        // Whether something is already running, so Loy does not stomp a
        // session that is halfway through.
        function focusStatus(): string {
            const a = GritStore.activeFocus;
            if (!a)
                return "idle";
            return JSON.stringify({
                label: a.label ?? "",
                phase: a.phase,
                focusMin: a.focusMin,
                restMin: a.restMin,
                startedAt: a.startedAt,
                // null while running. Loy freezes its countdown on this
                // rather than guessing, so a pause from the panel and a
                // pause by voice look identical in the notch.
                pausedAt: a.pausedAt ?? null
            });
        }

        // Returns what actually happened, so Loy can say "already paused"
        // instead of claiming it did something it did not.
        function pauseFocus(): string {
            const a = GritStore.activeFocus;
            if (!a)
                return "idle";
            if (a.pausedAt)
                return "already";
            GritStore.pauseFocus();
            return "ok";
        }

        function resumeFocus(): string {
            const a = GritStore.activeFocus;
            if (!a)
                return "idle";
            if (!a.pausedAt)
                return "already";
            GritStore.resumeFocus();
            return "ok";
        }
        function cancelFocus(): void {
            GritStore.cancelFocus();
        }
        // Check the next unchecked subtask of a task, by task title.
        // Used by job-application automation:
        // qs -c ii ipc call grit completeNextSubtask "Apply for 10 jobs"
        function completeNextSubtask(taskTitle: string): string {
            const wanted = taskTitle.trim().toLowerCase();
            const task = GritStore.db.tasks.find(t => !t.archived && (t.title ?? "").trim().toLowerCase() === wanted);
            if (!task)
                return "task not found: " + taskTitle;
            const subs = task.subtasks ?? [];
            const next = subs.find(s => !GritStore.subtaskDone(task, s));
            if (!next)
                return "all subtasks already done: " + taskTitle;
            const res = GritStore.toggleSubtask(task, next.id);
            return "checked subtask '" + next.title + "'" + (res.parentCompleted ? " (task completed!)" : "");
        }
    }

    GlobalShortcut {
        name: "gritToggle"
        description: "Toggles the Grit life tracker panel"

        onPressed: {
            GlobalStates.gritOpen = !GlobalStates.gritOpen;
        }
    }
}
