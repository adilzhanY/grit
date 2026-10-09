pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

/**
 * Data layer for the Activity page: pulls screen-time from the local
 * ActivityWatch server (localhost:5600) and coding stats from the local
 * wakapi instance (localhost:3000).
 *
 * Attribution follows the mouse, not global focus: the primary source is the
 * custom aw-watcher-monitor bucket (app + monitor + title under the pointer),
 * intersected with the AFK bucket so idle time never counts. Website time
 * comes from the aw-watcher-web browser extension buckets, split into
 * domains server-side.
 *
 * The view sets `mode` + `anchorDay` and flips `active` while it is visible;
 * everything else is fetched and aggregated here.
 */
Singleton {
    id: root

    readonly property string awUrl: "http://localhost:5600/api/0"
    readonly property string wakapiUrl: "http://localhost:3000"

    // The day data collection began (includes the wakapi heartbeat backlog
    // imported on setup). Nothing before it can exist, so "Total" starts here.
    readonly property string dataEpoch: "2026-08-19"

    // Since this instant (UTC) the monitor watcher resolves the exact browser
    // tab under the mouse and stamps its domain into its own events, which is
    // per-window correct. Earlier events lack the field, so periods before
    // this fall back to intersecting extension events with browser time
    // (which double-counts when two browser windows ping simultaneously).
    readonly property string domainEpoch: "2026-08-30T17:10:00.000Z"

    // ---------------- Range state (set by the view) ----------------

    property string mode: "day" // day | week | month | year | total
    property string anchorDay: root.localToday()
    property bool active: false

    /**
     * The current local day as a REACTIVE property. localToday() calls are
     * invisible to the binding system, so anything that read it froze at its
     * first evaluation and the page kept showing the previous day as "Today"
     * after midnight. A minute tick moves this, and an anchor sitting on
     * "today" rolls over with the clock.
     */
    property string todayLive: root.localToday()

    Timer {
        interval: 60000
        running: true
        repeat: true
        onTriggered: {
            const t = root.localToday();
            if (t === root.todayLive)
                return;
            if (root.anchorDay === root.todayLive)
                root.anchorDay = t; // follow the clock across midnight
            root.todayLive = t;
            refreshSoon.restart();
        }
    }

    property bool loading: false
    property string error: ""

    // ---------------- Results ----------------

    // Seconds of non-AFK screen time in the range
    property real activeSeconds: 0
    // [{label, value}] seconds, sorted desc
    property var apps: []
    property var screens: []
    property var domains: []
    // [{label, tick, total, perApp: {app: seconds}}] one row per timeline bucket
    property var timeline: []

    // wakapi
    property real codingSeconds: 0
    property real aiSeconds: 0
    property var codingProjects: []  // [{label, value}] seconds
    property var codingLanguages: []
    property var codingModels: []

    readonly property real humanSeconds: Math.max(0, root.codingSeconds - root.aiSeconds)

    // ---------------- Date helpers (all local time) ----------------

    function localToday() {
        return root.dayStr(new Date());
    }

    function dayStr(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    function dateOf(day) {
        const p = day.split("-").map(Number);
        return new Date(p[0], p[1] - 1, p[2]);
    }

    function addDays(day, n) {
        const d = root.dateOf(day);
        d.setDate(d.getDate() + n);
        return root.dayStr(d);
    }

    function addMonths(day, n) {
        const d = root.dateOf(day);
        d.setMonth(d.getMonth() + n);
        return root.dayStr(d);
    }

    function mondayOf(day) {
        const wd = root.dateOf(day).getDay(); // 0 = Sunday
        return root.addDays(day, -((wd + 6) % 7));
    }

    /** [startDay, endDay] of the current range, both inclusive. */
    readonly property var rangeDays: {
        const a = root.anchorDay;
        if (root.mode === "day")
            return [a, a];
        if (root.mode === "week") {
            const mon = root.mondayOf(a);
            return [mon, root.addDays(mon, 6)];
        }
        if (root.mode === "month") {
            const first = `${a.slice(0, 7)}-01`;
            return [first, root.addDays(root.addMonths(first, 1), -1)];
        }
        if (root.mode === "year")
            return [`${a.slice(0, 4)}-01-01`, `${a.slice(0, 4)}-12-31`];
        return [root.dataEpoch, root.todayLive];
    }

    readonly property bool rangeIncludesToday:
        root.rangeDays[0] <= root.todayLive && root.todayLive <= root.rangeDays[1]

    /**
     * Timeline buckets: [{label, tick, startIso, endIso}].
     * Hours for a day, days for week/month, months for year/total
     * (years when a total spans too many months to draw).
     */
    readonly property var timeBuckets: {
        const out = [];
        const push = (label, tick, from, to) => out.push({
            label: label, tick: tick,
            startIso: from.toISOString(), endIso: to.toISOString()
        });
        const [start, end] = root.rangeDays;

        if (root.mode === "day") {
            const base = root.dateOf(start);
            for (let h = 0; h < 24; h++) {
                const from = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h);
                const to = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h + 1);
                push(String(h).padStart(2, "0"), h % 3 === 0, from, to);
            }
        } else if (root.mode === "week" || root.mode === "month") {
            const many = root.mode === "month";
            for (let d = start; d <= end; d = root.addDays(d, 1)) {
                const dayNum = Number(d.slice(8, 10));
                const label = many ? String(dayNum) : "MTWTFSS"[(root.dateOf(d).getDay() + 6) % 7];
                push(label, !many || dayNum % 5 === 1, root.dateOf(d), root.dateOf(root.addDays(d, 1)));
            }
        } else {
            // Whole months; fall back to whole years when there are too many
            let m = `${start.slice(0, 7)}-01`;
            const months = [];
            while (m <= end) {
                months.push(m);
                m = root.addMonths(m, 1);
            }
            if (months.length <= 26) {
                for (const mm of months) {
                    const monthNum = Number(mm.slice(5, 7));
                    const name = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][monthNum - 1];
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
        return out;
    }

    // ---------------- Refresh plumbing ----------------

    onModeChanged: refreshSoon.restart()
    onAnchorDayChanged: refreshSoon.restart()
    onActiveChanged: {
        if (root.active)
            refreshSoon.restart();
    }

    // Collapses a mode+anchor change into one fetch
    Timer {
        id: refreshSoon
        interval: 60
        onTriggered: root.refresh()
    }

    // Live ranges tick over on their own while the page is open
    Timer {
        interval: 60000
        running: root.active && root.rangeIncludesToday
        repeat: true
        onTriggered: root.refresh()
    }

    property int generation: 0

    function refresh() {
        if (!root.active)
            return;
        root.generation++;
        root.loading = true;
        root.error = "";
        root.fetchBuckets(root.generation);
        root.fetchCoding(root.generation);
    }

    // ---------------- ActivityWatch ----------------

    function fetchBuckets(gen) {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", `${root.awUrl}/buckets/`);
        xhr.onreadystatechange = () => {
            if (xhr.readyState !== XMLHttpRequest.DONE)
                return;
            if (xhr.status !== 200) {
                if (gen === root.generation) {
                    root.error = "ActivityWatch is not reachable on :5600";
                    root.loading = false;
                }
                return;
            }
            const ids = Object.keys(JSON.parse(xhr.responseText));
            root.runQuery(gen,
                ids.find(b => b.startsWith("aw-watcher-afk_")) ?? "",
                ids.find(b => b.startsWith("aw-watcher-input-afk")) ?? "",
                ids.find(b => b.startsWith("aw-watcher-monitor_")) ?? "",
                ids.filter(b => b.startsWith("aw-watcher-web-")));
        };
        xhr.send();
    }

    function runQuery(gen, afkId, inputAfkId, monId, webIds) {
        if (monId === "" || afkId === "") {
            if (gen === root.generation) {
                root.error = "Watcher buckets missing on the ActivityWatch server";
                root.loading = false;
            }
            return;
        }
        const q = [`afk = flood(query_bucket("${afkId}"));`];
        if (inputAfkId !== "") {
            // The shell's input-only AFK bucket wins wherever it has data:
            // awatcher's respects idle inhibitors, which video sites hold
            // even while PAUSED, so it can stay "not-afk" forever. awatcher
            // fills the history from before the input bucket existed.
            q.push(`afkInput = flood(query_bucket("${inputAfkId}"));`);
            q.push('afk = union_no_overlap(afkInput, afk);');
        }
        q.push('notafk = filter_keyvals(afk, "status", ["not-afk"]);');
        if (webIds.length > 0) {
            let websrc = `query_bucket("${webIds[0]}")`;
            for (let i = 1; i < webIds.length; i++)
                websrc = `concat(${websrc}, query_bucket("${webIds[i]}"))`;
            // A PLAYING tab counts as presence even with no input (watching a
            // video); a paused one does not, so input-idle takes over there
            q.push(`webraw = flood(${websrc});`);
            q.push('audible = filter_keyvals(webraw, "audible", [true]);');
            q.push('notafk = period_union(notafk, audible);');
        }
        q.push(`mon = flood(query_bucket("${monId}"));`);
        q.push('mon = filter_period_intersect(mon, notafk);');
        q.push('apps = sort_by_duration(merge_events_by_keys(mon, ["app"]));');
        q.push('screens = sort_by_duration(merge_events_by_keys(mon, ["monitor"]));');
        if (webIds.length > 0) {
            // Legacy path for events before domainEpoch: clip tab time to
            // when a browser window is under the mouse. The raw extension
            // events keep running in the background (audible tabs stay
            // "active") and would overcount badly without the clip.
            q.push('browsermon = filter_keyvals(mon, "app", ["brave-browser", "firefox", "chromium", "google-chrome", "librewolf", "zen"]);');
            q.push('web = split_url_events(webraw);');
            q.push('web = filter_period_intersect(web, browsermon);');
            q.push('domains = sort_by_duration(merge_events_by_keys(web, ["$domain"]));');
            q.push('domainsNew = sort_by_duration(merge_events_by_keys(browsermon, ["domain"]));');
            q.push('RETURN = {"apps": apps, "screens": screens, "domains": domains, "domainsNew": domainsNew};');
        } else {
            q.push('browsermon = filter_keyvals(mon, "app", ["brave-browser", "firefox", "chromium", "google-chrome", "librewolf", "zen"]);');
            q.push('domainsNew = sort_by_duration(merge_events_by_keys(browsermon, ["domain"]));');
            q.push('RETURN = {"apps": apps, "screens": screens, "domainsNew": domainsNew};');
        }

        const buckets = root.timeBuckets;
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${root.awUrl}/query/`);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.onreadystatechange = () => {
            if (xhr.readyState !== XMLHttpRequest.DONE || gen !== root.generation)
                return;
            root.loading = false;
            if (xhr.status !== 200) {
                root.error = "ActivityWatch query failed";
                return;
            }
            root.applyQuery(buckets, JSON.parse(xhr.responseText));
        };
        xhr.send(JSON.stringify({
            timeperiods: buckets.map(b => `${b.startIso}/${b.endIso}`),
            query: q
        }));
    }

    function applyQuery(buckets, periods) {
        const appTotals = {};
        const screenTotals = {};
        const domainTotals = {};
        const rows = [];
        let total = 0;

        periods.forEach((p, i) => {
            const row = { label: buckets[i].label, tick: buckets[i].tick, total: 0, perApp: {} };
            for (const e of (p.apps ?? [])) {
                const app = e.data.app ?? "?";
                appTotals[app] = (appTotals[app] ?? 0) + e.duration;
                row.perApp[app] = (row.perApp[app] ?? 0) + e.duration;
                row.total += e.duration;
                total += e.duration;
            }
            for (const e of (p.screens ?? [])) {
                const s = e.data.monitor ?? "?";
                screenTotals[s] = (screenTotals[s] ?? 0) + e.duration;
            }
            // Monitor-resolved domains once available, extension intersect before
            const domainSrc = buckets[i].startIso >= root.domainEpoch
                ? (p.domainsNew ?? []) : (p.domains ?? []);
            for (const e of domainSrc) {
                const d = e.data["$domain"] ?? e.data.domain;
                if (d)
                    domainTotals[d] = (domainTotals[d] ?? 0) + e.duration;
            }
            rows.push(row);
        });

        const toSorted = obj => Object.keys(obj)
            .map(k => ({ label: k, value: obj[k] }))
            .filter(d => d.value >= 1)
            .sort((a, b) => b.value - a.value);

        root.activeSeconds = total;
        root.apps = toSorted(appTotals);
        root.screens = toSorted(screenTotals);
        root.domains = toSorted(domainTotals);
        root.timeline = rows;
    }

    // ---------------- wakapi ----------------

    property string wakapiKey: ""

    FileView {
        path: Quickshell.env("HOME") + "/.wakatime.cfg"
        onLoaded: {
            const m = text().match(/^\s*api_key\s*=\s*(\S+)/m);
            if (m) {
                root.wakapiKey = m[1];
                if (root.active)
                    refreshSoon.restart();
            }
        }
        onLoadFailed: root.wakapiKey = ""
    }

    function fetchCoding(gen) {
        if (root.wakapiKey === "") {
            root.codingSeconds = 0;
            root.aiSeconds = 0;
            root.codingProjects = [];
            root.codingLanguages = [];
            root.codingModels = [];
            return;
        }
        const [start, end] = root.rangeDays;
        const xhr = new XMLHttpRequest();
        xhr.open("GET", `${root.wakapiUrl}/api/compat/wakatime/v1/users/current/summaries?start=${start}&end=${end}`);
        xhr.setRequestHeader("Authorization", `Basic ${root.b64(root.wakapiKey)}`);
        xhr.onreadystatechange = () => {
            if (xhr.readyState !== XMLHttpRequest.DONE || gen !== root.generation)
                return;
            if (xhr.status !== 200) {
                root.codingSeconds = 0;
                root.aiSeconds = 0;
                root.codingProjects = [];
                root.codingLanguages = [];
                root.codingModels = [];
                return;
            }
            root.applyCoding(JSON.parse(xhr.responseText));
        };
        xhr.send();
    }

    /**
     * AI attribution goes by EDITOR, not by wakatime-cli's category tagging.
     * The category is time-sliced (any heartbeat near agent transcript
     * activity gets "ai coding", whatever file it touches), so with agents
     * running all day it would swallow the user's own typing. The editor
     * field is unambiguous: transcript-parsed agent heartbeats carry the
     * agent or model name, and a human typing in nvim is always "Neovim".
     */
    readonly property var aiEditors: [
        "claude", "opus", "sonnet", "fable", "haiku",
        "codex", "cursor", "gemini", "cline", "cline cli", "amp", "aider",
        "copilot", "windsurf", "codebuff", "codewhale", "codebuddy code",
        "kiro", "devin", "junie", "goose", "opencode", "droid", "charm crush"
    ]

    function isAiEditor(name) {
        return root.aiEditors.indexOf(String(name).toLowerCase()) >= 0;
    }

    function applyCoding(resp) {
        let total = 0;
        let ai = 0;
        const projects = {};
        const languages = {};
        const models = {};

        const addTo = (obj, name, secs) => {
            if (secs >= 1)
                obj[name] = (obj[name] ?? 0) + secs;
        };

        for (const day of (resp.data ?? [])) {
            total += day.grand_total?.total_seconds ?? 0;
            for (const e of (day.editors ?? [])) {
                if (root.isAiEditor(e.name)) {
                    ai += e.total_seconds;
                    addTo(models, e.name, e.total_seconds);
                }
            }
            for (const p of (day.projects ?? []))
                addTo(projects, p.name, p.total_seconds);
            for (const l of (day.languages ?? []))
                addTo(languages, l.name, l.total_seconds);
        }

        const toSorted = obj => Object.keys(obj)
            .map(k => ({ label: k, value: obj[k] }))
            .sort((a, b) => b.value - a.value);

        root.codingSeconds = total;
        root.aiSeconds = Math.min(ai, total);
        root.codingProjects = toSorted(projects);
        root.codingLanguages = toSorted(languages);
        root.codingModels = toSorted(models);
    }

    /** Base64 for the ASCII api key (Qt.btoa is deprecated and warns per call). */
    function b64(s) {
        const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let out = "";
        for (let i = 0; i < s.length; i += 3) {
            const a = s.charCodeAt(i);
            const b = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
            const c = i + 2 < s.length ? s.charCodeAt(i + 2) : 0;
            out += abc[a >> 2] + abc[((a & 3) << 4) | (b >> 4)]
                + (i + 1 < s.length ? abc[((b & 15) << 2) | (c >> 6)] : "=")
                + (i + 2 < s.length ? abc[c & 63] : "=");
        }
        return out;
    }

    // ---------------- Formatting ----------------

    /** Seconds to "3h 25m" / "48m" / "12s". */
    function fmtSecs(secs) {
        const s = Math.round(secs);
        if (s < 60)
            return `${s}s`;
        const min = Math.round(s / 60);
        const h = Math.floor(min / 60);
        const m = min % 60;
        if (h === 0)
            return `${m}m`;
        return m === 0 ? `${h}h` : `${h}h ${m}m`;
    }

    /** Display name for a wayland app class. */
    function prettyApp(cls) {
        const known = {
            "neovim": "Neovim",
            "brave-browser": "Brave",
            "org.quickshell": "Quickshell",
            "kitty": "kitty",
            "com.rtosta.zapzap": "WhatsApp",
            "org.telegram.desktop": "Telegram",
            "com.ayugram.desktop": "Telegram",
            "desktop": "Desktop"
        };
        if (known[cls])
            return known[cls];
        // GLFW titles its windows "Minecraft* 26.2" and the like
        if (/^minecraft/i.test(cls))
            return "Minecraft";
        // Split only genuine reverse-DNS ids ("org.vendor.App" -> "App");
        // a bare dot is not enough, version numbers contain dots too
        let last = cls;
        if (!cls.includes(" ") && /^[A-Za-z]{2,}(\.[\w-]+)+$/.test(cls))
            last = cls.split(".").pop();
        last = last.replace(/[-_]/g, " ");
        return last.charAt(0).toUpperCase() + last.slice(1);
    }
}
