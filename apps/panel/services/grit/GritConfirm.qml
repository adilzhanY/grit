pragma Singleton

import QtQuick
import Quickshell

/**
 * Shared confirmation flow for destructive actions. Any component calls
 * ask(title, message, callback[, confirmLabel]); GritContent hosts the
 * dialog and calls accept() / dismiss().
 */
Singleton {
    id: root

    property bool show: false
    property string title: ""
    property string message: ""
    property string confirmLabel: ""
    property var callback: null

    function ask(title, message, callback, confirmLabel) {
        root.title = title;
        root.message = message;
        root.callback = callback;
        root.confirmLabel = confirmLabel ?? "";
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
