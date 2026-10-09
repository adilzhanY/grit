.pragma library

// Pure logic behind GritSearch (Grit in the Super launcher): search ranking, which state the
// focus session is in, and which key runs which action. Kept free of QML so it
// can be unit tested in node.

function normalize(s) {
    return String(s ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

// Lower is better: exact, then prefix, then the start of any word, then
// anywhere in the name. -1 means no match.
function scoreMatch(name, query) {
    const n = normalize(name);
    const q = normalize(query);
    if (q.length === 0 || n.length === 0)
        return -1;
    if (n === q)
        return 0;
    if (n.startsWith(q))
        return 1;
    if (n.split(" ").some(w => w.startsWith(q)))
        return 2;
    if (n.includes(q))
        return 3;
    return -1;
}

// On equal scores a focus task comes first, then a list task, then a food:
// task names are what you type in full far more often than food names.
function typeRank(result) {
    return result.type === "focus" ? 0 : result.type === "task" ? 1 : 2;
}

// Foods, focus tasks and open list tasks matching the query, best first.
// foods: GritStore.foods (newest first). focusTasks: array of names.
// tasks: [{ task, listName }] already limited to what may be logged (the
// caller leaves out Bad tasks and done ones).
function search(query, foods, focusTasks, limit, tasks) {
    const results = [];

    for (const t of tasks ?? []) {
        const title = String(t?.task?.title ?? "").trim();
        if (!title)
            continue;
        const score = scoreMatch(title, query);
        if (score >= 0)
            results.push({ type: "task", name: title, task: t.task, listName: t.listName ?? "", score: score });
    }

    const seenTasks = new Set();
    for (const name of focusTasks ?? []) {
        const key = normalize(name);
        if (key.length === 0 || seenTasks.has(key))
            continue;
        seenTasks.add(key);
        const score = scoreMatch(name, query);
        if (score >= 0)
            results.push({ type: "focus", name: String(name).trim(), score: score });
    }

    // The library can hold the same food twice. Foods arrive newest first,
    // so the one kept is the latest. Same name with different calories is a
    // different food and both stay, each showing its kcal.
    const seenFoods = new Set();
    for (const food of foods ?? []) {
        if (!food || !food.name)
            continue;
        const key = normalize(food.name) + "|" + (food.calories ?? 0);
        if (seenFoods.has(key))
            continue;
        seenFoods.add(key);
        const score = scoreMatch(food.name, query);
        if (score >= 0)
            results.push({ type: "food", name: String(food.name).trim(), food: food, score: score });
    }

    results.sort((a, b) => a.score - b.score
        || typeRank(a) - typeRank(b)
        || a.name.length - b.name.length
        || a.name.localeCompare(b.name));
    return results.slice(0, limit ?? 8);
}

function isPaused(session) {
    return !!session && session.pausedAt !== undefined && session.pausedAt !== null;
}

// search | focus | focusDone | rest | restDone
function resolveMode(session, phaseOver) {
    if (!session)
        return "search";
    if (session.phase === "rest")
        return phaseOver ? "restDone" : "rest";
    return phaseOver ? "focusDone" : "focus";
}

// The actions offered in a mode, in button order, each with its key.
function actionsFor(mode, session) {
    const pauseOrResume = isPaused(session)
        ? { id: "resume", key: "r", label: "Resume", icon: "play_arrow" }
        : { id: "pause", key: "p", label: "Pause", icon: "pause" };

    switch (mode) {
    case "focus":
        return [
            pauseOrResume,
            { id: "saveEarly", key: "s", label: "Save early", icon: "check" },
            { id: "cancel", key: "c", label: "Cancel", icon: "close" }
        ];
    case "focusDone": {
        const list = [];
        if ((session?.restMin ?? 0) > 0)
            list.push({ id: "takeRest", key: "r", label: "Take rest", icon: "coffee" });
        list.push({ id: "save", key: "s", label: "Save", icon: "check" });
        list.push({ id: "goOn", key: "g", label: "Go without rest", icon: "fast_forward" });
        return list;
    }
    case "rest":
        return [
            pauseOrResume,
            { id: "skipRest", key: "s", label: "Skip rest", icon: "skip_next" },
            { id: "cancel", key: "c", label: "End session", icon: "close" }
        ];
    case "restDone":
        return [
            { id: "keepGoing", key: "g", label: "Keep going", icon: "play_arrow" },
            { id: "cancel", key: "c", label: "End session", icon: "close" }
        ];
    }
    return [];
}

// The letter a key press means on any layout. On the Russian or Kazakh layout
// the P key types "з", so the physical key is read from the scan code first.
// Qt on Wayland reports xkb keycodes, which are evdev codes + 8.
const SCANCODE_LETTERS = { 27: "r", 33: "p", 39: "s", 42: "g", 54: "c" };

function keyLetter(text, nativeScanCode) {
    const byCode = SCANCODE_LETTERS[nativeScanCode];
    if (byCode)
        return byCode;
    const t = String(text ?? "").toLowerCase();
    return /^[a-z]$/.test(t) ? t : "";
}

function actionForKey(actions, letter) {
    if (!letter)
        return null;
    return (actions ?? []).find(a => a.key === letter) ?? null;
}
