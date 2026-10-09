pragma ComponentBehavior: Bound
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import qs.modules.iris
import Quickshell
import QtQuick
import QtQuick.Layouts
import "../../../services/grit/GritCore.js" as Core
import "../../../services/grit/GritReadings.js" as Readings

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
    // Tasks that carry a text to read out loud get a persistent eye button
    readonly property var reading: Readings.readingFor(task?.title ?? "")
    readonly property bool hasSpecificDays: !!(task?.recurrence
        && task.recurrence.type === "weekly"
        && (task.recurrence.weekdays?.length ?? 0) > 0)

    implicitHeight: cardColumn.implicitHeight + UiScale.px(20)
    radius: Iris.radiusCard
    color: root.hovered || root.kbFocused ? Iris.raisedHover : Iris.raised
    // The one Iris focus ring while the keyboard is on this card
    border.width: root.kbFocused ? Iris.focusRingWidth : 0
    border.color: Iris.focusRingColor
    opacity: root.dimmed || root.done ? 0.5 : 1

    Behavior on color {
        ColorAnimation { duration: Iris.colorDuration }
    }
    Behavior on opacity {
        NumberAnimation { duration: 240; easing.type: Easing.OutCubic }
    }
    // Subtasks opening and closing settle with a little give
    Behavior on implicitHeight {
        SpringAnimation { spring: 3.2; damping: 0.42; epsilon: 0.25 }
    }

    HoverHandler {
        id: cardHover
    }

    // f-mode jump letter, drawn over the toggle circle
    IrisKeycap {
        z: 10
        visible: root.jumpLetter !== ""
        variant: "on"
        mono: true
        text: root.jumpLetter
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.margins: UiScale.px(14)
    }

    // Keyboard commands, same code paths as the mouse handlers
    Connections {
        target: GritKeys
        enabled: root.cardId !== ""
        function onCardCommand(cardId, cmd) {
            if (cardId !== root.cardId)
                return;
            switch (cmd) {
            case "toggle":
                doneCheck.toggle();
                break;
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
            topMargin: UiScale.px(10)
            leftMargin: UiScale.px(12)
            rightMargin: UiScale.px(12)
        }
        spacing: UiScale.px(6)

        RowLayout {
            Layout.fillWidth: true
            spacing: UiScale.px(12)

            // Complete toggle: a ring that fills white with a black check
            IrisCheck {
                id: doneCheck
                checked: root.done
                // Focused-card mnemonic: x toggles
                hint: root.kbFocused ? "x" : ""
                onToggled: {
                    const wasDone = root.done;
                    GritStore.toggleDone(root.task, root.day);
                    if (!wasDone)
                        GritSounds.play(root.task.listType === "impossible" ? "epic"
                            : root.task.listType === "cool" ? "cool" : "good");
                }
            }

            // Title + meta
            ColumnLayout {
                Layout.fillWidth: true
                spacing: UiScale.px(2)

                Item {
                    Layout.fillWidth: true
                    implicitHeight: titleEditing ? titleEditor.implicitHeight : titleText.implicitHeight
                    property bool titleEditing: false

                    IrisText {
                        id: titleText
                        anchors.left: parent.left
                        anchors.right: parent.right
                        visible: !parent.titleEditing
                        text: root.task?.title ?? ""
                        role: "label"
                        font.strikeout: root.done
                        wrapMode: Text.Wrap
                        elide: Text.ElideNone

                        MouseArea {
                            anchors.fill: parent
                            onDoubleClicked: {
                                titleEditor.text = root.task.title;
                                titleText.parent.titleEditing = true;
                                titleEditor.forceActiveFocus();
                            }
                        }
                    }
                    TextInput {
                        id: titleEditor
                        anchors.left: parent.left
                        anchors.right: parent.right
                        visible: parent.titleEditing
                        clip: true
                        font.family: Iris.fontFamily
                        font.pixelSize: Appearance.font.pixelSize.small
                        renderType: Appearance.font.renderType
                        color: Iris.fg
                        selectionColor: Iris.selection
                        selectedTextColor: Iris.fg
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
                IrisText {
                    Layout.fillWidth: true
                    visible: root.hasSpecificDays
                    text: Core.recurrenceLabel(root.task)
                    role: "secondary"
                    font.weight: Font.DemiBold
                    wrapMode: Text.Wrap
                    elide: Text.ElideNone
                }

                IrisText {
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
                        return parts.join("  ·  ");
                    }
                    role: "caption"
                    font.features: { "tnum": 1 }
                }
            }

            // Reading: always out, since it is the point of the task
            CardIconButton {
                visible: !!root.reading
                iconName: "visibility"
                onClicked: GritRead.open(root.reading)
            }

            // Hover actions, also out while keyboard-focused (with mnemonics)
            RowLayout {
                spacing: UiScale.px(4)
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
                            }, Translation.tr("Buy off"), false);
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

            // XP: a white chip, the reward; a dark well once it is earned
            IrisChip {
                on: !root.done
                text: `${root.task?.points ?? 0}`
            }
        }

        // Subtasks (expanded)
        ColumnLayout {
            Layout.fillWidth: true
            Layout.leftMargin: doneCheck.implicitWidth + UiScale.px(12)
            Layout.bottomMargin: UiScale.px(2)
            visible: root.subtasksExpanded
            spacing: UiScale.px(4)

            Repeater {
                model: root.subtasksExpanded ? root.subtasks : []
                delegate: RowLayout {
                    id: subRow
                    required property var modelData
                    Layout.fillWidth: true
                    spacing: UiScale.px(10)

                    readonly property bool subDone: {
                        GritStore.revision;
                        return Core.subtaskDone(root.task, modelData, GritStore.today);
                    }

                    IrisCheck {
                        size: UiScale.px(20)
                        checked: subRow.subDone
                        onToggled: {
                            const result = GritStore.toggleSubtask(root.task, subRow.modelData.id);
                            if (result.checked)
                                GritSounds.play(result.parentCompleted ? "cool" : "good");
                        }
                    }
                    Item {
                        Layout.fillWidth: true
                        implicitHeight: subEditing ? subTitleEditor.implicitHeight : subTitleText.implicitHeight
                        property bool subEditing: false

                        IrisText {
                            id: subTitleText
                            anchors.left: parent.left
                            anchors.right: parent.right
                            visible: !parent.subEditing
                            text: subRow.modelData.title
                            role: "secondary"
                            font.strikeout: subRow.subDone
                            color: subRow.subDone ? Iris.fg3 : Iris.fg2
                            wrapMode: Text.Wrap
                            elide: Text.ElideNone

                            Behavior on color {
                                ColorAnimation { duration: Iris.colorDuration }
                            }

                            MouseArea {
                                anchors.fill: parent
                                onDoubleClicked: {
                                    subTitleEditor.text = subRow.modelData.title;
                                    subTitleText.parent.subEditing = true;
                                    subTitleEditor.forceActiveFocus();
                                }
                            }
                        }
                        TextInput {
                            id: subTitleEditor
                            anchors.left: parent.left
                            anchors.right: parent.right
                            visible: parent.subEditing
                            clip: true
                            font.family: Iris.fontFamily
                            font.pixelSize: Appearance.font.pixelSize.smaller
                            renderType: Appearance.font.renderType
                            color: Iris.fg
                            selectionColor: Iris.selection
                            selectedTextColor: Iris.fg
                            onEditingFinished: {
                                if (text.trim().length > 0)
                                    GritStore.editSubtask(root.task, subRow.modelData.id, { title: text.trim() });
                                parent.subEditing = false;
                            }
                            Keys.onEscapePressed: parent.subEditing = false
                        }
                    }
                    IrisChip {
                        implicitHeight: UiScale.px(22)
                        text: {
                            GritStore.revision;
                            const shares = Core.subtaskShares(root.task, GritStore.today);
                            return `${shares[subRow.modelData.id] ?? 0}`;
                        }
                    }
                    CardIconButton {
                        iconName: "edit"
                        small: true
                        onClicked: GritEdit.openSubtask(root.task, subRow.modelData)
                    }
                    CardIconButton {
                        iconName: "close"
                        small: true
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

            // Add subtask: a dark pill field
            IrisField {
                id: newSubtaskField
                Layout.fillWidth: true
                Layout.topMargin: UiScale.px(2)
                implicitHeight: UiScale.px(34)
                icon: "add"
                placeholderText: Translation.tr("Add step…")
                font.pixelSize: Appearance.font.pixelSize.smaller
                onAccepted: {
                    if (text.trim().length > 0) {
                        GritStore.addSubtask(root.task, text);
                        text = "";
                    }
                }
            }
        }
    }

    // A small round action: the card-tone disc, white when its state is on.
    // While the card holds keyboard focus the glyph gives way to its key.
    component CardIconButton: IrisDisc {
        property string iconName: ""
        property bool active: false
        property bool small: false
        property string hintKey: ""

        size: UiScale.px(small ? 24 : 28)
        tone: "card"
        clickable: true
        icon: iconName
        on: active
        iconFill: active
        iconSize: small ? Appearance.font.pixelSize.smaller : Appearance.font.pixelSize.normal
        text: root.kbFocused ? hintKey : ""
    }
}
