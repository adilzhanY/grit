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
        spacing: UiScale.px(12)

        // ---- Today's burn ----
        IrisCard {
            RowLayout {
                Layout.fillWidth: true
                spacing: UiScale.px(14)

                IrisDisc {
                    size: UiScale.px(56)
                    icon: "local_fire_department"
                    on: true
                    filled: true
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 0

                    IrisText {
                        text: `${Math.round(root.burntToday)} kcal`
                        font.pixelSize: Appearance.font.pixelSize.hugeass
                        font.features: { "tnum": 1 }
                        font.weight: Font.ExtraBold
                        color: GritColors.fg
                    }
                    IrisText {
                        text: Translation.tr("burnt today")
                        font.pixelSize: Appearance.font.pixelSize.smaller
                        color: GritColors.fg3
                    }
                }
            }
        }

        // ---- Log burnt calories form ----
        IrisCard {
            spacing: UiScale.px(8)

            RowLayout {
                Layout.fillWidth: true
                spacing: UiScale.px(6)

                IrisField {
                    id: kcalField
                    Layout.preferredWidth: UiScale.px(110)
                    placeholderText: "kcal"
                    validator: DoubleValidator { bottom: 0; top: 100000 }
                    onAccepted: root.logBurn()
                }
                IrisField {
                    id: activityField
                    Layout.fillWidth: true
                    placeholderText: Translation.tr("Activity (optional)")
                    onAccepted: root.logBurn()
                }
            }
            RowLayout {
                Layout.fillWidth: true
                Item { Layout.fillWidth: true }
                IrisPill {
                    primary: true
                    text: Translation.tr("Log it")
                    onClicked: root.logBurn()
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
                Layout.topMargin: UiScale.px(4)
                spacing: UiScale.px(6)

                IrisSectionLabel {
                    Layout.fillWidth: true
                    text: root.dayHeading(dayGroup.modelData.date)
                    side: Translation.tr("%1 kcal burnt").arg(Math.round(dayGroup.modelData.rows
                        .reduce((s, l) => s + (l.caloriesBurnt ?? 0), 0)))
                }

                Repeater {
                    model: dayGroup.modelData.rows
                    delegate: Rectangle {
                        id: logRow
                        required property var modelData
                        Layout.fillWidth: true
                        implicitHeight: Math.max(UiScale.px(52), logRowLayout.implicitHeight + UiScale.px(14))
                        radius: height / 2
                        color: GritColors.raised

                        RowLayout {
                            id: logRowLayout
                            anchors {
                                left: parent.left
                                right: parent.right
                                verticalCenter: parent.verticalCenter
                                leftMargin: UiScale.px(20)
                                rightMargin: UiScale.px(10)
                            }
                            spacing: UiScale.px(8)

                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 0

                                IrisText {
                                    Layout.fillWidth: true
                                    text: root.rowTitle(logRow.modelData)
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    font.weight: Font.DemiBold
                                    color: GritColors.fg
                                    elide: Text.ElideRight
                                }
                                IrisText {
                                    Layout.fillWidth: true
                                    text: root.rowDetail(logRow.modelData)
                                    font.pixelSize: Appearance.font.pixelSize.smallest
                                    font.features: { "tnum": 1 }
                                    font.weight: Font.Medium
                                    color: GritColors.fg3
                                    elide: Text.ElideRight
                                }
                            }
                            IrisText {
                                visible: (logRow.modelData.awardedXp ?? 0) !== 0
                                text: Core.fmtXp(logRow.modelData.awardedXp)
                                font.pixelSize: Appearance.font.pixelSize.smallest
                                font.features: { "tnum": 1 }
                                color: (logRow.modelData.awardedXp ?? 0) > 0
                                    ? GritColors.fg2 : GritColors.danger
                            }
                            IrisText {
                                text: `${Math.round(logRow.modelData.caloriesBurnt ?? 0)} kcal`
                                font.pixelSize: Appearance.font.pixelSize.small
                                font.features: { "tnum": 1 }
                                font.weight: Font.Bold
                                color: GritColors.fg2
                            }
                            IrisDisc {
                                clickable: true
                                size: UiScale.px(32)
                                icon: "close"
                                tone: "card"
                                tip: Translation.tr("Delete")
                                onClicked: {
                                    const logId = logRow.modelData.id;
                                    GritConfirm.ask(
                                        Translation.tr("Delete log?"),
                                        `${root.rowTitle(logRow.modelData)} · ${Math.round(logRow.modelData.caloriesBurnt ?? 0)} kcal`,
                                        () => GritStore.deleteDayLog(logId));
                                }
                            }
                        }
                    }
                }
            }
        }

        Item { implicitHeight: UiScale.px(4) }
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
