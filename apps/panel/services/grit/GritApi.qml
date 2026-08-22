pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import qs.modules.common

/**
 * Supabase client for Grit: email/password auth with persisted, auto-refreshing
 * sessions, plus thin PostgREST helpers. Uses the same Supabase project as the
 * Grit web/mobile apps; RLS scopes every query to the signed-in user.
 */
Singleton {
    id: root

    // Public client config (publishable key is safe to embed; RLS protects data)
    readonly property string baseUrl: "https://saacyhthtisfhnjlscvg.supabase.co"
    readonly property string publishableKey: "sb_publishable_YCiaT4aux6n7yixsvPC_KQ_fbUwHE8k"

    property string accessToken: ""
    property string refreshToken: ""
    property real expiresAt: 0 // epoch seconds
    property string userId: ""
    property string userEmail: ""
    property bool sessionLoaded: false
    property bool refreshing: false
    readonly property bool loggedIn: accessToken !== "" && userId !== ""

    property string authError: ""

    signal signedIn()
    signal signedOut()

    readonly property string sessionDir: Directories.state + "/user/grit"
    readonly property string sessionPath: sessionDir + "/session.json"

    Component.onCompleted: {
        Quickshell.execDetached(["mkdir", "-p", root.sessionDir]);
    }

    // ---------- Auth ----------

    function signIn(email, password, callback) {
        root.authError = "";
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${root.baseUrl}/auth/v1/token?grant_type=password`);
        xhr.setRequestHeader("apikey", root.publishableKey);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.onreadystatechange = () => {
            if (xhr.readyState !== XMLHttpRequest.DONE)
                return;
            if (xhr.status === 200) {
                root.applySession(JSON.parse(xhr.responseText));
                root.saveSession();
                root.signedIn();
                if (callback) callback(null);
            } else {
                let msg = "Sign-in failed";
                try {
                    const err = JSON.parse(xhr.responseText);
                    msg = err.error_description ?? err.msg ?? err.message ?? msg;
                } catch (e) {}
                if (xhr.status === 0) msg = "No connection";
                root.authError = msg;
                if (callback) callback(msg);
            }
        };
        xhr.send(JSON.stringify({ email: email, password: password }));
    }

    function signOut() {
        root.accessToken = "";
        root.refreshToken = "";
        root.expiresAt = 0;
        root.userId = "";
        root.userEmail = "";
        root.saveSession();
        root.signedOut();
    }

    function applySession(session) {
        root.accessToken = session.access_token ?? "";
        root.refreshToken = session.refresh_token ?? "";
        root.expiresAt = session.expires_at ?? (Date.now() / 1000 + (session.expires_in ?? 3600));
        root.userId = session.user?.id ?? root.userId;
        root.userEmail = session.user?.email ?? root.userEmail;
    }

    function refreshSession(callback) {
        if (root.refreshToken === "" || root.refreshing)
            return;
        root.refreshing = true;
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${root.baseUrl}/auth/v1/token?grant_type=refresh_token`);
        xhr.setRequestHeader("apikey", root.publishableKey);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.onreadystatechange = () => {
            if (xhr.readyState !== XMLHttpRequest.DONE)
                return;
            root.refreshing = false;
            if (xhr.status === 200) {
                root.applySession(JSON.parse(xhr.responseText));
                root.saveSession();
                if (callback) callback(null);
            } else if (xhr.status >= 400 && xhr.status < 500) {
                // Refresh token rejected — the session is gone for good
                root.signOut();
                if (callback) callback("Session expired");
            } else if (callback) {
                callback("No connection"); // transient; keep tokens and retry later
            }
        };
        xhr.send(JSON.stringify({ refresh_token: root.refreshToken }));
    }

    // Refresh 2 minutes before expiry (and on load if already stale)
    Timer {
        interval: 30000
        running: root.loggedIn
        repeat: true
        onTriggered: {
            if (Date.now() / 1000 > root.expiresAt - 120)
                root.refreshSession();
        }
    }

    // ---------- PostgREST ----------

    /**
     * REST call against /rest/v1. callback(status, parsedBodyOrNull).
     * extraHeaders: optional {header: value} map (e.g. Prefer for upserts).
     */
    function rest(method, pathAndQuery, body, callback, extraHeaders) {
        const xhr = new XMLHttpRequest();
        xhr.open(method, `${root.baseUrl}/rest/v1/${pathAndQuery}`);
        xhr.setRequestHeader("apikey", root.publishableKey);
        xhr.setRequestHeader("Authorization", `Bearer ${root.accessToken}`);
        xhr.setRequestHeader("Content-Type", "application/json");
        if (extraHeaders) {
            for (const key in extraHeaders)
                xhr.setRequestHeader(key, extraHeaders[key]);
        }
        xhr.onreadystatechange = () => {
            if (xhr.readyState !== XMLHttpRequest.DONE)
                return;
            let parsed = null;
            if (xhr.responseText && xhr.responseText.length > 0) {
                try {
                    parsed = JSON.parse(xhr.responseText);
                } catch (e) {}
            }
            if (callback) callback(xhr.status, parsed);
        };
        xhr.send(body !== null && body !== undefined ? JSON.stringify(body) : undefined);
    }

    /** Upsert rows into a synced table (conflict target user_id,id — LWW merge). */
    function upsert(table, rows, callback) {
        root.rest("POST", `${table}?on_conflict=user_id,id`, rows, callback,
                  { "Prefer": "resolution=merge-duplicates,return=minimal" });
    }

    /** Pull rows of a table changed after the given ISO timestamp. */
    function pullSince(table, sinceIso, callback) {
        const query = `${table}?select=*&user_id=eq.${root.userId}&updated_at=gt.${encodeURIComponent(sinceIso)}`;
        root.rest("GET", query, null, callback);
    }

    // ---------- Session persistence ----------

    function saveSession() {
        sessionFileView.setText(JSON.stringify({
            accessToken: root.accessToken,
            refreshToken: root.refreshToken,
            expiresAt: root.expiresAt,
            userId: root.userId,
            userEmail: root.userEmail
        }));
    }

    FileView {
        id: sessionFileView
        path: Qt.resolvedUrl(root.sessionPath)
        onLoaded: {
            try {
                const s = JSON.parse(sessionFileView.text());
                root.accessToken = s.accessToken ?? "";
                root.refreshToken = s.refreshToken ?? "";
                root.expiresAt = s.expiresAt ?? 0;
                root.userId = s.userId ?? "";
                root.userEmail = s.userEmail ?? "";
                if (root.loggedIn && Date.now() / 1000 > root.expiresAt - 120)
                    root.refreshSession();
                if (root.loggedIn)
                    root.signedIn();
            } catch (e) {
                console.log("[GritApi] Failed to parse session:", e);
            }
            root.sessionLoaded = true;
        }
        onLoadFailed: error => {
            root.sessionLoaded = true;
        }
    }
}
