pragma ComponentBehavior: Bound
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
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
        spacing: 8

        // ---- Recent XP ----
        RowLayout {
            Layout.fillWidth: true
            spacing: 8

            GritText {
                text: Translation.tr("Recent XP")
                font.pixelSize: Appearance.font.pixelSize.normal
                font.weight: Font.DemiBold
                color: Appearance.colors.colPrimary
            }
            Item { Layout.fillWidth: true }
            GritText {
                text: Translation.tr("%1 entries").arg(root.ledgerDesc.length)
                font.pixelSize: Appearance.font.pixelSize.small
                font.features: { "tnum": 1 }
                font.variableAxes: { "wght": 500, "ROND": 100 }
                color: Appearance.colors.colSubtext
            }
        }

        GritText {
            Layout.fillWidth: true
            visible: root.ledgerDesc.length === 0
            text: Translation.tr("No XP earned yet")
            font.pixelSize: Appearance.font.pixelSize.small
            color: Appearance.colors.colSubtext
        }

        Repeater {
            model: root.ledgerDesc.slice(0, root.shownCount)
            delegate: Rectangle {
                id: entryRow
                required property var modelData
                readonly property var typeInfo: root.metaOf(entryRow.modelData.type)

                Layout.fillWidth: true
                implicitHeight: entryRowLayout.implicitHeight + 12
                radius: Appearance.rounding.small
                color: Appearance.colors.colLayer1
                border.width: 1
                border.color: Appearance.colors.colLayer0Border

                RowLayout {
                    id: entryRowLayout
                    anchors {
                        left: parent.left
                        right: parent.right
                        verticalCenter: parent.verticalCenter
                        leftMargin: 10
                        rightMargin: 10
                    }
                    spacing: 8

                    MaterialSymbol {
                        text: entryRow.typeInfo.icon
                        iconSize: Appearance.font.pixelSize.larger
                        color: entryRow.modelData.delta >= 0
                            ? Appearance.colors.colSubtext : Appearance.colors.colError
                    }
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: -1

                        GritText {
                            Layout.fillWidth: true
                            text: root.entryTitle(entryRow.modelData)
                            font.pixelSize: Appearance.font.pixelSize.normal
                            font.weight: Font.DemiBold
                            color: Appearance.colors.colOnLayer1
                            elide: Text.ElideRight
                        }
                        GritText {
                            Layout.fillWidth: true
                            text: `${entryRow.typeInfo.label} · ${root.entryWhen(entryRow.modelData.timestamp)}`
                            font.pixelSize: Appearance.font.pixelSize.small
                            font.features: { "tnum": 1 }
                            font.variableAxes: { "wght": 500, "ROND": 100 }
                            color: Appearance.colors.colSubtext
                            elide: Text.ElideRight
                        }
                    }
                    GritText {
                        text: Core.fmtXp(entryRow.modelData.delta)
                        font.pixelSize: Appearance.font.pixelSize.normal
                        font.family: "Google Sans Flex"
                        font.features: { "tnum": 1 }
                        font.variableAxes: { "wght": 700, "ROND": 100 }
                        color: entryRow.modelData.delta >= 0
                            ? Appearance.colors.colPrimary : Appearance.colors.colError
                    }
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: 6
            visible: root.ledgerDesc.length > root.pageSize

            RippleButton {
                visible: root.shownCount < root.ledgerDesc.length
                implicitHeight: 30
                buttonRadius: Appearance.rounding.full
                onClicked: root.shownCount = Math.min(root.shownCount + 10, root.ledgerDesc.length)
                contentItem: GritText {
                    anchors.centerIn: parent
                    horizontalAlignment: Text.AlignHCenter
                    leftPadding: 14
                    rightPadding: 14
                    text: Translation.tr("Show more")
                    font.pixelSize: Appearance.font.pixelSize.small
                    color: Appearance.colors.colOnLayer1
                }
            }
            RippleButton {
                visible: root.shownCount > root.pageSize
                implicitHeight: 30
                buttonRadius: Appearance.rounding.full
                onClicked: root.shownCount = root.pageSize
                contentItem: GritText {
                    anchors.centerIn: parent
                    horizontalAlignment: Text.AlignHCenter
                    leftPadding: 14
                    rightPadding: 14
                    text: Translation.tr("Show less")
                    font.pixelSize: Appearance.font.pixelSize.small
                    color: Appearance.colors.colSubtext
                }
            }
            Item { Layout.fillWidth: true }
        }

        // ---- Totals ----
        GritText {
            Layout.topMargin: 6
            text: Translation.tr("XP earned")
            font.pixelSize: Appearance.font.pixelSize.normal
            font.weight: Font.DemiBold
            color: Appearance.colors.colPrimary
        }

        GridLayout {
            Layout.fillWidth: true
            columns: 3
            rowSpacing: 6
            columnSpacing: 6

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
                delegate: Rectangle {
                    id: tile
                    required property var modelData
                    Layout.fillWidth: true
                    implicitHeight: tileColumn.implicitHeight + 20
                    radius: Appearance.rounding.normal
                    color: Appearance.colors.colLayer1
                    border.width: 1
                    border.color: Appearance.colors.colLayer0Border

                    ColumnLayout {
                        id: tileColumn
                        anchors {
                            left: parent.left
                            right: parent.right
                            verticalCenter: parent.verticalCenter
                            margins: 10
                        }
                        spacing: 0

                        GritText {
                            Layout.fillWidth: true
                            text: `${tile.modelData.value}`
                            font.pixelSize: 22
                            font.family: "Google Sans Flex"
                            font.features: { "tnum": 1 }
                            font.variableAxes: { "wght": 800, "ROND": 100 }
                            color: tile.modelData.value < 0
                                ? Appearance.colors.colError : Appearance.colors.colOnLayer1
                            elide: Text.ElideRight
                        }
                        GritText {
                            Layout.fillWidth: true
                            text: tile.modelData.label
                            font.pixelSize: Appearance.font.pixelSize.smallest
                            font.family: "Google Sans Flex"
                            font.variableAxes: { "wght": 600, "ROND": 100 }
                            color: Appearance.colors.colSubtext
                            elide: Text.ElideRight
                        }
                    }
                }
            }
        }

        // ---- Last 7 days strip ----
        Rectangle {
            Layout.fillWidth: true
            Layout.topMargin: 6
            implicitHeight: 118
            radius: Appearance.rounding.normal
            color: Appearance.colors.colLayer1
            border.width: 1
            border.color: Appearance.colors.colLayer0Border

            RowLayout {
                anchors.fill: parent
                anchors.margins: 10
                spacing: 4

                Repeater {
                    model: root.last7
                    delegate: ColumnLayout {
                        id: bar
                        required property var modelData
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        spacing: 3

                        GritText {
                            Layout.alignment: Qt.AlignHCenter
                            text: bar.modelData.xp === 0 ? "" : `${bar.modelData.xp}`
                            font.pixelSize: Appearance.font.pixelSize.smallest
                            font.features: { "tnum": 1 }
                            font.variableAxes: { "wght": 600, "ROND": 100 }
                            color: bar.modelData.xp < 0
                                ? Appearance.colors.colError : Appearance.colors.colSubtext
                        }
                        Item {
                            Layout.fillWidth: true
                            Layout.fillHeight: true

                            Rectangle {
                                anchors.bottom: parent.bottom
                                width: parent.width
                                radius: Appearance.rounding.verysmall
                                height: root.last7Peak <= 0 ? 2
                                    : Math.max(2, parent.height * Math.abs(bar.modelData.xp) / root.last7Peak)
                                color: bar.modelData.xp < 0 ? Appearance.colors.colError
                                    : bar.modelData.xp === 0 ? Appearance.colors.colLayer2
                                    : Appearance.colors.colPrimary

                                Behavior on height {
                                    animation: Appearance.animation.elementMoveFast.numberAnimation.createObject(this)
                                }
                            }
                        }
                        GritText {
                            Layout.alignment: Qt.AlignHCenter
                            text: root.weekdayLetter(bar.modelData.day)
                            font.pixelSize: Appearance.font.pixelSize.smallest
                            color: bar.modelData.day === GritStore.today
                                ? Appearance.colors.colPrimary : Appearance.colors.colSubtext
                        }
                    }
                }
            }
        }

        Item { implicitHeight: 4 }
    }
}
