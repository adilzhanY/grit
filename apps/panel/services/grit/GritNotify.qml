pragma Singleton

import QtQuick
import Quickshell

/**
 * One place that knows how a Grit desktop notification identifies itself.
 *
 * Every notification carries the bare Aperture mark, the same drawing as the
 * one beside the word in the panel (GritLogo at its small size: blades reach
 * half way, heavier rim). Not the phone's icon tile: the notification notch is
 * always black, so the light mark on its own reads cleanly there.
 */
Singleton {
    id: root

    /**
     * `notify-send -i` takes a filesystem path or an icon-theme name, not a
     * URL, so the file:// prefix comes off. The SVG sits next to this file and
     * the whole services/grit directory is symlinked into the shell, so the
     * icon travels with the repo and needs no install step. Its stroke is
     * white, fixed, because the notch never turns light.
     */
    readonly property string iconPath:
        Qt.resolvedUrl("grit-mark.svg").toString().replace(/^file:\/\//, "")

    /**
     * The head of every notification command. Spread it at the call site:
     *
     *     [...GritNotify.base, "-t", "6000", title, body]
     */
    readonly property var base: ["notify-send", "-a", "Grit", "-i", root.iconPath]
}
