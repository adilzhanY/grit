pragma Singleton

import QtQuick
import Quickshell

/**
 * Transient confirmation pill shown over the Grit panel. Any component calls
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
        interval: 1600
        onTriggered: root.shown = false
    }
}
