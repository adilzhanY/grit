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
 * Food logger, sidebar layout: budget + fasting up top, saved-food cards,
 * a new-food form, and the log history grouped by day (last 5 days).
 */
StyledFlickable {
    id: root

    clip: true
    contentHeight: mainColumn.implicitHeight

    property real fastingTick: Date.now()
    Timer {
        interval: 1000
        running: root.visible
        repeat: true
        onTriggered: root.fastingTick = Date.now()
    }

    // A macro's Lucide icon: drumstick for protein, wheat for carbs, droplet
    // for fat. A plain Text on purpose: MaterialSymbol only switches to the
    // Lucide font for Material names, and these are Lucide's own ligatures.
    component MacroIcon: Text {
        font.family: "Lucide Shell"
        renderType: Appearance.font.renderType
        color: GritColors.fg2
    }
    readonly property var macroIcons: ({ protein: "drumstick", carbs: "wheat", fat: "droplet" })

    readonly property var todayFood: {
        GritStore.revision;
        return GritStore.foodLogsToday();
    }
    readonly property real caloriesEaten: Core.foodTotal(root.todayFood, "calories")
    readonly property real caloriesBurnt: {
        GritStore.revision;
        return GritStore.db.dayLogs
            .filter(l => l.kind === "steps" && l.date === GritStore.today)
            .reduce((s, l) => s + (l.caloriesBurnt ?? 0), 0);
    }
    // Net intake vs the plain limit (like the web's budget gauge): burnt
    // calories decrement the eaten total instead of raising the limit.
    readonly property real netCalories: root.caloriesEaten - root.caloriesBurnt
    readonly property real lastFoodAt: {
        GritStore.revision;
        return Core.lastFoodLoggedAt(GritStore.db.dayLogs) ?? 0;
    }

    // Food history grouped by day, newest first, last 5 days (like the web)
    readonly property var foodHistory: {
        GritStore.revision;
        const byDate = {};
        for (const l of GritStore.db.dayLogs) {
            if (l.kind !== "food")
                continue;
            if (!byDate[l.date])
                byDate[l.date] = [];
            byDate[l.date].push(l);
        }
        const burntByDate = {};
        for (const l of GritStore.db.dayLogs) {
            if (l.kind !== "steps")
                continue;
            burntByDate[l.date] = (burntByDate[l.date] ?? 0) + (l.caloriesBurnt ?? 0);
        }
        const dates = Object.keys(byDate).sort().reverse().slice(0, 5);
        return dates.map(date => ({
            date: date,
            rows: byDate[date].sort((a, b) => b.loggedAt - a.loggedAt),
            burnt: burntByDate[date] ?? 0
        }));
    }

    readonly property var savedNames: {
        GritStore.revision;
        return GritStore.foods.map(f => f.name.trim().toLowerCase());
    }

    // Saved foods with the most-logged first, like the web's food panel
    readonly property var savedFoods: {
        GritStore.revision;
        return Core.sortFoodsByUsage(GritStore.foods, GritStore.db.dayLogs);
    }

    // The saved foods as search results, most logged first
    readonly property var foodResults: root.savedFoods.map(f => ({
        section: Translation.tr("Saved"),
        title: f.name,
        subtitle: `P${Math.round(f.protein ?? 0)} C${Math.round(f.carbs ?? 0)} F${Math.round(f.fat ?? 0)}`,
        icon: "restaurant",
        trail: `${f.calories} kcal`,
        food: f
    }))

    function logSaved(food) {
        GritStore.addFoodLog({
            name: food.name,
            calories: food.calories,
            protein: food.protein,
            carbs: food.carbs,
            fat: food.fat
        });
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

    ColumnLayout {
        id: mainColumn
        width: parent.width
        spacing: UiScale.px(12)

        // ---- Budget + fasting ----
        IrisCard {
            spacing: UiScale.px(10)

                RowLayout {
                    Layout.fillWidth: true
                    spacing: UiScale.px(6)

                    IrisText {
                        text: `${Math.round(root.netCalories)}`
                        font.pixelSize: Appearance.font.pixelSize.hugeass
                        font.features: { "tnum": 1 }
                        font.weight: Font.ExtraBold
                        color: root.netCalories > GritStore.settings.calorieLimit
                            ? GritColors.danger : GritColors.fg
                        Behavior on color {
                            ColorAnimation { duration: Iris.colorDuration }
                        }
                    }
                    IrisText {
                        Layout.alignment: Qt.AlignBottom
                        Layout.bottomMargin: UiScale.px(3)
                        text: `/ ${Math.round(GritStore.settings.calorieLimit)} kcal`
                        font.pixelSize: Appearance.font.pixelSize.small
                        font.features: { "tnum": 1 }
                        font.weight: Font.DemiBold
                        color: GritColors.fg3
                    }
                }

                IrisSlot {
                    Layout.fillWidth: true
                    valueBarHeight: UiScale.px(14)
                    showOver: true
                    value: Math.max(0, root.netCalories) / Math.max(1, GritStore.settings.calorieLimit)
                }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: UiScale.px(6)

                    Repeater {
                        model: [
                            [root.macroIcons.protein, Core.foodTotal(root.todayFood, "protein")],
                            [root.macroIcons.carbs, Core.foodTotal(root.todayFood, "carbs")],
                            [root.macroIcons.fat, Core.foodTotal(root.todayFood, "fat")]
                        ]
                        delegate: Rectangle {
                            id: macroPill
                            required property var modelData
                            implicitWidth: macroPillRow.implicitWidth + UiScale.px(24)
                            implicitHeight: UiScale.px(32)
                            radius: height / 2
                            color: GritColors.well

                            Row {
                                id: macroPillRow
                                anchors.centerIn: parent
                                spacing: UiScale.px(5)
                                MacroIcon {
                                    anchors.verticalCenter: parent.verticalCenter
                                    text: macroPill.modelData[0]
                                    font.pixelSize: Appearance.font.pixelSize.normal
                                }
                                IrisText {
                                    anchors.verticalCenter: parent.verticalCenter
                                    text: `${Math.round(macroPill.modelData[1])} g`
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    font.features: { "tnum": 1 }
                                    font.weight: Font.Bold
                                    color: GritColors.fg
                                }
                            }
                        }
                    }
                }

                // Fasting and what went in and out, on their own line
                RowLayout {
                    Layout.fillWidth: true
                    spacing: UiScale.px(10)
                    Rectangle {
                        implicitWidth: fastRow.implicitWidth + UiScale.px(28)
                        implicitHeight: UiScale.px(36)
                        radius: height / 2
                        color: GritColors.well

                        Row {
                            id: fastRow
                            anchors.centerIn: parent
                            spacing: UiScale.px(8)
                            IrisText {
                                anchors.verticalCenter: parent.verticalCenter
                                text: Translation.tr("FASTING")
                                font.pixelSize: Appearance.font.pixelSize.smallest
                                font.letterSpacing: 1.5
                                font.weight: Font.Bold
                                color: GritColors.fg3
                            }
                            IrisText {
                                anchors.verticalCenter: parent.verticalCenter
                                text: root.lastFoodAt > 0 ? Core.fmtElapsed(root.fastingTick - root.lastFoodAt) : "-"
                                font.pixelSize: Appearance.font.pixelSize.small
                                font.features: { "tnum": 1 }
                                font.weight: Font.Bold
                                color: GritColors.fg
                            }
                        }
                    }
                    IrisText {
                        Layout.fillWidth: true
                        text: Translation.tr("%1 eaten · %2 burnt")
                            .arg(Math.round(root.caloriesEaten)).arg(Math.round(root.caloriesBurnt))
                        elide: Text.ElideRight
                        font.pixelSize: Appearance.font.pixelSize.smaller
                        font.features: { "tnum": 1 }
                        color: GritColors.fg3
                    }
                }
        }

        // ---- Search over saved foods ----
        IrisCard {
            pad: UiScale.px(12)

            IrisSearch {
                id: foodSearch
                Layout.fillWidth: true
                size: "compact"
                placeholderText: Translation.tr("Log a food")
                model: root.foodResults
                filter: true
                emptySection: Translation.tr("Most logged")
                emptyText: Translation.tr("No saved foods yet, type a name to add one")
                noMatchText: Translation.tr("No saved food matches \"%1\"")
                addRowText: Translation.tr("Add \"%1\" as a new food")
                addRowSubtitle: Translation.tr("Opens the form with the name filled in")
                onPicked: item => {
                    root.logSaved(item.food);
                    foodSearch.clear();
                }
                onAddRequested: name => {
                    foodSearch.clear();
                    foodNameField.text = name;
                    calField.forceActiveFocus();
                    root.contentY = Math.max(0, Math.min(formCard.y, root.contentHeight - root.height));
                }
            }
        }

        // ---- Saved foods (tiles) ----
        IrisSectionLabel {
            Layout.fillWidth: true
            visible: GritStore.foods.length > 0
            text: Translation.tr("Saved foods · click to log")
        }
        GridLayout {
            id: foodGrid
            Layout.fillWidth: true
            visible: GritStore.foods.length > 0
            columns: width > UiScale.px(460) ? 3 : 2
            rowSpacing: UiScale.px(8)
            columnSpacing: UiScale.px(8)

            Repeater {
                model: root.savedFoods
                delegate: Rectangle {
                    id: foodCard
                    required property var modelData
                    Layout.fillWidth: true
                    Layout.preferredWidth: 1 // equal columns
                    implicitHeight: cardColumn.implicitHeight + UiScale.px(24)
                    radius: UiScale.px(18)
                    color: foodArea.pressed ? GritColors.raisedActive
                        : foodArea.containsMouse ? GritColors.raisedHover : GritColors.raised
                    scale: foodArea.pressed ? Iris.pressScalePill : 1

                    Behavior on color {
                        ColorAnimation { duration: Iris.colorDuration }
                    }
                    Behavior on scale {
                        NumberAnimation { duration: Iris.pressDuration; easing.type: Iris.pressEasing }
                    }

                    ColumnLayout {
                        id: cardColumn
                        anchors {
                            left: parent.left
                            right: parent.right
                            verticalCenter: parent.verticalCenter
                            leftMargin: UiScale.px(14)
                            rightMargin: UiScale.px(14)
                        }
                        spacing: UiScale.px(2)

                        IrisText {
                            Layout.fillWidth: true
                            text: foodCard.modelData.name
                            font.pixelSize: Appearance.font.pixelSize.small
                            font.weight: Font.DemiBold
                            color: GritColors.fg
                            elide: Text.ElideRight
                        }
                        IrisText {
                            text: `${foodCard.modelData.calories} kcal`
                            font.pixelSize: Appearance.font.pixelSize.normal
                            font.features: { "tnum": 1 }
                            font.weight: Font.ExtraBold
                            color: GritColors.fg
                        }
                        Row {
                            spacing: UiScale.px(8)
                            Repeater {
                                model: ["protein", "carbs", "fat"]
                                delegate: Row {
                                    id: macro
                                    required property string modelData
                                    spacing: UiScale.px(3)
                                    MacroIcon {
                                        anchors.verticalCenter: parent.verticalCenter
                                        text: root.macroIcons[macro.modelData]
                                        font.pixelSize: Appearance.font.pixelSize.smallest
                                        color: GritColors.fg3
                                    }
                                    IrisText {
                                        anchors.verticalCenter: parent.verticalCenter
                                        text: `${Math.round(foodCard.modelData[macro.modelData])}`
                                        font.pixelSize: Appearance.font.pixelSize.smallest
                                        font.features: { "tnum": 1 }
                                        font.weight: Font.DemiBold
                                        color: GritColors.fg2
                                    }
                                }
                            }
                        }
                    }

                    MouseArea {
                        id: foodArea
                        anchors.fill: parent
                        hoverEnabled: true
                        acceptedButtons: Qt.LeftButton | Qt.RightButton
                        cursorShape: Qt.PointingHandCursor
                        onClicked: mouse => {
                            if (mouse.button === Qt.RightButton) {
                                const foodId = foodCard.modelData.id;
                                GritConfirm.ask(
                                    Translation.tr("Remove saved food?"),
                                    foodCard.modelData.name,
                                    () => GritStore.deleteFood(foodId),
                                    Translation.tr("Remove"));
                                return;
                            }
                            root.logSaved(foodCard.modelData);
                        }
                        IrisToolTip { text: Translation.tr("Click to log · right-click to remove") }
                    }
                }
            }
        }

        // ---- Add food form ----
        IrisSectionLabel {
            Layout.fillWidth: true
            text: Translation.tr("Something new")
        }
        IrisCard {
            id: formCard
            spacing: UiScale.px(8)

                RowLayout {
                    Layout.fillWidth: true
                    spacing: UiScale.px(6)

                    IrisField {
                        id: foodNameField
                        Layout.fillWidth: true
                        placeholderText: Translation.tr("Food name")
                        onAccepted: root.logNewFood()
                    }
                    IrisField {
                        id: calField
                        Layout.preferredWidth: UiScale.px(96)
                        placeholderText: "kcal"
                        validator: DoubleValidator { bottom: 0; top: 100000 }
                        onAccepted: root.logNewFood()
                    }
                }
                RowLayout {
                    Layout.fillWidth: true
                    spacing: UiScale.px(6)

                    IrisField {
                        id: protField
                        Layout.fillWidth: true
                        placeholderText: Translation.tr("protein g")
                        validator: DoubleValidator { bottom: 0; top: 100000 }
                    }
                    IrisField {
                        id: carbField
                        Layout.fillWidth: true
                        placeholderText: Translation.tr("carbs g")
                        validator: DoubleValidator { bottom: 0; top: 100000 }
                    }
                    IrisField {
                        id: fatField
                        Layout.fillWidth: true
                        placeholderText: Translation.tr("fat g")
                        validator: DoubleValidator { bottom: 0; top: 100000 }
                    }
                }
                RowLayout {
                    Layout.fillWidth: true
                    spacing: UiScale.px(8)

                    // Save-to-library toggle: a well pill with a check when on
                    IrisPill {
                        id: saveToLibrary
                        property bool checked: false
                        icon: checked ? "check_circle" : "radio_button_unchecked"
                        text: Translation.tr("Save to library")
                        onClicked: checked = !checked
                    }
                    Item { Layout.fillWidth: true }
                    IrisPill {
                        primary: true
                        text: Translation.tr("Log it")
                        onClicked: root.logNewFood()
                    }
                }
        }

        // ---- History, grouped by day (like the web's FoodHistory) ----
        Repeater {
            model: root.foodHistory
            delegate: ColumnLayout {
                id: dayGroup
                required property var modelData
                Layout.fillWidth: true
                Layout.topMargin: UiScale.px(4)
                spacing: UiScale.px(6)

                RowLayout {
                    Layout.fillWidth: true
                    Layout.leftMargin: UiScale.px(6)
                    Layout.rightMargin: UiScale.px(6)
                    spacing: UiScale.px(8)

                    IrisText {
                        Layout.fillWidth: true
                        text: root.dayHeading(dayGroup.modelData.date)
                        font.pixelSize: Appearance.font.pixelSize.smaller
                        color: GritColors.fg3
                        elide: Text.ElideRight
                    }
                    // Web's DayMacroTotals format: "eaten - burnt = net", net highlighted
                    RowLayout {
                        spacing: 0

                        readonly property real dayEaten: dayGroup.modelData.rows
                            .reduce((s, l) => s + (l.calories ?? 0), 0)
                        readonly property real dayBurnt: dayGroup.modelData.burnt

                        IrisText {
                            text: parent.dayBurnt > 0
                                ? `${Math.round(parent.dayEaten)} − ${Math.round(parent.dayBurnt)} = `
                                : `${Math.round(parent.dayEaten)}`
                            font.pixelSize: Appearance.font.pixelSize.smaller
                            font.features: { "tnum": 1 }
                            font.weight: Font.DemiBold
                            color: GritColors.fg3
                        }
                        IrisText {
                            visible: parent.dayBurnt > 0
                            text: `${Math.round(parent.dayEaten - parent.dayBurnt)}`
                            font.pixelSize: Appearance.font.pixelSize.smaller
                            font.features: { "tnum": 1 }
                            font.weight: Font.Bold
                            color: GritColors.fg
                        }
                        IrisText {
                            text: ` kcal`
                            font.pixelSize: Appearance.font.pixelSize.smaller
                            font.weight: Font.DemiBold
                            color: GritColors.fg3
                        }
                    }
                    IrisText {
                        text: {
                            const rows = dayGroup.modelData.rows;
                            const p = rows.reduce((s, l) => s + (l.protein ?? 0), 0);
                            const c = rows.reduce((s, l) => s + (l.carbs ?? 0), 0);
                            const f = rows.reduce((s, l) => s + (l.fat ?? 0), 0);
                            return `· P${Math.round(p)} C${Math.round(c)} F${Math.round(f)}`;
                        }
                        font.pixelSize: Appearance.font.pixelSize.smaller
                        font.features: { "tnum": 1 }
                        font.weight: Font.DemiBold
                        color: GritColors.fg3
                    }
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
                                    text: logRow.modelData.name ?? Translation.tr("Food")
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    font.weight: Font.DemiBold
                                    color: GritColors.fg
                                    elide: Text.ElideRight
                                }
                                IrisText {
                                    Layout.fillWidth: true
                                    text: `${root.fmtClock(logRow.modelData.loggedAt)} · P${logRow.modelData.protein ?? 0} C${logRow.modelData.carbs ?? 0} F${logRow.modelData.fat ?? 0}`
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
                                color: GritColors.danger
                            }
                            IrisText {
                                text: `${logRow.modelData.calories ?? 0} kcal`
                                font.pixelSize: Appearance.font.pixelSize.small
                                font.features: { "tnum": 1 }
                                font.weight: Font.Bold
                                color: GritColors.fg2
                            }
                            // Save to library (if not saved yet)
                            IrisDisc {
                                visible: !root.savedNames.includes((logRow.modelData.name ?? "").trim().toLowerCase())
                                clickable: true
                                size: UiScale.px(32)
                                icon: "bookmark_add"
                                tone: "card"
                                tip: Translation.tr("Save to library")
                                onClicked: {
                                    GritStore.saveFood({
                                        name: logRow.modelData.name ?? Translation.tr("Food"),
                                        calories: logRow.modelData.calories ?? 0,
                                        protein: logRow.modelData.protein ?? 0,
                                        carbs: logRow.modelData.carbs ?? 0,
                                        fat: logRow.modelData.fat ?? 0
                                    });
                                }
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
                                        `${logRow.modelData.name ?? Translation.tr("Food")} · ${logRow.modelData.calories ?? 0} kcal`,
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

    function logNewFood() {
        const name = foodNameField.text.trim();
        const calories = parseFloat(calField.text) || 0;
        if (name.length === 0 || calories <= 0)
            return;
        const food = {
            name: name,
            calories: calories,
            protein: parseFloat(protField.text) || 0,
            carbs: parseFloat(carbField.text) || 0,
            fat: parseFloat(fatField.text) || 0
        };
        GritStore.addFoodLog(food);
        if (saveToLibrary.checked)
            GritStore.saveFood(food);
        foodNameField.text = "";
        calField.text = "";
        protField.text = "";
        carbField.text = "";
        fatField.text = "";
    }
}
