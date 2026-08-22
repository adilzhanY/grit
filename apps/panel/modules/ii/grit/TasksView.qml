pragma ComponentBehavior: Bound
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import QtQuick
import QtQuick.Layouts
import "../../../services/grit/GritCore.js" as Core

/**
 * Task cards for a Grit view: a vertical scrolling list with a dimmed
 * Done/Achieved section, or day-grouped sections for the Planned view.
 */
Item {
    id: root

    required property string viewId

    signal requestAdvanced()

    readonly property bool isBad: viewId === "bad"
    readonly property bool isPlanned: viewId === "planned"

    /** Quick-add with the view's defaults (mirrors the web's top composer). */
    function quickAdd(title) {
        const t = title.trim();
        if (t.length === 0)
            return;
        const listType = ["must", "bad", "cool", "impossible"].includes(root.viewId)
            ? root.viewId : "custom";
        const input = { listType: listType, title: t };
        if (root.viewId.startsWith("list:"))
            input.listId = root.viewId.slice(5);
        if (root.viewId === "myday")
            input.starredMyDay = true;
        const task = GritStore.addTask(input);
        if (root.viewId === "important")
            GritStore.updateTask(task.id, { important: true });
    }

    readonly property var activeTasks: {
        GritStore.revision;
        const today = GritStore.today;
        const all = GritStore.db.tasks;
        switch (root.viewId) {
        case "myday": {
            const mine = Core.myDayTasks(all, today).filter(t => !GritStore.isDoneToday(t));
            return Core.byMyDayPriority(mine);
        }
        case "important":
            return Core.byXp(Core.importantTasks(all));
        case "must":
            return Core.byXp(all.filter(t => t.listType === "must" && !t.archived
                && !GritStore.isDoneToday(t)));
        case "bad":
            return Core.byXp(all.filter(t => t.listType === "bad" && !t.archived));
        case "cool":
            return Core.byXp(all.filter(t => t.listType === "cool" && !t.archived));
        case "impossible":
            return Core.byXp(all.filter(t => t.listType === "impossible" && !t.archived));
        default: {
            if (root.viewId.startsWith("list:")) {
                const listId = root.viewId.slice(5);
                return Core.byXp(all.filter(t => t.listId === listId && !t.archived));
            }
            return [];
        }
        }
    }

    readonly property var doneTasks: {
        GritStore.revision;
        const today = GritStore.today;
        const all = GritStore.db.tasks;
        switch (root.viewId) {
        case "myday": {
            const mine = Core.myDayTasks(all, today).filter(t => GritStore.isDoneToday(t));
            return mine.filter(t => Core.showsInMyDayDone(t, today));
        }
        case "must":
            return all.filter(t => t.listType === "must" && !t.archived && GritStore.isDoneToday(t));
        case "cool":
            return all.filter(t => t.listType === "cool" && t.archived);
        case "impossible":
            return all.filter(t => t.listType === "impossible" && t.archived);
        default: {
            if (root.viewId.startsWith("list:")) {
                const listId = root.viewId.slice(5);
                return all.filter(t => t.listId === listId && t.archived);
            }
            return [];
        }
        }
    }

    readonly property bool allDoneToday: viewId === "myday"
        && activeTasks.length === 0 && doneTasks.length > 0

    readonly property var plannedGroups: {
        GritStore.revision;
        if (!root.isPlanned)
            return [];
        return Core.plannedDays(GritStore.db.tasks, GritStore.today, 10);
    }

    // ---- Vim layer: publish the visible card order for j/k and f ----
    // Planned ids carry the day, because one recurring task can appear under
    // several days and a command must land on exactly the card that was picked.
    function publishCards() {
        const ids = [];
        if (root.isPlanned) {
            for (const g of root.plannedGroups) {
                for (const t of g.tasks)
                    ids.push(`${t.id}|${g.day}`);
            }
        } else {
            for (const t of root.activeTasks)
                ids.push(t.id);
            for (const t of root.doneTasks)
                ids.push(t.id);
        }
        GritKeys.setCards(root.viewId, ids);
    }
    onActiveTasksChanged: root.publishCards()
    onDoneTasksChanged: root.publishCards()
    onPlannedGroupsChanged: root.publishCards()
    Component.onCompleted: root.publishCards()
    Component.onDestruction: GritKeys.clearCards(root.viewId)

    Connections {
        target: GritKeys
        function onAddRequested() {
            if (!root.isPlanned)
                composerField.forceActiveFocus();
        }
    }

    // Empty state
    ColumnLayout {
        anchors.centerIn: parent
        visible: root.isPlanned ? root.plannedGroups.length === 0
            : (root.activeTasks.length === 0 && root.doneTasks.length === 0)
        spacing: 4

        MaterialSymbol {
            Layout.alignment: Qt.AlignHCenter
            text: root.isBad ? "sentiment_very_satisfied" : "check_circle"
            iconSize: 40
            color: Appearance.colors.colSubtext
        }
        GritText {
            Layout.alignment: Qt.AlignHCenter
            text: root.isPlanned ? Translation.tr("Nothing planned ahead")
                : root.isBad ? Translation.tr("No bad habits tracked. Nice.")
                : Translation.tr("Nothing here!")
            font.pixelSize: Appearance.font.pixelSize.small
            color: Appearance.colors.colSubtext
        }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 8

        // ---- Always-available composer (like the web's AddTask on top) ----
        Rectangle {
            Layout.fillWidth: true
            visible: !root.isPlanned
            implicitHeight: 44
            radius: Appearance.rounding.normal
            color: Appearance.colors.colLayer1
            border.width: 1
            border.color: composerField.activeFocus ? Appearance.colors.colPrimary : Appearance.colors.colLayer0Border

            Behavior on border.color {
                ColorAnimation { duration: Appearance.animation.elementMoveFast.duration }
            }

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 6
                spacing: 10

                MaterialSymbol {
                    text: "add"
                    iconSize: Appearance.font.pixelSize.larger
                    color: composerField.activeFocus ? Appearance.colors.colPrimary : Appearance.colors.colSubtext
                }
                GritTextInput {
                    id: composerField
                    Layout.fillWidth: true
                    font.pixelSize: Appearance.font.pixelSize.small
                    color: Appearance.colors.colOnLayer1
                    onAccepted: {
                        root.quickAdd(text);
                        text = "";
                    }
                    GritText {
                        anchors.fill: parent
                        verticalAlignment: Text.AlignVCenter
                        visible: composerField.text.length === 0
                        text: root.viewId === "myday" ? Translation.tr("Add a task for today…")
                            : Translation.tr("Add a task…")
                        font.pixelSize: Appearance.font.pixelSize.small
                        color: Appearance.colors.colSubtext
                    }
                }
                RippleButton {
                    implicitWidth: 32
                    implicitHeight: 32
                    buttonRadius: Appearance.rounding.full
                    onClicked: root.requestAdvanced()
                    GritToolTip { text: Translation.tr("More options (XP, repeat, date…)") }
                    contentItem: MaterialSymbol {
                        anchors.centerIn: parent
                        horizontalAlignment: Text.AlignHCenter
                        text: "tune"
                        iconSize: Appearance.font.pixelSize.larger
                        color: Appearance.colors.colSubtext
                    }
                }
            }
        }

        // ---- My Day: everything done for today ----
        Item {
            visible: root.allDoneToday
            Layout.fillWidth: true
            Layout.fillHeight: true

            ColumnLayout {
                anchors.centerIn: parent
                spacing: 12

                MaterialSymbol {
                    Layout.alignment: Qt.AlignHCenter
                    text: "emoji_events"
                    iconSize: 80
                    color: Appearance.colors.colPrimary
                }
                GritText {
                    Layout.alignment: Qt.AlignHCenter
                    text: "FUCKING LEGEND"
                    font.pixelSize: 36
                    font.weight: Font.Bold
                    color: Appearance.colors.colPrimary
                }
            }
        }

        StyledFlickable {
            Layout.fillWidth: true
            Layout.fillHeight: !root.allDoneToday
            Layout.preferredHeight: root.allDoneToday
                ? Math.min(contentHeight, root.height * 0.5) : -1
            clip: true
            contentHeight: contentColumn.implicitHeight

        ColumnLayout {
            id: contentColumn
            width: parent.width
            spacing: 6

            // ---- My Day: the daily loop sits above the tasks ----
            Loader {
                Layout.fillWidth: true
                Layout.bottomMargin: 2
                active: root.viewId === "myday"
                visible: active
                sourceComponent: DailyPanel {}
            }

            // ---- Planned: day-grouped sections ----
            Repeater {
                model: root.plannedGroups
                delegate: ColumnLayout {
                    id: plannedGroup
                    required property var modelData
                    Layout.fillWidth: true
                    spacing: 6

                    GritText {
                        Layout.topMargin: 4
                        text: {
                            const day = modelData.day;
                            const weekday = Core.WEEKDAY_NAMES[Core.weekdayOf(day)];
                            const prefix = day === Core.addDays(GritStore.today, 1)
                                ? Translation.tr("Tomorrow") + " · " : "";
                            return `${prefix}${weekday} · ${Core.fmtDay(day)}`;
                        }
                        font.pixelSize: Appearance.font.pixelSize.small
                        font.weight: Font.DemiBold
                        color: Appearance.colors.colPrimary
                    }
                    Repeater {
                        model: plannedGroup.modelData.tasks
                        delegate: TaskCard {
                            required property var modelData
                            Layout.fillWidth: true
                            task: modelData
                            compact: true
                            forDay: plannedGroup.modelData.day
                        }
                    }
                }
            }

            // ---- Regular views ----
            Repeater {
                model: root.isPlanned ? [] : root.activeTasks
                delegate: Loader {
                    required property var modelData
                    Layout.fillWidth: true
                    sourceComponent: root.isBad ? badCardComponent : taskCardComponent
                    onLoaded: item.task = modelData
                    Component {
                        id: taskCardComponent
                        TaskCard {}
                    }
                    Component {
                        id: badCardComponent
                        BadCard {}
                    }
                }
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 6
                visible: !root.isPlanned && root.doneTasks.length > 0
                spacing: 8

                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: 1
                    color: Appearance.colors.colOutlineVariant
                }
                GritText {
                    text: (root.viewId === "cool" || root.viewId === "impossible")
                        ? Translation.tr("Achieved") : Translation.tr("Done")
                    font.pixelSize: Appearance.font.pixelSize.smallest
                    color: Appearance.colors.colSubtext
                }
                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: 1
                    color: Appearance.colors.colOutlineVariant
                }
            }

            Repeater {
                model: root.isPlanned ? [] : root.doneTasks
                delegate: TaskCard {
                    required property var modelData
                    Layout.fillWidth: true
                    task: modelData
                    dimmed: true
                }
            }

            Item { implicitHeight: 4 }
        }
        }
    }
}
