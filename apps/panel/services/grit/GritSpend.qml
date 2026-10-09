pragma Singleton

import QtQuick
import Quickshell
import "GritCore.js" as Core

/**
 * Range state and aggregation for the Spendings page.
 *
 * Every number the page draws is derived here rather than in the view, for the
 * same reason GritActivity does it: the range (Day / Week / Month / Year /
 * Total plus the anchor day being paged through) has to survive leaving the
 * page and coming back, and one pass over the rows feeds the tiles, the bar
 * chart, the category donut and the place leaderboard at once.
 *
 * The data itself lives in GritStore.db.spendings; this singleton owns no
 * state that is worth persisting beyond the session.
 */
Singleton {
    id: root

    property string mode: "day" // day | week | month | year | total
    property string anchorDay: root.localToday()

    readonly property string currency: GritStore.settings.currency ?? "EUR"

    function money(v) {
        return Core.fmtMoney(v, root.currency);
    }

    function moneyShort(v) {
        return Core.fmtMoneyShort(v, root.currency);
    }

    // ---------------- Day arithmetic ----------------

    function localToday() {
        return Core.localDay(Date.now());
    }

    /** Re-reads the clock when the store rolls over to a new day. */
    readonly property string today: GritStore.today

    function dateOf(day) {
        const p = day.split("-").map(Number);
        return new Date(p[0], p[1] - 1, p[2]);
    }

    function addDays(day, n) {
        return Core.addDays(day, n);
    }

    function addMonths(day, n) {
        const d = root.dateOf(day);
        const targetMonth = d.getMonth() + n;
        // Clamp instead of letting JS roll over: adding a month to Jan 31 must
        // land on Feb 28, not drift into March and skip a month in the pager.
        const probe = new Date(d.getFullYear(), targetMonth, 1);
        const lastDay = new Date(probe.getFullYear(), probe.getMonth() + 1, 0).getDate();
        probe.setDate(Math.min(d.getDate(), lastDay));
        return Core.localDay(probe.getTime());
    }

    /** The first day with a spending on it, so the pager cannot walk off into empty years. */
    readonly property string dataEpoch: {
        GritStore.revision;
        let min = "";
        for (const s of GritStore.db.spendings) {
            const d = s.date ?? "";
            if (d !== "" && (min === "" || d < min))
                min = d;
        }
        return min === "" ? root.today : min;
    }

    /** [startDay, endDay] of the current range, both inclusive. */
    readonly property var rangeDays: {
        const a = root.anchorDay;
        if (root.mode === "day")
            return [a, a];
        if (root.mode === "week") {
            const mon = Core.mondayOf(a);
            return [mon, root.addDays(mon, 6)];
        }
        if (root.mode === "month") {
            const first = `${a.slice(0, 7)}-01`;
            return [first, root.addDays(root.addMonths(first, 1), -1)];
        }
        if (root.mode === "year")
            return [`${a.slice(0, 4)}-01-01`, `${a.slice(0, 4)}-12-31`];
        return [root.dataEpoch < root.today ? root.dataEpoch : root.today, root.today];
    }

    readonly property bool rangeIncludesToday:
        root.rangeDays[0] <= root.today && root.today <= root.rangeDays[1]

    /** The same span, shifted one period back, for the "vs last period" line. */
    readonly property var prevRangeDays: {
        const [s, e] = root.rangeDays;
        if (root.mode === "day")
            return [root.addDays(s, -1), root.addDays(s, -1)];
        if (root.mode === "week")
            return [root.addDays(s, -7), root.addDays(s, -1)];
        if (root.mode === "month") {
            const prevFirst = root.addMonths(s, -1);
            return [prevFirst, root.addDays(s, -1)];
        }
        if (root.mode === "year")
            return [`${Number(s.slice(0, 4)) - 1}-01-01`, `${Number(s.slice(0, 4)) - 1}-12-31`];
        return ["", ""]; // "Total" has nothing before it
    }

    function shift(dir) {
        const a = root.anchorDay;
        if (root.mode === "day")
            root.anchorDay = root.addDays(a, dir);
        else if (root.mode === "week")
            root.anchorDay = root.addDays(a, dir * 7);
        else if (root.mode === "month")
            root.anchorDay = root.addMonths(a, dir);
        else if (root.mode === "year")
            root.anchorDay = root.addMonths(a, dir * 12);
    }

    readonly property bool canGoNext: root.mode !== "total" && root.rangeDays[1] < root.today
    readonly property bool canGoPrev: root.mode !== "total" && root.rangeDays[0] > root.dataEpoch

    // ---------------- Rows in range ----------------

    function rowsBetween(from, to) {
        GritStore.revision;
        if (from === "" || to === "")
            return [];
        return GritStore.db.spendings.filter(s => {
            const d = s.date ?? "";
            return d >= from && d <= to;
        });
    }

    /** In-range spendings, newest first. */
    readonly property var rows: {
        GritStore.revision;
        const [from, to] = root.rangeDays;
        return root.rowsBetween(from, to).sort((a, b) => (b.spentAt ?? 0) - (a.spentAt ?? 0));
    }

    function sum(list) {
        return list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    }

    readonly property real total: root.sum(root.rows)
    readonly property int count: root.rows.length

    readonly property real prevTotal: {
        const [from, to] = root.prevRangeDays;
        return root.sum(root.rowsBetween(from, to));
    }

    /**
     * Days the average is spread over. A range that has not finished yet is
     * averaged over the days actually lived, otherwise today's half-finished
     * spending would be divided by a whole month and always look tiny.
     */
    readonly property int daysElapsed: {
        const [from, to] = root.rangeDays;
        const end = to > root.today ? root.today : to;
        if (end < from)
            return 1;
        const ms = root.dateOf(end).getTime() - root.dateOf(from).getTime();
        return Math.max(1, Math.round(ms / 86400000) + 1);
    }

    readonly property real perDay: root.total / root.daysElapsed

    readonly property real largest: root.rows.reduce((m, r) => Math.max(m, Number(r.amount) || 0), 0)

    // ---------------- Breakdowns ----------------

    /** [{ id, label, icon, value }] by category, biggest first. */
    readonly property var byCategory: {
        const totals = {};
        for (const r of root.rows) {
            const id = r.category ?? "other";
            totals[id] = (totals[id] ?? 0) + (Number(r.amount) || 0);
        }
        return Object.keys(totals)
            .map(id => {
                const cat = Core.spendCategory(id);
                return { id: id, label: cat.name, icon: cat.icon, value: totals[id] };
            })
            .filter(d => d.value > 0)
            .sort((a, b) => b.value - a.value);
    }

    /**
     * [{ label, value, count }] by place, biggest first. A spending logged
     * without a place keeps an empty label: naming that case is the view's
     * job, so this service stays free of user-facing strings.
     */
    readonly property var byPlace: {
        const totals = {};
        for (const r of root.rows) {
            const key = (r.place ?? "").trim();
            if (!totals[key])
                totals[key] = { label: key, value: 0, count: 0 };
            totals[key].value += Number(r.amount) || 0;
            totals[key].count++;
        }
        return Object.keys(totals).map(k => totals[k])
            .filter(d => d.value > 0)
            .sort((a, b) => b.value - a.value);
    }

    /**
     * Bar-chart buckets: [{ label, tick, total, perCategory }].
     * Hours across a day, days across a week or month, months across a year or
     * a total (whole years once a total spans more months than the bar chart
     * can render legibly at panel width).
     */
    readonly property var timeline: {
        const [start, end] = root.rangeDays;
        const buckets = [];
        const push = (label, tick, from, to) => buckets.push({
            label: label, tick: tick, from: from.getTime(), to: to.getTime(),
            total: 0, perCategory: {}
        });

        if (root.mode === "day") {
            const base = root.dateOf(start);
            for (let h = 0; h < 24; h++) {
                push(String(h).padStart(2, "0"), h % 3 === 0,
                    new Date(base.getFullYear(), base.getMonth(), base.getDate(), h),
                    new Date(base.getFullYear(), base.getMonth(), base.getDate(), h + 1));
            }
        } else if (root.mode === "week" || root.mode === "month") {
            const many = root.mode === "month";
            for (let d = start; d <= end; d = root.addDays(d, 1)) {
                const dayNum = Number(d.slice(8, 10));
                const label = many ? String(dayNum) : "MTWTFSS"[(root.dateOf(d).getDay() + 6) % 7];
                push(label, !many || dayNum % 5 === 1,
                    root.dateOf(d), root.dateOf(root.addDays(d, 1)));
            }
        } else {
            let m = `${start.slice(0, 7)}-01`;
            const months = [];
            while (m <= end) {
                months.push(m);
                m = root.addMonths(m, 1);
            }
            if (months.length <= 26) {
                for (const mm of months) {
                    const monthNum = Number(mm.slice(5, 7));
                    const name = Core.MONTHS_SHORT[monthNum - 1];
                    // Numbers across a year, not initials: J, J and M each turn
                    // up twice, so the letters cannot be read as an axis.
                    const label = root.mode === "year" ? String(monthNum)
                        : `${name} ${mm.slice(2, 4)}`;
                    push(label, root.mode === "year" || Number(mm.slice(5, 7)) % 3 === 1,
                        root.dateOf(mm), root.dateOf(root.addMonths(mm, 1)));
                }
            } else {
                for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++)
                    push(String(y), true, new Date(y, 0, 1), new Date(y + 1, 0, 1));
            }
        }

        // One pass over the rows; buckets are ordered, so a scan finds the home
        // of each row without a per-row search over the whole bucket list.
        for (const r of root.rows) {
            const at = r.spentAt ?? 0;
            for (const b of buckets) {
                if (at >= b.from && at < b.to) {
                    const amount = Number(r.amount) || 0;
                    const cat = r.category ?? "other";
                    b.total += amount;
                    b.perCategory[cat] = (b.perCategory[cat] ?? 0) + amount;
                    break;
                }
            }
        }
        return buckets;
    }

    readonly property real chartMax: Math.max(1, ...root.timeline.map(b => b.total))

    /** In-range rows grouped by day, newest day first, for the history list. */
    readonly property var history: {
        const byDate = {};
        for (const r of root.rows) {
            const d = r.date ?? "";
            if (!byDate[d])
                byDate[d] = [];
            byDate[d].push(r);
        }
        return Object.keys(byDate).sort().reverse().map(date => ({
            date: date,
            rows: byDate[date],
            total: root.sum(byDate[date])
        }));
    }
}
