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

/**
 * Bad-habit tile: live clean-streak clock, progress to the next milestone,
 * and the dreaded slip button (with confirm).
 */
IrisCard {
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

    focused: root.kbFocused
    spacing: UiScale.px(6)

    Timer {
        id: slipConfirmTimeout
        interval: 3000
        onTriggered: root.confirmingSlip = false
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
                root.slip();
                break;
            case "copy":
                root.copyTitle();
                break;
            case "edit":
                GritEdit.open(root.task);
                break;
            case "delete":
                root.askDelete();
                break;
            }
        }
    }

    // Two steps: the first press arms it for 3 s, the second records the slip
    function slip() {
        if (!root.confirmingSlip) {
            root.confirmingSlip = true;
            slipConfirmTimeout.restart();
        } else {
            root.confirmingSlip = false;
            GritStore.recordSlip(root.task);
            GritSounds.play("bad");
        }
    }
    function copyTitle() {
        const title = root.task?.title ?? "";
        Quickshell.clipboardText = title;
        GritToast.show(Translation.tr("Copied \"%1\"").arg(title));
    }
    function askDelete() {
        const taskId = root.task.id;
        GritConfirm.ask(
            Translation.tr("Delete habit?"),
            Translation.tr("\"%1\" and its streak history will be gone").arg(root.task?.title ?? ""),
            () => GritStore.deleteTask(taskId));
    }

    RowLayout {
        Layout.fillWidth: true
        spacing: UiScale.px(8)

        Item {
            implicitWidth: skull.implicitWidth
            implicitHeight: skull.implicitHeight
            IrisDisc {
                id: skull
                size: UiScale.px(34)
                icon: "skull"
            }
            // f-mode jump letter, over the skull
            IrisKeycap {
                anchors.centerIn: parent
                visible: root.jumpLetter !== ""
                variant: "on"
                mono: true
                text: root.jumpLetter
            }
        }
        IrisText {
            Layout.fillWidth: true
            text: root.task?.title ?? ""
            font.weight: Font.DemiBold
        }
        BadIconButton {
            iconName: "content_copy"
            hintKey: "y"
            onClicked: root.copyTitle()
        }
        BadIconButton {
            iconName: "edit"
            hintKey: "e"
            onClicked: GritEdit.open(root.task)
        }
        BadIconButton {
            iconName: "delete"
            hintKey: "d"
            onClicked: root.askDelete()
        }
    }

    // The clock: how long, big and tabular
    IrisText {
        Layout.topMargin: UiScale.px(6)
        text: Core.formatStreak(root.streak)
        font.pixelSize: Appearance.font.pixelSize.hugeass * 1.2
        font.features: { "tnum": 1 }
        font.weight: Font.Bold
    }
    // and since when, one quiet line under it
    IrisText {
        Layout.fillWidth: true
        text: root.cleanSince
            ? Translation.tr("clean since %1").arg(Core.fmtDateTimeShort(root.cleanSince, root.nowTick))
            : Translation.tr("clean")
        role: "hint"
    }

    IrisSlot {
        Layout.fillWidth: true
        Layout.topMargin: UiScale.px(6)
        valueBarHeight: UiScale.px(12)
        value: root.milestoneProgress
    }

    RowLayout {
        Layout.fillWidth: true
        spacing: UiScale.px(8)

        IrisText {
            Layout.fillWidth: true
            text: root.nextMs
                ? Translation.tr("Next: %1  ·  +%2 XP").arg(root.nextMs.label).arg(Math.round(root.nextMs.baseXp * (root.task?.rewardMultiplier ?? 1)))
                : Translation.tr("All milestones reached!")
            role: "secondary"
            font.features: { "tnum": 1 }
        }
        IrisText {
            visible: (root.task?.bestStreakMs ?? 0) > 0
            text: Translation.tr("best %1").arg(Core.formatStreak(root.task.bestStreakMs))
            role: "hint"
            font.features: { "tnum": 1 }
        }
    }

    RowLayout {
        Layout.fillWidth: true
        Layout.topMargin: UiScale.px(4)
        spacing: UiScale.px(8)

        Item { Layout.fillWidth: true }
        IrisKeycap {
            visible: root.kbFocused && !root.confirmingSlip
            variant: "on"
            mono: true
            text: "s"
        }
        // Armed, it turns white: the one bright thing on the card
        IrisPill {
            dangerText: !root.confirmingSlip
            primary: root.confirmingSlip
            icon: root.confirmingSlip ? "warning" : ""
            text: root.confirmingSlip
                ? Translation.tr("Sure? −%1 XP").arg(root.task?.slipPenalty ?? 100)
                : Translation.tr("I slipped")
            onClicked: root.slip()
        }
    }

    // A small ghost action disc; its key shows while the card is focused
    component BadIconButton: IrisDisc {
        property string iconName: ""
        property string hintKey: ""

        size: UiScale.px(28)
        tone: "ghost"
        clickable: true
        icon: iconName
        iconSize: Appearance.font.pixelSize.normal
        text: root.kbFocused ? hintKey : ""
    }
}
