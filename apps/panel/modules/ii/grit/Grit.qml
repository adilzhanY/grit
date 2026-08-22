pragma ComponentBehavior: Bound
import qs
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland

/**
 * Grit life-tracker panel: slides in from the top edge (full width, ~25% of
 * screen height), same recipe as the left/right sidebars. The slide/fade is
 * a hyprland layerrule on the "quickshell:grit" namespace.
 */
Scope {
    id: root

    // Touch the background services so they run from shell start even if the
    // panel is never opened: sync keeps polling, the focus alarm can fire, and
    // the nav ranking is read off disk before anything asks it to sort.
    Component.onCompleted: {
        GritSync.everSynced;
        GritFocusAlarm.armed;
        GritNavUsage.loaded;
        GritKeys.mode; // instantiate, so the gritKeys IPC target exists
    }

    Connections {
        target: GlobalStates
        function onGritOpenChanged() {
            if (GlobalStates.gritOpen)
                gritLoader.active = true;
            // closing is handled inside the panel: exit animation, then unload
        }
    }

    Loader {
        id: gritLoader
        active: false

        sourceComponent: PanelWindow {
            id: panelWindow

            visible: true

            // Drives the macOS-style enter/exit choreography. Starts false so
            // the entrance animates on load; a deferred binding then makes it
            // track gritOpen, and the exit plays out before the loader unloads.
            property bool shown: false
            Component.onCompleted: Qt.callLater(() => {
                panelWindow.shown = Qt.binding(() => GlobalStates.gritOpen);
            })
            onShownChanged: shown ? unloadTimer.stop() : unloadTimer.restart()

            Timer {
                id: unloadTimer
                interval: 320 // just past the exit animation
                onTriggered: gritLoader.active = false
            }

            function hide() {
                GlobalStates.gritOpen = false;
            }

            exclusionMode: ExclusionMode.Ignore
            exclusiveZone: 0
            implicitWidth: 620 + Appearance.sizes.elevationMargin
            WlrLayershell.namespace: "quickshell:grit"
            WlrLayershell.keyboardFocus: WlrKeyboardFocus.OnDemand
            color: "transparent"

            anchors {
                top: true
                left: true
                bottom: true
            }

            mask: Region {
                item: gritBackground
            }

            HyprlandFocusGrab {
                id: grab
                windows: [panelWindow]
                active: GlobalStates.gritOpen
                onCleared: {
                    if (!active)
                        panelWindow.hide();
                }
            }

            StyledRectangularShadow {
                target: gritBackground
            }

            Rectangle {
                id: gritBackground
                anchors {
                    top: parent.top
                    bottom: parent.bottom
                    topMargin: Appearance.sizes.hyprlandGapsOut
                    bottomMargin: Appearance.sizes.hyprlandGapsOut
                }
                width: parent.width - Appearance.sizes.hyprlandGapsOut - Appearance.sizes.elevationMargin

                // macOS-style choreography: springy slide-in from the left edge
                // with a glass "materialize" (fade + subtle scale), accelerating
                // slide-out on close. Springs calibrated against Apple presets.
                x: -(width + Appearance.sizes.elevationMargin) // hidden (off-screen)
                opacity: 0
                scale: 0.98
                transformOrigin: Item.Left
                states: State {
                    name: "shown"
                    when: panelWindow.shown
                    PropertyChanges {
                        target: gritBackground
                        x: Appearance.sizes.hyprlandGapsOut
                        opacity: 1
                        scale: 1
                    }
                }
                transitions: [
                    Transition {
                        to: "shown"
                        SpringAnimation { properties: "x"; spring: 2.8; damping: 0.40; epsilon: 0.5; mass: 1 }
                        NumberAnimation { properties: "opacity"; duration: 180; easing.type: Easing.OutQuad }
                        NumberAnimation { properties: "scale"; duration: 260; easing.type: Easing.OutQuad }
                    },
                    Transition {
                        from: "shown"
                        NumberAnimation { properties: "x"; duration: 240; easing.type: Easing.InCubic }
                        NumberAnimation { properties: "opacity"; duration: 200; easing.type: Easing.InQuad }
                        NumberAnimation { properties: "scale"; duration: 200; easing.type: Easing.InQuad }
                    }
                ]
                color: Appearance.colors.colLayer0
                border.width: 1
                border.color: Appearance.colors.colLayer0Border
                radius: Appearance.rounding.screenRounding - Appearance.sizes.hyprlandGapsOut + 1

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
                }
            }
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
        function startFocus(focusMin: int, restMin: int): void {
            GritStore.startFocus(focusMin, restMin);
            GritSounds.play("focusStart");
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
