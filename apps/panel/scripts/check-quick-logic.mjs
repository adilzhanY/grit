// node scripts/check-quick-logic.mjs : checks GritSearch's ranking (Grit in the Super launcher)
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../services/grit/GritQuickLogic.js", import.meta.url), "utf8").replace(".pragma library", "");
const L = new Function(src + "; return { search, scoreMatch };")();
const assert = (ok, msg) => { if (!ok) { console.error("FAIL", msg); process.exitCode = 1; } };

const tasks = [
    { task: { id: "a", title: "Read 30 pages" }, listName: "Must" },
    { task: { id: "b", title: "Refactor grit" }, listName: "Work" },
];
const foods = [{ name: "Rice", calories: 200 }];

assert(L.search("", foods, ["Reading"], 8, tasks).length === 0, "empty query shows nothing");
const r = L.search("r", foods, ["Reading"], 8, tasks);
assert(r.some(x => x.type === "task" && x.task.id === "a" && x.listName === "Must"), "task found with its list");
assert(r[0].type === "focus", "focus task first on equal score");
assert(r.findIndex(x => x.type === "task") < r.findIndex(x => x.type === "food"), "tasks before foods on equal score");
assert(L.search("refactor", foods, [], 8, tasks)[0].task.id === "b", "exact prefix match wins");
assert(L.search("rice", foods, [], 8).length === 1, "still works without tasks");
console.log(process.exitCode ? "quick logic: FAILED" : "quick logic: ok");
