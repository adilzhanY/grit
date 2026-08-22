pragma ComponentBehavior: Bound
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import qs.modules.common.functions as CF
import Quickshell.Widgets
import QtQuick
import QtQuick.Layouts
import "../../../services/grit/GritCore.js" as Core

/**
 * Pomodoro focus page: ring timer + controls up top, then the analytics the
 * web app has: progression title, range analysis chart (Last 7 / Weekly /
 * Monthly / Yearly) and a VERTICAL activity heatmap (weeks flow downward).
 */
Item {
    id: root

    property bool showCustomTimer: false
    property bool showNewTask: false

    property real nowTick: Date.now()
    Timer {
        interval: 500
        running: root.visible || GritStore.activeFocus !== null
        repeat: true
        onTriggered: root.nowTick = Date.now()
    }

    readonly property var session: GritStore.activeFocus
    readonly property bool running: session !== null
    readonly property bool paused: running && session.pausedAt !== undefined && session.pausedAt !== null
    readonly property bool phaseOver: running && Core.focusElapsed(session, root.nowTick)
    readonly property real remainingMs: running ? Core.focusRemainingMs(session, root.nowTick) : 0
    readonly property real phaseProgress: running
        ? 1 - (root.remainingMs / Math.max(1, Core.focusPhaseMs(session))) : 0

    // ---------------- Data ----------------

    readonly property var focusLogs: {
        GritStore.revision;
        return GritStore.db.dayLogs.filter(l => l.kind === "focus");
    }
    readonly property var todayFocus: root.focusLogs.filter(l => l.date === GritStore.today)
    readonly property int todayCount: root.todayFocus.length
    readonly property int todayMinutes: root.todayFocus.reduce((s, l) => s + (l.minutes ?? 0), 0)
    readonly property int totalMinutes: root.focusLogs.reduce((s, l) => s + (l.minutes ?? 0), 0)
    readonly property real totalHours: root.totalMinutes / 60

    // day -> minutes
    readonly property var minutesByDay: {
        const m = {};
        for (const l of root.focusLogs)
            m[l.date] = (m[l.date] ?? 0) + (l.minutes ?? 0);
        return m;
    }

    // day -> { task -> minutes } for the stacked bars
    readonly property var minutesByDayTask: {
        const m = {};
        for (const l of root.focusLogs) {
            const t = l.name ?? Translation.tr("Unlabeled");
            if (!m[l.date])
                m[l.date] = {};
            m[l.date][t] = (m[l.date][t] ?? 0) + (l.minutes ?? 0);
        }
        return m;
    }

    // Stable task -> color mapping shared by the bars, the donut and the legend
    function taskColor(name) {
        const i = root.taskBreakdown.findIndex(d => d.label === name);
        return i >= 0 ? taskPie.seriesColors[i % taskPie.seriesColors.length]
            : Appearance.colors.colOutline;
    }

    property int hoverBucket: -1
    property real hoverTipX: 0
    property real hoverTipY: 0

    readonly property var allFocusTasks: {
        GritStore.revision;
        const names = new Set(GritStore.settings.focusTasks);
        for (const l of root.focusLogs) {
            if (l.name)
                names.add(l.name);
        }
        return [...names].sort((a, b) => a.localeCompare(b));
    }

    function taskMinutes(name) {
        return root.focusLogs
            .filter(l => l.name === name)
            .reduce((s, l) => s + (l.minutes ?? 0), 0);
    }

    property string selectedLabel: ""

    // ---------------- Analysis chart ----------------

    property string chartMode: "7d" // 7d | week | month | year

    // Per-task minutes within the selected analysis window (for the donut)
    readonly property var taskBreakdown: {
        GritStore.revision;
        const today = GritStore.today;
        let start = null;
        if (root.chartMode === "7d") {
            start = Core.addDays(today, -6);
        } else if (root.chartMode === "week") {
            start = Core.addDays(Core.mondayOf(today), -49);
        } else if (root.chartMode === "month") {
            const y = Number(today.slice(0, 4));
            const m = Number(today.slice(5, 7));
            let mm = m - 11, yy = y;
            while (mm < 1) {
                mm += 12;
                yy -= 1;
            }
            start = `${yy}-${String(mm).padStart(2, "0")}-01`;
        } else {
            start = `${today.slice(0, 4)}-01-01`;
        }
        const byTask = {};
        for (const l of root.focusLogs) {
            if (start && l.date < start)
                continue;
            const key = l.name ?? Translation.tr("Unlabeled");
            byTask[key] = (byTask[key] ?? 0) + (l.minutes ?? 0);
        }
        return Object.keys(byTask)
            .map(k => ({ label: k, value: byTask[k] }))
            .filter(d => d.value > 0)
            .sort((a, b) => b.value - a.value);
    }
    readonly property real breakdownTotal: root.taskBreakdown.reduce((s, d) => s + d.value, 0)

    readonly property var chartData: {
        const today = GritStore.today;
        const byTask = root.minutesByDayTask;
        const out = [];

        const makeRow = label => ({ label: label, minutes: 0, perTask: {} });
        const addDayTo = (row, day) => {
            const per = byTask[day];
            if (!per)
                return;
            for (const t in per) {
                row.perTask[t] = (row.perTask[t] ?? 0) + per[t];
                row.minutes += per[t];
            }
        };
        const addPrefixTo = (row, prefix) => {
            for (const day in byTask) {
                if (day.startsWith(prefix))
                    addDayTo(row, day);
            }
        };

        if (root.chartMode === "7d") {
            for (let i = 6; i >= 0; i--) {
                const day = Core.addDays(today, -i);
                const row = makeRow(Core.WEEKDAY_NAMES[Core.weekdayOf(day)][0]);
                addDayTo(row, day);
                out.push(row);
            }
        } else if (root.chartMode === "week") {
            const thisMonday = Core.mondayOf(today);
            for (let w = 7; w >= 0; w--) {
                const monday = Core.addDays(thisMonday, -7 * w);
                const row = makeRow(Core.fmtDay(monday).slice(0, 5));
                for (let d = 0; d < 7; d++)
                    addDayTo(row, Core.addDays(monday, d));
                out.push(row);
            }
        } else if (root.chartMode === "month") {
            const y = Number(today.slice(0, 4));
            const m = Number(today.slice(5, 7));
            for (let i = 11; i >= 0; i--) {
                let mm = m - i;
                let yy = y;
                while (mm < 1) {
                    mm += 12;
                    yy -= 1;
                }
                const row = makeRow(Core.MONTHS_SHORT[mm - 1]);
                addPrefixTo(row, `${yy}-${String(mm).padStart(2, "0")}`);
                out.push(row);
            }
        } else {
            const years = new Set();
            for (const day in byTask)
                years.add(day.slice(0, 4));
            years.add(today.slice(0, 4));
            for (const yr of [...years].sort()) {
                const row = makeRow(yr);
                addPrefixTo(row, yr);
                out.push(row);
            }
        }
        return out;
    }
    readonly property real chartMax: Math.max(1, ...root.chartData.map(d => d.minutes))

    // ---------------- Vertical heatmap ----------------

    property var heatRange: "last" // "last" (trailing year) or a calendar year number

    readonly property var heatYears: {
        const ys = new Set([Number(GritStore.today.slice(0, 4))]);
        for (const l of root.focusLogs)
            ys.add(Number(l.date.slice(0, 4)));
        return [...ys].sort((a, b) => b - a).slice(0, 3);
    }

    readonly property string heatStart: root.heatRange === "last"
        ? Core.addDays(GritStore.today, -364) : `${root.heatRange}-01-01`
    readonly property string heatEnd: (root.heatRange === "last"
        || root.heatRange === Number(GritStore.today.slice(0, 4)))
        ? GritStore.today : `${root.heatRange}-12-31`

    // Monday-anchored weeks flowing DOWNWARD (vertical heatmap)
    readonly property var heatWeeks: {
        const weeks = [];
        for (let w = Core.mondayOf(root.heatStart); w <= root.heatEnd; w = Core.addDays(w, 7))
            weeks.push(w);
        return weeks;
    }

    readonly property real heatRangeMinutes: {
        let sum = 0;
        for (const day in root.minutesByDay) {
            if (day >= root.heatStart && day <= root.heatEnd)
                sum += root.minutesByDay[day];
        }
        return sum;
    }

    // Same intensity ramp as the web: <30, <60, <120, 120+ minutes
    function heatColor(min) {
        if (min <= 0)
            return Appearance.colors.colLayer2;
        const weight = min < 30 ? 0.22 : min < 60 ? 0.45 : min < 120 ? 0.7 : 1.0;
        return CF.ColorUtils.mix(Appearance.colors.colPrimary, Appearance.colors.colLayer2, weight);
    }

    // The heatmap fills the card as two side-by-side vertical strips:
    // first half of the range on the left, second half on the right.
    readonly property int heatStripCount: 2
    readonly property int weeksPerStrip: Math.ceil(root.heatWeeks.length / root.heatStripCount)

    // Cell size adapts to the available width (label gutters + gaps accounted)
    readonly property real heatCell: {
        const labelW = 36;
        const avail = root.width - 24 - 12 - root.heatStripCount * labelW;
        return Math.max(11, Math.min(20, Math.floor(avail / (root.heatStripCount * 7)) - 3));
    }

    // Month label per row: strip starts always get "MMM yy"; afterwards a
    // label whenever the month changes (spaced ≥3 rows apart)
    readonly property var heatRowLabels: {
        const labels = {};
        let prevMonth = "";
        let lastLabelAt = -3;
        root.heatWeeks.forEach((monday, wi) => {
            const month = monday.slice(0, 7);
            const stripStart = wi % root.weeksPerStrip === 0;
            if (stripStart || (month !== prevMonth && wi - lastLabelAt >= 3)) {
                const name = Core.MONTHS_SHORT[Number(month.slice(5, 7)) - 1];
                labels[wi] = stripStart ? `${name} ${monday.slice(2, 4)}` : name;
                lastLabelAt = wi;
            }
            prevMonth = month;
        });
        return labels;
    }

    // Phase-end sound + notification are handled by GritFocusAlarm, which
    // runs in the background regardless of whether this page is open.

    StyledFlickable {
        id: pageFlick
        anchors.fill: parent
        clip: true
        contentHeight: pageColumn.implicitHeight

    ColumnLayout {
        id: pageColumn
        width: parent.width
        spacing: 10

        // ================ Timer ================

        CircularProgress {
            id: ring
            Layout.alignment: Qt.AlignHCenter
            Layout.topMargin: 6
            implicitSize: 190
            lineWidth: 9
            value: root.running ? root.phaseProgress : 0
            enableAnimation: false
            colPrimary: root.running && root.session.phase === "rest"
                ? Appearance.colors.colTertiary : Appearance.colors.colPrimary

            ColumnLayout {
                anchors.centerIn: parent
                spacing: 0

                GritText {
                    Layout.alignment: Qt.AlignHCenter
                    text: root.running ? Core.fmtElapsed(root.remainingMs).slice(3) : "--:--"
                    font.pixelSize: 40
                    font.family: Appearance.font.family.numbers
                    color: Appearance.colors.colOnLayer0
                }
                GritText {
                    Layout.alignment: Qt.AlignHCenter
                    text: !root.running ? Translation.tr("idle")
                        : root.paused ? Translation.tr("paused")
                        : root.session.phase === "focus" ? (root.session.label ?? Translation.tr("focus"))
                        : Translation.tr("rest")
                    font.pixelSize: Appearance.font.pixelSize.small
                    color: Appearance.colors.colSubtext
                }
            }
        }

        // Idle: presets
        ColumnLayout {
            Layout.fillWidth: true
            visible: !root.running
            spacing: 8

            RowLayout {
                Layout.alignment: Qt.AlignHCenter
                spacing: 8

                FocusPresetButton {
                    label: Translation.tr("Classic 25/5")
                    filled: true
                    onClicked: root.start(25, 5)
                }
                FocusPresetButton {
                    label: Translation.tr("Deep 50/10")
                    filled: true
                    onClicked: root.start(50, 10)
                }
                // Custom timer → opens the modal
                RippleButton {
                    implicitWidth: 38
                    implicitHeight: 38
                    buttonRadius: Appearance.rounding.full
                    colBackground: Appearance.colors.colLayer2
                    colBackgroundHover: Appearance.colors.colLayer2Hover
                    colRipple: Appearance.colors.colLayer2Active
                    onClicked: root.showCustomTimer = true
                    GritToolTip { text: Translation.tr("Custom timer") }
                    contentItem: MaterialSymbol {
                        anchors.centerIn: parent
                        horizontalAlignment: Text.AlignHCenter
                        text: "add"
                        iconSize: Appearance.font.pixelSize.larger
                        color: Appearance.colors.colOnLayer2
                    }
                }
            }

            GritText {
                Layout.topMargin: 4
                text: Translation.tr("Focus tasks")
                font.pixelSize: Appearance.font.pixelSize.smallest
                color: Appearance.colors.colSubtext
            }
            Flow {
                Layout.fillWidth: true
                spacing: 8

                Repeater {
                    model: root.allFocusTasks
                    delegate: RippleButton {
                        id: taskChip
                        required property var modelData
                        readonly property bool chipSelected: root.selectedLabel === modelData
                        implicitHeight: 36
                        buttonRadius: Appearance.rounding.full
                        colBackground: chipSelected ? Appearance.colors.colPrimary : Appearance.colors.colLayer2
                        colBackgroundHover: chipSelected ? Appearance.colors.colPrimaryHover : Appearance.colors.colLayer2Hover
                        colRipple: chipSelected ? Appearance.colors.colPrimaryActive : Appearance.colors.colLayer2Active
                        onClicked: root.selectedLabel = chipSelected ? "" : modelData
                        altAction: () => {
                            const taskName = taskChip.modelData;
                            GritConfirm.ask(
                                Translation.tr("Unsave focus task?"),
                                Translation.tr("\"%1\" stays on past logs and charts").arg(taskName),
                                () => GritStore.removeFocusTask(taskName),
                                Translation.tr("Remove"));
                        }
                        GritToolTip { text: Translation.tr("Click to select · right-click to unsave") }
                        contentItem: GritText {
                            anchors.centerIn: parent
                            horizontalAlignment: Text.AlignHCenter
                            leftPadding: 14
                            rightPadding: 14
                            text: taskChip.modelData
                            font.pixelSize: Appearance.font.pixelSize.small
                            color: taskChip.chipSelected ? Appearance.colors.colOnPrimary : Appearance.colors.colOnLayer2
                        }
                    }
                }
                // New focus task → opens the modal
                RippleButton {
                    implicitWidth: 36
                    implicitHeight: 36
                    buttonRadius: Appearance.rounding.full
                    colBackground: Appearance.colors.colLayer2
                    colBackgroundHover: Appearance.colors.colLayer2Hover
                    colRipple: Appearance.colors.colLayer2Active
                    onClicked: root.showNewTask = true
                    GritToolTip { text: Translation.tr("New focus task") }
                    contentItem: MaterialSymbol {
                        anchors.centerIn: parent
                        horizontalAlignment: Text.AlignHCenter
                        text: "add"
                        iconSize: Appearance.font.pixelSize.larger
                        color: Appearance.colors.colOnLayer2
                    }
                }
            }
        }

        // Running controls
        RowLayout {
            Layout.alignment: Qt.AlignHCenter
            visible: root.running && !root.phaseOver
            spacing: 8

            FocusPresetButton {
                label: root.paused ? Translation.tr("Resume") : Translation.tr("Pause")
                filled: true
                onClicked: root.paused ? GritStore.resumeFocus() : GritStore.pauseFocus()
            }
            FocusPresetButton {
                visible: root.session?.phase === "focus"
                label: Translation.tr("Save early")
                onClicked: {
                    const log = GritStore.saveFocusEarly();
                    if (log)
                        GritSounds.play("focusEnd");
                }
            }
            FocusPresetButton {
                label: root.session?.phase === "rest" ? Translation.tr("Skip rest") : Translation.tr("Cancel")
                onClicked: {
                    if (root.session?.phase === "rest")
                        GritStore.continueFocus();
                    else
                        GritStore.cancelFocus();
                }
            }
        }

        // Phase-over choices. Centred via alignment on the column itself, NOT
        // fillWidth: every child here sets Layout.alignment, which caps the
        // column's maximum width at its content, so fillWidth cannot stretch it
        // and the whole block would sit flush against the left edge.
        ColumnLayout {
            Layout.alignment: Qt.AlignHCenter
            visible: root.running && root.phaseOver
            spacing: 6

            GritText {
                Layout.alignment: Qt.AlignHCenter
                text: root.session?.phase === "focus"
                    ? Translation.tr("Focus done! +%1 XP").arg(Core.focusXp(root.session?.focusMin ?? 0))
                    : Translation.tr("Rest over.")
                font.pixelSize: Appearance.font.pixelSize.normal
                font.weight: Font.DemiBold
                color: Appearance.colors.colPrimary
            }
            RowLayout {
                Layout.alignment: Qt.AlignHCenter
                spacing: 8

                FocusPresetButton {
                    // No rest phase configured → only "Done" makes sense here
                    visible: root.session?.phase === "focus" && (root.session?.restMin ?? 0) > 0
                    label: Translation.tr("Take rest")
                    filled: true
                    onClicked: GritStore.finishFocus(true)
                }
                FocusPresetButton {
                    visible: root.session?.phase === "focus"
                    label: Translation.tr("Done")
                    onClicked: GritStore.finishFocus(false)
                }
                FocusPresetButton {
                    visible: root.session?.phase === "rest"
                    label: Translation.tr("Keep going")
                    filled: true
                    onClicked: {
                        GritStore.continueFocus();
                        GritSounds.play("focusStart");
                    }
                }
                FocusPresetButton {
                    visible: root.session?.phase === "rest"
                    label: Translation.tr("End session")
                    onClicked: GritStore.cancelFocus()
                }
            }
        }

        // ================ Progression + today ================

        Rectangle {
            Layout.fillWidth: true
            Layout.topMargin: 4
            implicitHeight: statRow.implicitHeight + 20
            radius: Appearance.rounding.normal
            color: Appearance.colors.colLayer1
            border.width: 1
            border.color: Appearance.colors.colLayer0Border

            RowLayout {
                id: statRow
                anchors {
                    left: parent.left
                    right: parent.right
                    verticalCenter: parent.verticalCenter
                    leftMargin: 12
                    rightMargin: 12
                }
                spacing: 12

                // Takes the slack so the today/set column always keeps its
                // width: long rank lines elide instead of pushing it off-card.
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 0
                    GritText {
                        Layout.fillWidth: true
                        text: Core.focusTitle(root.totalHours)
                        font.pixelSize: Appearance.font.pixelSize.huge
                        font.family: Appearance.font.family.title
                        color: Appearance.colors.colPrimary
                        elide: Text.ElideRight
                    }
                    GritText {
                        Layout.fillWidth: true
                        text: {
                            const next = Core.nextFocusTitle(root.totalHours);
                            return next
                                ? Translation.tr("%1 → %2 at %3h").arg(Core.fmtMinutes(root.totalMinutes))
                                    .arg(next.title).arg(next.hours)
                                : Core.fmtMinutes(root.totalMinutes);
                        }
                        font.pixelSize: Appearance.font.pixelSize.normal
                        font.family: "Google Sans Flex"
                        font.features: { "tnum": 1 }
                        font.variableAxes: { "wght": 600, "ROND": 100 }
                        color: Appearance.colors.colSubtext
                        elide: Text.ElideRight
                    }
                    GritText {
                        Layout.fillWidth: true
                        visible: Core.nextFocusTitle(root.totalHours) !== null
                        text: {
                            const next = Core.nextFocusTitle(root.totalHours);
                            return next ? Translation.tr("rank up +%1 XP").arg(next.xp) : "";
                        }
                        font.pixelSize: Appearance.font.pixelSize.small
                        font.family: "Google Sans Flex"
                        font.features: { "tnum": 1 }
                        font.variableAxes: { "wght": 600, "ROND": 100 }
                        color: Appearance.colors.colPrimary
                        elide: Text.ElideRight
                    }
                }

                ColumnLayout {
                    spacing: 2
                    GritText {
                        Layout.alignment: Qt.AlignRight
                        text: Translation.tr("Today: %1 · %2")
                            .arg(root.todayCount).arg(Core.fmtMinutes(root.todayMinutes))
                        font.pixelSize: Appearance.font.pixelSize.normal
                        font.family: "Google Sans Flex"
                        font.features: { "tnum": 1 }
                        font.variableAxes: { "wght": 600, "ROND": 100 }
                        color: Appearance.colors.colOnLayer1
                    }
                    RowLayout {
                        Layout.alignment: Qt.AlignRight
                        spacing: 4
                        Repeater {
                            model: Core.FOCUS_SET_SIZE
                            delegate: Rectangle {
                                required property int index
                                implicitWidth: 10
                                implicitHeight: 10
                                radius: 5
                                color: index < (root.todayCount % Core.FOCUS_SET_SIZE)
                                    ? Appearance.colors.colPrimary : Appearance.colors.colLayer2
                            }
                        }
                        GritText {
                            text: Translation.tr("set +%1").arg(Core.FOCUS_SET_XP)
                            font.pixelSize: Appearance.font.pixelSize.small
                            color: Appearance.colors.colSubtext
                        }
                    }
                }
            }
        }

        // ================ Analysis chart ================

        GritText {
            Layout.topMargin: 4
            text: Translation.tr("Analysis")
            font.pixelSize: Appearance.font.pixelSize.normal
            font.weight: Font.DemiBold
            color: Appearance.colors.colOnLayer0
        }

        GritSelectionArray {
            currentValue: root.chartMode
            onSelected: newValue => root.chartMode = newValue
            options: [
                { displayName: Translation.tr("Last 7"), icon: "today", value: "7d" },
                { displayName: Translation.tr("Weekly"), icon: "date_range", value: "week" },
                { displayName: Translation.tr("Monthly"), icon: "calendar_month", value: "month" },
                { displayName: Translation.tr("Yearly"), icon: "event_repeat", value: "year" }
            ]
        }

        Rectangle {
            id: chartCard
            Layout.fillWidth: true
            implicitHeight: 150
            radius: Appearance.rounding.normal
            color: Appearance.colors.colLayer1
            border.width: 1
            border.color: Appearance.colors.colLayer0Border

            // One tooltip for the whole chart, floated above the hovered bar
            // (it can't live inside the bars, they clip their contents)
            ChartTooltip {
                readonly property var bucket: root.hoverBucket >= 0 ? root.chartData[root.hoverBucket] : null
                shown: bucket !== null && rows.length > 0
                title: bucket ? `${bucket.label} · ${Core.fmtMinutes(bucket.minutes)}` : ""
                rows: bucket
                    ? root.taskBreakdown
                        .filter(d => (bucket.perTask[d.label] ?? 0) > 0)
                        .map(d => ({
                            color: root.taskColor(d.label),
                            label: d.label,
                            value: Core.fmtMinutes(bucket.perTask[d.label])
                        }))
                    : []
                x: Math.max(4, Math.min(chartCard.width - width - 4, root.hoverTipX - width / 2))
                y: Math.max(-6, root.hoverTipY - height - 10)
            }

            RowLayout {
                anchors {
                    fill: parent
                    margins: 12
                }
                spacing: 6

                Repeater {
                    model: root.chartData
                    delegate: ColumnLayout {
                        id: barColumn
                        required property var modelData
                        required property int index
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        spacing: 3

                        // Segments stacked in the donut's task order
                        readonly property var segments: {
                            const per = barColumn.modelData.perTask ?? {};
                            return root.taskBreakdown
                                .filter(d => (per[d.label] ?? 0) > 0)
                                .map(d => ({
                                    label: d.label,
                                    value: per[d.label],
                                    color: root.taskColor(d.label)
                                }));
                        }
                        readonly property bool bucketHovered: root.hoverBucket === barColumn.index

                        GritText {
                            Layout.alignment: Qt.AlignHCenter
                            visible: barColumn.modelData.minutes > 0 && root.chartData.length <= 12
                            text: Core.fmtMinutes(barColumn.modelData.minutes)
                            font.pixelSize: Appearance.font.pixelSize.smallest
                            font.family: "Google Sans Flex"
                            font.features: { "tnum": 1 }
                            font.variableAxes: { "wght": 600, "ROND": 100 }
                            color: Appearance.colors.colSubtext
                        }
                        Item { Layout.fillHeight: true }
                        ClippingRectangle {
                            id: barRect
                            Layout.alignment: Qt.AlignHCenter
                            Layout.preferredWidth: Math.min(26, Math.max(10, 200 / root.chartData.length))
                            Layout.preferredHeight: Math.max(3, 84 * (barColumn.modelData.minutes / root.chartMax))
                            radius: Appearance.rounding.unsharpen * 2
                            color: barColumn.modelData.minutes > 0
                                ? "transparent" : Appearance.colors.colLayer2
                            opacity: root.hoverBucket >= 0 && !barColumn.bucketHovered ? 0.5 : 1

                            Behavior on Layout.preferredHeight {
                                animation: Appearance.animation.elementMoveFast.numberAnimation.createObject(this)
                            }
                            Behavior on opacity {
                                animation: Appearance.animation.elementMoveFast.numberAnimation.createObject(this)
                            }

                            Column {
                                anchors.fill: parent

                                Repeater {
                                    model: barColumn.segments
                                    delegate: Rectangle {
                                        required property var modelData
                                        width: barRect.width
                                        height: barRect.height * (modelData.value / Math.max(1, barColumn.modelData.minutes))
                                        color: modelData.color
                                    }
                                }
                            }

                            HoverHandler {
                                onHoveredChanged: {
                                    if (hovered) {
                                        root.hoverBucket = barColumn.index;
                                        const p = barRect.mapToItem(chartCard, barRect.width / 2, 0);
                                        root.hoverTipX = p.x;
                                        root.hoverTipY = p.y;
                                    } else if (root.hoverBucket === barColumn.index) {
                                        root.hoverBucket = -1;
                                    }
                                }
                            }
                        }
                        GritText {
                            Layout.alignment: Qt.AlignHCenter
                            text: barColumn.modelData.label
                            font.pixelSize: Appearance.font.pixelSize.smallest
                            color: Appearance.colors.colSubtext
                        }
                    }
                }
            }
        }

        // ================ Task breakdown donut ================

        RowLayout {
            Layout.fillWidth: true
            Layout.topMargin: 4
            spacing: 8

            MaterialSymbol {
                text: "pie_chart"
                iconSize: Appearance.font.pixelSize.larger
                color: Appearance.colors.colSubtext
            }
            ColumnLayout {
                spacing: -2
                GritText {
                    text: Translation.tr("Focus analysis")
                    font.pixelSize: Appearance.font.pixelSize.normal
                    font.weight: Font.DemiBold
                    color: Appearance.colors.colOnLayer0
                }
                GritText {
                    text: Translation.tr("Task breakdown")
                    font.pixelSize: Appearance.font.pixelSize.smallest
                    color: Appearance.colors.colSubtext
                }
            }
        }

        Rectangle {
            Layout.fillWidth: true
            implicitHeight: breakdownColumn.implicitHeight + 24
            radius: Appearance.rounding.normal
            color: Appearance.colors.colLayer1
            border.width: 1
            border.color: Appearance.colors.colLayer0Border

            ColumnLayout {
                id: breakdownColumn
                anchors {
                    left: parent.left
                    right: parent.right
                    top: parent.top
                    margins: 12
                }
                spacing: 8

                GritText {
                    Layout.alignment: Qt.AlignHCenter
                    Layout.topMargin: 16
                    Layout.bottomMargin: 16
                    visible: root.taskBreakdown.length === 0
                    text: Translation.tr("No focus in this period.")
                    font.pixelSize: Appearance.font.pixelSize.small
                    color: Appearance.colors.colSubtext
                }

                PieChart {
                    id: taskPie
                    Layout.alignment: Qt.AlignHCenter
                    visible: root.taskBreakdown.length > 0
                    model: root.taskBreakdown
                    centerText: Core.fmtMinutes(root.breakdownTotal)
                    centerCaption: Translation.tr("focused")
                    valueFormatter: v => Core.fmtMinutes(v)
                }

                // Legend, synced with chart hover both ways
                ColumnLayout {
                    Layout.fillWidth: true
                    visible: root.taskBreakdown.length > 0
                    spacing: 0

                    Repeater {
                        model: taskPie.slices
                        delegate: Item {
                            id: legendRow
                            required property var modelData
                            required property int index
                            Layout.fillWidth: true
                            implicitHeight: 34

                            Rectangle {
                                anchors.top: parent.top
                                anchors.left: parent.left
                                anchors.right: parent.right
                                visible: legendRow.index > 0
                                height: 1
                                color: Appearance.colors.colOutlineVariant
                                opacity: 0.5
                            }
                            Rectangle {
                                anchors.fill: parent
                                radius: Appearance.rounding.small
                                color: Appearance.colors.colLayer1Hover
                                opacity: taskPie.hoveredIndex === legendRow.index ? 1 : 0
                                Behavior on opacity {
                                    animation: Appearance.animation.elementMoveFast.numberAnimation.createObject(this)
                                }
                            }
                            HoverHandler {
                                onHoveredChanged: taskPie.hoveredIndex = hovered ? legendRow.index : -1
                            }

                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: 6
                                anchors.rightMargin: 6
                                spacing: 10

                                Rectangle {
                                    implicitWidth: 10
                                    implicitHeight: 10
                                    radius: 5
                                    color: legendRow.modelData.color
                                }
                                GritText {
                                    Layout.fillWidth: true
                                    text: legendRow.modelData.label
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    font.weight: Font.DemiBold
                                    color: Appearance.colors.colOnLayer1
                                    elide: Text.ElideRight
                                }
                                GritText {
                                    text: Core.fmtMinutes(legendRow.modelData.value)
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    color: Appearance.colors.colSubtext
                                }
                                GritText {
                                    Layout.preferredWidth: 40
                                    horizontalAlignment: Text.AlignRight
                                    text: `${Math.round(legendRow.modelData.value / Math.max(1, root.breakdownTotal) * 100)}%`
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    font.weight: Font.DemiBold
                                    color: Appearance.colors.colOnLayer1
                                }
                            }
                        }
                    }
                }
            }
        }

        // ================ Vertical activity heatmap ================

        RowLayout {
            Layout.fillWidth: true
            Layout.topMargin: 4
            spacing: 6

            GritText {
                text: Translation.tr("Activity")
                font.pixelSize: Appearance.font.pixelSize.normal
                font.weight: Font.DemiBold
                color: Appearance.colors.colOnLayer0
            }
            GritText {
                text: Translation.tr("%1 focused").arg(Core.fmtMinutes(root.heatRangeMinutes))
                font.pixelSize: Appearance.font.pixelSize.smallest
                color: Appearance.colors.colSubtext
            }
            Item { Layout.fillWidth: true }
        }

        GritSelectionArray {
            currentValue: root.heatRange
            onSelected: newValue => root.heatRange = newValue
            options: {
                const opts = [{ displayName: Translation.tr("Last year"), icon: "history", value: "last" }];
                for (const y of root.heatYears)
                    opts.push({ displayName: String(y), icon: "calendar_today", value: y });
                return opts;
            }
        }

        Rectangle {
            Layout.fillWidth: true
            implicitHeight: heatColumn.implicitHeight + 24
            radius: Appearance.rounding.normal
            color: Appearance.colors.colLayer1
            border.width: 1
            border.color: Appearance.colors.colLayer0Border

            ColumnLayout {
                id: heatColumn
                anchors {
                    left: parent.left
                    right: parent.right
                    top: parent.top
                    margins: 12
                }
                spacing: 6

                // Two vertical strips side by side: time flows down the left
                // strip, continues at the top of the right one
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 12

                    Repeater {
                        model: root.heatStripCount
                        delegate: ColumnLayout {
                            id: strip
                            required property int index
                            readonly property int offset: strip.index * root.weeksPerStrip
                            Layout.fillWidth: true
                            Layout.alignment: Qt.AlignTop
                            spacing: 3

                            // Weekday header per strip
                            RowLayout {
                                spacing: 3
                                Item { Layout.preferredWidth: 36 }
                                Repeater {
                                    model: ["M", "T", "W", "T", "F", "S", "S"]
                                    delegate: GritText {
                                        required property var modelData
                                        Layout.preferredWidth: root.heatCell
                                        horizontalAlignment: Text.AlignHCenter
                                        text: modelData
                                        font.pixelSize: Appearance.font.pixelSize.smallest
                                        color: Appearance.colors.colSubtext
                                    }
                                }
                            }

                            Repeater {
                                model: root.heatWeeks.slice(strip.offset, strip.offset + root.weeksPerStrip)
                                delegate: RowLayout {
                                    id: weekRow
                                    required property var modelData
                                    required property int index
                                    spacing: 3

                                    GritText {
                                        Layout.preferredWidth: 36
                                        horizontalAlignment: Text.AlignRight
                                        text: root.heatRowLabels[strip.offset + weekRow.index] ?? ""
                                        font.pixelSize: Appearance.font.pixelSize.smallest
                                        color: Appearance.colors.colSubtext
                                    }
                                    Repeater {
                                        model: 7
                                        delegate: Rectangle {
                                            required property int index
                                            readonly property string day: Core.addDays(weekRow.modelData, index)
                                            readonly property real dayMinutes: root.minutesByDay[day] ?? 0
                                            readonly property bool inRange: day >= root.heatStart && day <= root.heatEnd
                                            readonly property bool isToday: day === GritStore.today
                                            Layout.preferredWidth: root.heatCell
                                            Layout.preferredHeight: root.heatCell
                                            radius: 3
                                            color: !inRange ? "transparent" : root.heatColor(dayMinutes)
                                            border.width: isToday ? 2 : 0
                                            border.color: Appearance.colors.colPrimary

                                            GritToolTip {
                                                extraVisibleCondition: false
                                                alternativeVisibleCondition: cellHover.hovered
                                                text: `${Core.fmtDay(parent.day ?? "")} · ${Core.fmtMinutes(parent.dayMinutes ?? 0)}`
                                            }
                                            HoverHandler {
                                                id: cellHover
                                                enabled: parent.inRange
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Legend + explicit start/end markers
                RowLayout {
                    Layout.fillWidth: true
                    Layout.topMargin: 4
                    spacing: 4

                    GritText {
                        text: Translation.tr("start %1").arg(Core.fmtDay(root.heatStart))
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        color: Appearance.colors.colSubtext
                    }
                    Item { Layout.fillWidth: true }
                    GritText {
                        text: Translation.tr("less")
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        color: Appearance.colors.colSubtext
                    }
                    Repeater {
                        model: [0, 15, 45, 90, 150]
                        delegate: Rectangle {
                            required property var modelData
                            implicitWidth: 12
                            implicitHeight: 12
                            radius: 3
                            color: root.heatColor(modelData)
                        }
                    }
                    GritText {
                        text: Translation.tr("more")
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        color: Appearance.colors.colSubtext
                    }
                    Item { Layout.fillWidth: true }
                    GritText {
                        text: root.heatEnd === GritStore.today
                            ? Translation.tr("today ◉") : Core.fmtDay(root.heatEnd)
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        color: Appearance.colors.colPrimary
                    }
                }
            }
        }

        Item { implicitHeight: 4 }
    }
    }

    // ---------------- Modals ----------------

    onShowCustomTimerChanged: if (showCustomTimer) customTimerLoader.active = true
    onShowNewTaskChanged: if (showNewTask) newTaskLoader.active = true

    Loader {
        id: customTimerLoader
        anchors.fill: parent
        active: false
        onActiveChanged: {
            if (active) {
                item.show = true;
                item.forceActiveFocus();
            }
        }
        sourceComponent: WindowDialog {
            id: customTimerDialog
            backgroundWidth: 320

            function confirm() {
                root.start(parseInt(focusMinField.text) || 25, parseInt(restMinField.text) || 5);
                customTimerDialog.dismiss();
            }

            GritDialogTitle {
                text: Translation.tr("Custom timer")
            }
            RowLayout {
                Layout.alignment: Qt.AlignHCenter
                spacing: 8

                ColumnLayout {
                    spacing: 2
                    GritText {
                        Layout.alignment: Qt.AlignHCenter
                        text: Translation.tr("Focus")
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        color: Appearance.colors.colSubtext
                    }
                    GritTextField {
        labelBackgroundColor: Appearance.m3colors.m3surfaceContainerHigh
                        id: focusMinField
                        Layout.preferredWidth: 90
                        placeholderText: "25"
                        text: "25"
                        validator: IntValidator { bottom: 1; top: 600 }
                        Component.onCompleted: { forceActiveFocus(); selectAll(); }
                        onAccepted: customTimerDialog.confirm()
                    }
                }
                GritText {
                    Layout.alignment: Qt.AlignVCenter
                    Layout.topMargin: 14
                    text: "/"
                    color: Appearance.colors.colSubtext
                }
                ColumnLayout {
                    spacing: 2
                    GritText {
                        Layout.alignment: Qt.AlignHCenter
                        text: Translation.tr("Rest")
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        color: Appearance.colors.colSubtext
                    }
                    GritTextField {
        labelBackgroundColor: Appearance.m3colors.m3surfaceContainerHigh
                        id: restMinField
                        Layout.preferredWidth: 90
                        placeholderText: "5"
                        text: "5"
                        validator: IntValidator { bottom: 0; top: 120 }
                        onAccepted: customTimerDialog.confirm()
                    }
                }
            }
            WindowDialogButtonRow {
                Item { Layout.fillWidth: true }
                GritDialogButton {
                    buttonText: Translation.tr("Cancel")
                    onClicked: customTimerDialog.dismiss()
                }
                GritDialogButton {
                    buttonText: Translation.tr("Start")
                    onClicked: customTimerDialog.confirm()
                }
            }
        }
        Connections {
            target: customTimerLoader.item
            function onDismiss() {
                customTimerLoader.item.show = false;
                root.showCustomTimer = false;
            }
            function onVisibleChanged() {
                if (!customTimerLoader.item.visible && !root.showCustomTimer)
                    customTimerLoader.active = false;
            }
        }
    }

    Loader {
        id: newTaskLoader
        anchors.fill: parent
        active: false
        onActiveChanged: {
            if (active) {
                item.show = true;
                item.forceActiveFocus();
            }
        }
        sourceComponent: WindowDialog {
            id: newTaskDialog
            backgroundWidth: 340

            function confirm() {
                const name = newTaskField.text.trim();
                if (name.length > 0) {
                    GritStore.addFocusTask(name);
                    root.selectedLabel = name;
                }
                newTaskDialog.dismiss();
            }

            GritDialogTitle {
                text: Translation.tr("New focus task")
            }
            GritTextField {
        labelBackgroundColor: Appearance.m3colors.m3surfaceContainerHigh
                id: newTaskField
                Layout.fillWidth: true
                placeholderText: Translation.tr("e.g. Learn German")
                Component.onCompleted: forceActiveFocus()
                onAccepted: newTaskDialog.confirm()
            }
            WindowDialogButtonRow {
                Item { Layout.fillWidth: true }
                GritDialogButton {
                    buttonText: Translation.tr("Cancel")
                    onClicked: newTaskDialog.dismiss()
                }
                GritDialogButton {
                    buttonText: Translation.tr("Add")
                    onClicked: newTaskDialog.confirm()
                }
            }
        }
        Connections {
            target: newTaskLoader.item
            function onDismiss() {
                newTaskLoader.item.show = false;
                root.showNewTask = false;
            }
            function onVisibleChanged() {
                if (!newTaskLoader.item.visible && !root.showNewTask)
                    newTaskLoader.active = false;
            }
        }
    }

    function start(focusMin, restMin) {
        GritStore.startFocus(focusMin, restMin, root.selectedLabel || undefined);
        GritSounds.play("focusStart");
    }

    component FocusPresetButton: RippleButton {
        property string label: ""
        property bool filled: false
        implicitHeight: 38
        buttonRadius: Appearance.rounding.full
        colBackground: filled ? Appearance.colors.colPrimary : Appearance.colors.colLayer2
        colBackgroundHover: filled ? Appearance.colors.colPrimaryHover : Appearance.colors.colLayer2Hover
        colRipple: filled ? Appearance.colors.colPrimaryActive : Appearance.colors.colLayer2Active
        contentItem: GritText {
            anchors.centerIn: parent
            horizontalAlignment: Text.AlignHCenter
            leftPadding: 18
            rightPadding: 18
            text: parent.label
            font.pixelSize: Appearance.font.pixelSize.normal
            color: parent.filled ? Appearance.colors.colOnPrimary : Appearance.colors.colOnLayer2
        }
    }

}
