pragma Singleton

import QtQuick
import Quickshell

/**
 * State for the full-screen reading overlay. A task card calls open() with an
 * entry from GritReadings.js; GritReader draws it centred on the focused
 * screen and calls close().
 */
Singleton {
    id: root

    property var reading: null
    readonly property bool shown: root.reading !== null
    // Reader-only text scale, so the panel's own type stays untouched
    property real fontScale: 1.0

    function open(reading) {
        if (!reading)
            return;
        root.reading = reading;
    }

    function close() {
        root.reading = null;
    }

    function bigger() {
        root.fontScale = Math.min(2.0, root.fontScale + 0.1);
    }

    function smaller() {
        root.fontScale = Math.max(0.6, root.fontScale - 0.1);
    }

    function resetSize() {
        root.fontScale = 1.0;
    }
}
