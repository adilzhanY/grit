pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import "GritCore.js" as Core

/**
 * Renewal reminders. Runs from shell start, independently of the panel, so a
 * trial that is about to start charging says so whether or not Grit is open.
 *
 * By default a subscription warns 7, 3 and 1 days out; the set is per row, so
 * an expensive yearly one can be given a longer runway.
 *
 * Every reminder that goes out is recorded on the row itself, keyed by the
 * exact charge date it referred to. That means it is sent once, it survives a
 * shell restart, and a second device that syncs the row will not send it again.
 */
Singleton {
    id: root

    // Referenced from Grit.qml so the singleton exists from shell start
    readonly property bool armed: true

    /** Nothing fires before this hour: a 03:00 popup helps no one. */
    readonly property int quietUntilHour: 9

    property string lastSweepDay: ""

    Timer {
        interval: 300000 // five minutes
        running: GritStore.loaded
        repeat: true
        triggeredOnStart: true
        onTriggered: root.sweep()
    }

    // A fresh row, or one edited to a new date, should not wait for the tick.
    Connections {
        target: GritStore
        function onLocalChange() {
            sweepSoon.restart();
        }
    }

    Timer {
        id: sweepSoon
        interval: 2000
        repeat: false
        onTriggered: root.sweep()
    }

    function sweep() {
        if (!GritStore.loaded)
            return;
        if (new Date().getHours() < root.quietUntilHour)
            return;

        const today = GritStore.today;
        for (const sub of GritStore.db.subscriptions) {
            const due = Core.subDueReminder(sub, today);
            if (!due)
                continue;
            root.notify(sub, due.day, due.away);
            GritStore.markSubNotified(sub.id, due.key);
            // One popup per sweep: a stack of six notifications at 09:00 is
            // noise, and the next sweep is only five minutes away.
            return;
        }
    }

    function notify(sub, day, away) {
        const trialEnd = Core.subTrialEnd(sub);
        const isTrialEnd = sub.cycle === "trial" && trialEnd === day;
        const when = away === 0 ? "today" : away === 1 ? "tomorrow" : `in ${away} days`;
        const price = Core.fmtMoney(sub.amountEur ?? 0, "EUR");
        const name = sub.name || "Subscription";

        let title;
        let body;
        if (isTrialEnd && (!sub.trialThen || sub.trialThen === "none")) {
            title = `${name} trial ends ${when}`;
            body = `Access stops on ${Core.fmtDay(day)}.`;
        } else if (isTrialEnd) {
            // The one that actually costs people money, so it shouts.
            title = `${name} trial ends ${when}`;
            body = `Starts charging ${price} ${Core.subCycle(sub.trialThen).name.toLowerCase()} on ${Core.fmtDay(day)}. Cancel before then to avoid it.`;
        } else {
            title = `${name} renews ${when}`;
            body = `${price} on ${Core.fmtDay(day)}.`;
        }

        notifProc.running = false;
        notifProc.command = [...GritNotify.base,
            "-t", isTrialEnd ? "0" : "15000",
            "-u", (isTrialEnd || away <= 1) ? "critical" : "normal",
            title, body];
        notifProc.running = true;
    }

    Process { id: notifProc }
}
