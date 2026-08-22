pragma ComponentBehavior: Bound
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import Quickshell
import QtQuick
import QtQuick.Layouts
import "../../../services/grit/GritCore.js" as Core

/**
 * One full-width task row: To-Do-style outlined circle toggle, title, XP
 * chip, hover actions, and an expandable subtask section.
 */
Rectangle {
    id: root

    property var task: ({})
    property bool dimmed: false
    property bool compact: false
    // Stored in GritStore so it survives delegate recreation on revision bumps
    readonly property bool subtasksExpanded: !!GritStore.subtasksExpandedIds[task?.id ?? ""]
    // Recurring done/toggle apply to this day instead of today (Planned view)
    property string forDay: ""

    readonly property string day: forDay !== "" ? forDay : GritStore.today
    readonly property bool done: {
        GritStore.revision;
        return task && task.id ? GritStore.isDoneOn(root.task, root.day) : false;
    }
    readonly property var subtasks: task?.subtasks ?? []
    readonly property bool hovered: cardHover.hovered
    // ---- Vim layer. Planned cards carry their day in the id, so a command
    // lands on exactly the card that was focused, never a twin on another day.
    readonly property string cardId: (task?.id ?? "")
        + (forDay !== "" ? `|${forDay}` : "")
    readonly property bool kbFocused: cardId !== "" && GritKeys.focusedCardId === cardId
    readonly property string jumpLetter: GritKeys.mode === "hint"
        ? (GritKeys.jumpLetters[cardId] ?? "") : ""
    // Repeats on specific weekdays → shown prominently inside the card
    readonly property bool hasSpecificDays: !!(task?.recurrence
        && task.recurrence.type === "weekly"
        && (task.recurrence.weekdays?.length ?? 0) > 0)

    implicitHeight: cardColumn.implicitHeight + 16
    radius: Appearance.rounding.normal
    color: root.hovered || root.kbFocused ? Appearance.colors.colLayer1Hover : Appearance.colors.colLayer1
    border.width: 1
    border.color: root.kbFocused ? Appearance.colors.colPrimary : Appearance.colors.colLayer0Border
    opacity: dimmed ? 0.55 : 1

    Behavior on color {
        ColorAnimation { duration: Appearance.animation.elementMoveFast.duration }
    }
    Behavior on implicitHeight {
        animation: Appearance.animation.elementMoveFast.numberAnimation.createObject(this)
    }

    HoverHandler {
        id: cardHover
    }

    // f-mode jump letter, drawn over the toggle circle
    GritHintKey {
        z: 10
        visible: root.jumpLetter !== ""
        letter: root.jumpLetter
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.margins: 11
    }

    // Keyboard commands, same code paths as the mouse handlers
    Connections {
        target: GritKeys
        enabled: root.cardId !== ""
        function onCardCommand(cardId, cmd) {
            if (cardId !== root.cardId)
                return;
            switch (cmd) {
            case "toggle": {
                const wasDone = root.done;
                GritStore.toggleDone(root.task, root.day);
                if (!wasDone)
                    GritSounds.play(root.task.listType === "impossible" ? "epic"
                        : root.task.listType === "cool" ? "cool" : "good");
                break;
            }
            case "edit":
                GritEdit.open(root.task);
                break;
            case "myday":
                if (!root.compact)
                    GritStore.updateTask(root.task.id, { starredMyDay: !root.task.starredMyDay });
                break;
            case "subtasks":
                if (!root.compact && (root.task?.listType ?? "") !== "bad")
                    GritStore.setSubtasksExpanded(root.task.id, !root.subtasksExpanded);
                break;
            case "copy": {
                const title = root.task?.title ?? "";
                Quickshell.clipboardText = title;
                GritToast.show(Translation.tr("Copied \"%1\"").arg(title));
                break;
            }
            case "delete": {
                const taskId = root.task.id;
                GritConfirm.ask(
                    Translation.tr("Delete task?"),
                    root.task?.title ?? "",
                    () => GritStore.deleteTask(taskId));
                break;
            }
            }
        }
    }

    ColumnLayout {
        id: cardColumn
        anchors {
            left: parent.left
            right: parent.right
            top: parent.top
            margins: 8
        }
        spacing: 4

        RowLayout {
            Layout.fillWidth: true
            spacing: 10

            // Complete toggle: plain outlined circle, like the To Do mockup
            MouseArea {
                id: toggleArea
                implicitWidth: 24
                implicitHeight: 24
                cursorShape: Qt.PointingHandCursor
                hoverEnabled: true
                onClicked: {
                    const wasDone = root.done;
                    GritStore.toggleDone(root.task, root.day);
                    if (!wasDone)
                        GritSounds.play(root.task.listType === "impossible" ? "epic"
                            : root.task.listType === "cool" ? "cool" : "good");
                }

                Rectangle {
                    anchors.centerIn: parent
                    width: 20
                    height: 20
                    radius: 10
                    color: root.done ? Appearance.colors.colPrimary : "transparent"
                    border.width: 2
                    border.color: root.done ? Appearance.colors.colPrimary
                        : toggleArea.containsMouse ? Appearance.colors.colOnLayer1 : Appearance.colors.colOutline

                    Behavior on color {
                        ColorAnimation { duration: Appearance.animation.elementMoveFast.duration }
                    }
                    Behavior on border.color {
                        ColorAnimation { duration: Appearance.animation.elementMoveFast.duration }
                    }

                    // Check preview on hover, solid when done
                    MaterialSymbol {
                        anchors.centerIn: parent
                        visible: root.done || toggleArea.containsMouse
                        text: "check"
                        iconSize: 14
                        color: root.done ? Appearance.colors.colOnPrimary : Appearance.colors.colOutline
                    }
                    // Focused-card mnemonic: x toggles
                    Text {
                        anchors.centerIn: parent
                        visible: root.kbFocused && !root.done && !toggleArea.containsMouse
                        text: "x"
                        font.family: Appearance.font.family.monospace
                        font.pixelSize: 12
                        font.weight: Font.Bold
                        color: Appearance.colors.colPrimary
                    }
                }
            }

            // Title + meta
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 0

                Item {
                    Layout.fillWidth: true
                    implicitHeight: titleEditing ? titleEditor.implicitHeight : titleText.implicitHeight
                    property bool titleEditing: false

                    GritText {
                        id: titleText
                        anchors.left: parent.left
                        anchors.right: parent.right
                        visible: !parent.titleEditing
                        text: root.task?.title ?? ""
                        font.pixelSize: Appearance.font.pixelSize.small
                        font.strikeout: root.done
                        color: Appearance.colors.colOnLayer1
                        wrapMode: Text.Wrap

                        MouseArea {
                            anchors.fill: parent
                            onDoubleClicked: {
                                titleEditor.text = root.task.title;
                                titleText.parent.titleEditing = true;
                                titleEditor.forceActiveFocus();
                            }
                        }
                    }
                    GritTextInput {
                        id: titleEditor
                        anchors.left: parent.left
                        anchors.right: parent.right
                        visible: parent.titleEditing
                        font.pixelSize: Appearance.font.pixelSize.small
                        color: Appearance.colors.colOnLayer1
                        onEditingFinished: {
                            if (text.trim().length > 0)
                                GritStore.updateTask(root.task.id, { title: text.trim() });
                            parent.titleEditing = false;
                        }
                        Keys.onEscapePressed: parent.titleEditing = false
                    }
                }

                // Weekly-on-specific-days schedule, prominent (shows even in
                // compact/Planned cards)
                GritText {
                    Layout.fillWidth: true
                    visible: root.hasSpecificDays
                    text: Core.recurrenceLabel(root.task)
                    font.pixelSize: Appearance.font.pixelSize.normal
                    color: Appearance.colors.colPrimary
                    wrapMode: Text.Wrap
                }

                GritText {
                    Layout.fillWidth: true
                    visible: text.length > 0 && !root.compact
                    text: {
                        GritStore.revision;
                        const parts = [];
                        if (root.task?.recurrence) {
                            // Weekly-specific schedules already shown above
                            if (!root.hasSpecificDays)
                                parts.push(Core.recurrenceLabel(root.task));
                        } else if (root.task?.plannedFor) {
                            parts.push(Core.fmtDay(root.task.plannedFor));
                        }
                        if (root.subtasks.length > 0) {
                            const doneCount = root.subtasks.filter(s => Core.subtaskDone(root.task, s, GritStore.today)).length;
                            parts.push(`${doneCount}/${root.subtasks.length}`);
                        }
                        // Musts that tick themselves off focus time show how
                        // much of the threshold is left, until they're done
                        const link = root.done ? null : Core.focusMustLinkFor(root.task?.title);
                        if (link) {
                            const mins = Core.focusMinutesOn(GritStore.db.dayLogs, root.day, link.focusTask);
                            parts.push(Translation.tr("%1 %2/%3m").arg(link.focusTask).arg(mins).arg(link.minutes));
                        }
                        return parts.join(" · ");
                    }
                    font.pixelSize: Appearance.font.pixelSize.smallest
                    color: Appearance.colors.colSubtext
                    elide: Text.ElideRight
                }
            }

            // Hover actions, also out while keyboard-focused (with mnemonics)
            RowLayout {
                spacing: 0
                visible: root.hovered || root.kbFocused

                CardIconButton {
                    visible: !root.compact
                    iconName: "wb_sunny"
                    hintKey: "w"
                    active: !!root.task?.starredMyDay
                    onClicked: GritStore.updateTask(root.task.id, { starredMyDay: !root.task.starredMyDay })
                }
                CardIconButton {
                    visible: !root.compact
                    iconName: "star"
                    active: !!root.task?.important
                    onClicked: GritStore.updateTask(root.task.id, { important: !root.task.important })
                }
                CardIconButton {
                    visible: !root.compact && (root.task?.listType ?? "") !== "bad"
                    iconName: "account_tree"
                    hintKey: "o"
                    active: root.subtasksExpanded
                    onClicked: GritStore.setSubtasksExpanded(root.task.id, !root.subtasksExpanded)
                }
                // Buy a Must off for wallet XP. Only worth offering on a Must
                // that is still open, and only when you can actually afford it.
                CardIconButton {
                    visible: !root.compact && (root.task?.listType ?? "") === "must"
                        && GritStore.xp >= Core.MUST_BUY_COST
                    iconName: "paid"
                    onClicked: {
                        const task = root.task;
                        GritConfirm.ask(
                            Translation.tr("Buy off \"%1\"?").arg(task.title),
                            Translation.tr("%1 XP from your wallet. It ticks off and pays nothing, but your quota and streak survive.")
                                .arg(Core.MUST_BUY_COST),
                            () => {
                                if (GritStore.buyMustCompletion(task))
                                    GritToast.show(Translation.tr("Bought off: %1").arg(task.title), "paid");
                            });
                    }
                }
                CardIconButton {
                    iconName: "content_copy"
                    hintKey: "y"
                    onClicked: {
                        const title = root.task?.title ?? "";
                        Quickshell.clipboardText = title;
                        GritToast.show(Translation.tr("Copied \"%1\"").arg(title));
                    }
                }
                CardIconButton {
                    visible: !root.compact
                    iconName: "edit"
                    hintKey: "e"
                    onClicked: GritEdit.open(root.task)
                }
                CardIconButton {
                    visible: !root.compact
                    iconName: "delete"
                    hintKey: "d"
                    onClicked: {
                        const taskId = root.task.id;
                        GritConfirm.ask(
                            Translation.tr("Delete task?"),
                            root.task?.title ?? "",
                            () => GritStore.deleteTask(taskId));
                    }
                }
            }

            // XP chip
            Rectangle {
                radius: Appearance.rounding.full
                color: Appearance.colors.colSecondaryContainer
                implicitWidth: xpText.implicitWidth + 16
                implicitHeight: xpText.implicitHeight + 6

                GritText {
                    id: xpText
                    anchors.centerIn: parent
                    text: `${root.task?.points ?? 0}`
                    font.pixelSize: Appearance.font.pixelSize.normal
                    font.features: { "tnum": 1 }
                    font.variableAxes: { "wght": 700, "ROND": 100 }
                    color: Appearance.colors.colOnSecondaryContainer
                }
            }
        }

        // Subtasks (expanded)
        ColumnLayout {
            Layout.fillWidth: true
            Layout.leftMargin: 34
            visible: root.subtasksExpanded
            spacing: 2

            Repeater {
                model: root.subtasksExpanded ? root.subtasks : []
                delegate: RowLayout {
                    id: subRow
                    required property var modelData
                    Layout.fillWidth: true
                    Layout.topMargin: 2
                    spacing: 10

                    readonly property bool subDone: {
                        GritStore.revision;
                        return Core.subtaskDone(root.task, modelData, GritStore.today);
                    }

                    MouseArea {
                        id: subToggleArea
                        implicitWidth: 24
                        implicitHeight: 24
                        cursorShape: Qt.PointingHandCursor
                        hoverEnabled: true
                        onClicked: {
                            const result = GritStore.toggleSubtask(root.task, subRow.modelData.id);
                            if (result.checked)
                                GritSounds.play(result.parentCompleted ? "cool" : "good");
                        }
                        Rectangle {
                            anchors.centerIn: parent
                            width: 20
                            height: 20
                            radius: 10
                            color: subRow.subDone ? Appearance.colors.colPrimary : "transparent"
                            border.width: 2
                            border.color: subRow.subDone ? Appearance.colors.colPrimary
                                : subToggleArea.containsMouse ? Appearance.colors.colOnLayer1 : Appearance.colors.colOutline

                            MaterialSymbol {
                                anchors.centerIn: parent
                                visible: subRow.subDone || subToggleArea.containsMouse
                                text: "check"
                                iconSize: 14
                                color: subRow.subDone ? Appearance.colors.colOnPrimary : Appearance.colors.colOutline
                            }
                        }
                    }
                    Item {
                        Layout.fillWidth: true
                        implicitHeight: subEditing ? subTitleEditor.implicitHeight : subTitleText.implicitHeight
                        property bool subEditing: false

                        GritText {
                            id: subTitleText
                            anchors.left: parent.left
                            anchors.right: parent.right
                            visible: !parent.subEditing
                            text: subRow.modelData.title
                            font.pixelSize: Appearance.font.pixelSize.small
                            font.strikeout: subRow.subDone
                            color: Appearance.colors.colOnLayer1
                            wrapMode: Text.Wrap

                            MouseArea {
                                anchors.fill: parent
                                onDoubleClicked: {
                                    subTitleEditor.text = subRow.modelData.title;
                                    subTitleText.parent.subEditing = true;
                                    subTitleEditor.forceActiveFocus();
                                }
                            }
                        }
                        GritTextInput {
                            id: subTitleEditor
                            anchors.left: parent.left
                            anchors.right: parent.right
                            visible: parent.subEditing
                            font.pixelSize: Appearance.font.pixelSize.small
                            color: Appearance.colors.colOnLayer1
                            onEditingFinished: {
                                if (text.trim().length > 0)
                                    GritStore.editSubtask(root.task, subRow.modelData.id, { title: text.trim() });
                                parent.subEditing = false;
                            }
                            Keys.onEscapePressed: parent.subEditing = false
                        }
                    }
                    Rectangle {
                        radius: Appearance.rounding.full
                        color: Appearance.colors.colSecondaryContainer
                        implicitWidth: subXpText.implicitWidth + 12
                        implicitHeight: subXpText.implicitHeight + 4

                        GritText {
                            id: subXpText
                            anchors.centerIn: parent
                            text: {
                                GritStore.revision;
                                const shares = Core.subtaskShares(root.task, GritStore.today);
                                return `${shares[subRow.modelData.id] ?? 0}`;
                            }
                            font.pixelSize: Appearance.font.pixelSize.smallest
                            color: Appearance.colors.colOnSecondaryContainer
                        }
                    }
                    CardIconButton {
                        iconName: "edit"
                        onClicked: GritEdit.openSubtask(root.task, subRow.modelData)
                    }
                    CardIconButton {
                        iconName: "close"
                        onClicked: {
                            const parentTask = root.task;
                            const subId = subRow.modelData.id;
                            GritConfirm.ask(
                                Translation.tr("Delete step?"),
                                subRow.modelData.title,
                                () => GritStore.deleteSubtask(parentTask, subId));
                        }
                    }
                }
            }

            // Add subtask
            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 2
                spacing: 10

                MaterialSymbol {
                    Layout.leftMargin: 2
                    text: "add"
                    iconSize: Appearance.font.pixelSize.larger
                    color: Appearance.colors.colSubtext
                }
                GritTextInput {
                    id: newSubtaskField
                    Layout.fillWidth: true
                    font.pixelSize: Appearance.font.pixelSize.small
                    color: Appearance.colors.colOnLayer1
                    onAccepted: {
                        if (text.trim().length > 0) {
                            GritStore.addSubtask(root.task, text);
                            text = "";
                        }
                    }
                    GritText {
                        anchors.fill: parent
                        visible: newSubtaskField.text.length === 0
                        text: Translation.tr("Add step…")
                        font.pixelSize: Appearance.font.pixelSize.small
                        color: Appearance.colors.colSubtext
                    }
                }
            }
        }
    }

    component CardIconButton: RippleButton {
        id: iconBtn
        property string iconName: ""
        property bool active: false
        property int size: 16
        property string hintKey: ""
        // While the card holds keyboard focus, the glyph gives way to its key
        readonly property bool showHint: root.kbFocused && iconBtn.hintKey !== ""
        implicitWidth: size + 10
        implicitHeight: size + 10
        buttonRadius: Appearance.rounding.full
        contentItem: Item {
            MaterialSymbol {
                anchors.centerIn: parent
                visible: !iconBtn.showHint
                horizontalAlignment: Text.AlignHCenter
                text: iconBtn.iconName
                iconSize: iconBtn.size
                fill: iconBtn.active ? 1 : 0
                color: iconBtn.active ? Appearance.colors.colPrimary : Appearance.colors.colSubtext
            }
            Text {
                anchors.centerIn: parent
                visible: iconBtn.showHint
                text: iconBtn.hintKey
                font.family: Appearance.font.family.monospace
                font.pixelSize: iconBtn.size - 3
                font.weight: Font.Bold
                color: Appearance.colors.colPrimary
            }
        }
    }
}
