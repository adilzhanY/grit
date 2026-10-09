pragma Singleton

import QtQuick
import Quickshell
import qs.modules.iris

/**
 * Grit's palette names, every value read from the Iris palette
 * (modules/iris/Iris.qml), so Grit has no palette of its own.
 */
Singleton {
    readonly property color ink: Iris.ink
    readonly property color well: Iris.well
    readonly property color raised: Iris.raised
    readonly property color raisedHover: Iris.raisedHover
    readonly property color raisedActive: Iris.raisedActive
    readonly property color divider: Iris.divider
    readonly property color hoverRow: Iris.hover
    readonly property color fg: Iris.fg
    readonly property color fg2: Iris.fg2
    readonly property color fg3: Iris.fg3
    readonly property color danger: Iris.danger
    // Series for charts: white down to dark grey, far enough apart to tell
    readonly property var series: Iris.series
}
