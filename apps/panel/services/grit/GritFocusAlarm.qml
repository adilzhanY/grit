pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import "GritCore.js" as Core

/**
 * Background watcher for the pomodoro timer. Lives independently of the Grit
 * panel, so the alarm fires even while the panel is closed: plays the cue
 * sound and raises a desktop notification with action buttons (Take rest /
 * Done, or Keep going / End session).
 *
 * The notification belongs to exactly one phase of one session: it is closed
 * the moment that phase is answered, no matter whether the answer came from
 * the notification, the Grit panel or another device, and its actions are
 * ignored if they arrive after the phase is gone. Otherwise a leftover
 * "Focus finished" popup would still be sitting on screen when the rest ends,
 * showing the wrong buttons, and clicking them would act on a later session.
 */
Singleton {
    id: root

    // Referenced from Grit.qml to keep this singleton alive from shell start
    readonly property bool armed: true
    property bool fired: false
    property bool ringing: false

    // Identifies a phase instance: a new phase (or none) means a different key
    readonly property string sessionKey: {
        const a = GritStore.activeFocus;
        return a ? `${a.phase}:${a.startedAt}` : "";
    }

    // The phase the notification currently on screen was raised for, and the
    // server-side id of that notification (0 while unknown).
    property string pendingKey: ""
    property int pendingId: 0
    property bool awaitingId: false

    // Answered elsewhere (panel, another device, session cancelled) → the
    // notification is stale, so take it down instead of leaving it around.
    onSessionKeyChanged: {
        if (root.pendingKey !== "" && root.pendingKey !== root.sessionKey)
            root.clearNotification();
    }

    Timer {
        interval: 1000
        running: GritStore.activeFocus !== null
        repeat: true
        onTriggered: root.check()
    }

    // Like the web's FocusAlarm: re-ring the chime every 3s until answered
    Timer {
        interval: 3000
        running: root.ringing && GritStore.activeFocus !== null
        repeat: true
        onTriggered: {
            const a = GritStore.activeFocus;
            if (a)
                GritSounds.play(a.phase === "focus" ? "focusEnd" : "restEnd");
        }
    }

    function check() {
        const a = GritStore.activeFocus;
        if (!a || !Core.focusElapsed(a, Date.now())) {
            root.fired = false;
            root.ringing = false;
            return;
        }
        if (root.fired)
            return;
        root.fired = true;
        root.ringing = true;
        const isFocus = a.phase === "focus";
        GritSounds.play(isFocus ? "focusEnd" : "restEnd");
        root.notify(a, isFocus);
    }

    function notify(a, isFocus) {
        root.clearNotification();
        root.pendingKey = root.sessionKey;
        root.awaitingId = true;
        if (isFocus) {
            const xp = Core.focusXp(a.focusMin);
            const label = a.label ? ` · ${a.label}` : "";
            const actions = a.restMin > 0
                ? ["-A", "rest=Take rest", "-A", "done=Done"]
                : ["-A", "done=Done"];
            notifProc.command = [...GritNotify.base, "-t", "0", "-p",
                ...actions,
                "Focus finished 🎉",
                `${a.focusMin} min${label} · +${xp} XP waiting`];
        } else {
            notifProc.command = [...GritNotify.base, "-t", "0", "-p",
                "-A", "continue=Keep going", "-A", "end=End session",
                "Rest over",
                "Back to work?"];
        }
        notifProc.running = true;
    }

    /** Take the pending notification off screen and forget it. */
    function clearNotification() {
        const id = root.pendingId;
        root.pendingKey = "";
        root.pendingId = 0;
        root.awaitingId = false;
        notifProc.running = false; // notify-send waits for an action forever
        root.closeById(id);
    }

    /**
     * notify-send only removes its notification when the user answers it, so
     * dismiss it over the bus by id when we take it down ourselves.
     */
    function closeById(id) {
        if (id <= 0)
            return;
        closeProc.running = false;
        closeProc.command = ["gdbus", "call", "--session",
            "--dest", "org.freedesktop.Notifications",
            "--object-path", "/org/freedesktop/Notifications",
            "--method", "org.freedesktop.Notifications.CloseNotification",
            String(id)];
        closeProc.running = true;
    }

    // notify-send prints the notification id first (-p), then the chosen
    // action key, if any. Both arrive line by line while it runs.
    Process {
        id: notifProc
        stdout: SplitParser {
            onRead: line => {
                const text = line.trim();
                if (text === "")
                    return;
                if (root.awaitingId && /^\d+$/.test(text)) {
                    root.awaitingId = false;
                    root.pendingId = parseInt(text);
                    return;
                }
                root.applyAction(text);
            }
        }
    }

    Process { id: closeProc }

    // A linked Must ticked itself off the back of a focus block. Announce it,
    // otherwise the task and its XP just change behind the user's back.
    Connections {
        target: GritStore
        function onFocusMustCompleted(title, xp) {
            GritSounds.play("cool");
            mustProc.running = false;
            mustProc.command = [...GritNotify.base, "-t", "6000",
                `${title} ✓`,
                `Done from focus time · +${xp} XP`];
            mustProc.running = true;
        }
    }

    Process { id: mustProc }

    // Focus rank ups are rare and pay a lot, so they get their own shout.
    Connections {
        target: GritStore
        function onFocusRankUp(title, hours, xp) {
            rankProc.running = false;
            rankProc.command = [...GritNotify.base, "-t", "10000", "-u", "critical",
                `${title} ⭐`,
                `${hours}h of focus. +${xp} XP`];
            rankProc.running = true;
        }
    }

    Process { id: rankProc }

    // A quest finished itself off the back of something you were doing anyway.
    Connections {
        target: GritStore
        function onQuestCompleted(label, xp) {
            GritSounds.play("cool");
            questProc.running = false;
            questProc.command = [...GritNotify.base, "-t", "5000",
                "Quest done", `${label} · +${xp} XP`];
            questProc.running = true;
        }
        function onWeeklyGoalMet(xp) {
            GritSounds.play("milestone");
            questProc.running = false;
            questProc.command = [...GritNotify.base, "-t", "8000",
                "Weekly goal cleared 🏆", `+${xp} XP`];
            questProc.running = true;
        }
    }

    Process { id: questProc }

    // ---------- The evening nudge ----------
    //
    // One notification a day, at 21:00, and only when the quota is still short
    // and there is a streak on the line. It names the block that would cover the
    // gap rather than the shortfall, because a number is not an action.

    property string nudgedDate: ""

    Timer {
        interval: 60000
        running: GritStore.loaded
        repeat: true
        triggeredOnStart: true
        onTriggered: root.maybeNudge()
    }

    function maybeNudge() {
        const today = GritStore.today;
        if (root.nudgedDate === today)
            return;
        if (new Date().getHours() < 21)
            return;
        // Nothing to save: quota already met, a rest day covers the day, or
        // there is no streak yet to protect.
        if (GritStore.quotaDone || GritStore.restDayUsedToday || GritStore.streak <= 0)
            return;
        root.nudgedDate = today;
        const short = Math.max(1, GritStore.dailyQuota - Math.round(GritStore.quotaProgress));
        const rate = Core.XP_PER_FOCUS_MIN * Math.max(1, GritStore.xpMultiplier.mult);
        const minutes = Math.max(5, Math.ceil(short / rate / 5) * 5);
        nudgeProc.running = false;
        nudgeProc.command = [...GritNotify.base, "-t", "12000",
            `${GritStore.streak} day streak on the line`,
            `${short} XP short. A ${minutes} minute focus block covers it.`];
        nudgeProc.running = true;
    }

    Process { id: nudgeProc }

    function applyAction(action) {
        const a = GritStore.activeFocus;
        // Only act when the notification still matches the live phase. An
        // answer from a stale popup must never touch a newer session.
        if (!a || root.pendingKey === "" || root.pendingKey !== root.sessionKey) {
            root.clearNotification();
            return;
        }
        const id = root.pendingId;
        root.pendingKey = "";
        root.pendingId = 0;
        root.awaitingId = false;

        if (a.phase === "focus") {
            if (action === "rest")
                GritStore.finishFocus(true);
            else if (action === "done")
                GritStore.finishFocus(false);
        } else {
            if (action === "continue") {
                GritStore.continueFocus();
                GritSounds.play("focusStart");
            } else if (action === "end") {
                GritStore.cancelFocus();
            }
        }
        root.closeById(id);
    }
}
