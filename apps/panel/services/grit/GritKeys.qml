pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import qs

/**
 * Vim-style keyboard layer for the Grit panel.
 *
 * Modes: "normal" (motions and single-letter commands on the focused card),
 * "hint" (f: jump letters on every visible card), "tabhint" (g: mnemonic
 * letters on the nav rail), "leader" (Space: which-key commands). INSERT is
 * not a stored mode: it is derived from a text editor holding active focus
 * (bound from Grit.qml), and while it holds, this router declines everything,
 * so typing can never trigger a command.
 *
 * The router is fed from the same rectangle that already owns the panel's
 * keyboard focus and Escape handling (Grit.qml). handleKey returns true when
 * the event was consumed; an unconsumed Escape falls through to the existing
 * close-the-panel behaviour, which keeps Escape's contract: it walks one
 * level back toward NORMAL and only closes the panel from a clean NORMAL.
 *
 * Cards do not register callbacks. The current tasks view publishes its
 * ordered card ids (setCards), and commands are broadcast as
 * cardCommand(cardId, cmd); each card acts only on its own id, reusing the
 * exact logic of its mouse handlers so keyboard and mouse can never drift.
 */
Singleton {
    id: root

    // "normal" | "hint" | "tabhint" | "leader"
    property string mode: "normal"
    // Multi-key input in flight ("d" waiting for the second d)
    property string pending: ""
    // A text editor holds focus (bound from Grit.qml); router declines keys
    property bool insertActive: false
    // A dialog owns the panel (bound from GritContent); router declines keys
    property bool suspended: false
    property bool cheatsheetOpen: false

    // ---------- Card focus ----------

    // Ordered ids of the cards in the visible tasks view, published by TasksView
    property var cardIds: []
    property string cardsView: ""
    property string focusedCardId: ""
    // id -> jump letter, assigned when entering hint mode
    property var jumpLetters: ({})

    readonly property int focusedIndex: root.cardIds.indexOf(root.focusedCardId)
    readonly property bool active: root.mode !== "normal" || root.pending !== ""
        || root.focusedCardId !== "" || root.insertActive || root.cheatsheetOpen

    signal cardCommand(string cardId, string cmd)
    signal tabLetter(string letter)
    signal tabIndex(int index)
    signal leaderCommand(string cmd)
    signal addRequested()

    // Letters for f-mode card jumps, home row outward. Modal, so no reservations.
    readonly property string jumpAlphabet: "asdfghjkl;qwertyuiopzxcvbnm"

    function setCards(viewId, ids) {
        root.cardsView = viewId;
        root.cardIds = ids;
        if (root.focusedCardId !== "" && ids.indexOf(root.focusedCardId) < 0)
            root.focusedCardId = "";
    }

    function clearCards(viewId) {
        if (root.cardsView !== viewId)
            return;
        root.cardsView = "";
        root.cardIds = [];
        root.focusedCardId = "";
        if (root.mode === "hint")
            root.mode = "normal";
    }

    function reset() {
        root.mode = "normal";
        root.pending = "";
        root.focusedCardId = "";
        root.cheatsheetOpen = false;
        pendingTimeout.stop();
    }

    // ---------- Key routing ----------

    /**
     * Letter for a key event, layout independent: prefer the produced text,
     * but fall back to the hardware Qt.Key_A..Z code so the hints keep working
     * while a Cyrillic layout is active (the letters shown are always Latin).
     */
    function letterOf(key, text) {
        if (text.length === 1 && /[a-z0-9?;]/.test(text.toLowerCase()))
            return text.toLowerCase();
        if (key >= Qt.Key_A && key <= Qt.Key_Z)
            return String.fromCharCode(key).toLowerCase();
        if (key >= Qt.Key_0 && key <= Qt.Key_9)
            return String.fromCharCode(key);
        return "";
    }

    function handleKey(key, text) {
        if (root.suspended || root.insertActive)
            return false;

        // Cheatsheet is modal: ? or Escape (or any key) puts it away
        if (root.cheatsheetOpen) {
            root.cheatsheetOpen = false;
            return true;
        }

        const letter = root.letterOf(key, text);

        switch (root.mode) {
        case "hint":
            return root.handleHint(key, letter);
        case "tabhint":
            return root.handleTabHint(key, letter);
        case "leader":
            return root.handleLeader(key, letter);
        }
        return root.handleNormal(key, letter);
    }

    function handleHint(key, letter) {
        if (key === Qt.Key_Escape) {
            root.mode = "normal";
            return true;
        }
        if (letter !== "") {
            for (const id of root.cardIds) {
                if (root.jumpLetters[id] === letter) {
                    root.focusedCardId = id;
                    break;
                }
            }
            root.mode = "normal";
        }
        return true; // modal: swallow everything
    }

    function handleTabHint(key, letter) {
        if (key === Qt.Key_Escape) {
            root.mode = "normal";
            return true;
        }
        if (letter !== "")
            root.tabLetter(letter); // GritContent exits the mode on a match
        return true;
    }

    function handleLeader(key, letter) {
        root.mode = "normal";
        if (key === Qt.Key_Escape)
            return true;
        switch (letter) {
        case "t":
            root.mode = "tabhint";
            return true;
        case "r":
            root.leaderCommand("restday");
            return true;
        case "s":
            root.leaderCommand("shop");
            return true;
        case "i":
            root.leaderCommand("stats");
            return true;
        case "?":
            root.cheatsheetOpen = true;
            return true;
        }
        return true; // unknown leader key: back to normal, swallowed
    }

    function handleNormal(key, letter) {
        // dd: the second d deletes, anything else abandons the pending d
        if (root.pending === "d") {
            root.pending = "";
            pendingTimeout.stop();
            if (letter === "d") {
                root.fireOnFocused("delete");
                return true;
            }
            if (key === Qt.Key_Escape)
                return true;
            // fall through so the new key still means what it means
        }

        if (key === Qt.Key_Escape) {
            if (root.focusedCardId !== "") {
                root.focusedCardId = "";
                return true;
            }
            return false; // clean NORMAL: let the panel close
        }

        if (key === Qt.Key_Space) {
            root.mode = "leader";
            return true;
        }
        if (key === Qt.Key_Return || key === Qt.Key_Enter)
            return root.fireOnFocused("toggle");

        switch (letter) {
        case "1": case "2": case "3": case "4": case "5":
            root.tabIndex(Number(letter) - 1);
            return true;
        case "g":
            root.mode = "tabhint";
            return true;
        case "f":
            if (root.cardIds.length === 0)
                return true;
            root.assignJumpLetters();
            root.mode = "hint";
            return true;
        case "j":
            return root.moveFocus(1);
        case "k":
            return root.moveFocus(-1);
        case "a":
            root.addRequested();
            return true;
        case "?":
            root.cheatsheetOpen = true;
            return true;
        case "x":
            return root.fireOnFocused("toggle");
        case "e":
            return root.fireOnFocused("edit");
        case "w":
            return root.fireOnFocused("myday");
        case "o":
            return root.fireOnFocused("subtasks");
        case "y":
            return root.fireOnFocused("copy");
        case "s":
            return root.fireOnFocused("slip");
        case "d":
            if (root.focusedCardId === "")
                return false;
            root.pending = "d";
            pendingTimeout.restart();
            return true;
        }
        return false;
    }

    function moveFocus(delta) {
        const ids = root.cardIds;
        if (ids.length === 0)
            return false;
        const i = ids.indexOf(root.focusedCardId);
        if (i < 0) {
            root.focusedCardId = delta > 0 ? ids[0] : ids[ids.length - 1];
            return true;
        }
        root.focusedCardId = ids[Math.max(0, Math.min(ids.length - 1, i + delta))];
        return true;
    }

    function fireOnFocused(cmd) {
        if (root.focusedCardId === "")
            return false;
        root.cardCommand(root.focusedCardId, cmd);
        return true;
    }

    function assignJumpLetters() {
        const map = {};
        const n = Math.min(root.cardIds.length, root.jumpAlphabet.length);
        for (let i = 0; i < n; i++)
            map[root.cardIds[i]] = root.jumpAlphabet[i];
        root.jumpLetters = map;
    }

    Timer {
        id: pendingTimeout
        interval: 900
        onTriggered: root.pending = ""
    }

    // Scripting and testing access, same pattern as the cliphist service:
    // qs -c ii ipc call gritKeys setMode leader
    IpcHandler {
        target: "gritKeys"

        function setMode(name: string): void {
            if (["normal", "hint", "tabhint", "leader"].indexOf(name) >= 0) {
                if (name === "hint")
                    root.assignJumpLetters();
                root.mode = name;
            }
        }
        function cheatsheet(): void {
            root.cheatsheetOpen = !root.cheatsheetOpen;
        }
        function reset(): void {
            root.reset();
        }
    }

    // A fresh open always starts in a clean NORMAL
    Connections {
        target: GlobalStates
        function onGritOpenChanged() {
            root.reset();
        }
    }
}
