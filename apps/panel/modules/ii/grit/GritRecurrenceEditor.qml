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
 * The Repeat block, shared by the add sheet and the edit dialog: type,
 * interval, and a weekday row for weekly.
 *
 * Weekdays are stored as JS getDay() numbers (Sunday is 0) because that is
 * what the web app and Core.dueOn expect, but the row is drawn Monday-first
 * via Core.WEEK_ORDER. Display order and stored value are not the same thing.
 */
ColumnLayout {
    id: root

    // Musts always repeat, so they are never offered a "Never"
    property bool allowNone: true
    property string recurrenceType: root.allowNone ? "none" : "daily"
    property int weekdayMask: 0

    readonly property var dayNames: [Translation.tr("Mon"), Translation.tr("Tue"),
        Translation.tr("Wed"), Translation.tr("Thu"), Translation.tr("Fri"),
        Translation.tr("Sat"), Translation.tr("Sun")]

    /** Fill the editor in from an existing task (or null to clear it). */
    function loadFrom(task) {
        const rec = task?.recurrence;
        if (!rec) {
            root.recurrenceType = root.allowNone ? "none" : "daily";
            root.weekdayMask = 0;
            intervalField.text = "";
            return;
        }
        root.recurrenceType = rec.type ?? "daily";
        let mask = 0;
        for (const d of rec.weekdays ?? [])
            mask |= (1 << d);
        root.weekdayMask = mask;
        const every = rec.interval ?? 1;
        intervalField.text = every > 1 ? `${every}` : "";
    }

    /** What to store: a recurrence object, or undefined to clear the key. */
    function buildRecurrence() {
        if (root.recurrenceType === "none")
            return undefined;
        const rec = { type: root.recurrenceType, weekdays: [] };
        if (root.recurrenceType === "weekly") {
            for (let d = 0; d < 7; d++) {
                if (root.weekdayMask & (1 << d))
                    rec.weekdays.push(d);
            }
        }
        const interval = parseInt(intervalField.text);
        if (!isNaN(interval) && interval > 1)
            rec.interval = interval;
        return rec;
    }

    spacing: UiScale.px(8)

    IrisText {
        text: Translation.tr("Repeat")
        leftPadding: UiScale.px(6)
        role: "hint"
    }

    // Up to five choices in a dialog: equal segments, text only, so they fit
    IrisSegmented {
        Layout.fillWidth: true
        equal: true
        value: root.recurrenceType
        onSelected: newValue => root.recurrenceType = newValue
        options: {
            const opts = [
                { label: Translation.tr("Daily"), value: "daily" },
                { label: Translation.tr("Weekly"), value: "weekly" },
                { label: Translation.tr("Monthly"), value: "monthly" },
                { label: Translation.tr("Yearly"), value: "yearly" }
            ];
            if (root.allowNone)
                opts.unshift({ label: Translation.tr("Never"), value: "none" });
            return opts;
        }
    }

    IrisField {
        id: intervalField
        Layout.preferredWidth: UiScale.px(130)
        visible: root.recurrenceType !== "none"
        placeholderText: Translation.tr("Every N")
        validator: IntValidator { bottom: 1; top: 365 }
    }

    // Weekday picker: a row of chips, multi-select, Monday first
    RowLayout {
        Layout.fillWidth: true
        visible: root.recurrenceType === "weekly"
        spacing: UiScale.px(4)

        Repeater {
            model: Core.WEEK_ORDER

            delegate: IrisChip {
                required property var modelData
                required property int index
                Layout.fillWidth: true
                implicitHeight: UiScale.px(34)
                clickable: true
                text: root.dayNames[index]
                on: (root.weekdayMask & (1 << modelData)) !== 0
                onClicked: root.weekdayMask ^= (1 << modelData)
            }
        }
    }
}
