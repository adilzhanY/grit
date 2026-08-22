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
 * Bad-habit tile: live clean-streak clock, progress to the next milestone,
 * and the dreaded slip button (with confirm).
 */
Rectangle {
    id: root

    property var task: ({})
    property bool confirmingSlip: false
    // ---- Vim layer ----
    readonly property string cardId: task?.id ?? ""
    readonly property bool kbFocused: cardId !== "" && GritKeys.focusedCardId === cardId
    readonly property string jumpLetter: GritKeys.mode === "hint"
        ? (GritKeys.jumpLetters[cardId] ?? "") : ""

    property real nowTick: Date.now()
    Timer {
        interval: 30000
        running: root.visible
        repeat: true
        onTriggered: root.nowTick = Date.now()
    }

    readonly property real streak: {
        GritStore.revision;
        return task && task.id ? Core.streakMs(root.nowTick, task.lastSlipAt, task.createdAt) : 0;
    }
    /** Start of the current clean run, the anchor `streak` counts up from. */
    readonly property var cleanSince: {
        GritStore.revision;
        return task && task.id ? Core.cleanSince(task) : null;
    }
    readonly property var nextMs: Core.nextMilestone(root.streak)
    readonly property var currentMs: Core.currentMilestone(root.streak)
    readonly property real milestoneProgress: {
        if (!root.nextMs)
            return 1;
        const prev = root.currentMs ? root.currentMs.ms : 0;
        const span = root.nextMs.ms - prev;
        return span > 0 ? Math.min(1, (root.streak - prev) / span) : 0;
    }

    implicitHeight: badColumn.implicitHeight + 16
    radius: Appearance.rounding.normal
    color: Appearance.colors.colLayer1
    border.width: 1
    border.color: root.kbFocused ? Appearance.colors.colPrimary : Appearance.colors.colLayer0Border

    // f-mode jump letter, over the skull
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
            case "slip":
                if (!root.confirmingSlip) {
                    root.confirmingSlip = true;
                    slipConfirmTimeout.restart();
                } else {
                    root.confirmingSlip = false;
                    GritStore.recordSlip(root.task);
                    GritSounds.play("bad");
                }
                break;
            case "copy": {
                const title = root.task?.title ?? "";
                Quickshell.clipboardText = title;
                GritToast.show(Translation.tr("Copied \"%1\"").arg(title));
                break;
            }
            case "edit":
                GritEdit.open(root.task);
                break;
            case "delete": {
                const taskId = root.task.id;
                GritConfirm.ask(
                    Translation.tr("Delete habit?"),
                    Translation.tr("\"%1\" and its streak history will be gone").arg(root.task?.title ?? ""),
                    () => GritStore.deleteTask(taskId));
                break;
            }
            }
        }
    }

    ColumnLayout {
        id: badColumn
        anchors {
            left: parent.left
            right: parent.right
            top: parent.top
            margins: 10
        }
        spacing: 4

        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            MaterialSymbol {
                text: "skull"
                iconSize: Appearance.font.pixelSize.larger
                color: Appearance.colors.colError
            }
            GritText {
                Layout.fillWidth: true
                text: root.task?.title ?? ""
                font.pixelSize: Appearance.font.pixelSize.small
                font.weight: Font.DemiBold
                color: Appearance.colors.colOnLayer1
                elide: Text.ElideRight
            }
            RippleButton {
                implicitWidth: 22
                implicitHeight: 22
                buttonRadius: Appearance.rounding.full
                onClicked: {
                    const title = root.task?.title ?? "";
                    Quickshell.clipboardText = title;
                    GritToast.show(Translation.tr("Copied \"%1\"").arg(title));
                }
                contentItem: Item {
                    MaterialSymbol {
                        anchors.centerIn: parent
                        visible: !root.kbFocused
                        horizontalAlignment: Text.AlignHCenter
                        text: "content_copy"
                        iconSize: 14
                        color: Appearance.colors.colSubtext
                    }
                    Text {
                        anchors.centerIn: parent
                        visible: root.kbFocused
                        text: "y"
                        font.family: Appearance.font.family.monospace
                        font.pixelSize: 12
                        font.weight: Font.Bold
                        color: Appearance.colors.colPrimary
                    }
                }
            }
            RippleButton {
                implicitWidth: 22
                implicitHeight: 22
                buttonRadius: Appearance.rounding.full
                onClicked: GritEdit.open(root.task)
                contentItem: Item {
                    MaterialSymbol {
                        anchors.centerIn: parent
                        visible: !root.kbFocused
                        horizontalAlignment: Text.AlignHCenter
                        text: "edit"
                        iconSize: 14
                        color: Appearance.colors.colSubtext
                    }
                    Text {
                        anchors.centerIn: parent
                        visible: root.kbFocused
                        text: "e"
                        font.family: Appearance.font.family.monospace
                        font.pixelSize: 12
                        font.weight: Font.Bold
                        color: Appearance.colors.colPrimary
                    }
                }
            }
            RippleButton {
                implicitWidth: 22
                implicitHeight: 22
                buttonRadius: Appearance.rounding.full
                onClicked: {
                    const taskId = root.task.id;
                    GritConfirm.ask(
                        Translation.tr("Delete habit?"),
                        Translation.tr("\"%1\" and its streak history will be gone").arg(root.task?.title ?? ""),
                        () => GritStore.deleteTask(taskId));
                }
                contentItem: Item {
                    MaterialSymbol {
                        anchors.centerIn: parent
                        visible: !root.kbFocused
                        horizontalAlignment: Text.AlignHCenter
                        text: "delete"
                        iconSize: 14
                        color: Appearance.colors.colSubtext
                    }
                    Text {
                        anchors.centerIn: parent
                        visible: root.kbFocused
                        text: "d"
                        font.family: Appearance.font.family.monospace
                        font.pixelSize: 12
                        font.weight: Font.Bold
                        color: Appearance.colors.colPrimary
                    }
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            Layout.topMargin: 2
            spacing: 5

            GritText {
                text: Translation.tr("Clean for %1").arg(Core.formatStreak(root.streak))
                font.pixelSize: Appearance.font.pixelSize.large
                font.family: Appearance.font.family.numbers
                color: Appearance.colors.colPrimary
            }
            Item { Layout.fillWidth: true }
            // The clock says how long, this says since when. Sitting on the same
            // line keeps it read as one fact rather than an extra row of chrome.
            MaterialSymbol {
                Layout.alignment: Qt.AlignVCenter
                visible: !!root.cleanSince
                text: "event"
                iconSize: Appearance.font.pixelSize.normal
                color: Appearance.colors.colSubtext
            }
            GritText {
                Layout.alignment: Qt.AlignVCenter
                visible: !!root.cleanSince
                text: Translation.tr("since %1").arg(Core.fmtDateTimeShort(root.cleanSince, root.nowTick))
                font.pixelSize: Appearance.font.pixelSize.small
                color: Appearance.colors.colSubtext
            }
        }

        StyledProgressBar {
            Layout.fillWidth: true
            value: root.milestoneProgress
        }

        RowLayout {
            Layout.fillWidth: true

            GritText {
                Layout.fillWidth: true
                text: root.nextMs
                    ? Translation.tr("Next: %1 (+%2)").arg(root.nextMs.label).arg(Math.round(root.nextMs.baseXp * (root.task?.rewardMultiplier ?? 1)))
                    : Translation.tr("All milestones reached!")
                font.pixelSize: Appearance.font.pixelSize.smallest
                color: Appearance.colors.colSubtext
                elide: Text.ElideRight
            }
            GritText {
                visible: (root.task?.bestStreakMs ?? 0) > 0
                text: Translation.tr("best %1").arg(Core.formatStreak(root.task.bestStreakMs))
                font.pixelSize: Appearance.font.pixelSize.smallest
                color: Appearance.colors.colSubtext
            }
        }

        RippleButton {
            Layout.fillWidth: true
            implicitHeight: 28
            buttonRadius: Appearance.rounding.full
            colBackground: root.confirmingSlip ? Appearance.colors.colError : Appearance.colors.colErrorContainer ?? Appearance.colors.colLayer2
            onClicked: {
                if (!root.confirmingSlip) {
                    root.confirmingSlip = true;
                    slipConfirmTimeout.restart();
                } else {
                    root.confirmingSlip = false;
                    GritStore.recordSlip(root.task);
                    GritSounds.play("bad");
                }
            }
            Timer {
                id: slipConfirmTimeout
                interval: 3000
                onTriggered: root.confirmingSlip = false
            }
            contentItem: Item {
                GritText {
                    anchors.centerIn: parent
                    horizontalAlignment: Text.AlignHCenter
                    text: root.confirmingSlip
                        ? Translation.tr("Sure? −%1 XP").arg(root.task?.slipPenalty ?? 100)
                        : Translation.tr("I slipped")
                    font.pixelSize: Appearance.font.pixelSize.smallest
                    color: root.confirmingSlip ? (Appearance.colors.colOnError ?? "#fff") : Appearance.colors.colOnLayer1
                }
                GritHintKey {
                    visible: root.kbFocused && !root.confirmingSlip
                    letter: "s"
                    chipSize: 16
                    anchors.right: parent.right
                    anchors.rightMargin: 10
                    anchors.verticalCenter: parent.verticalCenter
                }
            }
        }
    }
}
