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
 * Activity page: local screen-time and coding analytics. Data comes from
 * GritActivity (ActivityWatch + wakapi, both on localhost); attribution
 * follows the mouse across monitors and idle time never counts.
 *
 * Top to bottom: range selector with a date pager and calendar picker,
 * stat tiles, a stacked timeline, the app donut, the per-screen split,
 * the website leaderboard and the coding card with the AI vs human split.
 */
Item {
    id: root

    readonly property var act: GritActivity

    property bool showDatePicker: false

    // The page drives the service: fetch only while actually on screen
    Binding {
        target: GritActivity
        property: "active"
        value: root.visible && GlobalStates.gritOpen
    }
    Component.onDestruction: GritActivity.active = false

    function fs(secs) {
        return GritActivity.fmtSecs(secs);
    }

    // ---------------- Range helpers ----------------

    readonly property string today: GritActivity.todayLive

    readonly property string rangeTitle: {
        const a = root.act.anchorDay;
        if (root.act.mode === "day") {
            if (a === root.today)
                return Translation.tr("Today");
            if (a === GritActivity.addDays(root.today, -1))
                return Translation.tr("Yesterday");
            return Core.fmtDay(a);
        }
        if (root.act.mode === "week") {
            const [s, e] = root.act.rangeDays;
            const sName = Core.MONTHS_SHORT[Number(s.slice(5, 7)) - 1];
            const eName = Core.MONTHS_SHORT[Number(e.slice(5, 7)) - 1];
            return sName === eName
                ? `${Number(s.slice(8, 10))} to ${Number(e.slice(8, 10))} ${eName}`
                : `${Number(s.slice(8, 10))} ${sName} to ${Number(e.slice(8, 10))} ${eName}`;
        }
        if (root.act.mode === "month")
            return `${Core.MONTHS_SHORT[Number(a.slice(5, 7)) - 1]} ${a.slice(0, 4)}`;
        if (root.act.mode === "year")
            return a.slice(0, 4);
        return Translation.tr("All time");
    }

    function shiftRange(dir) {
        const a = root.act.anchorDay;
        if (root.act.mode === "day")
            root.act.anchorDay = GritActivity.addDays(a, dir);
        else if (root.act.mode === "week")
            root.act.anchorDay = GritActivity.addDays(a, dir * 7);
        else if (root.act.mode === "month")
            root.act.anchorDay = GritActivity.addMonths(a, dir);
        else if (root.act.mode === "year")
            root.act.anchorDay = GritActivity.addMonths(a, dir * 12);
    }

    readonly property bool canGoNext: root.act.mode !== "total"
        && root.act.rangeDays[1] < root.today
    readonly property bool canGoPrev: root.act.mode !== "total"
        && root.act.rangeDays[0] > GritActivity.dataEpoch

    // ---------------- Derived chart data ----------------

    // Donut model in pretty labels. Raw classes that share a display name
    // (e.g. two Minecraft versions) merge into one entry; `raws` keeps the
    // wayland classes so the timeline can still match colors by raw class.
    readonly property var appModel: {
        const out = [];
        for (const d of root.act.apps) {
            const label = GritActivity.prettyApp(d.label);
            const hit = out.find(e => e.label === label);
            if (hit) {
                hit.value += d.value;
                hit.raws.push(d.label);
            } else {
                out.push({ label: label, value: d.value, raws: [d.label] });
            }
        }
        return out.sort((a, b) => b.value - a.value);
    }

    function appColor(raw) {
        const i = root.appModel.findIndex(d => d.raws.indexOf(raw) >= 0);
        return i >= 0 ? appPie.seriesColors[i % appPie.seriesColors.length]
            : GritColors.fg3;
    }

    // Timeline bars stack the range's top apps; the rest pools into Other
    readonly property var topApps: root.act.apps.slice(0, 5).map(d => d.label)
    readonly property color otherColor: Qt.alpha(GritColors.fg3, 0.55)

    readonly property real chartMax: Math.max(1, ...root.act.timeline.map(d => d.total))

    property int hoverBucket: -1
    property real hoverTipX: 0
    property real hoverTipY: 0

    function barSegments(perApp) {
        const segs = [];
        let other = 0;
        for (const app in perApp) {
            if (root.topApps.indexOf(app) >= 0)
                segs.push({ app: app, value: perApp[app], color: root.appColor(app) });
            else
                other += perApp[app];
        }
        segs.sort((a, b) => root.topApps.indexOf(a.app) - root.topApps.indexOf(b.app));
        if (other > 0)
            segs.push({ app: "__other", value: other, color: root.otherColor });
        return segs;
    }

    property int shownSites: 8

    readonly property real screensTotal: root.act.screens.reduce((s, d) => s + d.value, 0)

    // The bucket that is "now" when the range reaches today: future buckets
    // are empty, so it is the last one with any time in it
    readonly property int lastActiveBucket: {
        const t = root.act.timeline;
        for (let i = t.length - 1; i >= 0; i--) {
            if (t[i].total > 0)
                return i;
        }
        return -1;
    }

    // ---------------- Iris pieces ----------------

    // A leaderboard row: the share is a slot bar with the label inside it and
    // the value on the right
    component ShareRow: Item {
        id: shareRow
        property real share: 0
        property string label
        property string value
        property string extra: ""
        property color fillColor: GritColors.raisedHover
        property color dotColor: "transparent"
        property string letter: ""
        property bool hot: false
        readonly property bool hovered: shareHover.hovered

        Layout.fillWidth: true
        implicitHeight: UiScale.px(40)

        Rectangle {
            anchors.fill: parent
            radius: height / 2
            color: shareRow.hot ? GritColors.raised : GritColors.well
            Behavior on color {
                ColorAnimation { duration: Iris.colorDuration }
            }

            Rectangle {
                height: parent.height
                width: Math.max(height, parent.width * Math.max(0, Math.min(1, shareRow.share)))
                radius: height / 2
                color: shareRow.hot ? GritColors.raisedActive : shareRow.fillColor
                Behavior on width {
                    SpringAnimation { spring: Iris.fillSpring; damping: Iris.fillDamping; epsilon: 0.3 }
                }
                Behavior on color {
                    ColorAnimation { duration: Iris.colorDuration }
                }
            }
        }

        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: UiScale.px(shareRow.letter !== "" ? 7 : 14)
            anchors.rightMargin: UiScale.px(16)
            spacing: UiScale.px(10)

            Rectangle {
                visible: shareRow.dotColor.a > 0
                implicitWidth: UiScale.px(10)
                implicitHeight: UiScale.px(10)
                radius: height / 2
                color: shareRow.dotColor
            }
            IrisDisc {
                visible: shareRow.letter !== ""
                size: UiScale.px(26)
                tone: "well"
                text: shareRow.letter
            }
            IrisText {
                Layout.fillWidth: true
                text: shareRow.label
                font.pixelSize: Appearance.font.pixelSize.small
                color: GritColors.fg
                elide: Text.ElideRight
            }
            IrisText {
                text: shareRow.value
                font.pixelSize: Appearance.font.pixelSize.smaller
                font.features: ({ "tnum": 1 })
                font.weight: Font.DemiBold
                color: GritColors.fg2
            }
            IrisText {
                visible: shareRow.extra !== ""
                Layout.preferredWidth: UiScale.px(40)
                horizontalAlignment: Text.AlignRight
                text: shareRow.extra
                font.pixelSize: Appearance.font.pixelSize.smaller
                font.features: ({ "tnum": 1 })
                font.weight: Font.DemiBold
                color: GritColors.fg
            }
        }

        HoverHandler {
            id: shareHover
        }
    }

    // A dot and a caption, for the split bars' keys
    component Key: RowLayout {
        id: key
        property color dot
        property string text
        spacing: UiScale.px(6)
        Rectangle {
            implicitWidth: UiScale.px(10)
            implicitHeight: UiScale.px(10)
            radius: height / 2
            color: key.dot
        }
        IrisText {
            text: key.text
            font.pixelSize: Appearance.font.pixelSize.smaller
            font.features: ({ "tnum": 1 })
            color: GritColors.fg2
        }
    }

    // ---------------- Page ----------------

    StyledFlickable {
        anchors.fill: parent
        clip: true
        contentHeight: pageColumn.implicitHeight

        ColumnLayout {
            id: pageColumn
            width: parent.width
            spacing: UiScale.px(12)

            // ================ Range selector ================

            IrisSegmented {
                Layout.fillWidth: true
                equal: true
                onBlack: true
                value: root.act.mode
                onSelected: v => {
                    root.act.mode = v;
                    if (root.act.anchorDay > root.today)
                        root.act.anchorDay = root.today;
                }
                // No icons: five segments only fit the rail-width page as text
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
                    clickable: true
                    enabled: root.canGoPrev
                    onClicked: root.shiftRange(-1)
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
                    clickable: true
                    enabled: root.canGoNext
                    onClicked: root.shiftRange(1)
                }
                IrisDisc {
                    icon: "edit_calendar"
                    clickable: true
                    tip: Translation.tr("Pick a date")
                    onClicked: root.showDatePicker = true
                }
                IrisPill {
                    visible: root.act.mode !== "total" && !root.act.rangeIncludesToday
                    compact: true
                    text: Translation.tr("Today")
                    onClicked: root.act.anchorDay = root.today
                }
                Item { Layout.fillWidth: true }
                IrisText {
                    visible: root.act.error !== ""
                    Layout.maximumWidth: UiScale.px(160)
                    text: root.act.error
                    font.pixelSize: Appearance.font.pixelSize.smallest
                    color: GritColors.danger
                    elide: Text.ElideRight
                }
                IrisDisc {
                    visible: root.act.loading
                    icon: "sync"
                    size: UiScale.px(26)
                    spinning: root.act.loading
                }
            }

            // ================ Stat tiles ================

            GridLayout {
                Layout.fillWidth: true
                columns: 3
                rowSpacing: UiScale.px(8)
                columnSpacing: UiScale.px(8)

                Repeater {
                    model: [
                        {
                            icon: "schedule",
                            label: Translation.tr("Screen time"),
                            value: root.fs(root.act.activeSeconds),
                            sub: root.appModel.length > 0
                                ? Translation.tr("top: %1").arg(root.appModel[0].label) : ""
                        },
                        {
                            icon: "code",
                            label: Translation.tr("Coding"),
                            value: root.fs(root.act.codingSeconds),
                            sub: root.act.codingProjects.length > 0
                                ? Translation.tr("top: %1").arg(root.act.codingProjects[0].label) : ""
                        },
                        {
                            icon: "smart_toy",
                            label: Translation.tr("AI share"),
                            value: root.act.codingSeconds > 0
                                ? `${Math.round(root.act.aiSeconds / root.act.codingSeconds * 100)}%` : "0%",
                            sub: Translation.tr("of coding time")
                        }
                    ]
                    // Disc above the number (not IrisStatTile's disc beside it):
                    // three tiles share the rail-width page, too narrow for both
                    delegate: IrisCard {
                        id: tile
                        required property var modelData
                        Layout.preferredWidth: 1
                        pad: UiScale.px(14)
                        spacing: UiScale.px(2)

                            IrisDisc {
                                Layout.bottomMargin: UiScale.px(6)
                                icon: tile.modelData.icon
                                tone: "card"
                            }
                            IrisText {
                                Layout.fillWidth: true
                                text: tile.modelData.value
                                font.pixelSize: Appearance.font.pixelSize.larger
                                font.features: ({ "tnum": 1 })
                                font.weight: Font.Bold
                                color: GritColors.fg
                                elide: Text.ElideRight
                            }
                            IrisText {
                                Layout.fillWidth: true
                                text: tile.modelData.label
                                font.pixelSize: Appearance.font.pixelSize.smallest
                                color: GritColors.fg2
                                elide: Text.ElideRight
                            }
                            IrisText {
                                Layout.fillWidth: true
                                visible: tile.modelData.sub !== ""
                                text: tile.modelData.sub
                                font.pixelSize: Appearance.font.pixelSize.smallest
                                color: GritColors.fg3
                                elide: Text.ElideRight
                            }
                    }
                }
            }

            // ================ Timeline ================

            IrisCard {
                id: chartCard
                implicitHeight: UiScale.px(230)
                z: 2
                fill: true
                spacing: UiScale.px(10)
                icon: "bar_chart"
                title: Translation.tr("Timeline")

                Item {
                    Layout.fillWidth: true
                    Layout.fillHeight: true

                IrisText {
                    anchors.centerIn: parent
                    visible: root.act.activeSeconds === 0 && !root.act.loading
                    text: Translation.tr("Nothing recorded in this period.")
                    font.pixelSize: Appearance.font.pixelSize.small
                    color: GritColors.fg3
                    z: 1
                }

                RowLayout {
                    id: barsRow
                    anchors.fill: parent
                    spacing: UiScale.px(root.act.timeline.length > 12 ? 2 : 6)

                    Repeater {
                        model: root.act.timeline
                        delegate: ColumnLayout {
                            id: barColumn
                            required property var modelData
                            required property int index
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            spacing: UiScale.px(4)

                            readonly property var segments: root.barSegments(barColumn.modelData.perApp)
                            readonly property bool bucketHovered: root.hoverBucket === barColumn.index
                            readonly property bool current: root.act.rangeIncludesToday && root.lastActiveBucket === barColumn.index
                            readonly property real barWidth: Math.min(UiScale.px(24), Math.max(UiScale.px(5), UiScale.px(300) / Math.max(1, root.act.timeline.length)))

                            // Always takes its line so every track is the same height
                            IrisText {
                                Layout.alignment: Qt.AlignHCenter
                                visible: root.act.timeline.length <= 8
                                text: barColumn.modelData.total > 0 ? root.fs(barColumn.modelData.total) : ""
                                font.pixelSize: Appearance.font.pixelSize.smallest
                                font.features: ({ "tnum": 1 })
                                font.weight: Font.DemiBold
                                color: barColumn.current || barColumn.bucketHovered ? GritColors.fg : GritColors.fg3
                                Behavior on color {
                                    ColorAnimation { duration: Iris.colorDuration }
                                }
                            }
                            Item {
                                id: barTrack
                                Layout.alignment: Qt.AlignHCenter
                                Layout.fillHeight: true
                                Layout.preferredWidth: barColumn.barWidth

                                Rectangle {
                                    anchors.fill: parent
                                    radius: Math.min(width / 2, UiScale.px(8))
                                    color: GritColors.well
                                }

                                ClippingRectangle {
                                    id: barFill
                                    anchors.bottom: parent.bottom
                                    width: parent.width
                                    visible: barColumn.modelData.total > 0
                                    // min() guards the frame where the model and chartMax
                                    // update in different orders and the ratio spikes
                                    height: Math.max(Math.min(width, UiScale.px(6)), barTrack.height * Math.min(1, (barColumn.modelData?.total ?? 0) / root.chartMax))
                                    radius: Math.min(width / 2, UiScale.px(8))
                                    color: "transparent"
                                    opacity: root.hoverBucket >= 0
                                        ? (barColumn.bucketHovered ? 1 : 0.4)
                                        : (root.act.rangeIncludesToday && root.lastActiveBucket >= 0 && !barColumn.current ? 0.75 : 1)

                                    Behavior on height {
                                        SpringAnimation { spring: 2.4; damping: 0.4; epsilon: 0.3 }
                                    }
                                    Behavior on opacity {
                                        NumberAnimation { duration: 160 }
                                    }

                                    Column {
                                        anchors.fill: parent

                                        Repeater {
                                            model: barColumn.segments
                                            delegate: Rectangle {
                                                required property var modelData
                                                width: barFill.width
                                                height: barFill.height * ((modelData?.value ?? 0) / Math.max(1, barColumn.modelData?.total ?? 1))
                                                color: modelData.color
                                            }
                                        }
                                    }
                                }
                            }
                            IrisText {
                                Layout.alignment: Qt.AlignHCenter
                                text: barColumn.modelData.tick ? barColumn.modelData.label : ""
                                font.pixelSize: Appearance.font.pixelSize.smallest
                                color: barColumn.current || barColumn.bucketHovered ? GritColors.fg : GritColors.fg3
                                Behavior on color {
                                    ColorAnimation { duration: Iris.colorDuration }
                                }
                            }

                            HoverHandler {
                                onHoveredChanged: {
                                    if (hovered) {
                                        root.hoverBucket = barColumn.index;
                                        const p = barFill.mapToItem(chartCard, barFill.width / 2, 0);
                                        root.hoverTipX = p.x;
                                        root.hoverTipY = p.y;
                                    } else if (root.hoverBucket === barColumn.index) {
                                        root.hoverBucket = -1;
                                    }
                                }
                            }
                        }
                    }
                }
                }

                // Tooltip: a small black card over the hovered bar. Parented
                // to the card itself, outside its layout column, so x/y hold.
                Rectangle {
                    id: chartTip
                    parent: chartCard
                    readonly property var bucket: root.hoverBucket >= 0
                        ? root.act.timeline[root.hoverBucket] ?? null : null
                    readonly property var rows: bucket
                        ? root.barSegments(bucket.perApp).map(s => ({
                            color: s.color,
                            label: s.app === "__other"
                                ? Translation.tr("Other") : GritActivity.prettyApp(s.app),
                            value: root.fs(s.value)
                        }))
                        : []
                    readonly property bool shown: bucket !== null && rows.length > 0
                    z: 100
                    visible: opacity > 0
                    opacity: shown ? 1 : 0
                    scale: shown ? 1 : 0.92
                    x: Math.max(UiScale.px(4), Math.min(chartCard.width - width - UiScale.px(4), root.hoverTipX - width / 2))
                    y: Math.max(-UiScale.px(6), root.hoverTipY - height - UiScale.px(10))
                    implicitWidth: tipColumn.implicitWidth + UiScale.px(28)
                    implicitHeight: tipColumn.implicitHeight + UiScale.px(20)
                    radius: UiScale.px(14)
                    color: GritColors.ink
                    border.width: 1
                    border.color: GritColors.raisedHover

                    Behavior on opacity {
                        NumberAnimation { duration: 150 }
                    }
                    Behavior on scale {
                        NumberAnimation { duration: 150; easing.type: Easing.OutCubic }
                    }

                    ColumnLayout {
                        id: tipColumn
                        anchors.centerIn: parent
                        spacing: UiScale.px(4)

                        IrisText {
                            text: chartTip.bucket ? `${chartTip.bucket.label} · ${root.fs(chartTip.bucket.total)}` : ""
                            font.pixelSize: Appearance.font.pixelSize.smaller
                            font.weight: Font.DemiBold
                            color: GritColors.fg
                        }
                        Repeater {
                            model: chartTip.rows
                            delegate: RowLayout {
                                required property var modelData
                                Layout.fillWidth: true
                                spacing: UiScale.px(8)

                                Rectangle {
                                    implicitWidth: UiScale.px(8)
                                    implicitHeight: UiScale.px(8)
                                    radius: height / 2
                                    color: modelData.color ?? "transparent"
                                }
                                IrisText {
                                    Layout.fillWidth: true
                                    Layout.rightMargin: UiScale.px(8)
                                    text: modelData.label ?? ""
                                    font.pixelSize: Appearance.font.pixelSize.smallest
                                    color: GritColors.fg2
                                    elide: Text.ElideRight
                                }
                                IrisText {
                                    text: modelData.value ?? ""
                                    font.pixelSize: Appearance.font.pixelSize.smallest
                                    font.features: ({ "tnum": 1 })
                                    font.weight: Font.DemiBold
                                    color: GritColors.fg
                                }
                            }
                        }
                    }
                }
            }

            // ================ App breakdown ================

            IrisCard {
                visible: root.appModel.length > 0
                spacing: UiScale.px(8)
                icon: "apps"
                title: Translation.tr("Apps")
                trailing: Translation.tr("Where the time went")

                    IrisPie {
                        id: appPie
                        Layout.alignment: Qt.AlignHCenter
                        Layout.topMargin: UiScale.px(4)
                        Layout.bottomMargin: UiScale.px(4)
                        model: root.appModel
                        centerText: root.fs(root.act.activeSeconds)
                        centerCaption: Translation.tr("active")
                        valueFormatter: v => root.fs(v)
                    }

                    Repeater {
                        model: root.appModel
                        delegate: ShareRow {
                            id: legendRow
                            required property var modelData
                            required property int index
                            share: modelData.value / Math.max(1, root.act.activeSeconds)
                            label: modelData.label
                            value: root.fs(modelData.value)
                            extra: `${Math.round(modelData.value / Math.max(1, root.act.activeSeconds) * 100)}%`
                            dotColor: appPie.colorOf(index)
                            hot: appPie.hoveredIndex === index
                            onHoveredChanged: appPie.hoveredIndex = hovered ? index
                                : (appPie.hoveredIndex === index ? -1 : appPie.hoveredIndex)
                        }
                    }
            }

            // ================ Screens ================

            IrisCard {
                visible: root.act.screens.length > 0
                spacing: UiScale.px(12)
                icon: "desktop_windows"
                title: Translation.tr("Screens")

                    // One slot, split by share of the pointer's time
                    Rectangle {
                        id: screenSplit
                        Layout.fillWidth: true
                        implicitHeight: UiScale.px(14)
                        radius: height / 2
                        color: GritColors.well
                        readonly property real gap: UiScale.px(3)
                        readonly property real usable: width - gap * Math.max(0, root.act.screens.length - 1)

                        Row {
                            anchors.fill: parent
                            spacing: screenSplit.gap

                            Repeater {
                                model: root.act.screens
                                delegate: Rectangle {
                                    required property var modelData
                                    required property int index
                                    width: screenSplit.usable * ((modelData?.value ?? 0) / Math.max(1, root.screensTotal))
                                    height: screenSplit.height
                                    radius: height / 2
                                    color: appPie.seriesColors[index % appPie.seriesColors.length]
                                    Behavior on width {
                                        SpringAnimation { spring: Iris.fillSpring; damping: Iris.fillDamping; epsilon: 0.3 }
                                    }
                                }
                            }
                        }
                    }

                    Flow {
                        Layout.fillWidth: true
                        spacing: UiScale.px(16)

                        Repeater {
                            model: root.act.screens
                            delegate: Key {
                                required property var modelData
                                required property int index
                                dot: appPie.seriesColors[index % appPie.seriesColors.length]
                                text: `${modelData.label}  ${root.fs(modelData.value)} · ${Math.round(modelData.value / Math.max(1, root.screensTotal) * 100)}%`
                            }
                        }
                    }
            }

            // ================ Websites ================

            IrisCard {
                visible: root.act.domains.length > 0
                spacing: UiScale.px(6)
                icon: "language"
                title: Translation.tr("Websites")
                trailing: Translation.tr("Active tab under the mouse")

                    Repeater {
                        model: root.act.domains.slice(0, root.shownSites)
                        delegate: ShareRow {
                            id: siteRow
                            required property var modelData
                            required property int index
                            // ?. because the list can be mid-swap when this evaluates
                            readonly property real topValue: root.act.domains[0]?.value ?? 1
                            readonly property string host: (modelData?.label ?? "").replace(/^www\./, "")
                            share: (modelData?.value ?? 0) / Math.max(1, topValue)
                            label: host
                            letter: (host[0] ?? "?").toUpperCase()
                            value: root.fs(modelData?.value ?? 0)
                            fillColor: index === 0 ? GritColors.raisedActive : GritColors.raisedHover
                            hot: hovered
                        }
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        Layout.topMargin: UiScale.px(4)
                        visible: root.act.domains.length > root.shownSites || root.shownSites > 8
                        spacing: UiScale.px(6)

                        IrisPill {
                            visible: root.act.domains.length > root.shownSites
                            compact: true
                            icon: "expand_more"
                            text: Translation.tr("Show more")
                            onClicked: root.shownSites += 10
                        }
                        IrisPill {
                            visible: root.shownSites > 8
                            compact: true
                            icon: "expand_less"
                            text: Translation.tr("Show less")
                            onClicked: root.shownSites = 8
                        }
                        Item { Layout.fillWidth: true }
                    }
            }

            // ================ Coding ================

            IrisCard {
                visible: root.act.codingSeconds > 0
                spacing: UiScale.px(10)
                icon: "terminal"
                title: Translation.tr("Coding")
                // The total rides in the title row, where the caption used to be
                trailing: root.fs(root.act.codingSeconds)

                    // AI vs human split: one slot, two parts
                    Rectangle {
                        id: codeSplit
                        Layout.fillWidth: true
                        implicitHeight: UiScale.px(14)
                        radius: height / 2
                        color: GritColors.well
                        readonly property bool both: root.act.humanSeconds > 0 && root.act.aiSeconds > 0
                        readonly property real gap: both ? UiScale.px(3) : 0
                        readonly property real usable: width - gap

                        Rectangle {
                            id: humanPart
                            width: codeSplit.usable * (root.act.humanSeconds / Math.max(1, root.act.codingSeconds))
                            height: parent.height
                            radius: height / 2
                            color: GritColors.fg
                            Behavior on width {
                                SpringAnimation { spring: Iris.fillSpring; damping: Iris.fillDamping; epsilon: 0.3 }
                            }
                        }
                        Rectangle {
                            x: humanPart.width + codeSplit.gap
                            width: codeSplit.usable * (root.act.aiSeconds / Math.max(1, root.act.codingSeconds))
                            height: parent.height
                            radius: height / 2
                            color: GritColors.fg3
                            Behavior on width {
                                SpringAnimation { spring: Iris.fillSpring; damping: Iris.fillDamping; epsilon: 0.3 }
                            }
                        }
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: UiScale.px(16)

                        Key {
                            dot: GritColors.fg
                            text: Translation.tr("You %1").arg(root.fs(root.act.humanSeconds))
                        }
                        Key {
                            dot: GritColors.fg3
                            text: Translation.tr("AI %1").arg(root.fs(root.act.aiSeconds))
                        }
                        Item { Layout.fillWidth: true }
                    }

                    // Projects
                    IrisText {
                        Layout.topMargin: UiScale.px(4)
                        visible: root.act.codingProjects.length > 0
                        text: Translation.tr("Projects")
                        font.pixelSize: Appearance.font.pixelSize.smaller
                        color: GritColors.fg3
                    }
                    Repeater {
                        model: root.act.codingProjects.slice(0, 6)
                        delegate: ShareRow {
                            id: projRow
                            required property var modelData
                            readonly property real topValue: root.act.codingProjects[0]?.value ?? 1
                            share: (modelData?.value ?? 0) / Math.max(1, topValue)
                            label: modelData?.label ?? ""
                            value: root.fs(modelData?.value ?? 0)
                            hot: hovered
                        }
                    }

                    // Languages and models side by side
                    RowLayout {
                        Layout.fillWidth: true
                        Layout.topMargin: UiScale.px(4)
                        spacing: UiScale.px(16)

                        Repeater {
                            model: [
                                { title: Translation.tr("Languages"), rows: root.act.codingLanguages.slice(0, 5) },
                                { title: Translation.tr("Models"), rows: root.act.codingModels.slice(0, 5) }
                            ]
                            delegate: ColumnLayout {
                                id: listColumn
                                required property var modelData
                                Layout.fillWidth: true
                                Layout.preferredWidth: 1
                                Layout.alignment: Qt.AlignTop
                                spacing: UiScale.px(2)

                                IrisText {
                                    Layout.bottomMargin: UiScale.px(2)
                                    text: listColumn.modelData.title
                                    font.pixelSize: Appearance.font.pixelSize.smaller
                                    color: GritColors.fg3
                                }
                                Repeater {
                                    model: listColumn.modelData.rows
                                    delegate: Rectangle {
                                        id: listRow
                                        required property var modelData
                                        Layout.fillWidth: true
                                        implicitHeight: UiScale.px(32)
                                        radius: height / 2
                                        color: listHover.hovered ? GritColors.raisedHover : "transparent"
                                        Behavior on color {
                                            ColorAnimation { duration: Iris.colorDuration }
                                        }
                                        HoverHandler {
                                            id: listHover
                                        }

                                        RowLayout {
                                            anchors.fill: parent
                                            anchors.leftMargin: UiScale.px(10)
                                            anchors.rightMargin: UiScale.px(10)
                                            IrisText {
                                                Layout.fillWidth: true
                                                text: listRow.modelData.label
                                                font.pixelSize: Appearance.font.pixelSize.small
                                                color: GritColors.fg
                                                elide: Text.ElideRight
                                            }
                                            IrisText {
                                                text: root.fs(listRow.modelData.value)
                                                font.pixelSize: Appearance.font.pixelSize.smaller
                                                font.features: ({ "tnum": 1 })
                                                color: GritColors.fg2
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
            }

            Item { implicitHeight: UiScale.px(4) }
        }
    }

    // ---------------- Date picker ----------------

    onShowDatePickerChanged: if (showDatePicker) datePicker.open()

    IrisDatePicker {
        id: datePicker
        selectedDay: root.act.anchorDay
        minDay: GritActivity.dataEpoch
        maxDay: root.today
        onPicked: day => {
            root.act.mode = "day";
            root.act.anchorDay = day;
            datePicker.close();
        }
        onClosed: root.showDatePicker = false
    }
}
