pragma ComponentBehavior: Bound
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import QtQuick
import QtQuick.Layouts
import "../../../services/grit/GritCore.js" as Core

/**
 * Task composer dialog: title, points, planned date, recurrence editor
 * (Must / any repeating task), slip penalty & multiplier (Bad).
 */
WindowDialog {
    id: root

    required property string currentView
    backgroundWidth: 390
    autoResize: true

    // Which list the task lands in, derived from the current view
    readonly property string targetListType: {
        if (["must", "bad", "cool", "impossible"].includes(root.currentView))
            return root.currentView;
        if (root.currentView.startsWith("list:"))
            return "custom";
        return "custom"; // My Day / Important / Planned quick-adds are loose customs
    }

    property int weekdayMask: 0 // bitmask of selected weekdays for weekly recurrence
    property string recurrenceType: "none"

    onShowChanged: {
        if (root.show) {
            titleField.text = "";
            pointsField.text = "";
            plannedField.text = "";
            penaltyField.text = "";
            intervalField.text = "";
            root.recurrenceType = root.targetListType === "must" ? "daily" : "none";
            root.weekdayMask = 0;
            titleField.forceActiveFocus();
        }
    }

    function submit() {
        const title = titleField.text.trim();
        if (title.length === 0)
            return;
        const input = {
            listType: root.targetListType,
            title: title
        };
        const points = parseInt(pointsField.text);
        if (!isNaN(points) && points >= 0)
            input.points = points;
        if (root.currentView.startsWith("list:"))
            input.listId = root.currentView.slice(5);
        if (root.currentView === "myday")
            input.starredMyDay = true;
        if (root.currentView === "important")
            input.important = true; // applied post-add below
        const plannedDay = Core.parseDayInput(plannedField.text);
        if (plannedDay)
            input.plannedFor = plannedDay;

        if (root.recurrenceType !== "none") {
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
            input.recurrence = rec;
        }
        if (root.targetListType === "bad") {
            const penalty = parseInt(penaltyField.text);
            if (!isNaN(penalty) && penalty >= 0)
                input.slipPenalty = penalty;
        }

        const task = GritStore.addTask(input);
        if (root.currentView === "important")
            GritStore.updateTask(task.id, { important: true });
        root.dismiss();
    }

    GritDialogTitle {
        text: Translation.tr("Add to %1").arg(root.currentView.startsWith("list:")
            ? (GritStore.customLists.find(l => `list:${l.id}` === root.currentView)?.name ?? "list")
            : root.currentView)
    }

    GritTextField {
        labelBackgroundColor: Appearance.m3colors.m3surfaceContainerHigh
        id: titleField
        Layout.fillWidth: true
        placeholderText: Translation.tr("What needs doing?")
        onAccepted: root.submit()
    }

    RowLayout {
        Layout.fillWidth: true
        spacing: 8

        GritTextField {
        labelBackgroundColor: Appearance.m3colors.m3surfaceContainerHigh
            id: pointsField
            Layout.preferredWidth: 100
            placeholderText: Translation.tr("XP (%1)").arg(Core.DEFAULT_POINTS[root.targetListType])
            validator: IntValidator { bottom: 0; top: 100000 }
        }
        GritTextField {
        labelBackgroundColor: Appearance.m3colors.m3surfaceContainerHigh
            id: plannedField
            Layout.fillWidth: true
            visible: root.targetListType !== "bad"
            placeholderText: Translation.tr("Planned (DD/MM/YYYY)")
        }
        GritTextField {
        labelBackgroundColor: Appearance.m3colors.m3surfaceContainerHigh
            id: penaltyField
            Layout.fillWidth: true
            visible: root.targetListType === "bad"
            placeholderText: Translation.tr("Slip penalty (100)")
            validator: IntValidator { bottom: 0; top: 100000 }
        }
    }

    // Quick planned-date presets (selection reflects the field's value)
    GritSelectionArray {
        visible: root.targetListType !== "bad"
        currentValue: {
            const day = Core.parseDayInput(plannedField.text);
            if (day === GritStore.today)
                return "today";
            if (day === Core.addDays(GritStore.today, 1))
                return "tomorrow";
            if (day === Core.addDays(GritStore.today, 7))
                return "nextweek";
            return "";
        }
        onSelected: newValue => {
            if (newValue === "today")
                plannedField.text = Core.fmtDay(GritStore.today);
            else if (newValue === "tomorrow")
                plannedField.text = Core.fmtDay(Core.addDays(GritStore.today, 1));
            else
                plannedField.text = Core.fmtDay(Core.addDays(GritStore.today, 7));
        }
        options: [
            { displayName: Translation.tr("Today"), icon: "today", value: "today" },
            { displayName: Translation.tr("Tomorrow"), icon: "event", value: "tomorrow" },
            { displayName: Translation.tr("Next week"), icon: "date_range", value: "nextweek" }
        ]
    }

    // Recurrence editor
    ColumnLayout {
        Layout.fillWidth: true
        visible: root.targetListType !== "bad" && root.targetListType !== "cool" && root.targetListType !== "impossible"
        spacing: 6

        GritText {
            text: Translation.tr("Repeat")
            font.pixelSize: Appearance.font.pixelSize.smallest
            color: Appearance.colors.colSubtext
        }

        GritSelectionArray {
            currentValue: root.recurrenceType
            onSelected: newValue => root.recurrenceType = newValue
            options: root.targetListType === "must" ? [
                { displayName: Translation.tr("Daily"), icon: "today", value: "daily" },
                { displayName: Translation.tr("Weekly"), icon: "date_range", value: "weekly" },
                { displayName: Translation.tr("Monthly"), icon: "calendar_month", value: "monthly" },
                { displayName: Translation.tr("Yearly"), icon: "event_repeat", value: "yearly" }
            ] : [
                { displayName: Translation.tr("Never"), icon: "block", value: "none" },
                { displayName: Translation.tr("Daily"), icon: "today", value: "daily" },
                { displayName: Translation.tr("Weekly"), icon: "date_range", value: "weekly" },
                { displayName: Translation.tr("Monthly"), icon: "calendar_month", value: "monthly" },
                { displayName: Translation.tr("Yearly"), icon: "event_repeat", value: "yearly" }
            ]
        }

        GritTextField {
        labelBackgroundColor: Appearance.m3colors.m3surfaceContainerHigh
            id: intervalField
            Layout.preferredWidth: 110
            visible: root.recurrenceType !== "none"
            placeholderText: Translation.tr("Every N")
            validator: IntValidator { bottom: 1; top: 365 }
        }

        // Weekday picker: M3 connected button group, multi-select
        RowLayout {
            Layout.fillWidth: true
            visible: root.recurrenceType === "weekly"
            spacing: 2

            Repeater {
                model: [Translation.tr("Sun"), Translation.tr("Mon"), Translation.tr("Tue"),
                        Translation.tr("Wed"), Translation.tr("Thu"), Translation.tr("Fri"),
                        Translation.tr("Sat")]
                delegate: GritSelectionGroupButton {
                    required property var modelData
                    required property int index
                    Layout.fillWidth: true
                    leftmost: index === 0
                    rightmost: index === 6
                    buttonText: modelData
                    toggled: (root.weekdayMask & (1 << index)) !== 0
                    onClicked: root.weekdayMask ^= (1 << index)
                }
            }
        }
    }

    WindowDialogButtonRow {
        Item { Layout.fillWidth: true }
        GritDialogButton {
            buttonText: Translation.tr("Cancel")
            onClicked: root.dismiss()
        }
        GritDialogButton {
            buttonText: Translation.tr("Add task")
            onClicked: root.submit()
        }
    }

}
