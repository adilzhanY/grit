/**
 * Daily Log — six trackers in one tabbed view: Food, Sleep, Steps, Reading,
 * Focus (Pomodoro) and Weight. h/l switches tabs, a logs an entry, j/k + dd
 * navigate and delete history. The Focus tab drives the live session whose
 * countdown also shows in the status bar.
 */
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import {
  type DayLog,
  type DayLogKind,
  foodTotal,
  calorieGoals,
  ageFromBirthday,
  fmtMinutes,
  fmtXp,
  fmtWeight,
  unitToKg,
  focusRemainingMs,
  focusElapsed,
  fmtElapsed,
  logStreak,
} from "@grit/core";
import { useStore, useNow } from "../../store/store";
import { useUI } from "../ui";
import { theme } from "../theme";
import { applyMotion } from "../components/motion";

const TABS: { key: DayLogKind; label: string }[] = [
  { key: "food", label: "Food" },
  { key: "sleep", label: "Sleep" },
  { key: "steps", label: "Steps" },
  { key: "reading", label: "Reading" },
  { key: "focus", label: "Focus" },
  { key: "weight", label: "Weight" },
];

export function DailyLog() {
  const store = useStore();
  const ui = useUI();
  const now = useNow(1000);
  const [tab, setTab] = useState(0);
  const [hist, setHist] = useState(0);
  const [pending, setPending] = useState(false);
  const isActive = !ui.inputCaptured && ui.view === "dailylog";

  const kind = TABS[tab].key;
  const history = store.dayLogs.filter((l) => l.kind === kind);

  useInput(
    (input, key) => {
      // Tab navigation.
      if (input === "l" || key.rightArrow) {
        setTab((t) => (t + 1) % TABS.length);
        setHist(0);
        return;
      }
      if (input === "h" || key.leftArrow) {
        setTab((t) => (t - 1 + TABS.length) % TABS.length);
        setHist(0);
        return;
      }
      // History selection.
      const m = applyMotion(input, key, hist, history.length);
      if (m !== null) {
        setHist(m);
        setPending(false);
        return;
      }
      if (key.ctrl || key.meta) return;

      if (pending) {
        setPending(false);
        if (input === "d" && history[hist]) void store.removeDayLog(history[hist].id);
        return;
      }
      if (input === "d") return setPending(true);

      if (input === "a") return addFor(kind, store, ui);
      if (kind === "food" && input === "q") return quickFood(store, ui);
      if (kind === "food" && input === "e") return manageFoods(store, ui);

      // Focus controls.
      if (kind === "focus") handleFocusKey(input, store, now);
    },
    { isActive },
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box>
        {TABS.map((t, i) => (
          <Text key={t.key} color={i === tab ? theme.accent : theme.inkFaint} bold={i === tab}>
            {i === tab ? "▌" : " "}
            {t.label + "  "}
          </Text>
        ))}
        <Text color={theme.inkFaint}>{"  h/l tabs"}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Summary kind={kind} />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.inkSoft}>History</Text>
        {history.length === 0 ? (
          <Text color={theme.inkFaint}>Nothing logged yet. Press a to log.</Text>
        ) : (
          history.slice(0, 12).map((l, i) => (
            <HistRow key={l.id} log={l} selected={i === hist} unit={store.settings.weightUnit} />
          ))
        )}
      </Box>
      <Text color={theme.inkFaint}>
        {pending ? "d… (d delete)" : "a log · j/k history · dd delete" + (kind === "food" ? " · q quick-add · e edit/remove saved" : "")}
      </Text>
    </Box>
  );
}

function Summary({ kind }: { kind: DayLogKind }) {
  const store = useStore();
  const now = useNow(1000);
  const today = store.today;
  const todays = store.dayLogs.filter((l) => l.date === today && l.kind === kind);
  const days = store.dayLogs.filter((l) => l.kind === kind).map((l) => l.date);
  const streak = logStreak(days, today);

  if (kind === "food") {
    const eaten = foodTotal(todays, "calories");
    const burnt = store.dayLogs
      .filter((l) => l.date === today && l.kind === "steps")
      .reduce((s, l) => s + (l.caloriesBurnt ?? 0), 0);
    const net = eaten - burnt;
    const limit = store.settings.calorieLimit;
    const over = net > limit;
    const latestKg = [...store.dayLogs]
      .filter((l) => l.kind === "weight")
      .sort((a, b) => b.loggedAt - a.loggedAt)[0]?.weightKg;
    const goals = latestKg
      ? calorieGoals({
          weightKg: latestKg,
          heightCm: store.settings.heightCm,
          age: ageFromBirthday(store.settings.birthday, today),
          sex: store.settings.sex,
        })
      : null;
    return (
      <Box flexDirection="column">
        <Text>
          <Text color={over ? theme.warn : theme.done}>{`Net ${net}`}</Text>
          <Text color={theme.inkSoft}>{` / ${limit} kcal`}</Text>
          <Text color={theme.inkFaint}>{`   (eaten ${eaten} − burnt ${burnt})`}</Text>
        </Text>
        <Text color={theme.inkSoft}>
          {`P ${foodTotal(todays, "protein")}g · C ${foodTotal(todays, "carbs")}g · F ${foodTotal(todays, "fat")}g`}
        </Text>
        {goals ? (
          <Text color={theme.inkFaint}>
            {`goals — maintain ${goals.maintain} · lose ${goals.lose} · gain ${goals.gain}`}
          </Text>
        ) : (
          <Text color={theme.inkFaint}>log a weight to see calorie goals</Text>
        )}
      </Box>
    );
  }
  if (kind === "sleep") {
    const mins = todays.reduce((s, l) => s + (l.minutes ?? 0), 0);
    return <Text>{mins ? `Last logged: ${fmtMinutes(mins)} · streak ${streak.current} (best ${streak.best})` : `streak ${streak.current} (best ${streak.best})`}</Text>;
  }
  if (kind === "steps") {
    const all = store.dayLogs.filter((l) => l.kind === "steps");
    const steps = all.reduce((s, l) => s + (l.steps ?? 0), 0);
    const meters = all.reduce((s, l) => s + (l.meters ?? 0), 0);
    const burnt = all.reduce((s, l) => s + (l.caloriesBurnt ?? 0), 0);
    return (
      <Text color={theme.inkSoft}>
        {`Total ${steps.toLocaleString()} steps · ${meters.toLocaleString()} m · ${burnt.toLocaleString()} kcal burnt · streak ${streak.current}`}
      </Text>
    );
  }
  if (kind === "reading") {
    const total = store.dayLogs.filter((l) => l.kind === "reading").reduce((s, l) => s + (l.minutes ?? 0), 0);
    return <Text color={theme.inkSoft}>{`Total ${fmtMinutes(total)} read · streak ${streak.current} (best ${streak.best})`}</Text>;
  }
  if (kind === "weight") {
    const latest = [...store.dayLogs].filter((l) => l.kind === "weight").sort((a, b) => b.loggedAt - a.loggedAt)[0];
    return (
      <Text color={theme.inkSoft}>
        {latest?.weightKg != null
          ? `Latest: ${fmtWeight(latest.weightKg, store.settings.weightUnit)}  (a to log · :set weight kg|lbs)`
          : "No weight logged yet. Press a to log."}
      </Text>
    );
  }
  // focus
  const af = store.activeFocus;
  const todayFocus = store.dayLogs.filter((l) => l.kind === "focus" && l.date === today);
  const totalFocusMin = todayFocus.reduce((s, l) => s + (l.minutes ?? 0), 0);
  if (af) {
    const phase = af.phase === "focus" ? "Focus" : "Break";
    const alarm = focusElapsed(af, now);
    return (
      <Box flexDirection="column">
        <Text color={alarm ? theme.warn : theme.accent} bold>
          {alarm
            ? `⏰ ${phase} done!`
            : `${af.pausedAt != null ? "⏸ " : "● "}${phase} · ${fmtElapsed(focusRemainingMs(af, now))} left`}
          {af.label ? <Text color={theme.inkSoft}>{`  — ${af.label}`}</Text> : null}
        </Text>
        <Text color={theme.inkFaint}>
          {alarm
            ? af.phase === "focus"
              ? "b start break · f finish & stop"
              : "c keep going · f finish"
            : "space pause/resume · s save early · c cancel"}
        </Text>
        <Text color={theme.inkSoft}>{`Today: ${todayFocus.length} pomodoros · ${fmtMinutes(totalFocusMin)}`}</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      <Text color={theme.inkSoft}>{`Today: ${todayFocus.length} pomodoros · ${fmtMinutes(totalFocusMin)}`}</Text>
      <Text color={theme.inkFaint}>Press a to start a focus session.</Text>
    </Box>
  );
}

function HistRow({ log, selected, unit }: { log: DayLog; selected: boolean; unit: "kg" | "lbs" }) {
  const date = log.date;
  let desc = "";
  if (log.kind === "food") desc = `${log.name ?? "food"} · ${log.calories ?? 0} kcal`;
  else if (log.kind === "sleep") desc = fmtMinutes(log.minutes ?? 0);
  else if (log.kind === "steps")
    desc = `${log.steps ? `${log.steps} steps` : `${log.meters ?? 0} m`}${log.caloriesBurnt ? ` · ${log.caloriesBurnt} kcal` : ""}${log.activity === "run" ? " (run)" : ""}`;
  else if (log.kind === "reading") desc = `${fmtMinutes(log.minutes ?? 0)} read`;
  else if (log.kind === "focus") desc = `${fmtMinutes(log.minutes ?? 0)} focus${log.name ? ` · ${log.name}` : ""}`;
  else if (log.kind === "weight") desc = fmtWeight(log.weightKg ?? 0, unit);
  return (
    <Text color={selected ? theme.accent : theme.ink}>
      {selected ? "❯ " : "  "}
      <Text color={theme.inkFaint}>{date} </Text>
      {desc}
      <Text color={log.awardedXp >= 0 ? theme.done : theme.warn}>{`  ${fmtXp(log.awardedXp)}`}</Text>
    </Text>
  );
}

// ---- add flows ----

async function addFor(kind: DayLogKind, store: ReturnType<typeof useStore>, ui: ReturnType<typeof useUI>) {
  if (kind === "food") {
    const res = await ui.form({
      title: "Log food",
      fields: [
        { name: "name", label: "Name", placeholder: "e.g. oatmeal" },
        { name: "calories", label: "Calories", initial: "0" },
        { name: "protein", label: "Protein g", initial: "0" },
        { name: "carbs", label: "Carbs g", initial: "0" },
        { name: "fat", label: "Fat g", initial: "0" },
      ],
    });
    if (!res?.name) return;
    const input = {
      name: res.name,
      calories: Math.max(0, Math.round(Number(res.calories) || 0)),
      protein: Math.max(0, Math.round(Number(res.protein) || 0)),
      carbs: Math.max(0, Math.round(Number(res.carbs) || 0)),
      fat: Math.max(0, Math.round(Number(res.fat) || 0)),
    };
    const save = await ui.confirm({ title: "Save to your foods library?", confirmLabel: "save" });
    return store.logFood(input, save);
  }
  if (kind === "sleep") {
    const res = await ui.form({
      title: "Log sleep",
      fields: [
        { name: "h", label: "Hours", initial: "7" },
        { name: "m", label: "Minutes", initial: "30" },
      ],
    });
    if (!res) return;
    const mins = (Number(res.h) || 0) * 60 + (Number(res.m) || 0);
    if (mins > 0) return store.logSleep(mins);
    return;
  }
  if (kind === "steps") {
    const activity = await ui.choose({
      title: "Activity",
      items: [
        { label: "Walk", value: "walk" },
        { label: "Run", value: "run" },
        { label: "Just log burnt calories", value: "burnt" },
      ],
    });
    if (!activity) return;
    if (activity === "burnt") {
      const res = await ui.form({ title: "Log burnt calories", fields: [{ name: "kcal", label: "kcal", initial: "0" }] });
      if (!res) return;
      return store.logSteps({ caloriesBurnt: Math.max(0, Math.round(Number(res.kcal) || 0)) });
    }
    const mode = await ui.choose({
      title: "Measure by",
      items: [
        { label: "Steps", value: "steps" },
        { label: "Meters", value: "meters" },
      ],
    });
    if (!mode) return;
    const res = await ui.form({
      title: `Log ${activity}`,
      fields: [
        { name: "amount", label: mode === "steps" ? "Steps" : "Meters", initial: "0" },
        { name: "minutes", label: "Minutes", initial: "0" },
      ],
    });
    if (!res) return;
    const amount = Math.max(0, Math.round(Number(res.amount) || 0));
    const minutes = Math.max(0, Math.round(Number(res.minutes) || 0));
    return store.logSteps({
      [mode]: amount,
      minutes: minutes || undefined,
      activity: activity as "walk" | "run",
    });
  }
  if (kind === "reading") {
    const v = await ui.prompt({ label: "Minutes read", initial: "30" });
    const mins = Math.max(0, Math.round(Number(v) || 0));
    if (mins > 0) return store.logReading(mins);
    return;
  }
  if (kind === "weight") {
    const v = await ui.prompt({ label: `Weight (${store.settings.weightUnit})`, placeholder: "e.g. 82.4" });
    const val = Number(v);
    if (v && val > 0) return store.logWeight(unitToKg(val, store.settings.weightUnit));
    return;
  }
  if (kind === "focus") {
    const preset = await ui.choose({
      title: "Focus preset",
      items: [
        { label: "Classic", value: "25/5", hint: "25 min focus · 5 min break" },
        { label: "Deep", value: "50/10", hint: "50 min focus · 10 min break" },
        { label: "Custom", value: "custom" },
      ],
    });
    if (!preset) return;
    let focusMin = 25;
    let restMin = 5;
    if (preset === "50/10") {
      focusMin = 50;
      restMin = 10;
    } else if (preset === "custom") {
      const res = await ui.form({
        title: "Custom session",
        fields: [
          { name: "focus", label: "Focus min", initial: "25" },
          { name: "rest", label: "Break min", initial: "5" },
        ],
      });
      if (!res) return;
      focusMin = Math.max(1, Math.round(Number(res.focus) || 25));
      restMin = Math.max(0, Math.round(Number(res.rest) || 5));
    }
    const label = await ui.prompt({ label: "Focus on (optional)", placeholder: "e.g. Learn German" });
    return store.startFocusSession(focusMin, restMin, label ?? undefined);
  }
}

function quickFood(store: ReturnType<typeof useStore>, ui: ReturnType<typeof useUI>) {
  void (async () => {
    if (store.foods.length === 0) return ui.notify("No saved foods yet. Log one and choose 'save'.");
    const id = await ui.choose({
      title: "Quick-add saved food",
      items: store.foods.map((f) => ({ label: f.name, value: f.id, hint: `${f.calories} kcal` })),
    });
    if (!id) return;
    const f = store.foods.find((x) => x.id === id);
    if (f) await store.logFood({ name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat });
  })();
}

/** Manage the saved-foods library: edit or remove an entry. */
function manageFoods(store: ReturnType<typeof useStore>, ui: ReturnType<typeof useUI>) {
  void (async () => {
    if (store.foods.length === 0) return ui.notify("No saved foods yet. Log one and choose 'save'.");
    const id = await ui.choose({
      title: "Saved foods",
      items: store.foods.map((f) => ({ label: f.name, value: f.id, hint: `${f.calories} kcal` })),
    });
    if (!id) return;
    const f = store.foods.find((x) => x.id === id);
    if (!f) return;
    const action = await ui.choose({
      title: f.name,
      items: [
        { label: "Edit", value: "edit" },
        { label: "Remove from saved", value: "delete" },
      ],
    });
    if (action === "delete") {
      const ok = await ui.confirm({ title: `Remove "${f.name}" from saved foods?`, danger: true, confirmLabel: "remove" });
      if (ok) {
        await store.removeFood(f.id);
        ui.notify(`Removed "${f.name}" from saved foods.`);
      }
    } else if (action === "edit") {
      const res = await ui.form({
        title: `Edit ${f.name}`,
        fields: [
          { name: "name", label: "Name", initial: f.name },
          { name: "calories", label: "Calories", initial: String(f.calories) },
          { name: "protein", label: "Protein g", initial: String(f.protein) },
          { name: "carbs", label: "Carbs g", initial: String(f.carbs) },
          { name: "fat", label: "Fat g", initial: String(f.fat) },
        ],
      });
      if (res?.name) {
        await store.updateFood(f.id, {
          name: res.name,
          calories: Math.max(0, Math.round(Number(res.calories) || 0)),
          protein: Math.max(0, Math.round(Number(res.protein) || 0)),
          carbs: Math.max(0, Math.round(Number(res.carbs) || 0)),
          fat: Math.max(0, Math.round(Number(res.fat) || 0)),
        });
      }
    }
  })();
}

function handleFocusKey(input: string, store: ReturnType<typeof useStore>, now: number) {
  const af = store.activeFocus;
  if (!af) return;
  const alarm = focusElapsed(af, now);
  if (alarm) {
    if (af.phase === "focus") {
      if (input === "b") void store.finishFocusSession(true);
      if (input === "f") void store.finishFocusSession(false);
    } else {
      if (input === "c") void store.continueFocusSession();
      if (input === "f") void store.cancelFocusSession();
    }
    return;
  }
  if (input === " ") void (af.pausedAt != null ? store.resumeFocusSession() : store.pauseFocusSession());
  if (input === "s") void store.saveFocusSession();
  if (input === "c") void store.cancelFocusSession();
}
