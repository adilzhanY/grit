pragma ComponentBehavior: Bound
import qs
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import qs.modules.iris
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

    // The window's reveal (0..1). Sections come in after the body, one by one,
    // each sliding 36px out of the left edge and fading up, like the Wall
    // (the shared Iris stagger).
    property real t: 1
    function appear(i) {
        return Iris.appear(root.t, i);
    }

    // Pin keeps the space free (Grit.qml owns the state)
    property bool pinned: false
    signal pinToggled

    /** The canonical rail, in the order it was written. Sorted for display below. */
    readonly property var navEntries: {
        const entries = [
            { id: "myday", name: Translation.tr("My Day"), icon: "wb_sunny" },
            { id: "important", name: Translation.tr("Important"), icon: "star" },
            { id: "planned", name: Translation.tr("Planned"), icon: "event_upcoming" },
            { id: "must", name: Translation.tr("Must"), icon: "local_fire_department" },
            { id: "calories", name: Translation.tr("Calories"), icon: "directions_run" },
            { id: "body", name: Translation.tr("Body"), icon: "straighten" },
            { id: "food", name: Translation.tr("Daily Log"), icon: "restaurant" },
            { id: "bad", name: Translation.tr("Bad"), icon: "skull" },
            { id: "cool", name: Translation.tr("Cool"), icon: "auto_awesome" },
            { id: "impossible", name: Translation.tr("Impossible"), icon: "landscape" },
            { id: "focus", name: Translation.tr("Focus"), icon: "timer" },
            { id: "activity", name: Translation.tr("Activity"), icon: "monitoring" }
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
    readonly property var pinnedOrder: ["myday", "focus", "activity", "food", "calories", "bad"]

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
            case "spendings":
                GlobalStates.gritView = "spendings";
                break;
            case "subscriptions":
                GlobalStates.gritView = "subscriptions";
                break;
            case "body":
                GlobalStates.gritView = "body";
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
        { id: "spendings", name: Translation.tr("Spendings"), icon: "payments" },
        { id: "subscriptions", name: Translation.tr("Subscriptions"), icon: "subscriptions" },
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
        anchors.margins: UiScale.px(12)
        spacing: UiScale.px(12)
        visible: GritApi.loggedIn

        // ---- Left nav rail ----
        ColumnLayout {
            Layout.fillHeight: true
            Layout.preferredWidth: UiScale.px(168)
            Layout.maximumWidth: UiScale.px(168)
            spacing: UiScale.px(2)
            opacity: Math.min(1, root.appear(0) * 1.4)
            transform: Translate { x: -(1 - root.appear(0)) * Iris.appearDistance }

            // The brand heads the rail: the one place in the panel that is
            // about the app rather than about a view. Left-aligned to the same
            // edge as the nav discs below it, not centred, so the rail reads
            // as one column.
            GritWordmark {
                Layout.leftMargin: UiScale.px(8)
                Layout.topMargin: UiScale.px(6)
                Layout.bottomMargin: UiScale.px(12)
                size: UiScale.px(30)
            }

            StyledFlickable {
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                contentHeight: navColumn.implicitHeight

                ColumnLayout {
                    id: navColumn
                    width: parent.width
                    spacing: UiScale.px(2)

                    Repeater {
                        model: root.orderedNavEntries
                        delegate: GritNavButton {
                            required property var modelData
                            navId: modelData.id
                            navName: modelData.name
                            navIcon: modelData.icon
                            currentView: root.currentView
                            hintLetter: root.tabHintMap[modelData.id] ?? ""
                            hintActive: GritKeys.mode === "tabhint"
                            onActivated: id => GlobalStates.gritView = id
                        }
                    }

                    GritNavButton {
                        navId: "__newlist"
                        navName: Translation.tr("New list")
                        navIcon: "add"
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
                    currentView: root.currentView
                    hintLetter: root.tabHintMap[modelData.id] ?? ""
                    hintActive: GritKeys.mode === "tabhint"
                    onActivated: id => GlobalStates.gritView = id
                }
            }

            // Sync + account
            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: UiScale.px(6)
                Layout.leftMargin: UiScale.px(10)
                spacing: UiScale.px(8)

                MouseArea {
                    implicitWidth: UiScale.px(8)
                    implicitHeight: UiScale.px(8)
                    hoverEnabled: true
                    Rectangle {
                        anchors.fill: parent
                        radius: width / 2
                        color: GritSync.errorMessage !== "" ? GritColors.danger : GritColors.fg
                        opacity: GritSync.syncing ? 1 : 0.45
                        Behavior on opacity {
                            NumberAnimation { duration: 180 }
                        }
                    }
                    IrisToolTip {
                        text: GritSync.errorMessage !== "" ? GritSync.errorMessage
                            : GritSync.syncing ? Translation.tr("Syncing…") : GritApi.userEmail
                    }
                }
                IrisText {
                    Layout.fillWidth: true
                    text: GritSync.syncing ? Translation.tr("Syncing…") : GritApi.userEmail.split("@")[0]
                    role: "caption"
                }
                IrisDisc {
                    size: UiScale.px(28)
                    icon: "logout"
                    clickable: true
                    tip: Translation.tr("Sign out")
                    onClicked: GritApi.signOut()
                }
            }
        }

        Rectangle {
            Layout.fillHeight: true
            implicitWidth: 1
            color: GritColors.divider
        }

        // ---- Content column ----
        ColumnLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: UiScale.px(10)

            // Header: the level in a white disc, the view's title, XP on the
            // right, and the level's progress as a thin slot underneath
            ColumnLayout {
                Layout.fillWidth: true
                Layout.topMargin: UiScale.px(2)
                spacing: UiScale.px(10)
                opacity: Math.min(1, root.appear(1) * 1.4)
                transform: Translate { x: -(1 - root.appear(1)) * Iris.appearDistance }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: UiScale.px(12)

                    // The level: a white disc with the number
                    IrisDisc {
                        size: UiScale.px(42)
                        on: true
                        text: `${GritStore.levelInfo.level}`
                    }

                    IrisText {
                        Layout.fillWidth: true
                        Layout.maximumWidth: implicitWidth
                        role: "heading"
                        text: root.viewTitle
                    }
                    IrisDisc {
                        visible: root.currentView.startsWith("list:")
                        size: UiScale.px(28)
                        icon: "edit"
                        clickable: true
                        tip: Translation.tr("Rename list")
                        onClicked: root.showRenameListDialog = true
                    }
                    IrisDisc {
                        visible: root.currentView.startsWith("list:")
                        size: UiScale.px(28)
                        icon: "delete"
                        clickable: true
                        tip: Translation.tr("Delete list")
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
                    }
                    Item { Layout.fillWidth: true }
                    IrisDisc {
                        size: UiScale.px(28)
                        icon: "push_pin"
                        on: root.pinned
                        clickable: true
                        tip: root.pinned ? Translation.tr("Unpin (Ctrl+P)") : Translation.tr("Pin, keep the space free (Ctrl+P)")
                        onClicked: root.pinToggled()
                    }
                }
                IrisSlot {
                    Layout.fillWidth: true
                    valueBarHeight: UiScale.px(6)
                    value: GritStore.levelInfo.progress
                }
                // Today's XP and the level's progress, under the bar, so the
                // title keeps the whole width above
                RowLayout {
                    Layout.fillWidth: true
                    Layout.topMargin: -UiScale.px(4)
                    IrisText {
                        text: `${Core.fmtXp(GritStore.xpToday)} ${Translation.tr("today")}`
                        font.pixelSize: Appearance.font.pixelSize.smaller
                        font.features: { "tnum": 1 }
                        font.weight: Font.DemiBold
                        color: GritStore.xpToday >= 0 ? Iris.fg : Iris.danger
                        Behavior on color {
                            ColorAnimation { duration: Iris.colorDuration }
                        }
                    }
                    Item { Layout.fillWidth: true }
                    IrisText {
                        text: `${GritStore.levelInfo.xpIntoLevel} / ${GritStore.levelInfo.xpForThisLevel}`
                        role: "caption"
                        font.features: { "tnum": 1 }
                        font.weight: Font.Medium
                    }
                }
            }

            // View content. The wrapper carries the entrance, the loader
            // keeps its own opacity and shift for view switches.
            Item {
                Layout.fillWidth: true
                Layout.fillHeight: true
                opacity: Math.min(1, root.appear(2) * 1.4)
                transform: Translate { x: -(1 - root.appear(2)) * Iris.appearDistance }
                Loader {
                    id: viewLoader
                    anchors.fill: parent
                    // Slides in from the right on every view change, like the
                    // right panel's lists
                    transform: Translate { id: viewShift }
                    sourceComponent: {
                        if (root.currentView === "food")
                            return foodViewComponent;
                        if (root.currentView === "calories")
                            return caloriesViewComponent;
                        if (root.currentView === "body")
                            return bodyViewComponent;
                        if (root.currentView === "focus")
                            return focusViewComponent;
                        if (root.currentView === "activity")
                            return activityViewComponent;
                        if (root.currentView === "stats")
                            return statsViewComponent;
                        if (root.currentView === "shop")
                            return shopViewComponent;
                        if (root.currentView === "spendings")
                            return spendingsViewComponent;
                        if (root.currentView === "subscriptions")
                            return subscriptionsViewComponent;
                        return tasksViewComponent;
                    }

                    Behavior on opacity {
                        animation: Appearance.animation.elementMoveFast.numberAnimation.createObject(this)
                    }
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
                id: bodyViewComponent
                BodyView {}
            }
            Component {
                id: focusViewComponent
                FocusView {}
            }
            Component {
                id: activityViewComponent
                ActivityView {}
            }
            Component {
                id: statsViewComponent
                StatsView {}
            }
            Component {
                id: shopViewComponent
                ShopView {}
            }
            Component {
                id: spendingsViewComponent
                SpendingsView {}
            }
            Component {
                id: subscriptionsViewComponent
                SubscriptionsView {}
            }

            // ---- Vim statusline: mode, context, which-key, pending input ----
            Rectangle {
                Layout.fillWidth: true
                visible: GritKeys.active
                opacity: Math.min(1, root.appear(3) * 1.4)
                transform: Translate { x: -(1 - root.appear(3)) * Iris.appearDistance }
                implicitHeight: UiScale.px(32)
                radius: height / 2
                color: GritColors.raised

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: UiScale.px(4)
                    anchors.rightMargin: UiScale.px(14)
                    spacing: UiScale.px(10)

                    // White when a mode other than NORMAL owns the keys
                    IrisKeycap {
                        text: root.keyModeName
                        mono: true
                        lit: root.keyModeName !== "NORMAL"
                        Behavior on implicitWidth {
                            SpringAnimation { spring: Iris.sizeSpring; damping: 0.38; epsilon: 0.3 }
                        }
                    }

                    IrisText {
                        text: GritKeys.focusedIndex >= 0
                            ? `${root.viewTitle} · ${GritKeys.focusedIndex + 1}/${GritKeys.cardIds.length}`
                            : root.viewTitle
                        role: "caption"
                    }

                    Item { Layout.fillWidth: true }

                    // Which-key bar, leader mode only
                    RowLayout {
                        visible: GritKeys.mode === "leader"
                        spacing: UiScale.px(10)

                        Repeater {
                            model: [
                                { k: "t", label: Translation.tr("tabs") },
                                { k: "r", label: Translation.tr("rest day") },
                                { k: "s", label: Translation.tr("shop") },
                                { k: "i", label: Translation.tr("stats") },
                                { k: "m", label: Translation.tr("money") },
                                { k: "u", label: Translation.tr("subs") },
                                { k: "b", label: Translation.tr("body") },
                                { k: "?", label: Translation.tr("keys") }
                            ]
                            delegate: RowLayout {
                                required property var modelData
                                spacing: UiScale.px(3)

                                IrisText {
                                    text: parent.modelData.k
                                    role: "caption"
                                    font.family: Appearance.font.family.monospace
                                    font.weight: Font.Bold
                                    color: Iris.fg
                                }
                                IrisText {
                                    text: parent.modelData.label
                                    role: "caption"
                                }
                            }
                        }
                    }

                    IrisText {
                        visible: text !== ""
                        text: GritKeys.pending !== "" ? GritKeys.pending + "·"
                            : GritKeys.mode === "hint" ? Translation.tr("pick a card")
                            : GritKeys.mode === "tabhint" ? Translation.tr("pick a tab") : ""
                        role: "caption"
                        font.family: Appearance.font.family.monospace
                        font.weight: Font.Bold
                        color: Iris.fg
                    }
                }
            }

        }
    }

    // ---------------- Transient toast (GritToast.show) ----------------

    // The Iris toast: a dark raised pill rising in at the bottom. GritToast's
    // timer takes it down, so repeated calls extend the same pill.
    IrisToast {
        text: GritToast.shown ? GritToast.message : ""
        icon: GritToast.iconName
    }

    // Fade and slide view switches
    onCurrentViewChanged: {
        viewSwitchAnim.restart();
    }
    SequentialAnimation {
        id: viewSwitchAnim
        PropertyAction { target: viewLoader; property: "opacity"; value: 0 }
        PropertyAction { target: viewShift; property: "x"; value: UiScale.px(28) }
        PauseAnimation { duration: 20 }
        PropertyAction { target: viewLoader; property: "opacity"; value: 1 }
        NumberAnimation { target: viewShift; property: "x"; to: 0; duration: 320; easing.type: Easing.OutCubic }
    }

    // ---------------- Dialogs ----------------
    // Each opens from its flag and hands the flag back when it closes. The
    // forms are made fresh for every opening (sourceComponent).

    onShowAddSheetChanged: if (showAddSheet) addSheet.open()
    onShowNewListDialogChanged: if (showNewListDialog) newListDialog.open()
    onShowRenameListDialogChanged: if (showRenameListDialog) renameListDialog.open()

    AddTaskSheet {
        id: addSheet
        currentView: root.currentView
        onClosed: root.showAddSheet = false
    }

    IrisDialog {
        id: newListDialog
        backgroundWidth: UiScale.px(340)
        onClosed: root.showNewListDialog = false
        sourceComponent: ColumnLayout {
            id: newListForm
            spacing: UiScale.px(16)

            function confirm() {
                if (newListNameField.text.trim().length > 0) {
                    const list = GritStore.addCustomList(newListNameField.text);
                    GlobalStates.gritView = `list:${list.id}`;
                }
                newListDialog.close();
            }

            IrisText {
                role: "title"
                text: Translation.tr("New list")
            }
            IrisField {
                id: newListNameField
                Layout.fillWidth: true
                placeholderText: Translation.tr("List name")
                onAccepted: newListForm.confirm()
                Component.onCompleted: forceActiveFocus()
            }
            RowLayout {
                Layout.fillWidth: true
                spacing: UiScale.px(8)
                Item { Layout.fillWidth: true }
                IrisPill {
                    text: Translation.tr("Cancel")
                    onClicked: newListDialog.close()
                }
                IrisPill {
                    primary: true
                    text: Translation.tr("Create")
                    onClicked: newListForm.confirm()
                }
            }
        }
    }

    IrisDialog {
        id: renameListDialog
        backgroundWidth: UiScale.px(340)
        onClosed: root.showRenameListDialog = false
        sourceComponent: ColumnLayout {
            id: renameListForm
            spacing: UiScale.px(16)

            function confirm() {
                if (root.currentView.startsWith("list:"))
                    GritStore.renameCustomList(root.currentView.slice(5), renameListNameField.text);
                renameListDialog.close();
            }

            IrisText {
                role: "title"
                text: Translation.tr("Rename list")
            }
            IrisField {
                id: renameListNameField
                Layout.fillWidth: true
                placeholderText: Translation.tr("List name")
                text: root.viewTitle
                onAccepted: renameListForm.confirm()
                Component.onCompleted: {
                    forceActiveFocus();
                    selectAll();
                }
            }
            RowLayout {
                Layout.fillWidth: true
                spacing: UiScale.px(8)
                Item { Layout.fillWidth: true }
                IrisPill {
                    text: Translation.tr("Cancel")
                    onClicked: renameListDialog.close()
                }
                IrisPill {
                    primary: true
                    text: Translation.tr("Rename")
                    onClicked: renameListForm.confirm()
                }
            }
        }
    }

    // Shared edit-task dialog (GritEdit.open)
    Connections {
        target: GritEdit
        function onShowChanged() {
            if (GritEdit.show)
                editDialog.open();
        }
    }

    IrisDialog {
        id: editDialog

        readonly property bool isBad: GritEdit.task?.listType === "bad"
        readonly property bool isSub: !!GritEdit.subtask
        // Same rule as the add sheet: one-off lists have nothing to repeat
        readonly property bool showRepeat: !editDialog.isSub && !editDialog.isBad
            && GritEdit.task?.listType !== "cool" && GritEdit.task?.listType !== "impossible"

        backgroundWidth: editDialog.showRepeat ? UiScale.px(410) : UiScale.px(360)
        onClosed: GritEdit.close()
        sourceComponent: ColumnLayout {
            id: editForm
            spacing: UiScale.px(16)

            function save() {
                const task = GritEdit.task;
                if (!task)
                    return editDialog.close();
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
                    editDialog.close();
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
                if (editDialog.showRepeat) {
                    // undefined is how patchRow drops a key, which is exactly
                    // what "Never" means for a task that used to repeat
                    patch.recurrence = editRepeat.buildRecurrence();
                }
                GritStore.updateTask(task.id, patch);
                editDialog.close();
            }

            IrisText {
                role: "title"
                text: editDialog.isSub ? Translation.tr("Edit step") : Translation.tr("Edit task")
            }
            IrisField {
                id: editNameField
                Layout.fillWidth: true
                placeholderText: Translation.tr("Name")
                text: (editDialog.isSub ? GritEdit.subtask?.title : GritEdit.task?.title) ?? ""
                Component.onCompleted: forceActiveFocus()
                onAccepted: editForm.save()
            }
            // The field comes filled in, so its name sits above it
            ColumnLayout {
                Layout.fillWidth: true
                spacing: UiScale.px(4)
                IrisText {
                    Layout.leftMargin: UiScale.px(6)
                    role: "caption"
                    text: editXpField.placeholderText
                }
                IrisField {
                    id: editXpField
                    Layout.preferredWidth: UiScale.px(180)
                    placeholderText: editDialog.isSub ? Translation.tr("XP (empty = auto)")
                        : editDialog.isBad ? Translation.tr("Slip penalty") : Translation.tr("XP reward")
                    text: editDialog.isSub
                        ? (GritEdit.subtask?.xp != null ? `${GritEdit.subtask.xp}` : "")
                        : `${(editDialog.isBad ? GritEdit.task?.slipPenalty : GritEdit.task?.points) ?? 0}`
                    validator: IntValidator { bottom: 0; top: 100000 }
                    onAccepted: editForm.save()
                }
            }
            GritRecurrenceEditor {
                id: editRepeat
                Layout.fillWidth: true
                visible: editDialog.showRepeat
                allowNone: GritEdit.task?.listType !== "must"
                Component.onCompleted: loadFrom(GritEdit.task)
            }
            RowLayout {
                Layout.fillWidth: true
                spacing: UiScale.px(8)
                Item { Layout.fillWidth: true }
                IrisPill {
                    text: Translation.tr("Cancel")
                    onClicked: editDialog.close()
                }
                IrisPill {
                    primary: true
                    text: Translation.tr("Save")
                    onClicked: editForm.save()
                }
            }
        }
    }

    // Shared confirmation sheet (GritConfirm.ask): red for destructive
    // actions, white for purchases
    Connections {
        target: GritConfirm
        function onShowChanged() {
            if (GritConfirm.show)
                confirmSheet.open();
        }
    }

    IrisConfirmSheet {
        id: confirmSheet
        icon: GritConfirm.danger ? "delete" : "paid"
        title: GritConfirm.title
        text: GritConfirm.message
        actionText: GritConfirm.confirmLabel.length > 0
            ? GritConfirm.confirmLabel : Translation.tr("Delete")
        danger: GritConfirm.danger
        onAccepted: GritConfirm.accept()
        onRejected: GritConfirm.dismiss()
    }

    // ---------------- Cheatsheet overlay (?) ----------------

    Loader {
        anchors.fill: parent
        z: 60
        active: GritKeys.cheatsheetOpen
        sourceComponent: Rectangle {
            color: Qt.rgba(0, 0, 0, 0.8) // over the always black panel

            // Any click puts it away, same as any key
            MouseArea {
                anchors.fill: parent
                onClicked: GritKeys.cheatsheetOpen = false
            }

            Rectangle {
                anchors.centerIn: parent
                width: Math.min(parent.width - UiScale.px(48), sheetColumn.implicitWidth + UiScale.px(56))
                implicitHeight: sheetColumn.implicitHeight + UiScale.px(48)
                radius: UiScale.px(24)
                color: GritColors.raised
                border.width: 1
                border.color: GritColors.divider

                ColumnLayout {
                    id: sheetColumn
                    anchors.centerIn: parent
                    spacing: UiScale.px(14)

                    IrisText {
                        Layout.alignment: Qt.AlignHCenter
                        role: "title"
                        text: Translation.tr("Keyboard")
                    }

                    GridLayout {
                        columns: 2
                        columnSpacing: UiScale.px(28)
                        rowSpacing: UiScale.px(8)

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
                                { k: "Space", d: Translation.tr("Leader: t r s i m u ?") },
                                { k: "Esc", d: Translation.tr("Back, then close") }
                            ]
                            delegate: RowLayout {
                                required property var modelData
                                spacing: UiScale.px(10)

                                IrisKeycap {
                                    Layout.minimumWidth: UiScale.px(34)
                                    text: parent.modelData.k
                                    mono: true
                                }
                                IrisText {
                                    role: "label"
                                    text: parent.modelData.d
                                    color: Iris.fg2
                                }
                            }
                        }
                    }

                    IrisText {
                        Layout.alignment: Qt.AlignHCenter
                        role: "caption"
                        text: Translation.tr("Card keys act on the focused card. Any key closes this.")
                    }
                }
            }
        }
    }
}
