pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import qs.modules.common
import qs.modules.common.functions

/**
 * Euro-based exchange rates, for entering a subscription in the currency it is
 * actually billed in.
 *
 * Rates come from open.er-api.com (free, no key, one update a day) and are
 * cached to disk, so a cold start with no network still converts. The cache is
 * refreshed at most once every 12 hours; the upstream only moves daily, and a
 * subscription page does not need the tick.
 *
 * Conversion happens ONCE, when a row is written, and the rate used is stored
 * on that row. Charts therefore read a fixed euro figure: what you paid is a
 * fact about the day you paid it, and must not drift every time the euro moves.
 */
Singleton {
    id: root

    /** What the user can type an amount in. Everything else is display only. */
    readonly property var inputCurrencies: ["EUR", "USD", "KZT"]

    /**
     * Last-resort rates (units per 1 EUR), from 2026-09-01. Only ever used
     * before the first successful fetch on a machine with no cache; a stale
     * rate converts a new subscription roughly right, which beats refusing to
     * save it. `stale` stays true until a real fetch lands, so the UI can say so.
     */
    readonly property var fallbackRates: ({ EUR: 1, USD: 1.1609, KZT: 536.5696 })

    property var rates: root.fallbackRates
    property real fetchedAt: 0
    property bool loading: false
    property string error: ""

    /** True while the numbers are the baked-in fallback rather than a real fetch. */
    readonly property bool stale: root.fetchedAt === 0

    readonly property string cacheDir: Directories.state + "/user/grit"
    readonly property string cachePath: root.cacheDir + "/fx.json"

    readonly property real refreshAfterMs: 12 * 3600 * 1000

    function symbolOf(code) {
        return ({ EUR: "€", USD: "$", KZT: "₸" })[code] ?? code;
    }

    /** Units of `code` per 1 EUR, falling back to the baked-in table. */
    function rateOf(code) {
        const r = Number(root.rates[code]);
        return (isFinite(r) && r > 0) ? r : (root.fallbackRates[code] ?? 1);
    }

    /** Convert into euro, rounded to cents. EUR in, EUR out, untouched. */
    function toEur(amount, code) {
        const v = Number(amount) || 0;
        if (code === "EUR" || !code)
            return Math.round(v * 100) / 100;
        return Math.round(v / root.rateOf(code) * 100) / 100;
    }

    function fromEur(amountEur, code) {
        const v = Number(amountEur) || 0;
        if (code === "EUR" || !code)
            return Math.round(v * 100) / 100;
        return Math.round(v * root.rateOf(code) * 100) / 100;
    }

    function refresh(force) {
        if (root.loading)
            return;
        if (!force && root.fetchedAt > 0 && Date.now() - root.fetchedAt < root.refreshAfterMs)
            return;
        root.loading = true;
        const xhr = new XMLHttpRequest();
        xhr.open("GET", "https://open.er-api.com/v6/latest/EUR");
        xhr.onreadystatechange = () => {
            if (xhr.readyState !== XMLHttpRequest.DONE)
                return;
            root.loading = false;
            if (xhr.status !== 200) {
                root.error = xhr.status === 0 ? "No connection" : `HTTP ${xhr.status}`;
                return;
            }
            try {
                const resp = JSON.parse(xhr.responseText);
                if (resp.result !== "success" || !resp.rates)
                    throw new Error("bad payload");
                // Keep only what we can actually be asked to convert: the whole
                // 166-currency table would be written to disk on every refresh.
                const keep = {};
                for (const c of root.inputCurrencies)
                    if (isFinite(Number(resp.rates[c])))
                        keep[c] = Number(resp.rates[c]);
                keep.EUR = 1;
                root.rates = keep;
                root.fetchedAt = Date.now();
                root.error = "";
                root.save();
            } catch (e) {
                root.error = "Bad rate data";
            }
        };
        xhr.send();
    }

    function save() {
        cacheFile.setText(JSON.stringify({ rates: root.rates, fetchedAt: root.fetchedAt }));
    }

    Component.onCompleted: {
        Quickshell.execDetached(["mkdir", "-p", FileUtils.trimFileProtocol(root.cacheDir)]); // the dir is a file:// URL
    }

    FileView {
        id: cacheFile
        path: Qt.resolvedUrl(root.cachePath)
        onLoaded: {
            try {
                const parsed = JSON.parse(cacheFile.text());
                if (parsed.rates && Number(parsed.rates.EUR) === 1) {
                    root.rates = parsed.rates;
                    root.fetchedAt = Number(parsed.fetchedAt) || 0;
                }
            } catch (e) {
                console.log("[GritFx] bad cache:", e);
            }
            root.refresh(false);
        }
        onLoadFailed: error => {
            if (error == FileViewError.FileNotFound)
                root.refresh(true);
        }
    }

    // A machine left running for days would otherwise keep converting at the
    // rate it happened to boot with.
    Timer {
        interval: 3600 * 1000
        running: true
        repeat: true
        onTriggered: root.refresh(false)
    }
}
