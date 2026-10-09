pragma ComponentBehavior: Bound
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import qs.modules.glass
import qs.modules.iris
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
        spacing: UiScale.px(12)

        IrisDisc {
            Layout.alignment: Qt.AlignHCenter
            size: UiScale.px(56)
            icon: root.isBad ? "sentiment_very_satisfied" : "check"
        }
        IrisText {
            Layout.alignment: Qt.AlignHCenter
            text: root.isPlanned ? Translation.tr("Nothing planned ahead")
                : root.isBad ? Translation.tr("No bad habits tracked. Nice.")
                : Translation.tr("Nothing here!")
            font.pixelSize: Appearance.font.pixelSize.small
            color: GritColors.fg3
        }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: UiScale.px(12)

        // ---- Always-available composer, the Super+Enter search field's glass ----
        GlassSurface {
            Layout.fillWidth: true
            visible: !root.isPlanned
            implicitHeight: UiScale.px(56)
            radius: height / 2
            showShadow: false
            colorTop: Qt.rgba(0.02, 0.02, 0.03, 0.90)
            colorBottom: Qt.rgba(0.12, 0.12, 0.14, 0.58)

            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.IBeamCursor
                onClicked: composerField.forceActiveFocus()
            }

            MaterialSymbol {
                id: composerPlus
                anchors.left: parent.left
                anchors.leftMargin: UiScale.px(20)
                anchors.verticalCenter: parent.verticalCenter
                text: "add"
                iconSize: Appearance.font.pixelSize.larger
                color: composerField.activeFocus ? Qt.rgba(1, 1, 1, 0.94) : Qt.rgba(1, 1, 1, 0.34)
                Behavior on color {
                    ColorAnimation { duration: 160 }
                }
            }

            Item {
                anchors.fill: parent
                anchors.leftMargin: UiScale.px(52)
                anchors.rightMargin: UiScale.px(60)
                clip: true

                TextInput {
                    id: composerField
                    font.family: Iris.fontFamily
                    renderType: Appearance.font.renderType
                    clip: true
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    font.pixelSize: Appearance.font.pixelSize.larger
                    color: Qt.rgba(1, 1, 1, 0.94)
                    selectionColor: Qt.rgba(1, 1, 1, 0.11)
                    selectedTextColor: Qt.rgba(1, 1, 1, 0.94)
                    selectByMouse: true
                    cursorDelegate: Item {} // GlassCaret draws the caret
                    onAccepted: {
                        root.quickAdd(text);
                        text = "";
                    }
                }
                Text {
                    anchors.left: composerField.left
                    anchors.right: composerField.right
                    anchors.verticalCenter: composerField.verticalCenter
                    visible: composerField.text.length === 0
                    text: root.viewId === "myday" ? Translation.tr("Add a task for today…")
                        : Translation.tr("Add a task…")
                    renderType: Appearance.font.renderType
                    font: composerField.font
                    color: Qt.rgba(1, 1, 1, 0.34)
                    elide: Text.ElideRight
                }
            }

            GlassCaret {
                input: composerField
                visible: composerField.activeFocus
                colCaret: "#ffffff"
                colGlow: Qt.rgba(0.86, 0.93, 1, 0.95)
                colBloom: Qt.rgba(0.80, 0.90, 1, 0.45)
            }

            // Opens the full "add a task" sheet
            IrisDisc {
                anchors.right: parent.right
                anchors.rightMargin: UiScale.px(12)
                anchors.verticalCenter: parent.verticalCenter
                size: UiScale.px(34)
                icon: "tune"
                clickable: true
                tip: Translation.tr("More options (XP, repeat, date…)")
                onClicked: root.requestAdvanced()
            }
        }

        // ---- My Day: everything done for today ----
        Item {
            visible: root.allDoneToday
            Layout.fillWidth: true
            Layout.fillHeight: true

            ColumnLayout {
                id: trophy
                anchors.centerIn: parent
                spacing: UiScale.px(16)

                // Springs in each time the last task of the day is ticked
                onVisibleChanged: if (visible) trophyPop.restart()
                SequentialAnimation {
                    id: trophyPop
                    PropertyAction { target: trophy; property: "scale"; value: 0.7 }
                    SpringAnimation { target: trophy; property: "scale"; to: 1; spring: 2.6; damping: 0.28; epsilon: 0.005 }
                }

                IrisDisc {
                    Layout.alignment: Qt.AlignHCenter
                    size: UiScale.px(112)
                    icon: "emoji_events"
                    on: true
                    filled: true
                    iconSize: Appearance.font.pixelSize.hugeass * 2
                }
                IrisText {
                    Layout.alignment: Qt.AlignHCenter
                    text: "FUCKING LEGEND"
                    font.pixelSize: Appearance.font.pixelSize.hugeass * 1.3
                    font.weight: Font.ExtraBold
                    color: GritColors.fg
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
            spacing: UiScale.px(8)

            // ---- My Day: the daily loop sits above the tasks ----
            Loader {
                Layout.fillWidth: true
                Layout.bottomMargin: UiScale.px(4)
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
                    spacing: UiScale.px(8)

                    IrisSectionLabel {
                        Layout.fillWidth: true
                        Layout.topMargin: UiScale.px(6)
                        text: {
                            const day = plannedGroup.modelData.day;
                            const weekday = Core.WEEKDAY_NAMES[Core.weekdayOf(day)];
                            const prefix = day === Core.addDays(GritStore.today, 1)
                                ? Translation.tr("Tomorrow") + "  ·  " : "";
                            return `${prefix}${weekday}  ·  ${Core.fmtDay(day)}`;
                        }
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

            // Done divider: a quiet caption, the dimmed rows below say the rest
            IrisSectionLabel {
                Layout.fillWidth: true
                Layout.topMargin: UiScale.px(8)
                visible: !root.isPlanned && root.doneTasks.length > 0
                text: ((root.viewId === "cool" || root.viewId === "impossible")
                    ? Translation.tr("Achieved") : Translation.tr("Done"))
                    + "  ·  " + root.doneTasks.length
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

            Item { implicitHeight: UiScale.px(4) }
        }
        }
    }
}
