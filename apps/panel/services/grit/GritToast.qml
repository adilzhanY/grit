pragma Singleton

import QtQuick
import Quickshell
import qs.modules.iris

/**
 * Transient confirmation line shown over the Grit panel (an IrisToast). Any component calls
 * show(message[, icon]); GritContent draws it and the timer here takes it back
 * down, so repeated calls just extend the same pill.
 */
Singleton {
    id: root

    property string message: ""
    property string iconName: "check"
    property bool shown: false

    function show(message, iconName) {
        root.message = message;
        root.iconName = iconName ?? "check";
        root.shown = true;
        hideTimer.restart();
    }

    Timer {
        id: hideTimer
        interval: Iris.toastDuration
        onTriggered: root.shown = false
    }
}
