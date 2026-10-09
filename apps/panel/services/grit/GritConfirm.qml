pragma Singleton

import QtQuick
import Quickshell

/**
 * Shared confirmation flow for destructive actions. Any component calls
 * ask(title, message, callback[, confirmLabel[, danger]]); GritContent hosts
 * the sheet and calls accept() / dismiss(). `danger` (default true) makes the
 * confirm the red pill; pass false for a purchase or anything not destructive.
 */
Singleton {
    id: root

    property bool show: false
    property string title: ""
    property string message: ""
    property string confirmLabel: ""
    property bool danger: true
    property var callback: null

    function ask(title, message, callback, confirmLabel, danger) {
        root.title = title;
        root.message = message;
        root.callback = callback;
        root.confirmLabel = confirmLabel ?? "";
        root.danger = danger ?? true;
        root.show = true;
    }

    function accept() {
        const cb = root.callback;
        root.callback = null;
        root.show = false;
        if (cb)
            cb();
    }

    function dismiss() {
        root.callback = null;
        root.show = false;
    }
}
