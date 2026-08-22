pragma ComponentBehavior: Bound
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
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
        spacing: 8

        // ---- Budget + fasting ----
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: budgetColumn.implicitHeight + 20
            radius: Appearance.rounding.normal
            color: Appearance.colors.colLayer1
            border.width: 1
            border.color: Appearance.colors.colLayer0Border

            ColumnLayout {
                id: budgetColumn
                anchors {
                    left: parent.left
                    right: parent.right
                    top: parent.top
                    margins: 10
                }
                spacing: 4

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 6

                    GritText {
                        text: `${Math.round(root.netCalories)}`
                        font.pixelSize: 24
                        font.family: "Google Sans Flex"
                        font.features: { "tnum": 1 }
                        font.variableAxes: { "wght": 800, "ROND": 100 }
                        color: root.netCalories > GritStore.settings.calorieLimit
                            ? Appearance.colors.colError : Appearance.colors.colOnLayer1
                    }
                    GritText {
                        Layout.alignment: Qt.AlignBottom
                        Layout.bottomMargin: 3
                        text: `/ ${Math.round(GritStore.settings.calorieLimit)} kcal`
                        font.pixelSize: Appearance.font.pixelSize.small
                        font.family: "Google Sans Flex"
                        font.features: { "tnum": 1 }
                        font.variableAxes: { "wght": 600, "ROND": 100 }
                        color: Appearance.colors.colSubtext
                    }
                    Item { Layout.fillWidth: true }
                    ColumnLayout {
                        spacing: -4
                        GritText {
                            Layout.alignment: Qt.AlignRight
                            text: Translation.tr("FASTING")
                            font.pixelSize: 9
                            font.letterSpacing: 1.5
                            font.weight: Font.Bold
                            color: Appearance.colors.colSubtext
                        }
                        GritText {
                            Layout.alignment: Qt.AlignRight
                            text: root.lastFoodAt > 0 ? Core.fmtElapsed(root.fastingTick - root.lastFoodAt) : "—"
                            font.pixelSize: Appearance.font.pixelSize.large
                            font.family: "Google Sans Flex"
                            font.features: { "tnum": 1 }
                            font.variableAxes: { "wght": 700, "ROND": 100 }
                            color: Appearance.colors.colPrimary
                        }
                    }
                }

                StyledProgressBar {
                    Layout.fillWidth: true
                    value: Math.min(1, Math.max(0, root.netCalories) / Math.max(1, GritStore.settings.calorieLimit))
                }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 16
                    Repeater {
                        model: [
                            [Translation.tr("P"), Core.foodTotal(root.todayFood, "protein")],
                            [Translation.tr("C"), Core.foodTotal(root.todayFood, "carbs")],
                            [Translation.tr("F"), Core.foodTotal(root.todayFood, "fat")]
                        ]
                        delegate: RowLayout {
                            required property var modelData
                            spacing: 3

                            GritText {
                                Layout.alignment: Qt.AlignBottom
                                Layout.bottomMargin: 3
                                text: modelData[0]
                                font.pixelSize: Appearance.font.pixelSize.normal
                                font.family: "Google Sans Flex"
                                font.variableAxes: { "wght": 800, "ROND": 100 }
                                color: Appearance.colors.colSubtext
                            }
                            GritText {
                                text: `${Math.round(modelData[1])}`
                                font.pixelSize: 24
                                font.family: "Google Sans Flex"
                                font.features: { "tnum": 1 }
                                font.variableAxes: { "wght": 800, "ROND": 100 }
                                color: Appearance.colors.colOnLayer1
                            }
                            GritText {
                                Layout.alignment: Qt.AlignBottom
                                Layout.bottomMargin: 3
                                text: "g"
                                font.pixelSize: Appearance.font.pixelSize.normal
                                font.family: "Google Sans Flex"
                                font.variableAxes: { "wght": 800, "ROND": 100 }
                                color: Appearance.colors.colSubtext
                            }
                        }
                    }
                    Item { Layout.fillWidth: true }
                }
            }
        }

        // ---- Saved foods (cards) ----
        GritText {
            visible: GritStore.foods.length > 0
            text: Translation.tr("Saved foods")
            font.pixelSize: Appearance.font.pixelSize.smallest
            color: Appearance.colors.colSubtext
        }
        GridLayout {
            Layout.fillWidth: true
            visible: GritStore.foods.length > 0
            columns: 3
            columnSpacing: 8
            rowSpacing: 8

            Repeater {
                model: root.savedFoods
                delegate: RippleButton {
                    id: foodCard
                    required property var modelData
                    Layout.fillWidth: true
                    implicitHeight: cardColumn.implicitHeight + 18
                    buttonRadius: Appearance.rounding.normal
                    colBackground: Appearance.colors.colLayer2
                    colBackgroundHover: Appearance.colors.colLayer2Hover
                    colRipple: Appearance.colors.colLayer2Active
                    onClicked: {
                        GritStore.addFoodLog({
                            name: foodCard.modelData.name,
                            calories: foodCard.modelData.calories,
                            protein: foodCard.modelData.protein,
                            carbs: foodCard.modelData.carbs,
                            fat: foodCard.modelData.fat
                        });
                    }
                    altAction: () => {
                        const foodId = foodCard.modelData.id;
                        GritConfirm.ask(
                            Translation.tr("Remove saved food?"),
                            foodCard.modelData.name,
                            () => GritStore.deleteFood(foodId),
                            Translation.tr("Remove"));
                    }
                    GritToolTip { text: Translation.tr("Click to log · right-click to remove") }

                    contentItem: ColumnLayout {
                        id: cardColumn
                        anchors.centerIn: parent
                        width: foodCard.width - 16
                        spacing: 1

                        GritText {
                            Layout.fillWidth: true
                            horizontalAlignment: Text.AlignHCenter
                            text: foodCard.modelData.name
                            font.pixelSize: Appearance.font.pixelSize.small
                            font.weight: Font.DemiBold
                            color: Appearance.colors.colOnLayer2
                            elide: Text.ElideRight
                        }
                        GritText {
                            Layout.alignment: Qt.AlignHCenter
                            text: `${foodCard.modelData.calories} kcal`
                            font.pixelSize: Appearance.font.pixelSize.large
                            font.features: { "tnum": 1 }
                            font.variableAxes: { "wght": 800, "ROND": 100 }
                            color: Appearance.colors.colPrimary
                        }
                        GritText {
                            Layout.alignment: Qt.AlignHCenter
                            text: `P${Math.round(foodCard.modelData.protein)} · C${Math.round(foodCard.modelData.carbs)} · F${Math.round(foodCard.modelData.fat)}`
                            font.pixelSize: Appearance.font.pixelSize.small
                            font.features: { "tnum": 1 }
                            font.variableAxes: { "wght": 600, "ROND": 100 }
                            color: Appearance.colors.colOnLayer2
                        }
                    }
                }
            }
        }

        // ---- Add food form ----
        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            GritTextField {
                id: foodNameField
                Layout.fillWidth: true
                placeholderText: Translation.tr("Food name")
                onAccepted: root.logNewFood()
            }
            GritTextField {
                id: calField
                Layout.preferredWidth: 70
                placeholderText: "kcal"
                validator: DoubleValidator { bottom: 0; top: 100000 }
                onAccepted: root.logNewFood()
            }
        }
        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            GritTextField {
                id: protField
                Layout.fillWidth: true
                placeholderText: Translation.tr("protein g")
                validator: DoubleValidator { bottom: 0; top: 100000 }
            }
            GritTextField {
                id: carbField
                Layout.fillWidth: true
                placeholderText: Translation.tr("carbs g")
                validator: DoubleValidator { bottom: 0; top: 100000 }
            }
            GritTextField {
                id: fatField
                Layout.fillWidth: true
                placeholderText: Translation.tr("fat g")
                validator: DoubleValidator { bottom: 0; top: 100000 }
            }
        }
        RowLayout {
            Layout.fillWidth: true
            spacing: 8

            StyledSwitch {
                id: saveToLibrary
            }
            GritText {
                Layout.fillWidth: true
                text: Translation.tr("Save to library")
                font.pixelSize: Appearance.font.pixelSize.normal
                color: Appearance.colors.colOnLayer0
            }
            RippleButton {
                implicitHeight: 30
                buttonRadius: Appearance.rounding.full
                colBackground: Appearance.colors.colPrimary
                colBackgroundHover: Appearance.colors.colPrimaryHover
                colRipple: Appearance.colors.colPrimaryActive
                onClicked: root.logNewFood()
                contentItem: GritText {
                    anchors.centerIn: parent
                    horizontalAlignment: Text.AlignHCenter
                    leftPadding: 14
                    rightPadding: 14
                    text: Translation.tr("Log it")
                    font.pixelSize: Appearance.font.pixelSize.small
                    color: Appearance.colors.colOnPrimary
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
                Layout.topMargin: 6
                spacing: 4

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    GritText {
                        Layout.fillWidth: true
                        text: root.dayHeading(dayGroup.modelData.date)
                        font.pixelSize: Appearance.font.pixelSize.normal
                        font.weight: Font.DemiBold
                        color: Appearance.colors.colPrimary
                        elide: Text.ElideRight
                    }
                    // Web's DayMacroTotals format: "eaten − burnt = net", net highlighted
                    RowLayout {
                        spacing: 0

                        readonly property real dayEaten: dayGroup.modelData.rows
                            .reduce((s, l) => s + (l.calories ?? 0), 0)
                        readonly property real dayBurnt: dayGroup.modelData.burnt

                        GritText {
                            text: parent.dayBurnt > 0
                                ? `${Math.round(parent.dayEaten)} − ${Math.round(parent.dayBurnt)} = `
                                : `${Math.round(parent.dayEaten)}`
                            font.pixelSize: Appearance.font.pixelSize.small
                            font.features: { "tnum": 1 }
                            font.variableAxes: { "wght": 600, "ROND": 100 }
                            color: Appearance.colors.colSubtext
                        }
                        GritText {
                            visible: parent.dayBurnt > 0
                            text: `${Math.round(parent.dayEaten - parent.dayBurnt)}`
                            font.pixelSize: Appearance.font.pixelSize.small
                            font.features: { "tnum": 1 }
                            font.variableAxes: { "wght": 700, "ROND": 100 }
                            color: Appearance.colors.colPrimary
                        }
                        GritText {
                            text: ` kcal`
                            font.pixelSize: Appearance.font.pixelSize.small
                            font.variableAxes: { "wght": 600, "ROND": 100 }
                            color: Appearance.colors.colSubtext
                        }
                    }
                    GritText {
                        text: {
                            const rows = dayGroup.modelData.rows;
                            const p = rows.reduce((s, l) => s + (l.protein ?? 0), 0);
                            const c = rows.reduce((s, l) => s + (l.carbs ?? 0), 0);
                            const f = rows.reduce((s, l) => s + (l.fat ?? 0), 0);
                            return `· P${Math.round(p)} C${Math.round(c)} F${Math.round(f)}`;
                        }
                        font.pixelSize: Appearance.font.pixelSize.small
                        font.features: { "tnum": 1 }
                        font.variableAxes: { "wght": 600, "ROND": 100 }
                        color: Appearance.colors.colSubtext
                    }
                }

                Repeater {
                    model: dayGroup.modelData.rows
                    delegate: Rectangle {
                        id: logRow
                        required property var modelData
                        Layout.fillWidth: true
                        implicitHeight: logRowLayout.implicitHeight + 12
                        radius: Appearance.rounding.small
                        color: Appearance.colors.colLayer1
                        border.width: 1
                        border.color: Appearance.colors.colLayer0Border

                        RowLayout {
                            id: logRowLayout
                            anchors {
                                left: parent.left
                                right: parent.right
                                verticalCenter: parent.verticalCenter
                                leftMargin: 10
                                rightMargin: 6
                            }
                            spacing: 8

                            MaterialSymbol {
                                text: "restaurant"
                                iconSize: Appearance.font.pixelSize.larger
                                color: Appearance.colors.colSubtext
                            }
                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: -1

                                GritText {
                                    Layout.fillWidth: true
                                    text: logRow.modelData.name ?? Translation.tr("Food")
                                    font.pixelSize: Appearance.font.pixelSize.normal
                                    font.weight: Font.DemiBold
                                    color: Appearance.colors.colOnLayer1
                                    elide: Text.ElideRight
                                }
                                GritText {
                                    Layout.fillWidth: true
                                    text: `${root.fmtClock(logRow.modelData.loggedAt)} · ${logRow.modelData.calories ?? 0} kcal · P${logRow.modelData.protein ?? 0} C${logRow.modelData.carbs ?? 0} F${logRow.modelData.fat ?? 0}`
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    font.features: { "tnum": 1 }
                                    font.variableAxes: { "wght": 500, "ROND": 100 }
                                    color: Appearance.colors.colSubtext
                                    elide: Text.ElideRight
                                }
                            }
                            GritText {
                                visible: (logRow.modelData.awardedXp ?? 0) !== 0
                                text: Core.fmtXp(logRow.modelData.awardedXp)
                                font.pixelSize: Appearance.font.pixelSize.smallest
                                color: Appearance.colors.colError
                            }
                            // Save to library (if not saved yet)
                            RippleButton {
                                visible: !root.savedNames.includes((logRow.modelData.name ?? "").trim().toLowerCase())
                                implicitWidth: 26
                                implicitHeight: 26
                                buttonRadius: Appearance.rounding.full
                                onClicked: {
                                    GritStore.saveFood({
                                        name: logRow.modelData.name ?? Translation.tr("Food"),
                                        calories: logRow.modelData.calories ?? 0,
                                        protein: logRow.modelData.protein ?? 0,
                                        carbs: logRow.modelData.carbs ?? 0,
                                        fat: logRow.modelData.fat ?? 0
                                    });
                                }
                                GritToolTip { text: Translation.tr("Save to library") }
                                contentItem: MaterialSymbol {
                                    anchors.centerIn: parent
                                    horizontalAlignment: Text.AlignHCenter
                                    text: "bookmark_add"
                                    iconSize: Appearance.font.pixelSize.normal
                                    color: Appearance.colors.colSubtext
                                }
                            }
                            RippleButton {
                                implicitWidth: 26
                                implicitHeight: 26
                                buttonRadius: Appearance.rounding.full
                                onClicked: {
                                    const logId = logRow.modelData.id;
                                    GritConfirm.ask(
                                        Translation.tr("Delete log?"),
                                        `${logRow.modelData.name ?? Translation.tr("Food")} · ${logRow.modelData.calories ?? 0} kcal`,
                                        () => GritStore.deleteDayLog(logId));
                                }
                                contentItem: MaterialSymbol {
                                    anchors.centerIn: parent
                                    horizontalAlignment: Text.AlignHCenter
                                    text: "close"
                                    iconSize: Appearance.font.pixelSize.normal
                                    color: Appearance.colors.colSubtext
                                }
                            }
                        }
                    }
                }
            }
        }

        Item { implicitHeight: 4 }
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
