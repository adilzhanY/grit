pragma ComponentBehavior: Bound
import qs
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import qs.modules.iris
import Quickshell.Widgets
import QtQuick
import QtQuick.Layouts
import "../../../services/grit/GritCore.js" as Core

/**
 * Spendings page: what money left, where it went, and how that compares.
 *
 * Top to bottom: the entry form (amount, place, category, day), the same
 * Day / Week / Month / Year / Total range selector the Focus and Activity
 * pages use, stat tiles, a category-stacked bar chart, the category donut,
 * the place leaderboard, and the history grouped by day.
 *
 * The form sits above the charts on purpose: logging a purchase is the daily
 * action and must not be behind a scroll, while the charts are what you read
 * afterwards.
 */
Item {
    id: root

    readonly property var spend: GritSpend

    property bool showDatePicker: false
    /** Which day a new spending is filed under; reset to today after each add. */
    property string entryDay: GritStore.today
    property string entryCategory: "food"

    function money(v) {
        return GritSpend.money(v);
    }

    // ---------------- Entry ----------------

    readonly property var places: {
        GritStore.revision;
        return GritStore.spendPlaces.slice(0, 5);
    }

    readonly property real draftAmount: Core.parseAmount(amountField.text) ?? 0
    readonly property bool canSubmit: root.draftAmount > 0

    function submit() {
        const amount = Core.parseAmount(amountField.text);
        if (amount === null || amount <= 0)
            return;
        // A spending filed on an earlier day keeps that day's clock position at
        // noon, so it sorts sensibly against rows that do carry a real time.
        const day = root.entryDay;
        const at = day === GritStore.today
            ? Date.now()
            : (() => {
                const p = day.split("-").map(Number);
                return new Date(p[0], p[1] - 1, p[2], 12, 0, 0).getTime();
            })();
        GritStore.addSpending({
            amount: amount,
            place: placeField.text,
            category: root.entryCategory,
            date: day,
            spentAt: at
        });
        GritToast.show(Translation.tr("%1 at %2")
            .arg(root.money(amount))
            .arg(placeField.text.trim() === "" ? Core.spendCategory(root.entryCategory).name
                : placeField.text.trim()), "payments");
        amountField.clear();
        placeField.clear();
        root.entryDay = GritStore.today;
        amountField.forceActiveFocus();
    }

    function fmtClock(ts) {
        const d = new Date(ts);
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }

    function dayHeading(date) {
        if (date === GritStore.today)
            return Translation.tr("Today");
        if (date === Core.addDays(GritStore.today, -1))
            return Translation.tr("Yesterday");
        return Core.fmtDay(date);
    }

    // ---------------- Range labels ----------------

    readonly property string rangeTitle: {
        const a = root.spend.anchorDay;
        if (root.spend.mode === "day") {
            if (a === GritStore.today)
                return Translation.tr("Today");
            if (a === Core.addDays(GritStore.today, -1))
                return Translation.tr("Yesterday");
            return Core.fmtDay(a);
        }
        if (root.spend.mode === "week") {
            const s = root.spend.rangeDays[0];
            const e = root.spend.rangeDays[1];
            const sName = Core.MONTHS_SHORT[Number(s.slice(5, 7)) - 1];
            const eName = Core.MONTHS_SHORT[Number(e.slice(5, 7)) - 1];
            return sName === eName
                ? `${Number(s.slice(8, 10))} to ${Number(e.slice(8, 10))} ${eName}`
                : `${Number(s.slice(8, 10))} ${sName} to ${Number(e.slice(8, 10))} ${eName}`;
        }
        if (root.spend.mode === "month")
            return `${Core.MONTHS_SHORT[Number(a.slice(5, 7)) - 1]} ${a.slice(0, 4)}`;
        if (root.spend.mode === "year")
            return a.slice(0, 4);
        return Translation.tr("All time");
    }

    /** "+18% vs last month". Empty in Total mode, which has nothing to compare to. */
    readonly property string trendText: {
        if (root.spend.mode === "total" || root.spend.prevTotal <= 0)
            return "";
        const pct = Math.round((root.spend.total - root.spend.prevTotal) / root.spend.prevTotal * 100);
        const noun = root.spend.mode === "day" ? Translation.tr("yesterday")
            : root.spend.mode === "week" ? Translation.tr("last week")
            : root.spend.mode === "month" ? Translation.tr("last month")
            : Translation.tr("last year");
        if (pct === 0)
            return Translation.tr("same as %1").arg(noun);
        return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}% vs ${noun}`;
    }

    readonly property bool trendUp: root.spend.total > root.spend.prevTotal

    // ---------------- Chart helpers ----------------

    /** Bars stack the range's five biggest categories; the rest pools into Other. */
    readonly property var topCategories: root.spend.byCategory.slice(0, 5).map(d => d.id)
    readonly property color otherColor: Qt.alpha(GritColors.fg3, 0.8)

    function categoryColor(id) {
        const i = root.spend.byCategory.findIndex(d => d.id === id);
        return i >= 0 ? categoryPie.seriesColors[i % categoryPie.seriesColors.length]
            : GritColors.fg3;
    }

    function barSegments(perCategory) {
        const segs = [];
        let other = 0;
        for (const id in perCategory) {
            if (root.topCategories.indexOf(id) >= 0)
                segs.push({ id: id, value: perCategory[id], color: root.categoryColor(id) });
            else
                other += perCategory[id];
        }
        segs.sort((a, b) => root.topCategories.indexOf(a.id) - root.topCategories.indexOf(b.id));
        if (other > 0)
            segs.push({ id: "__other", value: other, color: root.otherColor });
        return segs;
    }

    property int hoverBucket: -1

    property int shownPlaces: 8

    // ---------------- Page ----------------

    StyledFlickable {
        anchors.fill: parent
        clip: true
        contentHeight: pageColumn.implicitHeight

        ColumnLayout {
            id: pageColumn
            width: parent.width
            spacing: UiScale.px(12)

            // ================ Entry form ================

            IrisCard {
                RowLayout {
                    Layout.fillWidth: true
                    spacing: UiScale.px(8)

                    IrisField {
                        id: amountField
                        Layout.preferredWidth: UiScale.px(118)
                        placeholderText: Core.currencySymbol(root.spend.currency)
                        inputMethodHints: Qt.ImhFormattedNumbersOnly
                        onAccepted: root.submit()
                    }
                    IrisField {
                        id: placeField
                        Layout.fillWidth: true
                        placeholderText: Translation.tr("Place")
                        onAccepted: root.submit()
                    }
                    // The main action: white once there is an amount to
                    // log, a dark disc until then so it never disappears.
                    IrisDisc {
                        id: addButton
                        size: UiScale.px(52)
                        icon: "add"
                        on: root.canSubmit
                        clickable: root.canSubmit
                        onClicked: root.submit()
                        // Its own hover, so the hint also shows while it cannot be clicked
                        HoverHandler { id: addHover }
                        IrisToolTip {
                            alternativeVisibleCondition: addHover.hovered
                            text: root.canSubmit ? Translation.tr("Log spending")
                                : Translation.tr("Enter an amount first")
                        }
                    }
                }

                // Recently used places: one tap fills the place and the
                // category it usually falls under.
                Flow {
                    Layout.fillWidth: true
                    visible: root.places.length > 0
                    spacing: UiScale.px(6)

                    Repeater {
                        model: root.places
                        delegate: IrisPill {
                            required property var modelData
                            compact: true
                            text: modelData.name
                            onClicked: {
                                placeField.text = modelData.name;
                                if (modelData.category)
                                    root.entryCategory = modelData.category;
                                amountField.forceActiveFocus();
                            }
                        }
                    }
                }

                // Category rail. Icons only: twelve labelled chips would
                // cost four rows of a page whose point is the charts below.
                GridLayout {
                    Layout.fillWidth: true
                    columns: 6
                    rowSpacing: UiScale.px(8)
                    columnSpacing: UiScale.px(4)

                    Repeater {
                        model: Core.SPEND_CATEGORIES
                        delegate: Item {
                            id: catChip
                            required property var modelData
                            readonly property bool picked: root.entryCategory === catChip.modelData.id
                            Layout.fillWidth: true
                            implicitHeight: UiScale.px(40)

                            IrisDisc {
                                anchors.centerIn: parent
                                size: UiScale.px(40)
                                icon: catChip.modelData.icon
                                on: catChip.picked
                                filled: catChip.picked
                                clickable: true
                                tip: catChip.modelData.name
                                onClicked: root.entryCategory = catChip.modelData.id
                            }
                        }
                    }
                }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: UiScale.px(8)

                    IrisText {
                        Layout.fillWidth: true
                        Layout.leftMargin: UiScale.px(4)
                        text: Core.spendCategory(root.entryCategory).name
                        font.pixelSize: Appearance.font.pixelSize.small
                        font.weight: Font.DemiBold
                        color: GritColors.fg
                        elide: Text.ElideRight
                    }
                    // White while the entry is back-dated, so the odd day
                    // cannot be missed before logging.
                    IrisPill {
                        id: dayPill
                        compact: true
                        icon: "event"
                        primary: root.entryDay !== GritStore.today
                        text: root.dayHeading(root.entryDay)
                        tip: Translation.tr("Pick the day it was spent")
                        onClicked: root.showDatePicker = true
                    }
                }
            }

            // ================ Range selector ================

            IrisSegmented {
                onBlack: true
                value: root.spend.mode
                onSelected: newValue => {
                    root.spend.mode = newValue;
                    if (root.spend.anchorDay > GritStore.today)
                        root.spend.anchorDay = GritStore.today;
                }
                options: [
                    { label: Translation.tr("Day"), value: "day" },
                    { label: Translation.tr("Week"), value: "week" },
                    { label: Translation.tr("Month"), value: "month" },
                    { label: Translation.tr("Year"), value: "year" },
                    { label: Translation.tr("Total"), value: "total" }
                ]
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: UiScale.px(6)

                IrisDisc {
                    icon: "chevron_left"
                    size: UiScale.px(34)
                    clickable: true
                    enabled: root.spend.canGoPrev
                    onClicked: root.spend.shift(-1)
                }
                IrisText {
                    Layout.preferredWidth: UiScale.px(150)
                    horizontalAlignment: Text.AlignHCenter
                    text: root.rangeTitle
                    font.pixelSize: Appearance.font.pixelSize.normal
                    font.weight: Font.DemiBold
                    color: GritColors.fg
                }
                IrisDisc {
                    icon: "chevron_right"
                    size: UiScale.px(34)
                    clickable: true
                    enabled: root.spend.canGoNext
                    onClicked: root.spend.shift(1)
                }
                IrisPill {
                    visible: root.spend.mode !== "total" && !root.spend.rangeIncludesToday
                    compact: true
                    text: Translation.tr("Today")
                    onClicked: root.spend.anchorDay = GritStore.today
                }
                Item { Layout.fillWidth: true }
            }

            // ================ Headline and stat tiles ================

            IrisCard {
                spacing: UiScale.px(2)

                IrisText {
                    text: Translation.tr("Spent")
                    font.pixelSize: Appearance.font.pixelSize.smaller
                    color: GritColors.fg3
                }
                IrisText {
                    Layout.fillWidth: true
                    text: root.money(root.spend.total)
                    font.pixelSize: Appearance.font.pixelSize.hugeass
                    font.features: { "tnum": 1 }
                    font.weight: Font.ExtraBold
                    color: GritColors.fg
                    elide: Text.ElideRight
                }
                IrisText {
                    Layout.fillWidth: true
                    visible: root.trendText !== ""
                    text: root.trendText
                    font.pixelSize: Appearance.font.pixelSize.smaller
                    color: root.trendUp ? GritColors.danger : GritColors.fg2
                    elide: Text.ElideRight
                }
            }

            GridLayout {
                Layout.fillWidth: true
                columns: 2
                rowSpacing: UiScale.px(12)
                columnSpacing: UiScale.px(12)

                Repeater {
                    model: [
                        {
                            icon: "calendar_month",
                            label: Translation.tr("Per day"),
                            value: root.money(Math.round(root.spend.perDay * 100) / 100),
                            sub: root.spend.daysElapsed === 1
                                ? Translation.tr("over 1 day")
                                : Translation.tr("over %1 days").arg(root.spend.daysElapsed)
                        },
                        {
                            icon: "sell",
                            label: Translation.tr("Top category"),
                            value: root.spend.byCategory.length > 0
                                ? root.spend.byCategory[0].label : Translation.tr("Nothing yet"),
                            sub: root.spend.byCategory.length > 0 && root.spend.total > 0
                                ? Translation.tr("%1 of the total")
                                    .arg(`${Math.round(root.spend.byCategory[0].value / root.spend.total * 100)}%`)
                                : ""
                        }
                    ]
                    delegate: IrisStatTile {
                        required property var modelData
                        Layout.preferredWidth: 1
                        icon: modelData.icon
                        label: modelData.label
                        value: modelData.value
                        sublabel: modelData.sub
                    }
                }
            }

            // ================ Timeline ================

            IrisSectionLabel {
                Layout.fillWidth: true
                Layout.topMargin: UiScale.px(6)
                icon: "bar_chart"
                text: Translation.tr("Timeline")
            }

            IrisCard {
                id: chartCard
                implicitHeight: UiScale.px(170)
                fill: true

                Item {
                    Layout.fillWidth: true
                    Layout.fillHeight: true

                    IrisText {
                        anchors.centerIn: parent
                        visible: root.spend.count === 0
                        text: Translation.tr("Nothing spent in this period.")
                        font.pixelSize: Appearance.font.pixelSize.small
                        color: GritColors.fg3
                    }

                    RowLayout {
                        anchors.fill: parent
                        spacing: root.spend.timeline.length > 12 ? UiScale.px(2) : UiScale.px(6)

                        Repeater {
                            model: root.spend.timeline
                            delegate: ColumnLayout {
                                id: barColumn
                                required property var modelData
                                required property int index
                                Layout.fillWidth: true
                                Layout.fillHeight: true
                                spacing: UiScale.px(4)

                                readonly property var segments: root.barSegments(barColumn.modelData.perCategory)
                                readonly property bool bucketHovered: root.hoverBucket === barColumn.index

                                IrisText {
                                    Layout.alignment: Qt.AlignHCenter
                                    visible: barColumn.modelData.total > 0 && root.spend.timeline.length <= 8
                                    text: GritSpend.moneyShort(barColumn.modelData.total)
                                    font.pixelSize: Appearance.font.pixelSize.smallest
                                    font.features: { "tnum": 1 }
                                    font.weight: Font.DemiBold
                                    color: barColumn.bucketHovered ? GritColors.fg : GritColors.fg3
                                    Behavior on color {
                                        ColorAnimation { duration: Iris.colorDuration }
                                    }
                                }
                                // The well track is the full column; the stacked
                                // spend grows up from its bottom.
                                Rectangle {
                                    id: barTrack
                                    Layout.alignment: Qt.AlignHCenter
                                    Layout.fillHeight: true
                                    Layout.preferredWidth: Math.min(UiScale.px(24), Math.max(UiScale.px(5), UiScale.px(300) / Math.max(1, root.spend.timeline.length)))
                                    radius: Math.min(width / 2, UiScale.px(8))
                                    color: GritColors.well
                                    opacity: root.hoverBucket >= 0 && !barColumn.bucketHovered ? 0.5 : 1

                                    Behavior on opacity {
                                        NumberAnimation { duration: 160 }
                                    }

                                    ClippingRectangle {
                                        id: barRect
                                        anchors.bottom: parent.bottom
                                        width: parent.width
                                        // min() guards the frame where the model and chartMax
                                        // update in different orders and the ratio spikes
                                        height: barColumn.modelData.total > 0
                                            ? Math.max(UiScale.px(4), parent.height * Math.min(1, (barColumn.modelData?.total ?? 0) / root.spend.chartMax))
                                            : 0
                                        radius: parent.radius
                                        color: "transparent"

                                        Behavior on height {
                                            SpringAnimation { spring: 2.4; damping: 0.4; epsilon: 0.3 }
                                        }

                                        Column {
                                            anchors.fill: parent

                                            Repeater {
                                                model: barColumn.segments
                                                delegate: Rectangle {
                                                    required property var modelData
                                                    width: barRect.width
                                                    height: barRect.height * ((modelData?.value ?? 0) / Math.max(1, barColumn.modelData?.total ?? 1))
                                                    color: modelData.color
                                                }
                                            }
                                        }
                                    }

                                    HoverHandler {
                                        onHoveredChanged: {
                                            if (hovered)
                                                root.hoverBucket = barColumn.index;
                                            else if (root.hoverBucket === barColumn.index)
                                                root.hoverBucket = -1;
                                        }
                                    }

                                    // The bucket's total, then one line per category
                                    IrisToolTip {
                                        alternativeVisibleCondition: barColumn.bucketHovered && barColumn.segments.length > 0
                                        text: [`${barColumn.modelData.label} · ${root.money(barColumn.modelData.total)}`]
                                            .concat(barColumn.segments.map(seg => `${seg.id === "__other" ? Translation.tr("Other")
                                                : Core.spendCategory(seg.id).name}  ${root.money(seg.value)}`))
                                            .join("\n")
                                    }
                                }
                                IrisText {
                                    Layout.alignment: Qt.AlignHCenter
                                    text: barColumn.modelData.tick ? barColumn.modelData.label : ""
                                    font.pixelSize: Appearance.font.pixelSize.smallest
                                    color: barColumn.bucketHovered ? GritColors.fg : GritColors.fg3
                                }
                            }
                        }
                    }
                }
            }

            // ================ Categories ================

            IrisSectionLabel {
                Layout.fillWidth: true
                Layout.topMargin: UiScale.px(6)
                visible: root.spend.byCategory.length > 0
                icon: "donut_small"
                text: Translation.tr("Categories")
                side: Translation.tr("Where the money went")
            }

            IrisCard {
                visible: root.spend.byCategory.length > 0
                spacing: UiScale.px(8)

                IrisPie {
                    id: categoryPie
                    Layout.alignment: Qt.AlignHCenter
                    model: root.spend.byCategory
                    centerText: GritSpend.moneyShort(root.spend.total)
                    centerCaption: Translation.tr("spent")
                    valueFormatter: v => root.money(v)
                }

                // One slot per category: the fill is its share, the
                // round icon and label sit inside, the amount on the right.
                Repeater {
                    model: root.spend.byCategory
                    delegate: Item {
                        id: legendRow
                        required property var modelData
                        required property int index
                        readonly property bool hovered: categoryPie.hoveredIndex === legendRow.index
                        Layout.fillWidth: true
                        implicitHeight: UiScale.px(40)

                        Rectangle {
                            anchors.fill: parent
                            radius: height / 2
                            color: GritColors.well

                            Rectangle {
                                height: parent.height
                                width: Math.max(parent.height, parent.width * (legendRow.modelData?.value ?? 0)
                                    / Math.max(1, root.spend.byCategory[0]?.value ?? 1))
                                radius: height / 2
                                color: legendRow.hovered ? GritColors.raisedActive : GritColors.raisedHover
                                Behavior on width {
                                    SpringAnimation { spring: 2.6; damping: 0.4; epsilon: 0.3 }
                                }
                                Behavior on color {
                                    ColorAnimation { duration: Iris.colorDuration }
                                }
                            }
                        }
                        HoverHandler {
                            onHoveredChanged: categoryPie.hoveredIndex = hovered ? legendRow.index : -1
                        }

                        RowLayout {
                            anchors.fill: parent
                            anchors.leftMargin: UiScale.px(6)
                            anchors.rightMargin: UiScale.px(16)
                            spacing: UiScale.px(10)

                            IrisDisc {
                                size: UiScale.px(28)
                                icon: legendRow.modelData.icon
                                on: legendRow.hovered
                            }
                            IrisText {
                                Layout.fillWidth: true
                                text: legendRow.modelData.label
                                font.pixelSize: Appearance.font.pixelSize.small
                                font.weight: Font.DemiBold
                                color: GritColors.fg
                                elide: Text.ElideRight
                            }
                            Rectangle {
                                implicitWidth: UiScale.px(10)
                                implicitHeight: UiScale.px(10)
                                radius: width / 2
                                color: categoryPie.seriesColors[legendRow.index % categoryPie.seriesColors.length]
                            }
                            IrisText {
                                text: root.money(legendRow.modelData.value)
                                font.pixelSize: Appearance.font.pixelSize.smaller
                                font.features: { "tnum": 1 }
                                color: GritColors.fg2
                            }
                            IrisText {
                                Layout.preferredWidth: UiScale.px(40)
                                horizontalAlignment: Text.AlignRight
                                text: `${Math.round(legendRow.modelData.value / Math.max(1, root.spend.total) * 100)}%`
                                font.pixelSize: Appearance.font.pixelSize.smaller
                                font.features: { "tnum": 1 }
                                font.weight: Font.DemiBold
                                color: GritColors.fg
                            }
                        }
                    }
                }
            }

            // ================ Places ================

            IrisSectionLabel {
                Layout.fillWidth: true
                Layout.topMargin: UiScale.px(6)
                visible: root.spend.byPlace.length > 0
                icon: "storefront"
                text: Translation.tr("Places")
                side: Translation.tr("Who got the money")
            }

            IrisCard {
                visible: root.spend.byPlace.length > 0
                spacing: UiScale.px(8)

                Repeater {
                    model: root.spend.byPlace.slice(0, root.shownPlaces)
                    delegate: Item {
                        id: placeRow
                        required property var modelData
                        required property int index
                        Layout.fillWidth: true
                        implicitHeight: UiScale.px(40)

                        Rectangle {
                            anchors.fill: parent
                            radius: height / 2
                            color: GritColors.well

                            // The top place gets the white disc
                            Rectangle {
                                height: parent.height
                                width: Math.max(parent.height, parent.width * ((placeRow.modelData?.value ?? 0)
                                    / Math.max(1, root.spend.byPlace[0]?.value ?? 1)))
                                radius: height / 2
                                color: placeHover.hovered ? GritColors.raisedActive : GritColors.raisedHover
                                Behavior on width {
                                    SpringAnimation { spring: 2.6; damping: 0.4; epsilon: 0.3 }
                                }
                                Behavior on color {
                                    ColorAnimation { duration: Iris.colorDuration }
                                }
                            }
                        }
                        HoverHandler { id: placeHover }

                        RowLayout {
                            anchors.fill: parent
                            anchors.leftMargin: UiScale.px(6)
                            anchors.rightMargin: UiScale.px(16)
                            spacing: UiScale.px(10)

                            IrisDisc {
                                size: UiScale.px(28)
                                icon: placeRow.index === 0 ? "workspace_premium" : "storefront"
                                on: placeRow.index === 0
                            }
                            IrisText {
                                Layout.fillWidth: true
                                text: placeRow.modelData.label !== ""
                                    ? placeRow.modelData.label : Translation.tr("No place")
                                font.pixelSize: Appearance.font.pixelSize.small
                                font.weight: Font.DemiBold
                                color: GritColors.fg
                                elide: Text.ElideRight
                            }
                            IrisText {
                                text: placeRow.modelData.count === 1
                                    ? Translation.tr("1 visit")
                                    : Translation.tr("%1 visits").arg(placeRow.modelData.count)
                                font.pixelSize: Appearance.font.pixelSize.smallest
                                color: GritColors.fg3
                            }
                            IrisText {
                                text: root.money(placeRow.modelData.value)
                                font.pixelSize: Appearance.font.pixelSize.small
                                font.features: { "tnum": 1 }
                                font.weight: Font.Bold
                                color: GritColors.fg
                            }
                        }
                    }
                }

                IrisPill {
                    Layout.alignment: Qt.AlignHCenter
                    visible: root.spend.byPlace.length > root.shownPlaces
                    compact: true
                    icon: "expand_more"
                    text: Translation.tr("Show more")
                    onClicked: root.shownPlaces += 8
                }
            }

            // ================ History ================

            IrisSectionLabel {
                Layout.fillWidth: true
                Layout.topMargin: UiScale.px(6)
                visible: root.spend.count > 0
                icon: "receipt_long"
                text: Translation.tr("History")
                side: root.spend.count === 1
                    ? Translation.tr("1 entry")
                    : Translation.tr("%1 entries").arg(root.spend.count)
            }

            Repeater {
                model: root.spend.history
                delegate: ColumnLayout {
                    id: dayGroup
                    required property var modelData
                    Layout.fillWidth: true
                    spacing: UiScale.px(6)

                    RowLayout {
                        Layout.fillWidth: true
                        Layout.leftMargin: UiScale.px(8)
                        Layout.rightMargin: UiScale.px(16)
                        spacing: UiScale.px(8)

                        IrisText {
                            Layout.fillWidth: true
                            text: root.dayHeading(dayGroup.modelData.date)
                            font.pixelSize: Appearance.font.pixelSize.smaller
                            color: GritColors.fg3
                        }
                        IrisText {
                            text: root.money(dayGroup.modelData.total)
                            font.pixelSize: Appearance.font.pixelSize.smaller
                            font.features: { "tnum": 1 }
                            font.weight: Font.Bold
                            color: GritColors.fg3
                        }
                    }

                    Repeater {
                        model: dayGroup.modelData.rows
                        delegate: Rectangle {
                            id: entryRow
                            required property var modelData
                            readonly property var category: Core.spendCategory(entryRow.modelData.category)
                            Layout.fillWidth: true
                            implicitHeight: UiScale.px(52)
                            radius: height / 2
                            color: entryHover.hovered ? GritColors.raisedHover : GritColors.raised

                            Behavior on color {
                                ColorAnimation { duration: Iris.colorDuration }
                            }

                            HoverHandler { id: entryHover }

                            RowLayout {
                                anchors {
                                    fill: parent
                                    leftMargin: UiScale.px(8)
                                    rightMargin: UiScale.px(10)
                                }
                                spacing: UiScale.px(10)

                                IrisDisc {
                                    size: UiScale.px(36)
                                    icon: entryRow.category.icon
                                    tone: "well"
                                }
                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 0

                                    IrisText {
                                        Layout.fillWidth: true
                                        text: (entryRow.modelData.place ?? "").trim() !== ""
                                            ? entryRow.modelData.place : entryRow.category.name
                                        font.pixelSize: Appearance.font.pixelSize.small
                                        font.weight: Font.DemiBold
                                        color: GritColors.fg
                                        elide: Text.ElideRight
                                    }
                                    IrisText {
                                        Layout.fillWidth: true
                                        text: `${root.fmtClock(entryRow.modelData.spentAt ?? 0)} · ${entryRow.category.name}`
                                        font.pixelSize: Appearance.font.pixelSize.smallest
                                        color: GritColors.fg3
                                        elide: Text.ElideRight
                                    }
                                }
                                IrisText {
                                    text: root.money(entryRow.modelData.amount)
                                    font.pixelSize: Appearance.font.pixelSize.normal
                                    font.features: { "tnum": 1 }
                                    font.weight: Font.Bold
                                    color: GritColors.fg
                                }
                                IrisDisc {
                                    size: UiScale.px(30)
                                    icon: "close"
                                    clickable: true
                                    tone: "ghost"
                                    tip: Translation.tr("Delete")
                                    onClicked: {
                                        const id = entryRow.modelData.id;
                                        const label = (entryRow.modelData.place ?? "").trim() !== ""
                                            ? entryRow.modelData.place : entryRow.category.name;
                                        GritConfirm.ask(
                                            Translation.tr("Delete spending?"),
                                            `${root.money(entryRow.modelData.amount)} · ${label}`,
                                            () => GritStore.deleteSpending(id));
                                    }
                                }
                            }
                        }
                    }
                }
            }

            IrisText {
                Layout.fillWidth: true
                Layout.topMargin: UiScale.px(12)
                horizontalAlignment: Text.AlignHCenter
                visible: root.spend.count === 0
                text: Translation.tr("No spendings in this period yet.")
                font.pixelSize: Appearance.font.pixelSize.small
                color: GritColors.fg3
            }

            Item { implicitHeight: UiScale.px(4) }
        }
    }

    // ---------------- Day picker for a back-dated entry ----------------

    IrisDatePicker {
        id: datePicker
        selectedDay: root.entryDay
        maxDay: GritStore.today
        onPicked: day => {
            root.entryDay = day;
            datePicker.close();
        }
        onClosed: root.showDatePicker = false
    }

    onShowDatePickerChanged: {
        if (root.showDatePicker)
            datePicker.open();
    }
}
