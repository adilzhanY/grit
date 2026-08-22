pragma ComponentBehavior: Bound
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import QtQuick
import QtQuick.Layouts
import "../../../services/grit/GritCore.js" as Core

/**
 * Burnt-calories logger: today's burn up top, a quick log form, and the
 * burn history grouped by day (last 5 days). Entries are "steps" day-logs
 * so they raise the food budget and ride the existing day_logs sync.
 */
StyledFlickable {
    id: root

    clip: true
    contentHeight: mainColumn.implicitHeight

    readonly property real burntToday: {
        GritStore.revision;
        return GritStore.db.dayLogs
            .filter(l => l.kind === "steps" && l.date === GritStore.today)
            .reduce((s, l) => s + (l.caloriesBurnt ?? 0), 0);
    }

    // Burn history grouped by day, newest first, last 5 days (like the food view)
    readonly property var burnHistory: {
        GritStore.revision;
        const byDate = {};
        for (const l of GritStore.db.dayLogs) {
            if (l.kind !== "steps")
                continue;
            if (!byDate[l.date])
                byDate[l.date] = [];
            byDate[l.date].push(l);
        }
        const dates = Object.keys(byDate).sort().reverse().slice(0, 5);
        return dates.map(date => ({
            date: date,
            rows: byDate[date].sort((a, b) => b.loggedAt - a.loggedAt)
        }));
    }

    function dayHeading(date) {
        if (date === GritStore.today)
            return Translation.tr("Today");
        if (date === Core.addDays(GritStore.today, -1))
            return Translation.tr("Yesterday");
        return Core.fmtDay(date);
    }

    function fmtClock(ts) {
        const d = new Date(ts);
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }

    function rowTitle(log) {
        // Entries synced from the web may be real step/distance logs
        if (log.steps)
            return `${log.steps} ${Translation.tr("steps")}${log.activity === "run" ? " · " + Translation.tr("Run") : ""}`;
        if (log.meters)
            return `${log.meters} m${log.activity === "run" ? " · " + Translation.tr("Run") : ""}`;
        return log.name ?? Translation.tr("Calories burnt");
    }

    function rowDetail(log) {
        const parts = [root.fmtClock(log.loggedAt)];
        if (log.minutes)
            parts.push(`${log.minutes} min`);
        if (log.caloriesBurnt)
            parts.push(`${Math.round(log.caloriesBurnt)} kcal`);
        return parts.join(" · ");
    }

    ColumnLayout {
        id: mainColumn
        width: parent.width
        spacing: 8

        // ---- Today's burn ----
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: burnColumn.implicitHeight + 20
            radius: Appearance.rounding.normal
            color: Appearance.colors.colLayer1
            border.width: 1
            border.color: Appearance.colors.colLayer0Border

            ColumnLayout {
                id: burnColumn
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
                        Layout.alignment: Qt.AlignBottom
                        Layout.bottomMargin: 3
                        text: "local_fire_department"
                        fill: 1
                        iconSize: Appearance.font.pixelSize.larger
                        color: Appearance.colors.colPrimary
                    }
                    GritText {
                        text: `${Math.round(root.burntToday)}`
                        font.pixelSize: 24
                        font.family: "Google Sans Flex"
                        font.features: { "tnum": 1 }
                        font.variableAxes: { "wght": 800, "ROND": 100 }
                        color: Appearance.colors.colOnLayer1
                    }
                    GritText {
                        Layout.alignment: Qt.AlignBottom
                        Layout.bottomMargin: 3
                        text: Translation.tr("kcal burnt today")
                        font.pixelSize: Appearance.font.pixelSize.small
                        font.family: "Google Sans Flex"
                        font.variableAxes: { "wght": 600, "ROND": 100 }
                        color: Appearance.colors.colSubtext
                    }
                    Item { Layout.fillWidth: true }
                }
            }
        }

        // ---- Log burnt calories form ----
        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            GritTextField {
                id: activityField
                Layout.fillWidth: true
                placeholderText: Translation.tr("Activity (optional)")
                onAccepted: root.logBurn()
            }
            GritTextField {
                id: kcalField
                Layout.preferredWidth: 70
                placeholderText: "kcal"
                validator: DoubleValidator { bottom: 0; top: 100000 }
                onAccepted: root.logBurn()
            }
            RippleButton {
                implicitHeight: 30
                buttonRadius: Appearance.rounding.full
                colBackground: Appearance.colors.colPrimary
                colBackgroundHover: Appearance.colors.colPrimaryHover
                colRipple: Appearance.colors.colPrimaryActive
                onClicked: root.logBurn()
                contentItem: GritText {
                    anchors.centerIn: parent
                    horizontalAlignment: Text.AlignHCenter
                    leftPadding: 14
                    rightPadding: 14
                    text: Translation.tr("Log it")
                    font.pixelSize: Appearance.font.pixelSize.small
                    color: Appearance.colors.colOnPrimary
                }
            }
        }

        // ---- History, grouped by day ----
        Repeater {
            model: root.burnHistory
            delegate: ColumnLayout {
                id: dayGroup
                required property var modelData
                Layout.fillWidth: true
                Layout.topMargin: 6
                spacing: 4

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    GritText {
                        text: root.dayHeading(dayGroup.modelData.date)
                        font.pixelSize: Appearance.font.pixelSize.normal
                        font.weight: Font.DemiBold
                        color: Appearance.colors.colPrimary
                    }
                    Item { Layout.fillWidth: true }
                    GritText {
                        text: {
                            const kcal = dayGroup.modelData.rows
                                .reduce((s, l) => s + (l.caloriesBurnt ?? 0), 0);
                            return Translation.tr("%1 kcal burnt").arg(Math.round(kcal));
                        }
                        font.pixelSize: Appearance.font.pixelSize.small
                        font.features: { "tnum": 1 }
                        font.variableAxes: { "wght": 600, "ROND": 100 }
                        color: Appearance.colors.colSubtext
                    }
                }

                Repeater {
                    model: dayGroup.modelData.rows
                    delegate: Rectangle {
                        id: logRow
                        required property var modelData
                        Layout.fillWidth: true
                        implicitHeight: logRowLayout.implicitHeight + 12
                        radius: Appearance.rounding.small
                        color: Appearance.colors.colLayer1
                        border.width: 1
                        border.color: Appearance.colors.colLayer0Border

                        RowLayout {
                            id: logRowLayout
                            anchors {
                                left: parent.left
                                right: parent.right
                                verticalCenter: parent.verticalCenter
                                leftMargin: 10
                                rightMargin: 6
                            }
                            spacing: 8

                            MaterialSymbol {
                                text: "local_fire_department"
                                iconSize: Appearance.font.pixelSize.larger
                                color: Appearance.colors.colSubtext
                            }
                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: -1

                                GritText {
                                    Layout.fillWidth: true
                                    text: root.rowTitle(logRow.modelData)
                                    font.pixelSize: Appearance.font.pixelSize.normal
                                    font.weight: Font.DemiBold
                                    color: Appearance.colors.colOnLayer1
                                    elide: Text.ElideRight
                                }
                                GritText {
                                    Layout.fillWidth: true
                                    text: root.rowDetail(logRow.modelData)
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    font.features: { "tnum": 1 }
                                    font.variableAxes: { "wght": 500, "ROND": 100 }
                                    color: Appearance.colors.colSubtext
                                    elide: Text.ElideRight
                                }
                            }
                            GritText {
                                visible: (logRow.modelData.awardedXp ?? 0) !== 0
                                text: Core.fmtXp(logRow.modelData.awardedXp)
                                font.pixelSize: Appearance.font.pixelSize.smallest
                                color: (logRow.modelData.awardedXp ?? 0) > 0
                                    ? Appearance.colors.colPrimary : Appearance.colors.colError
                            }
                            RippleButton {
                                implicitWidth: 26
                                implicitHeight: 26
                                buttonRadius: Appearance.rounding.full
                                onClicked: {
                                    const logId = logRow.modelData.id;
                                    GritConfirm.ask(
                                        Translation.tr("Delete log?"),
                                        `${root.rowTitle(logRow.modelData)} · ${Math.round(logRow.modelData.caloriesBurnt ?? 0)} kcal`,
                                        () => GritStore.deleteDayLog(logId));
                                }
                                contentItem: MaterialSymbol {
                                    anchors.centerIn: parent
                                    horizontalAlignment: Text.AlignHCenter
                                    text: "close"
                                    iconSize: Appearance.font.pixelSize.normal
                                    color: Appearance.colors.colSubtext
                                }
                            }
                        }
                    }
                }
            }
        }

        Item { implicitHeight: 4 }
    }

    function logBurn() {
        const kcal = parseFloat(kcalField.text) || 0;
        if (kcal <= 0)
            return;
        const name = activityField.text.trim();
        const input = { caloriesBurnt: kcal };
        if (name.length > 0)
            input.name = name;
        GritStore.addBurntLog(input);
        activityField.text = "";
        kcalField.text = "";
    }
}
