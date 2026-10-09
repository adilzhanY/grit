pragma ComponentBehavior: Bound
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import qs.modules.iris
import QtQuick
import QtQuick.Layouts
import "../../../services/grit/GritCore.js" as Core

/**
 * The daily loop, compressed into one card at the top of My Day: today's quota,
 * the show-up streak and its multiplier, the three quests drawn for the date,
 * and the weekly goal. Everything here is derived from the ledger, so the card
 * is read-only apart from the two rescue buttons.
 *
 * The rescue row deliberately stays hidden until 20:00. Offering "use a rest
 * day" at 10:00 would just be an invitation to bail out of the day.
 */
IrisCard {
    id: root

    property real nowTick: Date.now()
    Timer {
        interval: 60000
        running: root.visible
        repeat: true
        onTriggered: root.nowTick = Date.now()
    }

    readonly property int hourNow: new Date(root.nowTick).getHours()
    readonly property bool lateInDay: root.hourNow >= 20
    readonly property bool rescuable: !GritStore.quotaDone && !GritStore.restDayUsedToday && root.lateInDay
    readonly property real quotaFraction: GritStore.dailyQuota > 0
        ? Math.max(0, Math.min(1, GritStore.quotaProgress / GritStore.dailyQuota)) : 0
    readonly property var mult: GritStore.xpMultiplier
    readonly property var week: GritStore.weekInfo

    Layout.fillWidth: true
    spacing: UiScale.px(12)

    // ---- Streak + multiplier and rest ----
    RowLayout {
        Layout.fillWidth: true
        spacing: UiScale.px(12)

        IrisDisc {
            size: UiScale.px(52)
            icon: GritStore.restDayUsedToday ? "hotel" : "local_fire_department"
            on: GritStore.streak > 0
            filled: GritStore.streak > 0
            MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                acceptedButtons: Qt.NoButton
                IrisToolTip {
                    text: GritStore.streak > 0
                        ? Translation.tr("%1 day streak").arg(GritStore.streak)
                        : Translation.tr("No streak yet. Hit today's quota to start one.")
                }
            }
        }
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 0
            IrisText {
                text: `${GritStore.streak}`
                font.pixelSize: Appearance.font.pixelSize.huge
                font.features: { "tnum": 1 }
                font.weight: Font.ExtraBold
                color: GritStore.streak > 0 ? Iris.fg : Iris.fg3
            }
            IrisText {
                text: Translation.tr("day streak")
                role: "hint"
            }
        }
        // Multiplier: white, since it is a reward running right now
        IrisChip {
            visible: root.mult.mult > 1
            on: true
            text: root.mult.reason === "comeback"
                ? Translation.tr("comeback ×2")
                : Translation.tr("+%1%").arg(Math.round((root.mult.mult - 1) * 100))
            tip: root.mult.reason === "comeback"
                ? Translation.tr("First day back after a break: everything pays double")
                : Translation.tr("Streak bonus on every task and focus block today")
        }
        IrisChip {
            visible: GritStore.restDaysBanked > 0
            icon: "hotel"
            text: Translation.tr("%1 rest").arg(GritStore.restDaysBanked)
            tip: Translation.tr("Banked rest days. One per 7 days of quota.")
        }
    }

    // ---- Quota ----
    ColumnLayout {
        Layout.fillWidth: true
        spacing: UiScale.px(8)

        IrisText {
            Layout.fillWidth: true
            text: Translation.tr("%1 / %2 XP today")
                .arg(Math.round(GritStore.quotaProgress)).arg(GritStore.dailyQuota)
            role: "label"
            font.features: { "tnum": 1 }
            font.weight: Font.DemiBold
            color: GritStore.quotaDone ? Iris.fg : Iris.fg2
            Behavior on color {
                ColorAnimation { duration: Iris.colorDuration }
            }
        }
        IrisSlot {
            Layout.fillWidth: true
            valueBarHeight: UiScale.px(14)
            value: root.quotaFraction
        }
    }

    // ---- Quests: three dark tiles, a disc that turns white when done ----
    RowLayout {
        Layout.fillWidth: true
        spacing: UiScale.px(8)

        Repeater {
            model: GritStore.todayQuests
            delegate: Rectangle {
                id: questChip
                required property var modelData
                readonly property bool done: questChip.modelData.done

                Layout.fillWidth: true
                Layout.preferredWidth: 1
                implicitHeight: questCol.implicitHeight + UiScale.px(24)
                radius: UiScale.px(18)
                color: questHover.containsMouse ? GritColors.hoverRow : GritColors.well

                Behavior on color {
                    ColorAnimation { duration: 140 }
                }

                MouseArea {
                    id: questHover
                    anchors.fill: parent
                    hoverEnabled: true
                    acceptedButtons: Qt.NoButton
                    IrisToolTip { text: questChip.modelData.label }
                }

                ColumnLayout {
                    id: questCol
                    anchors {
                        left: parent.left
                        right: parent.right
                        verticalCenter: parent.verticalCenter
                        leftMargin: UiScale.px(8)
                        rightMargin: UiScale.px(8)
                    }
                    spacing: UiScale.px(4)

                    IrisDisc {
                        Layout.alignment: Qt.AlignHCenter
                        Layout.bottomMargin: UiScale.px(2)
                        size: UiScale.px(30)
                        icon: questChip.done ? "check" : "radio_button_unchecked"
                        on: questChip.done
                    }
                    IrisText {
                        Layout.fillWidth: true
                        horizontalAlignment: Text.AlignHCenter
                        text: questChip.modelData.label
                        role: "caption"
                        color: questChip.done ? Iris.fg : Iris.fg2
                    }
                    IrisText {
                        Layout.fillWidth: true
                        horizontalAlignment: Text.AlignHCenter
                        text: `+${questChip.modelData.xp} XP`
                        role: "caption"
                        font.features: { "tnum": 1 }
                    }
                }
            }
        }
    }

    // ---- Weekly goal ----
    ColumnLayout {
        Layout.fillWidth: true
        spacing: UiScale.px(6)

        RowLayout {
            Layout.fillWidth: true
            spacing: UiScale.px(6)

            MaterialSymbol {
                text: "calendar_month"
                iconSize: Appearance.font.pixelSize.normal
                color: GritColors.fg3
            }
            IrisText {
                Layout.fillWidth: true
                text: Translation.tr("This week")
                role: "hint"
            }
            IrisText {
                text: root.week.progress >= root.week.target
                    ? Translation.tr("done  ·  +%1 XP Monday").arg(root.week.reward)
                    : `${Math.round(root.week.progress)} / ${root.week.target}`
                role: "hint"
                font.features: { "tnum": 1 }
                color: root.week.progress >= root.week.target ? Iris.fg : Iris.fg3
            }
        }
        IrisSlot {
            Layout.fillWidth: true
            valueBarHeight: UiScale.px(6)
            value: root.week.target > 0
                ? Math.max(0, Math.min(1, root.week.progress / root.week.target)) : 0
        }
    }

    // ---- Rescue row, only late in the day ----
    RowLayout {
        Layout.fillWidth: true
        visible: root.rescuable && GritStore.streak > 0
        spacing: UiScale.px(8)

        IrisText {
            Layout.fillWidth: true
            text: Translation.tr("%1 XP short. A %2 minute focus block covers it.")
                .arg(Math.max(0, GritStore.dailyQuota - Math.round(GritStore.quotaProgress)))
                .arg(Math.max(5, Math.ceil((GritStore.dailyQuota - GritStore.quotaProgress)
                    / (Core.XP_PER_FOCUS_MIN * root.mult.mult) / 5) * 5))
            role: "caption"
        }
        IrisPill {
            visible: GritStore.restDaysBanked > 0
            compact: true
            primary: true
            icon: "hotel"
            text: Translation.tr("Use rest day")
            onClicked: {
                if (GritStore.spendRestDay())
                    GritToast.show(Translation.tr("Rest day used. Streak held."), "hotel");
            }
        }
        IrisPill {
            visible: GritStore.restDaysBanked === 0 && GritStore.xp >= Core.REST_BUY_COST
            compact: true
            text: Translation.tr("Buy one  ·  %1").arg(Core.REST_BUY_COST)
            onClicked: {
                GritConfirm.ask(
                    Translation.tr("Buy a rest day?"),
                    Translation.tr("%1 XP from your wallet. Your level is not affected.")
                        .arg(Core.REST_BUY_COST),
                    () => {
                        if (GritStore.buyRestDay())
                            GritToast.show(Translation.tr("Rest day bought. Streak held."), "hotel");
                    }, Translation.tr("Buy"), false);
            }
        }
    }
}
