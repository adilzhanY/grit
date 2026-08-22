pragma ComponentBehavior: Bound
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
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
Rectangle {
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
    implicitHeight: column.implicitHeight + 24
    radius: Appearance.rounding.normal
    color: Appearance.colors.colLayer1
    border.width: 1
    border.color: GritStore.quotaDone ? Appearance.colors.colPrimary : Appearance.colors.colLayer0Border

    Behavior on border.color {
        ColorAnimation { duration: Appearance.animation.elementMoveFast.duration }
    }

    ColumnLayout {
        id: column
        anchors {
            left: parent.left
            right: parent.right
            verticalCenter: parent.verticalCenter
            leftMargin: 14
            rightMargin: 14
        }
        spacing: 8

        // ---- Quota + streak ----
        RowLayout {
            Layout.fillWidth: true
            spacing: 10

            MaterialSymbol {
                text: GritStore.restDayUsedToday ? "hotel" : "local_fire_department"
                fill: GritStore.streak > 0 ? 1 : 0
                iconSize: 22
                color: GritStore.streak > 0 ? Appearance.colors.colPrimary : Appearance.colors.colSubtext
                GritToolTip {
                    text: GritStore.streak > 0
                        ? Translation.tr("%1 day streak").arg(GritStore.streak)
                        : Translation.tr("No streak yet. Hit today's quota to start one.")
                }
            }
            GritText {
                text: `${GritStore.streak}`
                font.pixelSize: 22
                font.family: "Google Sans Flex"
                font.features: { "tnum": 1 }
                font.variableAxes: { "wght": 800, "ROND": 100 }
                color: GritStore.streak > 0 ? Appearance.colors.colOnLayer1 : Appearance.colors.colSubtext
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 6
                    GritText {
                        Layout.fillWidth: true
                        text: Translation.tr("%1 / %2 XP today")
                            .arg(Math.round(GritStore.quotaProgress)).arg(GritStore.dailyQuota)
                        font.pixelSize: Appearance.font.pixelSize.small
                        font.family: "Google Sans Flex"
                        font.features: { "tnum": 1 }
                        font.variableAxes: { "wght": 600, "ROND": 100 }
                        color: GritStore.quotaDone ? Appearance.colors.colPrimary : Appearance.colors.colSubtext
                        elide: Text.ElideRight
                    }
                    GritText {
                        visible: root.mult.mult > 1
                        text: root.mult.reason === "comeback"
                            ? Translation.tr("comeback ×2")
                            : Translation.tr("+%1%").arg(Math.round((root.mult.mult - 1) * 100))
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        font.features: { "tnum": 1 }
                        color: Appearance.colors.colPrimary
                        GritToolTip {
                            text: root.mult.reason === "comeback"
                                ? Translation.tr("First day back after a break: everything pays double")
                                : Translation.tr("Streak bonus on every task and focus block today")
                        }
                    }
                    GritText {
                        visible: GritStore.restDaysBanked > 0
                        text: Translation.tr("%1 rest").arg(GritStore.restDaysBanked)
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        font.features: { "tnum": 1 }
                        color: Appearance.colors.colSubtext
                        GritToolTip { text: Translation.tr("Banked rest days. One per 7 days of quota.") }
                    }
                }
                StyledProgressBar {
                    Layout.fillWidth: true
                    value: root.quotaFraction
                }
            }
        }

        // ---- Quests ----
        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            Repeater {
                model: GritStore.todayQuests
                delegate: Rectangle {
                    id: questChip
                    required property var modelData
                    readonly property bool done: questChip.modelData.done

                    Layout.fillWidth: true
                    implicitHeight: questRow.implicitHeight + 14
                    radius: Appearance.rounding.small
                    color: questChip.done ? Appearance.colors.colSecondaryContainer : Appearance.colors.colLayer2
                    border.width: 1
                    border.color: questChip.done ? Appearance.colors.colPrimary : Appearance.colors.colLayer0Border

                    Behavior on color {
                        ColorAnimation { duration: Appearance.animation.elementMoveFast.duration }
                    }

                    RowLayout {
                        id: questRow
                        anchors {
                            left: parent.left
                            right: parent.right
                            verticalCenter: parent.verticalCenter
                            leftMargin: 8
                            rightMargin: 8
                        }
                        spacing: 6

                        MaterialSymbol {
                            text: questChip.done ? "check_circle" : "radio_button_unchecked"
                            fill: questChip.done ? 1 : 0
                            iconSize: Appearance.font.pixelSize.normal
                            color: questChip.done ? Appearance.colors.colPrimary : Appearance.colors.colSubtext
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: -2
                            GritText {
                                Layout.fillWidth: true
                                text: questChip.modelData.label
                                font.pixelSize: Appearance.font.pixelSize.smallest
                                color: questChip.done ? Appearance.colors.colOnSecondaryContainer
                                    : Appearance.colors.colOnLayer1
                                elide: Text.ElideRight
                                GritToolTip { text: questChip.modelData.label }
                            }
                            GritText {
                                text: `+${questChip.modelData.xp} XP`
                                font.pixelSize: Appearance.font.pixelSize.smallest
                                font.features: { "tnum": 1 }
                                color: Appearance.colors.colSubtext
                            }
                        }
                    }
                }
            }
        }

        // ---- Weekly goal ----
        RowLayout {
            Layout.fillWidth: true
            spacing: 8

            MaterialSymbol {
                text: "calendar_month"
                iconSize: Appearance.font.pixelSize.normal
                color: Appearance.colors.colSubtext
            }
            GritText {
                text: Translation.tr("This week")
                font.pixelSize: Appearance.font.pixelSize.smallest
                color: Appearance.colors.colSubtext
            }
            StyledProgressBar {
                Layout.fillWidth: true
                value: root.week.target > 0
                    ? Math.max(0, Math.min(1, root.week.progress / root.week.target)) : 0
            }
            GritText {
                text: root.week.progress >= root.week.target
                    ? Translation.tr("done · +%1 XP Monday").arg(root.week.reward)
                    : `${Math.round(root.week.progress)} / ${root.week.target}`
                font.pixelSize: Appearance.font.pixelSize.smallest
                font.features: { "tnum": 1 }
                color: root.week.progress >= root.week.target
                    ? Appearance.colors.colPrimary : Appearance.colors.colSubtext
            }
        }

        // ---- Rescue row, only late in the day ----
        RowLayout {
            Layout.fillWidth: true
            visible: root.rescuable && GritStore.streak > 0
            spacing: 6

            GritText {
                Layout.fillWidth: true
                text: Translation.tr("%1 XP short. A %2 minute focus block covers it.")
                    .arg(Math.max(0, GritStore.dailyQuota - Math.round(GritStore.quotaProgress)))
                    .arg(Math.max(5, Math.ceil((GritStore.dailyQuota - GritStore.quotaProgress)
                        / (Core.XP_PER_FOCUS_MIN * root.mult.mult) / 5) * 5))
                font.pixelSize: Appearance.font.pixelSize.smallest
                color: Appearance.colors.colSubtext
                elide: Text.ElideRight
            }
            RippleButton {
                visible: GritStore.restDaysBanked > 0
                implicitHeight: 26
                buttonRadius: Appearance.rounding.full
                onClicked: {
                    if (GritStore.spendRestDay())
                        GritToast.show(Translation.tr("Rest day used. Streak held."), "hotel");
                }
                contentItem: GritText {
                    anchors.centerIn: parent
                    horizontalAlignment: Text.AlignHCenter
                    leftPadding: 12
                    rightPadding: 12
                    text: Translation.tr("Use rest day")
                    font.pixelSize: Appearance.font.pixelSize.smallest
                    color: Appearance.colors.colOnLayer1
                }
            }
            RippleButton {
                visible: GritStore.restDaysBanked === 0 && GritStore.xp >= Core.REST_BUY_COST
                implicitHeight: 26
                buttonRadius: Appearance.rounding.full
                onClicked: {
                    GritConfirm.ask(
                        Translation.tr("Buy a rest day?"),
                        Translation.tr("%1 XP from your wallet. Your level is not affected.")
                            .arg(Core.REST_BUY_COST),
                        () => {
                            if (GritStore.buyRestDay())
                                GritToast.show(Translation.tr("Rest day bought. Streak held."), "hotel");
                        });
                }
                contentItem: GritText {
                    anchors.centerIn: parent
                    horizontalAlignment: Text.AlignHCenter
                    leftPadding: 12
                    rightPadding: 12
                    text: Translation.tr("Buy one · %1").arg(Core.REST_BUY_COST)
                    font.pixelSize: Appearance.font.pixelSize.smallest
                    color: Appearance.colors.colSubtext
                }
            }
        }
    }
}
