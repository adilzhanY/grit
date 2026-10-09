pragma ComponentBehavior: Bound
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import qs.modules.common.functions as CF
import qs.modules.iris
import Quickshell.Widgets
import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
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
            : GritColors.fg3;
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

    /**
     * The last 10 sessions, newest first, flat rather than grouped by day: this
     * is a short "what have I just been doing" list, and day headings would eat
     * a third of its rows.
     *
     * A focus log records when it ENDED (loggedAt) and how long it ran, so the
     * start time is derived rather than stored.
     */
    readonly property var recentSessions: {
        return root.focusLogs
            .slice()
            .sort((a, b) => (b.loggedAt ?? 0) - (a.loggedAt ?? 0))
            .slice(0, 10)
            .map(l => ({
                id: l.id,
                name: l.name ?? Translation.tr("Focus"),
                minutes: l.minutes ?? 0,
                date: l.date,
                startedAt: (l.loggedAt ?? 0) - (l.minutes ?? 0) * 60000,
                endedAt: l.loggedAt ?? 0,
                awardedXp: l.awardedXp ?? 0
            }));
    }

    function clockOf(ts) {
        const d = new Date(ts);
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }

    /** "Today", "Yesterday", or the date, for the right-hand column. */
    function sessionDayLabel(date) {
        if (date === GritStore.today)
            return Translation.tr("Today");
        if (date === Core.addDays(GritStore.today, -1))
            return Translation.tr("Yesterday");
        return Core.fmtDay(date);
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
            return GritColors.well;
        const weight = min < 30 ? 0.22 : min < 60 ? 0.45 : min < 120 ? 0.7 : 1.0;
        return CF.ColorUtils.mix(GritColors.fg, GritColors.raisedHover, weight);
    }

    // The heatmap fills the card as two side-by-side vertical strips:
    // first half of the range on the left, second half on the right.
    readonly property int heatStripCount: 2
    readonly property int weeksPerStrip: Math.ceil(root.heatWeeks.length / root.heatStripCount)

    // Cell size adapts to the available width (label gutters + gaps accounted)
    readonly property real heatCell: {
        const labelW = UiScale.px(36);
        const avail = root.width - UiScale.px(32) - UiScale.px(14) - root.heatStripCount * labelW;
        return Math.max(UiScale.px(11), Math.min(UiScale.px(20), Math.floor(avail / (root.heatStripCount * 7)) - UiScale.px(4)));
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
        spacing: UiScale.px(12)

        // ================ Timer ================

        // A white arc on a grey track, round caps; rest runs in grey
        Item {
            id: ring
            readonly property real line: UiScale.px(10)
            readonly property real value: root.running ? Math.max(0, Math.min(1, root.phaseProgress)) : 0
            readonly property color arcColor: root.running && root.session.phase === "rest"
                ? GritColors.fg2 : GritColors.fg
            Layout.alignment: Qt.AlignHCenter
            Layout.topMargin: UiScale.px(6)
            implicitWidth: UiScale.px(210)
            implicitHeight: UiScale.px(210)

            Shape {
                anchors.fill: parent
                preferredRendererType: Shape.CurveRenderer
                ShapePath {
                    strokeColor: GritColors.raisedHover
                    strokeWidth: ring.line
                    fillColor: "transparent"
                    capStyle: ShapePath.RoundCap
                    PathAngleArc {
                        centerX: ring.width / 2
                        centerY: ring.height / 2
                        radiusX: ring.width / 2 - ring.line
                        radiusY: radiusX
                        startAngle: 0
                        sweepAngle: 360
                    }
                }
                ShapePath {
                    strokeColor: ring.value > 0 ? ring.arcColor : "transparent"
                    strokeWidth: ring.line
                    fillColor: "transparent"
                    capStyle: ShapePath.RoundCap
                    Behavior on strokeColor {
                        ColorAnimation { duration: 180 }
                    }
                    PathAngleArc {
                        centerX: ring.width / 2
                        centerY: ring.height / 2
                        radiusX: ring.width / 2 - ring.line
                        radiusY: radiusX
                        startAngle: -90
                        sweepAngle: 360 * Math.max(0.001, ring.value)
                    }
                }
            }

            ColumnLayout {
                anchors.centerIn: parent
                spacing: UiScale.px(2)

                IrisText {
                    Layout.alignment: Qt.AlignHCenter
                    text: root.running ? Core.fmtElapsed(root.remainingMs).slice(3) : "--:--"
                    font.pixelSize: Appearance.font.pixelSize.hugeass * 1.7
                    font.family: Appearance.font.family.numbers
                    font.features: { "tnum": 1 }
                    font.weight: Font.DemiBold
                    color: GritColors.fg
                }
                IrisText {
                    Layout.alignment: Qt.AlignHCenter
                    Layout.maximumWidth: ring.width - UiScale.px(60)
                    text: !root.running ? Translation.tr("idle")
                        : root.paused ? Translation.tr("paused")
                        : root.session.phase === "focus" ? (root.session.label ?? Translation.tr("focus"))
                        : Translation.tr("rest")
                    font.pixelSize: Appearance.font.pixelSize.smaller
                    color: GritColors.fg3
                    elide: Text.ElideRight
                }
            }
        }

        // Idle: presets
        ColumnLayout {
            Layout.fillWidth: true
            visible: !root.running
            spacing: UiScale.px(8)

            RowLayout {
                Layout.alignment: Qt.AlignHCenter
                spacing: UiScale.px(8)

                IrisPill {
                    text: Translation.tr("Classic 25/5")
                    icon: "play_arrow"
                    iconFill: true
                    primary: true
                    onBlack: true
                    onClicked: root.start(25, 5)
                }
                IrisPill {
                    text: Translation.tr("Deep 50/10")
                    icon: "play_arrow"
                    iconFill: true
                    primary: true
                    onBlack: true
                    onClicked: root.start(50, 10)
                }
                // Custom timer: opens the modal
                IrisDisc {
                    icon: "add"
                    clickable: true
                    size: UiScale.px(40)
                    tip: Translation.tr("Custom timer")
                    onClicked: root.showCustomTimer = true
                }
            }

            IrisSectionLabel {
                Layout.fillWidth: true
                Layout.topMargin: UiScale.px(4)
                text: Translation.tr("Focus tasks")
            }
            Flow {
                Layout.fillWidth: true
                spacing: UiScale.px(6)

                Repeater {
                    model: root.allFocusTasks
                    delegate: IrisPill {
                        id: taskChip
                        required property var modelData
                        text: modelData
                        onBlack: true
                        primary: root.selectedLabel === modelData
                        tip: Translation.tr("Click to select · right-click to unsave")
                        onClicked: root.selectedLabel = primary ? "" : modelData
                        onRightClicked: {
                            const taskName = taskChip.modelData;
                            GritConfirm.ask(
                                Translation.tr("Unsave focus task?"),
                                Translation.tr("\"%1\" stays on past logs and charts").arg(taskName),
                                () => GritStore.removeFocusTask(taskName),
                                Translation.tr("Remove"));
                        }
                    }
                }
                // New focus task: opens the modal
                IrisDisc {
                    icon: "add"
                    clickable: true
                    size: UiScale.px(36)
                    tip: Translation.tr("New focus task")
                    onClicked: root.showNewTask = true
                }
            }
        }

        // Running controls: the big white disc pauses and resumes
        RowLayout {
            Layout.alignment: Qt.AlignHCenter
            visible: root.running && !root.phaseOver
            spacing: UiScale.px(12)

            IrisPill {
                visible: root.session?.phase === "focus"
                text: Translation.tr("Save early")
                icon: "check"
                iconFill: true
                onBlack: true
                onClicked: {
                    const log = GritStore.saveFocusEarly();
                    if (log)
                        GritSounds.play("focusEnd");
                }
            }
            IrisDisc {
                on: true
                filled: true
                clickable: true
                size: UiScale.px(58)
                icon: root.paused ? "play_arrow" : "pause"
                tip: root.paused ? Translation.tr("Resume") : Translation.tr("Pause")
                onClicked: root.paused ? GritStore.resumeFocus() : GritStore.pauseFocus()
            }
            IrisPill {
                text: root.session?.phase === "rest" ? Translation.tr("Skip rest") : Translation.tr("Cancel")
                icon: root.session?.phase === "rest" ? "skip_next" : "close"
                iconFill: true
                onBlack: true
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
            spacing: UiScale.px(8)

            IrisText {
                Layout.alignment: Qt.AlignHCenter
                text: root.session?.phase === "focus"
                    ? Translation.tr("Focus done! +%1 XP").arg(Core.focusXp(root.session?.focusMin ?? 0))
                    : Translation.tr("Rest over.")
                font.pixelSize: Appearance.font.pixelSize.normal
                font.weight: Font.DemiBold
                color: GritColors.fg
            }
            RowLayout {
                Layout.alignment: Qt.AlignHCenter
                spacing: UiScale.px(8)

                IrisPill {
                    // No rest phase configured: only "Done" makes sense here
                    visible: root.session?.phase === "focus" && (root.session?.restMin ?? 0) > 0
                    text: Translation.tr("Take rest")
                    icon: "coffee"
                    iconFill: true
                    onBlack: true
                    primary: true
                    onClicked: GritStore.finishFocus(true)
                }
                IrisPill {
                    visible: root.session?.phase === "focus"
                    text: Translation.tr("Done")
                    icon: "check"
                    iconFill: true
                    onBlack: true
                    onClicked: GritStore.finishFocus(false)
                }
                IrisPill {
                    visible: root.session?.phase === "rest"
                    text: Translation.tr("Keep going")
                    icon: "play_arrow"
                    iconFill: true
                    onBlack: true
                    primary: true
                    onClicked: {
                        GritStore.continueFocus();
                        GritSounds.play("focusStart");
                    }
                }
                IrisPill {
                    visible: root.session?.phase === "rest"
                    text: Translation.tr("End session")
                    icon: "stop"
                    iconFill: true
                    onBlack: true
                    onClicked: GritStore.cancelFocus()
                }
            }
        }

        // ================ Progression + today ================

        IrisCard {
            Layout.topMargin: UiScale.px(4)

            RowLayout {
                id: statRow
                Layout.fillWidth: true
                spacing: UiScale.px(12)

                // Takes the slack so the today/set column always keeps its
                // width: long rank lines elide instead of pushing it off-card.
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: UiScale.px(1)
                    IrisText {
                        Layout.fillWidth: true
                        text: Core.focusTitle(root.totalHours)
                        font.pixelSize: Appearance.font.pixelSize.huge
                        font.family: Appearance.font.family.title
                        color: GritColors.fg
                        elide: Text.ElideRight
                    }
                    IrisText {
                        Layout.fillWidth: true
                        text: {
                            const next = Core.nextFocusTitle(root.totalHours);
                            return next
                                ? Translation.tr("%1 → %2 at %3h").arg(Core.fmtMinutes(root.totalMinutes))
                                    .arg(next.title).arg(next.hours)
                                : Core.fmtMinutes(root.totalMinutes);
                        }
                        font.pixelSize: Appearance.font.pixelSize.small
                        font.features: { "tnum": 1 }
                        font.weight: Font.DemiBold
                        color: GritColors.fg2
                        elide: Text.ElideRight
                    }
                    IrisText {
                        Layout.fillWidth: true
                        visible: Core.nextFocusTitle(root.totalHours) !== null
                        text: {
                            const next = Core.nextFocusTitle(root.totalHours);
                            return next ? Translation.tr("rank up +%1 XP").arg(next.xp) : "";
                        }
                        font.pixelSize: Appearance.font.pixelSize.smaller
                        font.features: { "tnum": 1 }
                        font.weight: Font.DemiBold
                        color: GritColors.fg3
                        elide: Text.ElideRight
                    }
                }

                ColumnLayout {
                    spacing: UiScale.px(6)
                    IrisText {
                        Layout.alignment: Qt.AlignRight
                        text: Translation.tr("Today: %1 · %2")
                            .arg(root.todayCount).arg(Core.fmtMinutes(root.todayMinutes))
                        font.pixelSize: Appearance.font.pixelSize.normal
                        font.features: { "tnum": 1 }
                        font.weight: Font.DemiBold
                        color: GritColors.fg
                    }
                    RowLayout {
                        Layout.alignment: Qt.AlignRight
                        spacing: UiScale.px(5)
                        Repeater {
                            model: Core.FOCUS_SET_SIZE
                            delegate: Rectangle {
                                required property int index
                                readonly property bool lit: index < (root.todayCount % Core.FOCUS_SET_SIZE)
                                implicitWidth: UiScale.px(10)
                                implicitHeight: UiScale.px(10)
                                radius: width / 2
                                color: lit ? GritColors.fg : GritColors.raisedHover
                                scale: lit ? 1 : 0.85
                                Behavior on color {
                                    ColorAnimation { duration: 180 }
                                }
                                Behavior on scale {
                                    SpringAnimation { spring: 3; damping: 0.35; epsilon: 0.01 }
                                }
                            }
                        }
                        IrisText {
                            Layout.leftMargin: UiScale.px(2)
                            text: Translation.tr("set +%1").arg(Core.FOCUS_SET_XP)
                            font.pixelSize: Appearance.font.pixelSize.smaller
                            color: GritColors.fg3
                        }
                    }
                }
            }
        }

        // ================ Analysis chart ================

        IrisSectionLabel {
            Layout.fillWidth: true
            Layout.topMargin: UiScale.px(4)
            text: Translation.tr("Analysis")
        }

        // Four options with icons do not fit the page width: equal, text only
        IrisSegmented {
            Layout.fillWidth: true
            equal: true
            onBlack: true
            value: root.chartMode
            onSelected: v => root.chartMode = v
            options: [
                { label: Translation.tr("Last 7"), value: "7d" },
                { label: Translation.tr("Weekly"), value: "week" },
                { label: Translation.tr("Monthly"), value: "month" },
                { label: Translation.tr("Yearly"), value: "year" }
            ]
        }

        IrisCard {
            id: chartCard
            implicitHeight: UiScale.px(170)
            fill: true

          // Bars plus the tooltip; the tooltip is positioned by hand, so it
          // lives in this plain Item rather than in the card's layout
          Item {
            id: chartArea
            Layout.fillWidth: true
            Layout.fillHeight: true

            // One tooltip for the whole chart, floated above the hovered bar
            // (it can't live inside the bars, they clip their contents)
            FocusTooltip {
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
                // Kept inside the card: chartArea sits inset by the card's pad
                x: Math.max(UiScale.px(4) - chartCard.pad, Math.min(chartArea.width + chartCard.pad - width - UiScale.px(4), root.hoverTipX - width / 2))
                y: Math.max(-UiScale.px(6) - chartCard.pad, root.hoverTipY - height - UiScale.px(10))
            }

            RowLayout {
                anchors.fill: parent
                spacing: UiScale.px(6)

                Repeater {
                    model: root.chartData
                    delegate: ColumnLayout {
                        id: barColumn
                        required property var modelData
                        required property int index
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        spacing: UiScale.px(4)

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
                        readonly property bool isCurrent: barColumn.index === root.chartData.length - 1
                        readonly property real barWidth: Math.min(UiScale.px(26), Math.max(UiScale.px(10), UiScale.px(200) / root.chartData.length))

                        IrisText {
                            Layout.alignment: Qt.AlignHCenter
                            visible: barColumn.modelData.minutes > 0 && root.chartData.length <= 12
                            text: Core.fmtMinutes(barColumn.modelData.minutes)
                            font.pixelSize: Appearance.font.pixelSize.smallest
                            font.features: { "tnum": 1 }
                            font.weight: Font.DemiBold
                            color: barColumn.bucketHovered ? GritColors.fg : GritColors.fg3
                            Behavior on color {
                                ColorAnimation { duration: 160 }
                            }
                        }
                        Item { Layout.fillHeight: true }

                        // A well-coloured slot with the stacked bar rising in it
                        Item {
                            Layout.alignment: Qt.AlignHCenter
                            Layout.preferredWidth: barColumn.barWidth
                            Layout.preferredHeight: UiScale.px(84)

                            Rectangle {
                                anchors.fill: parent
                                radius: Math.min(UiScale.px(8), width / 2)
                                color: GritColors.well
                            }

                            ClippingRectangle {
                                id: barRect
                                anchors.bottom: parent.bottom
                                width: parent.width
                                height: barColumn.modelData.minutes > 0
                                    ? Math.max(Math.min(width, UiScale.px(6)), parent.height * (barColumn.modelData.minutes / root.chartMax))
                                    : 0
                                radius: Math.min(UiScale.px(8), width / 2)
                                color: "transparent"
                                opacity: root.hoverBucket >= 0 && !barColumn.bucketHovered ? 0.45 : 1
                                scale: barColumn.bucketHovered ? 1.06 : 1
                                transformOrigin: Item.Bottom

                                Behavior on height {
                                    SpringAnimation { spring: 2.4; damping: 0.4; epsilon: 0.3 }
                                }
                                Behavior on opacity {
                                    NumberAnimation { duration: 160; easing.type: Easing.OutCubic }
                                }
                                Behavior on scale {
                                    NumberAnimation { duration: 140; easing.type: Easing.OutCubic }
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
                            }

                            HoverHandler {
                                onHoveredChanged: {
                                    if (hovered) {
                                        root.hoverBucket = barColumn.index;
                                        const p = barRect.mapToItem(chartArea, barRect.width / 2, 0);
                                        root.hoverTipX = p.x;
                                        root.hoverTipY = p.y;
                                    } else if (root.hoverBucket === barColumn.index) {
                                        root.hoverBucket = -1;
                                    }
                                }
                            }
                        }
                        IrisText {
                            Layout.alignment: Qt.AlignHCenter
                            text: barColumn.modelData.label
                            font.pixelSize: Appearance.font.pixelSize.smallest
                            font.weight: barColumn.isCurrent ? Font.DemiBold : Font.Normal
                            color: barColumn.isCurrent || barColumn.bucketHovered ? GritColors.fg : GritColors.fg3
                            Behavior on color {
                                ColorAnimation { duration: 160 }
                            }
                        }
                    }
                }
            }
          }
        }

        // ================ Task breakdown donut ================

        IrisSectionLabel {
            Layout.fillWidth: true
            Layout.topMargin: UiScale.px(4)
            icon: "pie_chart"
            text: Translation.tr("Focus analysis")
            side: Translation.tr("Task breakdown")
        }

        IrisCard {
            spacing: UiScale.px(10)

                IrisText {
                    Layout.alignment: Qt.AlignHCenter
                    Layout.topMargin: UiScale.px(16)
                    Layout.bottomMargin: UiScale.px(16)
                    visible: root.taskBreakdown.length === 0
                    text: Translation.tr("No focus in this period.")
                    font.pixelSize: Appearance.font.pixelSize.small
                    color: GritColors.fg3
                }

                IrisPie {
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
                    spacing: UiScale.px(2)

                    Repeater {
                        model: root.taskBreakdown
                        delegate: Item {
                            id: legendRow
                            required property var modelData
                            required property int index
                            readonly property bool lit: taskPie.hoveredIndex === legendRow.index
                            Layout.fillWidth: true
                            implicitHeight: UiScale.px(36)

                            Rectangle {
                                anchors.fill: parent
                                radius: height / 2
                                color: legendRow.lit ? GritColors.raisedHover : "transparent"
                                Behavior on color {
                                    ColorAnimation { duration: 160 }
                                }
                            }
                            HoverHandler {
                                onHoveredChanged: taskPie.hoveredIndex = hovered ? legendRow.index : -1
                            }

                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: UiScale.px(12)
                                anchors.rightMargin: UiScale.px(12)
                                spacing: UiScale.px(10)

                                Rectangle {
                                    implicitWidth: UiScale.px(10)
                                    implicitHeight: UiScale.px(10)
                                    radius: width / 2
                                    color: taskPie.colorOf(legendRow.index)
                                }
                                IrisText {
                                    Layout.fillWidth: true
                                    text: legendRow.modelData.label
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    font.weight: Font.DemiBold
                                    color: GritColors.fg
                                    elide: Text.ElideRight
                                }
                                IrisText {
                                    text: Core.fmtMinutes(legendRow.modelData.value)
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    font.features: { "tnum": 1 }
                                    color: GritColors.fg2
                                }
                                IrisText {
                                    Layout.preferredWidth: UiScale.px(40)
                                    horizontalAlignment: Text.AlignRight
                                    text: `${Math.round(legendRow.modelData.value / Math.max(1, root.breakdownTotal) * 100)}%`
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    font.features: { "tnum": 1 }
                                    font.weight: Font.DemiBold
                                    color: GritColors.fg
                                }
                            }
                        }
                    }
                }
        }

        // ================ Vertical activity heatmap ================

        IrisSectionLabel {
            Layout.fillWidth: true
            Layout.topMargin: UiScale.px(4)
            text: Translation.tr("Activity")
            side: Translation.tr("%1 focused").arg(Core.fmtMinutes(root.heatRangeMinutes))
        }

        // Up to four options: equal widths, text only, so it never overflows
        IrisSegmented {
            Layout.fillWidth: true
            equal: true
            onBlack: true
            value: root.heatRange
            onSelected: v => root.heatRange = v
            options: {
                const opts = [{ label: Translation.tr("Last year"), value: "last" }];
                for (const y of root.heatYears)
                    opts.push({ label: String(y), value: y });
                return opts;
            }
        }

        IrisCard {
            spacing: UiScale.px(8)

                // Two vertical strips side by side: time flows down the left
                // strip, continues at the top of the right one
                RowLayout {
                    Layout.fillWidth: true
                    spacing: UiScale.px(14)

                    Repeater {
                        model: root.heatStripCount
                        delegate: ColumnLayout {
                            id: strip
                            required property int index
                            readonly property int offset: strip.index * root.weeksPerStrip
                            Layout.fillWidth: true
                            Layout.alignment: Qt.AlignTop
                            spacing: UiScale.px(4)

                            // Weekday header per strip
                            RowLayout {
                                spacing: UiScale.px(4)
                                Item { Layout.preferredWidth: UiScale.px(36) }
                                Repeater {
                                    model: ["M", "T", "W", "T", "F", "S", "S"]
                                    delegate: IrisText {
                                        required property var modelData
                                        Layout.preferredWidth: root.heatCell
                                        horizontalAlignment: Text.AlignHCenter
                                        text: modelData
                                        font.pixelSize: Appearance.font.pixelSize.smallest
                                        color: GritColors.fg3
                                    }
                                }
                            }

                            Repeater {
                                model: root.heatWeeks.slice(strip.offset, strip.offset + root.weeksPerStrip)
                                delegate: RowLayout {
                                    id: weekRow
                                    required property var modelData
                                    required property int index
                                    spacing: UiScale.px(4)

                                    IrisText {
                                        Layout.preferredWidth: UiScale.px(36)
                                        horizontalAlignment: Text.AlignRight
                                        text: root.heatRowLabels[strip.offset + weekRow.index] ?? ""
                                        font.pixelSize: Appearance.font.pixelSize.smallest
                                        color: GritColors.fg3
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
                                            radius: root.heatCell * 0.3
                                            color: !inRange ? "transparent" : root.heatColor(dayMinutes)
                                            border.width: isToday ? UiScale.px(2) : 0
                                            border.color: GritColors.fg
                                            scale: cellHover.hovered ? 1.2 : 1
                                            z: cellHover.hovered ? 1 : 0
                                            Behavior on color {
                                                ColorAnimation { duration: 180 }
                                            }
                                            Behavior on scale {
                                                NumberAnimation { duration: 120; easing.type: Easing.OutCubic }
                                            }

                                            IrisToolTip {
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
                    Layout.topMargin: UiScale.px(4)
                    spacing: UiScale.px(4)

                    IrisText {
                        text: Translation.tr("start %1").arg(Core.fmtDay(root.heatStart))
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        color: GritColors.fg3
                    }
                    Item { Layout.fillWidth: true }
                    IrisText {
                        text: Translation.tr("less")
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        color: GritColors.fg3
                    }
                    Repeater {
                        model: [0, 15, 45, 90, 150]
                        delegate: Rectangle {
                            required property var modelData
                            implicitWidth: UiScale.px(12)
                            implicitHeight: UiScale.px(12)
                            radius: UiScale.px(4)
                            color: root.heatColor(modelData)
                        }
                    }
                    IrisText {
                        text: Translation.tr("more")
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        color: GritColors.fg3
                    }
                    Item { Layout.fillWidth: true }
                    IrisText {
                        text: root.heatEnd === GritStore.today
                            ? Translation.tr("today ◉") : Core.fmtDay(root.heatEnd)
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        color: GritColors.fg
                    }
                }
        }

        // ================ Recent sessions ================

        IrisSectionLabel {
            Layout.fillWidth: true
            Layout.topMargin: UiScale.px(4)
            visible: root.recentSessions.length > 0
            icon: "history"
            text: Translation.tr("Recent sessions")
            side: root.recentSessions.length === 1
                ? Translation.tr("The last one")
                : Translation.tr("The last %1").arg(root.recentSessions.length)
        }

        // Raised pill rows, one per session
        ColumnLayout {
            Layout.fillWidth: true
            visible: root.recentSessions.length > 0
            spacing: UiScale.px(6)

            Repeater {
                model: root.recentSessions
                delegate: Rectangle {
                    id: sessionRow
                    required property var modelData
                    required property int index
                    Layout.fillWidth: true
                    implicitHeight: UiScale.px(52)
                    radius: height / 2
                    color: rowHover.hovered ? GritColors.raisedHover : GritColors.raised
                    Behavior on color {
                        ColorAnimation { duration: 140 }
                    }
                    HoverHandler { id: rowHover }

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: UiScale.px(8)
                        anchors.rightMargin: UiScale.px(10)
                        spacing: UiScale.px(10)

                        Rectangle {
                            implicitWidth: UiScale.px(36)
                            implicitHeight: UiScale.px(36)
                            radius: width / 2
                            color: rowHover.hovered ? GritColors.raisedActive : GritColors.raisedHover
                            Behavior on color {
                                ColorAnimation { duration: 140 }
                            }

                            MaterialSymbol {
                                anchors.centerIn: parent
                                text: "timer"
                                iconSize: Appearance.font.pixelSize.normal
                                color: root.taskColor(sessionRow.modelData.name)
                            }
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 0

                            IrisText {
                                Layout.fillWidth: true
                                text: sessionRow.modelData.name
                                font.pixelSize: Appearance.font.pixelSize.small
                                font.weight: Font.DemiBold
                                color: GritColors.fg
                                elide: Text.ElideRight
                            }
                            IrisText {
                                Layout.fillWidth: true
                                text: `${root.clockOf(sessionRow.modelData.startedAt)} → ${root.clockOf(sessionRow.modelData.endedAt)} · ${root.sessionDayLabel(sessionRow.modelData.date)}`
                                font.pixelSize: Appearance.font.pixelSize.smallest
                                font.features: { "tnum": 1 }
                                font.weight: Font.Medium
                                color: GritColors.fg3
                                elide: Text.ElideRight
                            }
                        }
                        IrisText {
                            text: Core.fmtMinutes(sessionRow.modelData.minutes)
                            font.pixelSize: Appearance.font.pixelSize.small
                            font.features: { "tnum": 1 }
                            font.weight: Font.Bold
                            color: GritColors.fg
                        }
                        IrisText {
                            Layout.preferredWidth: UiScale.px(34)
                            horizontalAlignment: Text.AlignRight
                            visible: sessionRow.modelData.awardedXp !== 0
                            text: Core.fmtXp(sessionRow.modelData.awardedXp)
                            font.pixelSize: Appearance.font.pixelSize.smallest
                            font.features: { "tnum": 1 }
                            font.weight: Font.DemiBold
                            color: GritColors.fg2
                        }
                        IrisDisc {
                            icon: "close"
                            clickable: true
                            size: UiScale.px(28)
                            tip: Translation.tr("Delete")
                            opacity: rowHover.hovered ? 1 : 0
                            enabled: rowHover.hovered
                            onClicked: {
                                const row = sessionRow.modelData;
                                GritConfirm.ask(
                                    Translation.tr("Delete this session?"),
                                    Translation.tr("%1 · %2. Its XP is reversed.")
                                        .arg(row.name)
                                        .arg(Core.fmtMinutes(row.minutes)),
                                    () => GritStore.deleteDayLog(row.id));
                            }
                            Behavior on opacity {
                                NumberAnimation { duration: Iris.colorDuration; easing.type: Easing.OutCubic }
                            }
                        }
                    }
                }
            }
        }

        Item { implicitHeight: UiScale.px(4) }
    }
    }

    // ---------------- Modals ----------------

    onShowCustomTimerChanged: if (showCustomTimer) customTimerDialog.open()
    onShowNewTaskChanged: if (showNewTask) newTaskDialog.open()

    IrisDialog {
        id: customTimerDialog
        backgroundWidth: UiScale.px(320)
        onClosed: root.showCustomTimer = false

        sourceComponent: ColumnLayout {
            id: customTimerForm
            spacing: UiScale.px(16)

            function confirm() {
                root.start(parseInt(focusMinField.text) || 25, parseInt(restMinField.text) || 5);
                customTimerDialog.close();
            }

            IrisText {
                role: "title"
                text: Translation.tr("Custom timer")
            }
            RowLayout {
                Layout.alignment: Qt.AlignHCenter
                spacing: UiScale.px(8)

                ColumnLayout {
                    spacing: UiScale.px(2)
                    IrisText {
                        Layout.alignment: Qt.AlignHCenter
                        text: Translation.tr("Focus")
                        role: "caption"
                    }
                    IrisField {
                        id: focusMinField
                        Layout.preferredWidth: UiScale.px(90)
                        placeholderText: "25"
                        text: "25"
                        validator: IntValidator { bottom: 1; top: 600 }
                        Component.onCompleted: { forceActiveFocus(); selectAll(); }
                        onAccepted: customTimerForm.confirm()
                    }
                }
                IrisText {
                    Layout.alignment: Qt.AlignVCenter
                    Layout.topMargin: UiScale.px(14)
                    role: "label"
                    text: "/"
                    color: GritColors.fg3
                }
                ColumnLayout {
                    spacing: UiScale.px(2)
                    IrisText {
                        Layout.alignment: Qt.AlignHCenter
                        text: Translation.tr("Rest")
                        role: "caption"
                    }
                    IrisField {
                        id: restMinField
                        Layout.preferredWidth: UiScale.px(90)
                        placeholderText: "5"
                        text: "5"
                        validator: IntValidator { bottom: 0; top: 120 }
                        onAccepted: customTimerForm.confirm()
                    }
                }
            }
            RowLayout {
                Layout.fillWidth: true
                spacing: UiScale.px(8)
                Item { Layout.fillWidth: true }
                IrisPill {
                    text: Translation.tr("Cancel")
                    onClicked: customTimerDialog.close()
                }
                IrisPill {
                    primary: true
                    text: Translation.tr("Start")
                    onClicked: customTimerForm.confirm()
                }
            }
        }
    }

    IrisDialog {
        id: newTaskDialog
        backgroundWidth: UiScale.px(340)
        onClosed: root.showNewTask = false

        sourceComponent: ColumnLayout {
            id: newTaskForm
            spacing: UiScale.px(16)

            function confirm() {
                const name = newTaskField.text.trim();
                if (name.length > 0) {
                    GritStore.addFocusTask(name);
                    root.selectedLabel = name;
                }
                newTaskDialog.close();
            }

            IrisText {
                role: "title"
                text: Translation.tr("New focus task")
            }
            IrisField {
                id: newTaskField
                Layout.fillWidth: true
                placeholderText: Translation.tr("e.g. Learn German")
                Component.onCompleted: forceActiveFocus()
                onAccepted: newTaskForm.confirm()
            }
            RowLayout {
                Layout.fillWidth: true
                spacing: UiScale.px(8)
                Item { Layout.fillWidth: true }
                IrisPill {
                    text: Translation.tr("Cancel")
                    onClicked: newTaskDialog.close()
                }
                IrisPill {
                    primary: true
                    text: Translation.tr("Add")
                    onClicked: newTaskForm.confirm()
                }
            }
        }
    }

    function start(focusMin, restMin) {
        GritStore.startFocus(focusMin, restMin, root.selectedLabel || undefined);
        GritSounds.play("focusStart");
    }

    // The chart's hover card: black with a hairline, a title and one row per
    // task (round swatch, name, value)
    component FocusTooltip: Rectangle {
        id: tip
        property string title: ""
        property var rows: []
        property bool shown: false

        visible: opacity > 0
        opacity: shown && rows.length > 0 ? 1 : 0
        scale: shown ? 1 : 0.92
        z: 100
        radius: UiScale.px(14)
        color: GritColors.ink
        border.width: 1
        border.color: GritColors.divider
        implicitWidth: tipColumn.implicitWidth + UiScale.px(24)
        implicitHeight: tipColumn.implicitHeight + UiScale.px(18)

        Behavior on opacity {
            NumberAnimation { duration: 150; easing.type: Easing.OutCubic }
        }
        Behavior on scale {
            NumberAnimation { duration: 150; easing.type: Easing.OutCubic }
        }

        ColumnLayout {
            id: tipColumn
            anchors.centerIn: parent
            spacing: UiScale.px(4)

            IrisText {
                visible: tip.title.length > 0
                text: tip.title
                font.pixelSize: Appearance.font.pixelSize.small
                font.features: { "tnum": 1 }
                font.weight: Font.DemiBold
                color: GritColors.fg
            }
            Repeater {
                model: tip.rows
                delegate: RowLayout {
                    required property var modelData
                    Layout.fillWidth: true
                    spacing: UiScale.px(8)

                    Rectangle {
                        implicitWidth: UiScale.px(8)
                        implicitHeight: UiScale.px(8)
                        radius: width / 2
                        color: modelData.color ?? "transparent"
                    }
                    IrisText {
                        Layout.fillWidth: true
                        Layout.rightMargin: UiScale.px(8)
                        text: modelData.label ?? ""
                        font.pixelSize: Appearance.font.pixelSize.smaller
                        color: GritColors.fg2
                        elide: Text.ElideRight
                    }
                    IrisText {
                        text: modelData.value ?? ""
                        font.pixelSize: Appearance.font.pixelSize.smaller
                        font.features: { "tnum": 1 }
                        font.weight: Font.Bold
                        color: GritColors.fg
                    }
                }
            }
        }
    }
}
