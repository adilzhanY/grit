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
 * Body recomposition tracker: weight (the existing "weight" day-logs, so the
 * web app and the calorie maths see it too) plus tape measurements every two
 * weeks. Each site carries its measuring routine and the user's own fixed
 * spot, so every session measures the same place the same way.
 */
StyledFlickable {
    id: root

    clip: true
    contentHeight: mainColumn.implicitHeight

    readonly property string reminderTitle: Translation.tr("Measure body")
    readonly property var spots: GritStore.settings.bodySpots ?? {}
    readonly property int dueIn: Core.bodyDueIn(GritStore.measurements, GritStore.today)
    readonly property var weightAvg: Core.weightAvg7(GritStore.weightLogs, GritStore.today)
    readonly property var weightAvgBefore: Core.weightAvg7(GritStore.weightLogs, Core.addDays(GritStore.today, -14))
    readonly property bool hasReminder: {
        GritStore.revision;
        return GritStore.db.tasks.some(t => t.title === root.reminderTitle && !t.archived);
    }
    readonly property var weightSeries: GritStore.weightLogs.slice()
        .sort((a, b) => a.date < b.date ? -1 : 1)
        .slice(-60)
        .map(l => l.weightKg)

    function fmtCm(v) {
        return `${Math.round(v * 10) / 10} cm`;
    }
    function fmtChange(v, unit) {
        if (v === 0)
            return `±0 ${unit}`;
        return `${v > 0 ? "+" : "−"}${Math.abs(Math.round(v * 10) / 10)} ${unit}`;
    }
    // A flat 0..1 line for IrisGraph, with a little headroom so a flat series
    // does not sit on the floor of the chart.
    function normalise(vals) {
        if (vals.length < 2)
            return [];
        const lo = Math.min(...vals), hi = Math.max(...vals);
        const pad = Math.max(0.5, (hi - lo) * 0.2);
        return vals.map(v => (v - lo + pad) / (hi - lo + 2 * pad));
    }
    function saveSpot(site, text) {
        const next = Object.assign({}, root.spots);
        next[site] = text.trim();
        GritStore.updateSettings({ bodySpots: next });
    }
    function parseNum(text) {
        const v = parseFloat(String(text).replace(",", "."));
        return isFinite(v) && v > 0 ? v : 0;
    }

    ColumnLayout {
        id: mainColumn
        width: parent.width
        spacing: UiScale.px(12)

        // ---- When is the next tape session ----
        IrisCard {
            RowLayout {
                Layout.fillWidth: true
                spacing: UiScale.px(14)

                IrisDisc {
                    size: UiScale.px(56)
                    icon: "straighten"
                    on: root.dueIn <= 0
                    filled: true
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 0

                    IrisText {
                        Layout.fillWidth: true
                        text: GritStore.measurements.length === 0 ? Translation.tr("First measurement")
                            : root.dueIn <= 0 ? Translation.tr("Measure today")
                            : root.dueIn === 1 ? Translation.tr("Next tape in 1 day")
                            : Translation.tr("Next tape in %1 days").arg(root.dueIn)
                        role: "title"
                    }
                    IrisText {
                        Layout.fillWidth: true
                        text: GritStore.measurements.length === 0
                            ? Translation.tr("Read the guide, find your spots, then log all three")
                            : Translation.tr("Every %1 days, same weekday, in the morning").arg(Core.BODY_INTERVAL_DAYS)
                        role: "hint"
                    }
                }
                IrisPill {
                    visible: !root.hasReminder
                    compact: true
                    icon: "notifications"
                    text: Translation.tr("Remind me")
                    tip: Translation.tr("Adds a task to My Day every 2 weeks on this weekday")
                    onClicked: {
                        GritStore.addTask({
                            listType: "custom",
                            title: root.reminderTitle,
                            recurrence: { type: "weekly", interval: 2, weekdays: [Core.weekdayOf(GritStore.today)] }
                        });
                        GritToast.show(Translation.tr("Reminder added to My Day"), "notifications");
                    }
                }
            }
        }

        // ---- The rules that hold for every site ----
        IrisCard {
            title: Translation.tr("How to measure")
            icon: "info"
            spacing: UiScale.px(6)

            Repeater {
                model: Core.BODY_RULES
                delegate: RowLayout {
                    id: ruleRow
                    required property string modelData
                    required property int index
                    Layout.fillWidth: true
                    spacing: UiScale.px(10)

                    IrisText {
                        Layout.alignment: Qt.AlignTop
                        Layout.preferredWidth: UiScale.px(16)
                        text: `${ruleRow.index + 1}`
                        role: "secondary"
                        font.features: { "tnum": 1 }
                    }
                    IrisText {
                        Layout.fillWidth: true
                        text: ruleRow.modelData
                        role: "secondary"
                        wrapMode: Text.WordWrap
                        elide: Text.ElideNone
                    }
                }
            }
        }

        // ---- Weight ----
        IrisCard {
            title: Translation.tr("Weight")
            icon: "monitor_weight"
            trailing: root.weightAvg === null ? "" : Translation.tr("7 day avg %1 kg").arg(root.weightAvg)
            spacing: UiScale.px(8)

            IrisText {
                Layout.fillWidth: true
                visible: root.weightAvg !== null && root.weightAvgBefore !== null
                text: Translation.tr("%1 vs two weeks ago").arg(root.fmtChange(
                    (root.weightAvg ?? 0) - (root.weightAvgBefore ?? 0), "kg"))
                role: "secondary"
            }
            IrisGraph {
                Layout.fillWidth: true
                visible: root.weightSeries.length >= 2
                capacity: Math.max(2, root.weightSeries.length)
                values: root.normalise(root.weightSeries)
            }
            IrisText {
                Layout.fillWidth: true
                text: Translation.tr("Morning, after the toilet, before food or drink. Same scale on a hard floor. In a recomp the scale barely moves, so the tape below is the real test.")
                role: "hint"
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            RowLayout {
                Layout.fillWidth: true
                spacing: UiScale.px(6)

                IrisField {
                    id: weightField
                    Layout.fillWidth: true
                    placeholderText: Translation.tr("kg today")
                    inputMethodHints: Qt.ImhFormattedNumbersOnly
                    onAccepted: weightSave.clicked()
                }
                IrisPill {
                    id: weightSave
                    primary: true
                    text: Translation.tr("Log")
                    onClicked: {
                        const kg = root.parseNum(weightField.text);
                        if (kg < 20 || kg > 400) {
                            weightField.shake();
                            return;
                        }
                        GritStore.addWeightLog(kg);
                        weightField.text = "";
                        GritToast.show(Translation.tr("Weight logged"), "monitor_weight");
                    }
                }
            }
        }

        // ---- One card per tape site ----
        Repeater {
            model: Core.BODY_SITES
            delegate: IrisCard {
                id: siteCard
                required property var modelData
                readonly property var series: Core.bodySeries(GritStore.measurements, modelData.id)
                readonly property string spot: root.spots[modelData.id] ?? ""

                title: modelData.name
                icon: modelData.icon
                trailing: series.last === null ? "" : root.fmtCm(series.last)
                spacing: UiScale.px(8)

                IrisText {
                    Layout.fillWidth: true
                    visible: siteCard.series.points.length >= 2
                    text: Translation.tr("%1 since %2").arg(root.fmtChange(siteCard.series.change, "cm"))
                        .arg(Core.fmtDay(siteCard.series.points[0]?.date ?? GritStore.today))
                    role: "secondary"
                }
                IrisGraph {
                    Layout.fillWidth: true
                    visible: siteCard.series.points.length >= 2
                    capacity: Math.max(2, siteCard.series.points.length)
                    values: root.normalise(siteCard.series.points.map(p => p.value))
                }
                IrisText {
                    Layout.fillWidth: true
                    text: siteCard.modelData.how
                    role: "secondary"
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
                // Only until the spot is saved: after that it is noise
                IrisText {
                    Layout.fillWidth: true
                    visible: siteCard.spot === ""
                    text: Translation.tr("First time: %1").arg(siteCard.modelData.firstTime)
                    role: "hint"
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
                IrisField {
                    id: spotField
                    Layout.fillWidth: true
                    icon: "pin"
                    placeholderText: Translation.tr("Your spot, %1").arg(siteCard.modelData.spotHint)
                    // One-way seed: binding text here would fight the typist
                    Component.onCompleted: text = siteCard.spot
                    onEditingFinished: {
                        if (text.trim() !== siteCard.spot)
                            root.saveSpot(siteCard.modelData.id, text);
                    }
                }
                RowLayout {
                    Layout.fillWidth: true
                    spacing: UiScale.px(6)

                    IrisField {
                        id: cmField
                        Layout.fillWidth: true
                        placeholderText: Translation.tr("cm today")
                        inputMethodHints: Qt.ImhFormattedNumbersOnly
                        onAccepted: cmSave.clicked()
                    }
                    IrisPill {
                        id: cmSave
                        primary: true
                        text: Translation.tr("Save")
                        onClicked: {
                            const cm = root.parseNum(cmField.text);
                            if (cm < 10 || cm > 250) {
                                cmField.shake();
                                return;
                            }
                            GritStore.saveMeasurements(GritStore.today, { [siteCard.modelData.id]: cm });
                            cmField.text = "";
                            GritToast.show(Translation.tr("%1 saved").arg(siteCard.modelData.name), "straighten");
                        }
                    }
                }
            }
        }

        // ---- Past sessions ----
        IrisSectionLabel {
            Layout.fillWidth: true
            Layout.topMargin: UiScale.px(4)
            visible: GritStore.measurements.length > 0
            text: Translation.tr("Sessions")
        }
        Repeater {
            model: GritStore.measurements.slice().reverse()
            delegate: Rectangle {
                id: sessionRow
                required property var modelData
                Layout.fillWidth: true
                implicitHeight: Math.max(UiScale.px(52), sessionLayout.implicitHeight + UiScale.px(14))
                radius: height / 2
                color: GritColors.raised

                RowLayout {
                    id: sessionLayout
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
                            text: Core.fmtDay(sessionRow.modelData.date)
                            font.pixelSize: Appearance.font.pixelSize.small
                            font.weight: Font.DemiBold
                            color: GritColors.fg
                        }
                        IrisText {
                            Layout.fillWidth: true
                            text: Core.BODY_SITES
                                .filter(s => typeof sessionRow.modelData[s.id] === "number")
                                .map(s => `${s.name} ${root.fmtCm(sessionRow.modelData[s.id])}`)
                                .join(" · ")
                            font.pixelSize: Appearance.font.pixelSize.smallest
                            font.features: { "tnum": 1 }
                            color: GritColors.fg3
                        }
                    }
                    IrisDisc {
                        clickable: true
                        size: UiScale.px(32)
                        icon: "close"
                        tone: "card"
                        tip: Translation.tr("Delete")
                        onClicked: {
                            const date = sessionRow.modelData.date;
                            GritConfirm.ask(Translation.tr("Delete session?"), Core.fmtDay(date),
                                () => GritStore.deleteMeasurementDay(date));
                        }
                    }
                }
            }
        }

        Item { implicitHeight: UiScale.px(4) }
    }
}
