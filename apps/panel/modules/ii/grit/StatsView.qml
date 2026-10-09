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
 * XP statistics: the most recent ledger entries up top (5 at a time, with a
 * "Show more" button), then XP earned over today / 3 days / week / month /
 * all time and a seven-day bar strip. Read-only, straight off the ledger.
 */
StyledFlickable {
    id: root

    clip: true
    contentHeight: mainColumn.implicitHeight

    readonly property int pageSize: 5
    property int shownCount: pageSize

    readonly property var ledgerDesc: {
        GritStore.revision;
        return GritStore.db.ledger.slice().sort((a, b) => b.timestamp - a.timestamp);
    }

    /** XP summed over the last `days` calendar days, today included. */
    function xpOverDays(days) {
        const from = Core.addDays(GritStore.today, -(days - 1));
        return root.ledgerDesc
            .filter(e => Core.localDay(e.timestamp) >= from)
            .reduce((s, e) => s + e.delta, 0);
    }

    readonly property var last7: {
        GritStore.revision;
        const out = [];
        for (let i = 6; i >= 0; i--) {
            const day = Core.addDays(GritStore.today, -i);
            out.push({ day: day, xp: Core.xpGainedOn(GritStore.db.ledger, day) });
        }
        return out;
    }

    readonly property real last7Peak: {
        let peak = 0;
        for (const d of root.last7)
            peak = Math.max(peak, Math.abs(d.xp));
        return peak;
    }

    readonly property var typeMeta: ({
        must_complete: { icon: "local_fire_department", label: Translation.tr("Must") },
        cool_achieve: { icon: "auto_awesome", label: Translation.tr("Cool") },
        impossible_achieve: { icon: "landscape", label: Translation.tr("Impossible") },
        custom_complete: { icon: "checklist", label: Translation.tr("List") },
        bad_slip: { icon: "skull", label: Translation.tr("Slip") },
        streak_milestone: { icon: "military_tech", label: Translation.tr("Streak") },
        food_penalty: { icon: "restaurant", label: Translation.tr("Over limit") },
        weight_log: { icon: "monitor_weight", label: Translation.tr("Weight") },
        focus_log: { icon: "timer", label: Translation.tr("Focus") },
        focus_rank: { icon: "workspace_premium", label: Translation.tr("Focus rank") },
        quest: { icon: "flag", label: Translation.tr("Quest") },
        weekly_goal: { icon: "calendar_month", label: Translation.tr("Weekly goal") },
        rest_day: { icon: "hotel", label: Translation.tr("Rest day") },
        spend: { icon: "redeem", label: Translation.tr("Shop") },
        buyout: { icon: "paid", label: Translation.tr("Bought off") },
        adjust: { icon: "undo", label: Translation.tr("Adjust") }
    })

    function metaOf(type) {
        return root.typeMeta[type] ?? { icon: "bolt", label: type };
    }

    function entryTitle(entry) {
        const m = (entry.meta ?? "").trim();
        return m.length > 0 ? m : root.metaOf(entry.type).label;
    }

    function entryWhen(ts) {
        const day = Core.localDay(ts);
        const d = new Date(ts);
        const clock = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        if (day === GritStore.today)
            return `${Translation.tr("Today")} ${clock}`;
        if (day === Core.addDays(GritStore.today, -1))
            return `${Translation.tr("Yesterday")} ${clock}`;
        return `${Core.fmtDay(day)} ${clock}`;
    }

    function weekdayLetter(day) {
        const p = day.split("-").map(Number);
        return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString("en-US", { weekday: "narrow" });
    }

    ColumnLayout {
        id: mainColumn
        width: parent.width
        spacing: UiScale.px(8)

        // ---- Recent XP ----
        IrisSectionLabel {
            Layout.fillWidth: true
            text: Translation.tr("Recent XP")
            side: Translation.tr("%1 entries").arg(root.ledgerDesc.length)
        }

        IrisText {
            Layout.fillWidth: true
            Layout.leftMargin: UiScale.px(6)
            visible: root.ledgerDesc.length === 0
            text: Translation.tr("No XP earned yet")
            font.pixelSize: Appearance.font.pixelSize.small
            color: GritColors.fg3
        }

        Repeater {
            model: root.ledgerDesc.slice(0, root.shownCount)
            delegate: Rectangle {
                id: entryRow
                required property var modelData
                readonly property var typeInfo: root.metaOf(entryRow.modelData.type)

                Layout.fillWidth: true
                implicitHeight: Math.max(UiScale.px(52), entryRowLayout.implicitHeight + UiScale.px(14))
                radius: height / 2
                color: GritColors.raised

                RowLayout {
                    id: entryRowLayout
                    anchors {
                        left: parent.left
                        right: parent.right
                        verticalCenter: parent.verticalCenter
                        leftMargin: UiScale.px(8)
                        rightMargin: UiScale.px(20)
                    }
                    spacing: UiScale.px(10)

                    IrisDisc {
                        size: UiScale.px(36)
                        icon: entryRow.typeInfo.icon
                        tone: "card"
                    }
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 0

                        IrisText {
                            Layout.fillWidth: true
                            text: root.entryTitle(entryRow.modelData)
                            font.pixelSize: Appearance.font.pixelSize.small
                            font.weight: Font.DemiBold
                            color: GritColors.fg
                            elide: Text.ElideRight
                        }
                        IrisText {
                            Layout.fillWidth: true
                            text: `${entryRow.typeInfo.label} · ${root.entryWhen(entryRow.modelData.timestamp)}`
                            font.pixelSize: Appearance.font.pixelSize.smallest
                            font.features: { "tnum": 1 }
                            font.weight: Font.Medium
                            color: GritColors.fg3
                            elide: Text.ElideRight
                        }
                    }
                    IrisText {
                        text: Core.fmtXp(entryRow.modelData.delta)
                        font.pixelSize: Appearance.font.pixelSize.normal
                        font.features: { "tnum": 1 }
                        font.weight: Font.Bold
                        color: entryRow.modelData.delta >= 0 ? GritColors.fg : GritColors.danger
                    }
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: UiScale.px(6)
            visible: root.ledgerDesc.length > root.pageSize

            IrisPill {
                visible: root.shownCount < root.ledgerDesc.length
                compact: true
                icon: "expand_more"
                text: Translation.tr("Show more")
                onClicked: root.shownCount = Math.min(root.shownCount + 10, root.ledgerDesc.length)
            }
            IrisPill {
                visible: root.shownCount > root.pageSize
                compact: true
                icon: "expand_less"
                text: Translation.tr("Show less")
                onClicked: root.shownCount = root.pageSize
            }
            Item { Layout.fillWidth: true }
        }

        // ---- Totals ----
        IrisSectionLabel {
            Layout.fillWidth: true
            Layout.topMargin: UiScale.px(8)
            text: Translation.tr("XP earned")
        }

        GridLayout {
            Layout.fillWidth: true
            columns: 3
            rowSpacing: UiScale.px(8)
            columnSpacing: UiScale.px(8)

            Repeater {
                model: [
                    { label: Translation.tr("Today"), value: root.xpOverDays(1) },
                    { label: Translation.tr("Last 3 days"), value: root.xpOverDays(3) },
                    { label: Translation.tr("Last week"), value: root.xpOverDays(7) },
                    { label: Translation.tr("Last month"), value: root.xpOverDays(30) },
                    { label: Translation.tr("Last year"), value: root.xpOverDays(365) },
                    { label: Translation.tr("Wallet"), value: Math.round(GritStore.xp) },
                    { label: Translation.tr("Lifetime"), value: Math.round(GritStore.lifetimeXp) }
                ]
                delegate: IrisCard {
                    id: tile
                    required property var modelData
                    Layout.preferredWidth: 1 // equal columns
                    pad: UiScale.px(14)
                    spacing: 0

                    IrisText {
                        Layout.fillWidth: true
                        text: `${tile.modelData.value}`
                        font.pixelSize: Appearance.font.pixelSize.larger
                        font.features: { "tnum": 1 }
                        font.weight: Font.ExtraBold
                        color: tile.modelData.value < 0 ? GritColors.danger : GritColors.fg
                        elide: Text.ElideRight
                    }
                    IrisText {
                        Layout.fillWidth: true
                        text: tile.modelData.label
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        font.weight: Font.DemiBold
                        color: GritColors.fg3
                        elide: Text.ElideRight
                    }
                }
            }
        }

        // ---- Last 7 days strip ----
        IrisCard {
            Layout.topMargin: UiScale.px(4)
            implicitHeight: UiScale.px(150)
            fill: true

            RowLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: UiScale.px(6)

                Repeater {
                    model: root.last7
                    delegate: ColumnLayout {
                        id: bar
                        required property var modelData
                        readonly property bool isToday: bar.modelData.day === GritStore.today
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        spacing: UiScale.px(4)

                        IrisText {
                            Layout.alignment: Qt.AlignHCenter
                            text: bar.modelData.xp === 0 ? "" : `${bar.modelData.xp}`
                            font.pixelSize: Appearance.font.pixelSize.smallest
                            font.features: { "tnum": 1 }
                            font.weight: Font.DemiBold
                            color: bar.modelData.xp < 0 ? GritColors.danger : GritColors.fg3
                        }
                        // A well track with a rounded fill: white today, fg2 before
                        Rectangle {
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            radius: UiScale.px(8)
                            color: GritColors.well

                            Rectangle {
                                anchors.bottom: parent.bottom
                                width: parent.width
                                radius: UiScale.px(8)
                                visible: bar.modelData.xp !== 0
                                height: root.last7Peak <= 0 ? 0
                                    : Math.max(UiScale.px(6), parent.height * Math.abs(bar.modelData.xp) / root.last7Peak)
                                color: bar.modelData.xp < 0 ? GritColors.danger
                                    : bar.isToday ? GritColors.fg : GritColors.fg2

                                Behavior on height {
                                    SpringAnimation { spring: 2.4; damping: 0.4; epsilon: 0.3 }
                                }
                                Behavior on color {
                                    ColorAnimation { duration: Iris.colorDuration }
                                }
                            }
                        }
                        IrisText {
                            Layout.alignment: Qt.AlignHCenter
                            text: root.weekdayLetter(bar.modelData.day)
                            font.pixelSize: Appearance.font.pixelSize.smallest
                            color: bar.isToday ? GritColors.fg : GritColors.fg3
                        }
                    }
                }
            }
        }

        Item { implicitHeight: UiScale.px(4) }
    }
}
