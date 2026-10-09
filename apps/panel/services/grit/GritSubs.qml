pragma Singleton

import QtQuick
import Quickshell
import "GritCore.js" as Core

/**
 * Derived state for the Subscriptions page: what is live, what is about to be
 * charged, what the whole stack costs, and what the cancelled ones cost while
 * they lasted.
 *
 * Every euro figure here comes from the `amountEur` frozen onto each row when
 * it was written, never from a live conversion, so the numbers on this page do
 * not move when exchange rates do.
 */
Singleton {
    id: root

    readonly property string today: GritStore.today

    // Charge-history range, same vocabulary as the Spendings and Activity pages
    property string mode: "year" // day | week | month | year | total
    property string anchorDay: GritStore.today

    // ---------------- Buckets of subscriptions ----------------

    /**
     * A COPY of the table, never the live array. GritStore.patchRow mutates
     * rows in place, and a QML `var` property that re-evaluates to the same
     * object reference does not emit its change signal, so returning the live
     * array froze everything downstream: an edit saved correctly to disk and
     * the list went on showing the value from before it.
     */
    readonly property var all: {
        GritStore.revision;
        return GritStore.db.subscriptions.slice();
    }

    readonly property var active: root.all
        .filter(s => s.status !== "cancelled")
        .slice()
        .sort((a, b) => {
            // Soonest charge first: this list is a countdown, not a catalogue.
            const da = Core.subNextCharge(a, root.today) ?? "9999-12-31";
            const db = Core.subNextCharge(b, root.today) ?? "9999-12-31";
            return da < db ? -1 : da > db ? 1 : (a.name ?? "").localeCompare(b.name ?? "");
        })

    readonly property var cancelled: root.all
        .filter(s => s.status === "cancelled")
        .slice()
        .sort((a, b) => (b.cancelledAt ?? 0) - (a.cancelledAt ?? 0))

    /**
     * A trial that is still running, so it costs nothing yet. Every place that
     * talks about committed money asks this one question, rather than repeating
     * the test: when the headline and the breakdown disagreed about which
     * subscriptions count, the donut's slices added up to 126%.
     */
    function isLiveTrial(sub) {
        return sub.cycle === "trial" && (Core.subTrialEnd(sub) ?? "") >= root.today;
    }

    /** Live trials, which are the ones that quietly start charging. */
    readonly property var trials: root.active.filter(s => root.isLiveTrial(s))

    /** Active subscriptions that are actually billing today. */
    readonly property var committed: root.active.filter(s => !root.isLiveTrial(s))

    // ---------------- Money ----------------

    /**
     * Committed spend per month, in euro. Trials that have not converted are
     * excluded: they cost nothing today, and folding them in would overstate
     * what the user is actually on the hook for.
     */
    readonly property real monthlyEur: root.committed
        .reduce((sum, s) => sum + Core.subMonthlyEur(s), 0)

    readonly property real yearlyEur: root.monthlyEur * 12

    /** What the live trials will start costing per month once they convert. */
    readonly property real trialMonthlyEur: root.trials
        .reduce((sum, s) => sum + Core.subMonthlyEur(s), 0)

    /** Lifetime euro across every subscription, cancelled ones included. */
    readonly property real spentAllTimeEur: root.all
        .reduce((sum, s) => sum + Core.subSpentEur(s, root.today), 0)

    readonly property real spentCancelledEur: root.cancelled
        .reduce((sum, s) => sum + Core.subSpentEur(s, root.today), 0)

    function spentOn(sub) {
        return Core.subSpentEur(sub, root.today);
    }

    function nextCharge(sub) {
        return Core.subNextCharge(sub, root.today);
    }

    function daysUntil(day) {
        return day ? Core.daysBetween(root.today, day) : -1;
    }

    /** Human countdown for a charge date: "today", "tomorrow", "in 5 days". */
    function untilLabel(day) {
        const d = root.daysUntil(day);
        if (d < 0)
            return "";
        if (d === 0)
            return "today";
        if (d === 1)
            return "tomorrow";
        return `in ${d} days`;
    }

    // ---------------- Upcoming ----------------

    /**
     * Everything due in the next `horizon` days, soonest first, as
     * [{ sub, day, days, isTrialEnd }].
     */
    property int horizon: 30

    readonly property var upcoming: {
        const out = [];
        for (const s of root.active) {
            const day = Core.subNextCharge(s, root.today);
            if (!day)
                continue;
            const days = Core.daysBetween(root.today, day);
            if (days > root.horizon)
                continue;
            const trialEnd = Core.subTrialEnd(s);
            out.push({
                sub: s, day: day, days: days,
                isTrialEnd: s.cycle === "trial" && trialEnd === day
            });
        }
        return out.sort((a, b) => a.days - b.days);
    }

    /** Anything inside the reminder window, for the badge on the nav rail. */
    readonly property int dueSoonCount: root.upcoming.filter(u => u.days <= 7).length

    // ---------------- Per-service breakdown ----------------

    /**
     * [{ label, value }] monthly euro per subscription, biggest first. Reads the
     * same `committed` list as monthlyEur, so the slices always add up to the
     * figure in the middle of the donut.
     */
    readonly property var byService: root.committed
        .map(s => ({ label: s.name || "Untitled", value: Core.subMonthlyEur(s) }))
        .filter(d => d.value > 0)
        .sort((a, b) => b.value - a.value)

    // ---------------- Charge history range ----------------

    function dateOf(day) {
        const p = day.split("-").map(Number);
        return new Date(p[0], p[1] - 1, p[2]);
    }

    function addDays(day, n) {
        return Core.addDays(day, n);
    }

    function addMonths(day, n) {
        return Core.addMonthsClamped(day, n);
    }

    /** The earliest day any subscription started, so the pager has a floor. */
    readonly property string dataEpoch: {
        let min = "";
        for (const s of root.all) {
            const d = Core.subStartDay(s);
            if (d !== "" && (min === "" || d < min))
                min = d;
        }
        return min === "" ? root.today : min;
    }

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

    /**
     * Every charge that actually landed inside the range, as
     * [{ day, name, eur }]. Built once and shared by the total, the bar chart
     * and the list, so the three can never disagree.
     */
    readonly property var chargesInRange: {
        const [from, to] = root.rangeDays;
        const end = to < root.today ? to : root.today; // never bill the future
        const out = [];
        for (const s of root.all) {
            const eur = Number(s.amountEur) || 0;
            if (eur <= 0)
                continue;
            for (const day of Core.subChargeDays(s, end)) {
                if (day >= from && day <= end)
                    out.push({ day: day, name: s.name || "Untitled", eur: eur });
            }
        }
        return out.sort((a, b) => a.day < b.day ? 1 : a.day > b.day ? -1 : 0);
    }

    readonly property real chargedInRangeEur: root.chargesInRange.reduce((s, c) => s + c.eur, 0)

    /** Bar buckets over the range: [{ label, tick, total, perService }]. */
    readonly property var timeline: {
        const [start, end] = root.rangeDays;
        const buckets = [];
        const push = (label, tick, from, to) => buckets.push({
            label: label, tick: tick, from: from, to: to, total: 0, perService: {}
        });

        if (root.mode === "day" || root.mode === "week" || root.mode === "month") {
            const many = root.mode === "month";
            const single = root.mode === "day";
            for (let d = start; d <= end; d = root.addDays(d, 1)) {
                const dayNum = Number(d.slice(8, 10));
                const label = single ? Core.fmtDay(d).slice(0, 5)
                    : many ? String(dayNum)
                    : "MTWTFSS"[(root.dateOf(d).getDay() + 6) % 7];
                push(label, !many || dayNum % 5 === 1, d, d);
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
                        mm, root.addDays(root.addMonths(mm, 1), -1));
                }
            } else {
                for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++)
                    push(String(y), true, `${y}-01-01`, `${y}-12-31`);
            }
        }

        for (const charge of root.chargesInRange) {
            for (const b of buckets) {
                if (charge.day >= b.from && charge.day <= b.to) {
                    b.total += charge.eur;
                    b.perService[charge.name] = (b.perService[charge.name] ?? 0) + charge.eur;
                    break;
                }
            }
        }
        return buckets;
    }

    readonly property real chartMax: Math.max(1, ...root.timeline.map(b => b.total))
}
