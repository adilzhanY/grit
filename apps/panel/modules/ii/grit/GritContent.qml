pragma ComponentBehavior: Bound
import qs
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import QtQuick
import QtQuick.Layouts
import "../../../services/grit/GritCore.js" as Core

/**
 * Grit sidebar layout: vertical nav rail on the left, then XP hero,
 * scrolling content, and a bottom action bar. The current view lives in
 * GlobalStates.gritView so it's scriptable via IPC.
 */
Item {
    id: root

    readonly property string currentView: GlobalStates.gritView

    /** The canonical rail, in the order it was written. Sorted for display below. */
    readonly property var navEntries: {
        const entries = [
            { id: "myday", name: Translation.tr("My Day"), icon: "wb_sunny" },
            { id: "important", name: Translation.tr("Important"), icon: "star" },
            { id: "planned", name: Translation.tr("Planned"), icon: "event_upcoming" },
            { id: "must", name: Translation.tr("Must"), icon: "local_fire_department" },
            { id: "calories", name: Translation.tr("Calories"), icon: "directions_run" },
            { id: "food", name: Translation.tr("Daily Log"), icon: "restaurant" },
            { id: "bad", name: Translation.tr("Bad"), icon: "skull" },
            { id: "cool", name: Translation.tr("Cool"), icon: "auto_awesome" },
            { id: "impossible", name: Translation.tr("Impossible"), icon: "landscape" },
            { id: "focus", name: Translation.tr("Focus"), icon: "timer" }
        ];
        for (const list of GritStore.customLists)
            entries.push({ id: `list:${list.id}`, name: list.name, icon: "checklist" });
        return entries;
    }

    /**
     * The head of the rail is fixed by hand and never moves, however the usage
     * numbers fall. These are the views worth reaching for by muscle memory, so
     * a busy week must not be able to push one of them down a row.
     */
    readonly property var pinnedOrder: ["myday", "focus", "food", "calories", "bad"]

    /**
     * Everything below the fixed head is ranked by how often it gets edited.
     * Scores are snapshotted when the panel opens rather than read live, so the
     * rail holds still while it is on screen: a list that climbed a rank the
     * moment you ticked something would move the row out from under the pointer
     * and the next click would land on the wrong view.
     *
     * Ties fall back to the canonical order, so with no history at all the tail
     * reads exactly like the old static list.
     */
    property var navScores: ({})

    function refreshNavOrder() {
        root.navScores = GritNavUsage.snapshot();
    }

    readonly property var orderedNavEntries: {
        const entries = root.navEntries;
        const scores = root.navScores;
        const pinned = root.pinnedOrder;

        const head = [];
        for (const id of pinned) {
            const entry = entries.find(e => e.id === id);
            if (entry)
                head.push(entry);
        }
        const tail = entries
            .filter(e => pinned.indexOf(e.id) < 0)
            .map((e, i) => ({ entry: e, i: i, score: scores[e.id] ?? 0 }))
            .sort((a, b) => (b.score - a.score) || (a.i - b.i))
            .map(x => x.entry);
        return head.concat(tail);
    }

    Connections {
        target: GlobalStates
        function onGritOpenChanged() {
            if (GlobalStates.gritOpen)
                root.refreshNavOrder();
        }
    }

    // The usage file is read asynchronously. If the panel wins that race on the
    // first open after a shell start, sort again the moment it lands: fires once,
    // before the user has had time to aim at anything.
    Connections {
        target: GritNavUsage
        function onLoadedChanged() {
            if (GritNavUsage.loaded)
                root.refreshNavOrder();
        }
    }

    Component.onCompleted: root.refreshNavOrder()

    // ---------------- Vim keyboard layer ----------------

    /**
     * Mnemonic letters for the whole rail (tab-hint mode, g): word initials
     * first, then any letter of the name, then a home-row fallback. Assigned
     * in display order, so the pinned head gets first pick and its letters
     * stay stable no matter how the ranked tail moves.
     */
    readonly property var tabHintMap: {
        const entries = root.orderedNavEntries.concat(root.pinnedEntries);
        const used = new Set();
        const map = {};
        for (const e of entries) {
            const name = e.name.toLowerCase();
            const candidates = name.split(/\s+/).map(w => w[0]).concat(Array.from(name));
            let letter = "";
            for (const c of candidates) {
                if (/^[a-z0-9]$/.test(c) && !used.has(c)) {
                    letter = c;
                    break;
                }
            }
            if (letter === "") {
                for (const c of "asdfghjklqwertyuiopzxcvbnm") {
                    if (!used.has(c)) {
                        letter = c;
                        break;
                    }
                }
            }
            if (letter !== "") {
                used.add(letter);
                map[e.id] = letter;
            }
        }
        return map;
    }

    readonly property string keyModeName: GritKeys.insertActive ? "INSERT"
        : GritKeys.cheatsheetOpen ? "KEYS"
        : GritKeys.mode === "hint" ? "JUMP"
        : GritKeys.mode === "tabhint" ? "TABS"
        : GritKeys.mode === "leader" ? "LEADER" : "NORMAL"

    Connections {
        target: GritKeys
        function onTabLetter(letter) {
            const map = root.tabHintMap;
            for (const id in map) {
                if (map[id] === letter) {
                    GlobalStates.gritView = id;
                    GritKeys.mode = "normal";
                    return;
                }
            }
            // no match: stay in tab-hint mode so a typo costs nothing
        }
        function onTabIndex(index) {
            const id = root.pinnedOrder[index];
            if (id !== undefined)
                GlobalStates.gritView = id;
        }
        function onLeaderCommand(cmd) {
            switch (cmd) {
            case "shop":
                GlobalStates.gritView = "shop";
                break;
            case "stats":
                GlobalStates.gritView = "stats";
                break;
            case "restday":
                if (GritStore.restDayUsedToday)
                    GritToast.show(Translation.tr("Already resting today"), "hotel");
                else if (GritStore.spendRestDay())
                    GritToast.show(Translation.tr("Rest day spent. Streak held."), "hotel");
                else
                    GritToast.show(Translation.tr("No rest days banked"), "hotel");
                break;
            }
        }
    }

    // Dialogs and the login gate own the keyboard while they are up
    Binding {
        target: GritKeys
        property: "suspended"
        value: root.showAddSheet || root.showNewListDialog || root.showRenameListDialog
            || GritConfirm.show || GritEdit.show || !GritApi.loggedIn
    }

    // Pinned to the bottom of the rail, just above the account row.
    readonly property var pinnedEntries: [
        { id: "shop", name: Translation.tr("Shop"), icon: "redeem" },
        { id: "stats", name: Translation.tr("Stats"), icon: "insights" }
    ]

    readonly property string viewTitle: {
        const pinned = root.pinnedEntries.find(e => e.id === root.currentView);
        if (pinned)
            return pinned.name;
        const entry = root.navEntries.find(e => e.id === root.currentView);
        return entry ? entry.name : "Grit";
    }

    property bool showAddSheet: false
    property bool showNewListDialog: false
    property bool showRenameListDialog: false

    // ---------------- Login gate ----------------

    Loader {
        anchors.fill: parent
        active: GritApi.sessionLoaded && !GritApi.loggedIn
        sourceComponent: LoginView {}
    }

    // ---------------- Main layout ----------------

    RowLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 10
        visible: GritApi.loggedIn

        // ---- Left nav rail ----
        ColumnLayout {
            Layout.fillHeight: true
            Layout.preferredWidth: 158
            Layout.maximumWidth: 158
            spacing: 4

            StyledFlickable {
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                contentHeight: navColumn.implicitHeight

                ColumnLayout {
                    id: navColumn
                    width: parent.width
                    spacing: 2

                    Repeater {
                        model: root.orderedNavEntries
                        delegate: GritNavButton {
                            required property var modelData
                            navId: modelData.id
                            navName: modelData.name
                            navIcon: modelData.icon
                            current: root.currentView
                            hintLetter: root.tabHintMap[modelData.id] ?? ""
                            hintActive: GritKeys.mode === "tabhint"
                            onActivated: id => GlobalStates.gritView = id
                        }
                    }

                    GritNavButton {
                        navId: "__newlist"
                        navName: Translation.tr("New list")
                        navIcon: "add"
                        current: ""
                        dim: true
                        onActivated: root.showNewListDialog = true
                    }
                }
            }

            Repeater {
                model: root.pinnedEntries
                delegate: GritNavButton {
                    required property var modelData
                    navId: modelData.id
                    navName: modelData.name
                    navIcon: modelData.icon
                    current: root.currentView
                    hintLetter: root.tabHintMap[modelData.id] ?? ""
                    hintActive: GritKeys.mode === "tabhint"
                    onActivated: id => GlobalStates.gritView = id
                }
            }

            // Sync + account
            RowLayout {
                Layout.fillWidth: true
                Layout.leftMargin: 6
                spacing: 6

                MouseArea {
                    implicitWidth: 8
                    implicitHeight: 8
                    hoverEnabled: true
                    Rectangle {
                        anchors.fill: parent
                        radius: 4
                        color: GritSync.errorMessage !== "" ? Appearance.colors.colError : Appearance.colors.colPrimary
                        opacity: GritSync.syncing ? 1 : 0.5
                    }
                    GritToolTip {
                        text: GritSync.errorMessage !== "" ? GritSync.errorMessage
                            : GritSync.syncing ? Translation.tr("Syncing…") : GritApi.userEmail
                    }
                }
                GritText {
                    Layout.fillWidth: true
                    text: GritSync.syncing ? Translation.tr("Syncing…") : GritApi.userEmail.split("@")[0]
                    font.pixelSize: Appearance.font.pixelSize.smallest
                    color: Appearance.colors.colSubtext
                    elide: Text.ElideRight
                }
                RippleButton {
                    implicitWidth: 24
                    implicitHeight: 24
                    buttonRadius: Appearance.rounding.full
                    onClicked: GritApi.signOut()
                    GritToolTip { text: Translation.tr("Sign out") }
                    contentItem: MaterialSymbol {
                        anchors.centerIn: parent
                        horizontalAlignment: Text.AlignHCenter
                        text: "logout"
                        iconSize: Appearance.font.pixelSize.normal
                        color: Appearance.colors.colSubtext
                    }
                }
            }
        }

        Rectangle {
            Layout.fillHeight: true
            implicitWidth: 1
            color: Appearance.colors.colOutlineVariant
        }

        // ---- Content column ----
        ColumnLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 8

            // XP hero
            RowLayout {
                Layout.fillWidth: true
                spacing: 10

                Rectangle {
                    implicitWidth: 40
                    implicitHeight: 40
                    radius: Appearance.rounding.full
                    color: Appearance.colors.colPrimaryContainer

                    GritText {
                        anchors.centerIn: parent
                        text: `${GritStore.levelInfo.level}`
                        font.pixelSize: Appearance.font.pixelSize.large
                        font.family: Appearance.font.family.numbers
                        font.weight: Font.DemiBold
                        color: Appearance.colors.colOnPrimaryContainer
                    }
                }

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 2

                    RowLayout {
                        Layout.fillWidth: true
                        GritText {
                            text: root.viewTitle
                            font.pixelSize: Appearance.font.pixelSize.large
                            font.family: Appearance.font.family.title
                            color: Appearance.colors.colOnLayer0
                        }
                        RippleButton {
                            visible: root.currentView.startsWith("list:")
                            implicitWidth: 24
                            implicitHeight: 24
                            buttonRadius: Appearance.rounding.full
                            onClicked: root.showRenameListDialog = true
                            GritToolTip { text: Translation.tr("Rename list") }
                            contentItem: MaterialSymbol {
                                anchors.centerIn: parent
                                horizontalAlignment: Text.AlignHCenter
                                text: "edit"
                                iconSize: Appearance.font.pixelSize.normal
                                color: Appearance.colors.colSubtext
                            }
                        }
                        RippleButton {
                            visible: root.currentView.startsWith("list:")
                            implicitWidth: 24
                            implicitHeight: 24
                            buttonRadius: Appearance.rounding.full
                            onClicked: {
                                const listId = root.currentView.slice(5);
                                const listName = root.viewTitle;
                                GritConfirm.ask(
                                    Translation.tr("Delete list?"),
                                    Translation.tr("\"%1\" and all of its tasks will be deleted").arg(listName),
                                    () => {
                                        GlobalStates.gritView = "myday";
                                        GritStore.deleteCustomList(listId);
                                        // Otherwise the dead list's rank lingers
                                        // and a later list reusing the id inherits it.
                                        GritNavUsage.forget(`list:${listId}`);
                                    });
                            }
                            GritToolTip { text: Translation.tr("Delete list") }
                            contentItem: MaterialSymbol {
                                anchors.centerIn: parent
                                horizontalAlignment: Text.AlignHCenter
                                text: "delete"
                                iconSize: Appearance.font.pixelSize.normal
                                color: Appearance.colors.colSubtext
                            }
                        }
                        Item { Layout.fillWidth: true }
                        GritText {
                            text: `${GritStore.levelInfo.xpIntoLevel}/${GritStore.levelInfo.xpForThisLevel}`
                            font.pixelSize: Appearance.font.pixelSize.large
                            font.family: "Google Sans Flex"
                            font.features: { "tnum": 1 }
                            font.variableAxes: { "wght": 700, "ROND": 100 }
                            color: Appearance.colors.colOnLayer0
                        }
                        GritText {
                            text: Core.fmtXp(GritStore.xpToday)
                            font.pixelSize: Appearance.font.pixelSize.large
                            font.family: "Google Sans Flex"
                            font.features: { "tnum": 1 }
                            font.variableAxes: { "wght": 700, "ROND": 100 }
                            color: GritStore.xpToday >= 0 ? Appearance.colors.colPrimary : Appearance.colors.colError
                        }
                    }
                    StyledProgressBar {
                        Layout.fillWidth: true
                        value: GritStore.levelInfo.progress
                    }
                }
            }

            // View content
            Loader {
                id: viewLoader
                Layout.fillWidth: true
                Layout.fillHeight: true
                sourceComponent: {
                    if (root.currentView === "food")
                        return foodViewComponent;
                    if (root.currentView === "calories")
                        return caloriesViewComponent;
                    if (root.currentView === "focus")
                        return focusViewComponent;
                    if (root.currentView === "stats")
                        return statsViewComponent;
                    if (root.currentView === "shop")
                        return shopViewComponent;
                    return tasksViewComponent;
                }

                Behavior on opacity {
                    animation: Appearance.animation.elementMoveFast.numberAnimation.createObject(this)
                }
            }

            Component {
                id: tasksViewComponent
                TasksView {
                    viewId: root.currentView
                    onRequestAdvanced: root.showAddSheet = true
                }
            }
            Component {
                id: foodViewComponent
                FoodLogView {}
            }
            Component {
                id: caloriesViewComponent
                CaloriesView {}
            }
            Component {
                id: focusViewComponent
                FocusView {}
            }
            Component {
                id: statsViewComponent
                StatsView {}
            }
            Component {
                id: shopViewComponent
                ShopView {}
            }

            // ---- Vim statusline: mode, context, which-key, pending input ----
            Rectangle {
                Layout.fillWidth: true
                visible: GritKeys.active
                implicitHeight: 26
                radius: Appearance.rounding.small
                color: Appearance.colors.colLayer1
                border.width: 1
                border.color: Appearance.colors.colLayer0Border

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 4
                    anchors.rightMargin: 10
                    spacing: 10

                    Rectangle {
                        implicitWidth: modeText.implicitWidth + 16
                        implicitHeight: 18
                        radius: Appearance.rounding.full
                        color: root.keyModeName === "INSERT" ? Appearance.colors.colPrimaryContainer
                            : root.keyModeName === "NORMAL" ? Appearance.colors.colSecondaryContainer
                            : Appearance.colors.colTertiaryContainer

                        GritText {
                            id: modeText
                            anchors.centerIn: parent
                            text: root.keyModeName
                            font.family: Appearance.font.family.monospace
                            font.pixelSize: Appearance.font.pixelSize.smallest
                            font.weight: Font.Bold
                            color: root.keyModeName === "INSERT" ? Appearance.colors.colOnPrimaryContainer
                                : root.keyModeName === "NORMAL" ? Appearance.colors.colOnSecondaryContainer
                                : Appearance.colors.colOnTertiaryContainer
                        }
                    }

                    GritText {
                        text: GritKeys.focusedIndex >= 0
                            ? `${root.viewTitle} · ${GritKeys.focusedIndex + 1}/${GritKeys.cardIds.length}`
                            : root.viewTitle
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        color: Appearance.colors.colSubtext
                        elide: Text.ElideRight
                    }

                    Item { Layout.fillWidth: true }

                    // Which-key bar, leader mode only
                    RowLayout {
                        visible: GritKeys.mode === "leader"
                        spacing: 10

                        Repeater {
                            model: [
                                { k: "t", label: Translation.tr("tabs") },
                                { k: "r", label: Translation.tr("rest day") },
                                { k: "s", label: Translation.tr("shop") },
                                { k: "i", label: Translation.tr("stats") },
                                { k: "?", label: Translation.tr("keys") }
                            ]
                            delegate: RowLayout {
                                required property var modelData
                                spacing: 3

                                GritText {
                                    text: parent.modelData.k
                                    font.family: Appearance.font.family.monospace
                                    font.pixelSize: Appearance.font.pixelSize.smallest
                                    font.weight: Font.Bold
                                    color: Appearance.colors.colPrimary
                                }
                                GritText {
                                    text: parent.modelData.label
                                    font.pixelSize: Appearance.font.pixelSize.smallest
                                    color: Appearance.colors.colSubtext
                                }
                            }
                        }
                    }

                    GritText {
                        visible: text !== ""
                        text: GritKeys.pending !== "" ? GritKeys.pending + "\u00b7"
                            : GritKeys.mode === "hint" ? Translation.tr("pick a card")
                            : GritKeys.mode === "tabhint" ? Translation.tr("pick a tab") : ""
                        font.family: Appearance.font.family.monospace
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        font.weight: Font.Bold
                        color: Appearance.colors.colPrimary
                    }
                }
            }

        }
    }

    // ---------------- Transient toast (GritToast.show) ----------------

    Rectangle {
        id: toastPill
        z: 50
        anchors {
            horizontalCenter: parent.horizontalCenter
            bottom: parent.bottom
            bottomMargin: 20
        }
        // Hugs its text, but never grows past the panel, so long titles elide
        implicitWidth: Math.min(toastRow.implicitWidth + 28, root.width - 40)
        implicitHeight: toastRow.implicitHeight + 18
        radius: Appearance.rounding.full
        color: Appearance.colors.colTooltip
        opacity: GritToast.shown ? 1 : 0
        visible: opacity > 0

        // Rises into place instead of just appearing
        transform: Translate {
            y: GritToast.shown ? 0 : 10
            Behavior on y {
                animation: Appearance.animation.elementMoveFast.numberAnimation.createObject(this)
            }
        }
        Behavior on opacity {
            animation: Appearance.animation.elementMoveFast.numberAnimation.createObject(this)
        }

        RowLayout {
            id: toastRow
            anchors.centerIn: parent
            width: toastPill.width - 28
            spacing: 8

            MaterialSymbol {
                text: GritToast.iconName
                iconSize: Appearance.font.pixelSize.normal
                color: Appearance.colors.colOnTooltip
            }
            GritText {
                Layout.fillWidth: true
                text: GritToast.message
                font.pixelSize: Appearance.font.pixelSize.small
                color: Appearance.colors.colOnTooltip
                elide: Text.ElideRight
            }
        }
    }

    // Fade view switches
    onCurrentViewChanged: {
        viewSwitchAnim.restart();
    }
    SequentialAnimation {
        id: viewSwitchAnim
        PropertyAction { target: viewLoader; property: "opacity"; value: 0 }
        PauseAnimation { duration: 20 }
        PropertyAction { target: viewLoader; property: "opacity"; value: 1 }
    }

    // ---------------- Dialogs (Loader-wrapped, ToggleDialog pattern) ----------------

    onShowAddSheetChanged: if (showAddSheet) addSheetLoader.active = true
    onShowNewListDialogChanged: if (showNewListDialog) newListLoader.active = true
    onShowRenameListDialogChanged: if (showRenameListDialog) renameListLoader.active = true

    Loader {
        id: addSheetLoader
        anchors.fill: parent
        active: false
        onActiveChanged: {
            if (active) {
                item.show = true;
                item.forceActiveFocus();
            }
        }
        sourceComponent: AddTaskSheet {
            currentView: root.currentView
        }
        Connections {
            target: addSheetLoader.item
            function onDismiss() {
                addSheetLoader.item.show = false;
                root.showAddSheet = false;
            }
            function onVisibleChanged() {
                if (!addSheetLoader.item.visible && !root.showAddSheet)
                    addSheetLoader.active = false;
            }
        }
    }

    Loader {
        id: newListLoader
        anchors.fill: parent
        active: false
        onActiveChanged: {
            if (active) {
                item.show = true;
                item.forceActiveFocus();
            }
        }
        sourceComponent: WindowDialog {
            id: newListDialog
            backgroundWidth: 340

            function confirm() {
                if (newListNameField.text.trim().length > 0) {
                    const list = GritStore.addCustomList(newListNameField.text);
                    GlobalStates.gritView = `list:${list.id}`;
                }
                newListDialog.dismiss();
            }

            GritDialogTitle {
                text: Translation.tr("New list")
            }
            GritTextField {
        labelBackgroundColor: Appearance.m3colors.m3surfaceContainerHigh
                id: newListNameField
                Layout.fillWidth: true
                placeholderText: Translation.tr("List name")
                onAccepted: newListDialog.confirm()
                Component.onCompleted: forceActiveFocus()
            }
            WindowDialogButtonRow {
                Item { Layout.fillWidth: true }
                GritDialogButton {
                    buttonText: Translation.tr("Cancel")
                    onClicked: newListDialog.dismiss()
                }
                GritDialogButton {
                    buttonText: Translation.tr("Create")
                    onClicked: newListDialog.confirm()
                }
            }
        }
        Connections {
            target: newListLoader.item
            function onDismiss() {
                newListLoader.item.show = false;
                root.showNewListDialog = false;
            }
            function onVisibleChanged() {
                if (!newListLoader.item.visible && !root.showNewListDialog)
                    newListLoader.active = false;
            }
        }
    }

    Loader {
        id: renameListLoader
        anchors.fill: parent
        active: false
        onActiveChanged: {
            if (active) {
                item.show = true;
                item.forceActiveFocus();
            }
        }
        sourceComponent: WindowDialog {
            id: renameListDialog
            backgroundWidth: 340

            function confirm() {
                if (root.currentView.startsWith("list:"))
                    GritStore.renameCustomList(root.currentView.slice(5), renameListNameField.text);
                renameListDialog.dismiss();
            }

            GritDialogTitle {
                text: Translation.tr("Rename list")
            }
            GritTextField {
                id: renameListNameField
                labelBackgroundColor: Appearance.m3colors.m3surfaceContainerHigh
                Layout.fillWidth: true
                placeholderText: Translation.tr("List name")
                text: root.viewTitle
                onAccepted: renameListDialog.confirm()
                Component.onCompleted: {
                    forceActiveFocus();
                    selectAll();
                }
            }
            WindowDialogButtonRow {
                Item { Layout.fillWidth: true }
                GritDialogButton {
                    buttonText: Translation.tr("Cancel")
                    onClicked: renameListDialog.dismiss()
                }
                GritDialogButton {
                    buttonText: Translation.tr("Rename")
                    onClicked: renameListDialog.confirm()
                }
            }
        }
        Connections {
            target: renameListLoader.item
            function onDismiss() {
                renameListLoader.item.show = false;
                root.showRenameListDialog = false;
            }
            function onVisibleChanged() {
                if (!renameListLoader.item.visible && !root.showRenameListDialog)
                    renameListLoader.active = false;
            }
        }
    }

    // Shared edit-task dialog (GritEdit.open)
    Connections {
        target: GritEdit
        function onShowChanged() {
            if (GritEdit.show)
                editLoader.active = true;
        }
    }

    Loader {
        id: editLoader
        anchors.fill: parent
        active: false
        onActiveChanged: {
            if (active) {
                item.show = true;
                item.forceActiveFocus();
            }
        }
        sourceComponent: WindowDialog {
            id: editDialog
            backgroundWidth: 360

            readonly property bool isBad: GritEdit.task?.listType === "bad"
            readonly property bool isSub: !!GritEdit.subtask

            function save() {
                const task = GritEdit.task;
                if (!task)
                    return editDialog.dismiss();
                const name = editNameField.text.trim();
                if (editDialog.isSub) {
                    const patch = {};
                    if (name.length > 0)
                        patch.title = name;
                    const raw = editXpField.text.trim();
                    if (raw.length === 0) {
                        patch.xp = null;
                    } else {
                        const v = parseInt(raw);
                        if (!isNaN(v) && v >= 0)
                            patch.xp = v;
                    }
                    GritStore.editSubtask(task, GritEdit.subtask.id, patch);
                    editDialog.dismiss();
                    return;
                }
                const patch = {};
                if (name.length > 0)
                    patch.title = name;
                const value = parseInt(editXpField.text);
                if (!isNaN(value) && value >= 0) {
                    if (editDialog.isBad)
                        patch.slipPenalty = value;
                    else
                        patch.points = value;
                }
                GritStore.updateTask(task.id, patch);
                editDialog.dismiss();
            }

            GritDialogTitle {
                text: editDialog.isSub ? Translation.tr("Edit step") : Translation.tr("Edit task")
            }
            GritTextField {
                id: editNameField
                labelBackgroundColor: Appearance.m3colors.m3surfaceContainerHigh
                Layout.fillWidth: true
                placeholderText: Translation.tr("Name")
                text: (editDialog.isSub ? GritEdit.subtask?.title : GritEdit.task?.title) ?? ""
                Component.onCompleted: forceActiveFocus()
                onAccepted: editDialog.save()
            }
            GritTextField {
                id: editXpField
                labelBackgroundColor: Appearance.m3colors.m3surfaceContainerHigh
                Layout.preferredWidth: 160
                placeholderText: editDialog.isSub ? Translation.tr("XP (empty = auto)")
                    : editDialog.isBad ? Translation.tr("Slip penalty") : Translation.tr("XP reward")
                text: editDialog.isSub
                    ? (GritEdit.subtask?.xp != null ? `${GritEdit.subtask.xp}` : "")
                    : `${(editDialog.isBad ? GritEdit.task?.slipPenalty : GritEdit.task?.points) ?? 0}`
                validator: IntValidator { bottom: 0; top: 100000 }
                onAccepted: editDialog.save()
            }
            WindowDialogButtonRow {
                Item { Layout.fillWidth: true }
                GritDialogButton {
                    buttonText: Translation.tr("Cancel")
                    onClicked: editDialog.dismiss()
                }
                GritDialogButton {
                    buttonText: Translation.tr("Save")
                    onClicked: editDialog.save()
                }
            }
        }
        Connections {
            target: editLoader.item
            function onDismiss() {
                editLoader.item.show = false;
                GritEdit.close();
            }
            function onVisibleChanged() {
                if (!editLoader.item.visible && !GritEdit.show)
                    editLoader.active = false;
            }
        }
    }

    // Shared confirmation dialog for destructive actions (GritConfirm.ask)
    Connections {
        target: GritConfirm
        function onShowChanged() {
            if (GritConfirm.show)
                confirmLoader.active = true;
        }
    }

    Loader {
        id: confirmLoader
        anchors.fill: parent
        active: false
        onActiveChanged: {
            if (active) {
                item.show = true;
                item.forceActiveFocus();
            }
        }
        sourceComponent: WindowDialog {
            id: confirmDialog
            backgroundWidth: 340

            GritDialogTitle {
                text: GritConfirm.title
            }
            GritText {
                Layout.fillWidth: true
                visible: GritConfirm.message.length > 0
                text: GritConfirm.message
                font.pixelSize: Appearance.font.pixelSize.small
                color: Appearance.colors.colSubtext
                wrapMode: Text.Wrap
            }
            WindowDialogButtonRow {
                Item { Layout.fillWidth: true }
                GritDialogButton {
                    buttonText: Translation.tr("Cancel")
                    onClicked: confirmDialog.dismiss()
                }
                GritDialogButton {
                    buttonText: GritConfirm.confirmLabel.length > 0
                        ? GritConfirm.confirmLabel : Translation.tr("Delete")
                    onClicked: {
                        GritConfirm.accept();
                        confirmDialog.dismiss();
                    }
                }
            }
        }
        Connections {
            target: confirmLoader.item
            function onDismiss() {
                confirmLoader.item.show = false;
                GritConfirm.dismiss();
            }
            function onVisibleChanged() {
                if (!confirmLoader.item.visible && !GritConfirm.show)
                    confirmLoader.active = false;
            }
        }
    }

    // ---------------- Cheatsheet overlay (?) ----------------

    Loader {
        anchors.fill: parent
        z: 60
        active: GritKeys.cheatsheetOpen
        sourceComponent: Rectangle {
            color: Qt.rgba(Appearance.colors.colLayer0.r, Appearance.colors.colLayer0.g,
                Appearance.colors.colLayer0.b, 0.92)

            // Any click puts it away, same as any key
            MouseArea {
                anchors.fill: parent
                onClicked: GritKeys.cheatsheetOpen = false
            }

            Rectangle {
                anchors.centerIn: parent
                width: Math.min(parent.width - 48, sheetColumn.implicitWidth + 48)
                implicitHeight: sheetColumn.implicitHeight + 40
                radius: Appearance.rounding.normal
                color: Appearance.colors.colLayer1
                border.width: 1
                border.color: Appearance.colors.colLayer0Border

                ColumnLayout {
                    id: sheetColumn
                    anchors.centerIn: parent
                    spacing: 12

                    GritText {
                        Layout.alignment: Qt.AlignHCenter
                        text: Translation.tr("Keyboard")
                        font.pixelSize: Appearance.font.pixelSize.large
                        font.family: Appearance.font.family.title
                        color: Appearance.colors.colOnLayer1
                    }

                    GridLayout {
                        columns: 2
                        columnSpacing: 28
                        rowSpacing: 6

                        Repeater {
                            model: [
                                { k: "1..5", d: Translation.tr("Pinned tabs") },
                                { k: "g", d: Translation.tr("Any tab, by letter") },
                                { k: "f", d: Translation.tr("Jump to a card") },
                                { k: "j / k", d: Translation.tr("Next / previous card") },
                                { k: "x", d: Translation.tr("Toggle done") },
                                { k: "e", d: Translation.tr("Edit") },
                                { k: "w", d: Translation.tr("My Day star") },
                                { k: "o", d: Translation.tr("Subtasks") },
                                { k: "y", d: Translation.tr("Copy title") },
                                { k: "dd", d: Translation.tr("Delete") },
                                { k: "s", d: Translation.tr("Slip (Bad tab)") },
                                { k: "a", d: Translation.tr("Add task") },
                                { k: "Space", d: Translation.tr("Leader: t r s i ?") },
                                { k: "Esc", d: Translation.tr("Back, then close") }
                            ]
                            delegate: RowLayout {
                                required property var modelData
                                spacing: 10

                                Rectangle {
                                    implicitWidth: Math.max(30, sheetKeyText.implicitWidth + 12)
                                    implicitHeight: 20
                                    radius: Appearance.rounding.small
                                    color: Appearance.colors.colLayer2

                                    GritText {
                                        id: sheetKeyText
                                        anchors.centerIn: parent
                                        text: parent.parent.modelData.k
                                        font.family: Appearance.font.family.monospace
                                        font.pixelSize: Appearance.font.pixelSize.smallest
                                        font.weight: Font.Bold
                                        color: Appearance.colors.colPrimary
                                    }
                                }
                                GritText {
                                    text: parent.modelData.d
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    color: Appearance.colors.colOnLayer1
                                }
                            }
                        }
                    }

                    GritText {
                        Layout.alignment: Qt.AlignHCenter
                        text: Translation.tr("Card keys act on the focused card. Any key closes this.")
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        color: Appearance.colors.colSubtext
                    }
                }
            }
        }
    }
}
