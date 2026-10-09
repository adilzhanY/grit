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
 * Task composer dialog: title, points, planned date, recurrence editor
 * (Must / any repeating task), slip penalty & multiplier (Bad).
 */
IrisDialog {
    id: root

    required property string currentView
    backgroundWidth: UiScale.px(410)

    // Which list the task lands in, derived from the current view
    readonly property string targetListType: {
        if (["must", "bad", "cool", "impossible"].includes(root.currentView))
            return root.currentView;
        if (root.currentView.startsWith("list:"))
            return "custom";
        return "custom"; // My Day / Important / Planned quick-adds are loose customs
    }

    // A clean form each time; focus goes to the title once the frame has it
    onOpened: {
        titleField.text = "";
        pointsField.text = "";
        plannedField.text = "";
        penaltyField.text = "";
        repeatEditor.loadFrom(null);
        titleField.forceActiveFocus();
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

        const recurrence = repeatEditor.buildRecurrence();
        if (recurrence)
            input.recurrence = recurrence;
        if (root.targetListType === "bad") {
            const penalty = parseInt(penaltyField.text);
            if (!isNaN(penalty) && penalty >= 0)
                input.slipPenalty = penalty;
        }

        const task = GritStore.addTask(input);
        if (root.currentView === "important")
            GritStore.updateTask(task.id, { important: true });
        root.close();
    }

    IrisText {
        role: "title"
        text: Translation.tr("Add to %1").arg(root.currentView.startsWith("list:")
            ? (GritStore.customLists.find(l => `list:${l.id}` === root.currentView)?.name ?? "list")
            : root.currentView)
    }

    IrisField {
        id: titleField
        Layout.fillWidth: true
        placeholderText: Translation.tr("What needs doing?")
        onAccepted: root.submit()
    }

    RowLayout {
        Layout.fillWidth: true
        spacing: UiScale.px(8)

        IrisField {
            id: pointsField
            Layout.preferredWidth: UiScale.px(100)
            placeholderText: Translation.tr("XP (%1)").arg(Core.DEFAULT_POINTS[root.targetListType])
            validator: IntValidator { bottom: 0; top: 100000 }
        }
        IrisField {
            id: plannedField
            Layout.fillWidth: true
            visible: root.targetListType !== "bad"
            placeholderText: Translation.tr("Planned (DD/MM/YYYY)")
        }
        IrisField {
            id: penaltyField
            Layout.fillWidth: true
            visible: root.targetListType === "bad"
            placeholderText: Translation.tr("Slip penalty (100)")
            validator: IntValidator { bottom: 0; top: 100000 }
        }
    }

    // Quick planned-date presets (selection reflects the field's value)
    IrisSegmented {
        Layout.fillWidth: true
        equal: true
        visible: root.targetListType !== "bad"
        value: {
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
            { label: Translation.tr("Today"), icon: "today", value: "today" },
            { label: Translation.tr("Tomorrow"), icon: "event", value: "tomorrow" },
            { label: Translation.tr("Next week"), icon: "date_range", value: "nextweek" }
        ]
    }

    // Recurrence editor
    GritRecurrenceEditor {
        id: repeatEditor
        Layout.fillWidth: true
        visible: root.targetListType !== "bad" && root.targetListType !== "cool"
            && root.targetListType !== "impossible"
        allowNone: root.targetListType !== "must"
    }

    RowLayout {
        Layout.fillWidth: true
        spacing: UiScale.px(8)
        Item { Layout.fillWidth: true }
        IrisPill {
            text: Translation.tr("Cancel")
            onClicked: root.close()
        }
        IrisPill {
            primary: true
            text: Translation.tr("Add task")
            onClicked: root.submit()
        }
    }
}
