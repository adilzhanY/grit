pragma Singleton

import QtQuick
import Quickshell

/**
 * Shared edit-task flow: any card calls open(task); GritContent hosts the
 * dialog (name + XP reward, or slip penalty for bad habits).
 * openSubtask(task, sub) reuses the same dialog to edit a step's name and
 * pinned XP.
 */
Singleton {
    id: root

    property var task: null
    property var subtask: null
    property bool show: false

    function open(task) {
        root.task = task;
        root.subtask = null;
        root.show = true;
    }

    function openSubtask(task, sub) {
        root.task = task;
        root.subtask = sub;
        root.show = true;
    }

    function close() {
        root.show = false;
        root.task = null;
        root.subtask = null;
    }
}
