/**
 * UI context: navigation + the modal overlay system. Every text entry, choice,
 * and confirmation in GritTUI goes through a promise-based overlay (prompt /
 * form / choose / confirm) so views never manage their own input widgets — they
 * just `await ui.prompt(...)`. Search and the command palette are overlays too.
 * While any overlay is open, `inputCaptured` is true and view-level key handlers
 * stand down, so there's never a key-routing conflict.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Box, Text, useInput } from "ink";
import Fuse from "fuse.js";
import { useStore } from "../store/store";
import { theme } from "./theme";
import { TextInput } from "./components/TextInput";

export type ViewId =
  | "myday"
  | "important"
  | "planned"
  | "dailylog"
  | "must"
  | "bad"
  | "cool"
  | "impossible"
  | "analytics"
  | `list:${string}`;

export interface NavItem {
  id: ViewId;
  label: string;
  color: string;
  num?: number;
}

export interface FormField {
  name: string;
  label: string;
  initial?: string;
  placeholder?: string;
}
export interface ChooseItem {
  label: string;
  value: string;
  hint?: string;
}

type Overlay =
  | { type: "prompt"; label: string; initial: string; placeholder?: string; mask?: boolean; resolve: (v: string | null) => void }
  | { type: "form"; title: string; fields: FormField[]; resolve: (v: Record<string, string> | null) => void }
  | { type: "choose"; title: string; items: ChooseItem[]; resolve: (v: string | null) => void }
  | { type: "confirm"; title: string; message?: string; confirmLabel?: string; danger?: boolean; resolve: (v: boolean) => void }
  | { type: "search" }
  | { type: "command" }
  | { type: "fuzzy" }
  | { type: "help" };

export interface UI {
  view: ViewId;
  setView: (v: ViewId) => void;
  nav: NavItem[];
  /** Move to the next/previous nav entry (Tab / Shift-Tab). */
  cycleView: (dir: 1 | -1) => void;
  filter: string;
  inputCaptured: boolean;
  modeLabel: string;
  status: string | null;
  notify: (msg: string | null) => void;
  prompt: (o: { label: string; initial?: string; placeholder?: string; mask?: boolean }) => Promise<string | null>;
  form: (o: { title: string; fields: FormField[] }) => Promise<Record<string, string> | null>;
  choose: (o: { title: string; items: ChooseItem[] }) => Promise<string | null>;
  confirm: (o: { title: string; message?: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
  openSearch: () => void;
  openCommand: () => void;
  openFuzzy: () => void;
  openHelp: () => void;
  clearFilter: () => void;
}

const Ctx = createContext<UI | null>(null);
export function useUI(): UI {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUI must be used within UIProvider");
  return v;
}

export function UIProvider({
  onSignOut,
  onQuit,
  children,
}: {
  onSignOut: () => void;
  onQuit: () => void;
  children: ReactNode;
}) {
  const store = useStore();
  const [view, setView] = useState<ViewId>("myday");
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);

  const nav = useMemo<NavItem[]>(() => {
    const base: NavItem[] = [
      { id: "myday", label: "My Day", color: theme.primary, num: 1 },
      { id: "important", label: "Important", color: theme.primary, num: 2 },
      { id: "planned", label: "Planned", color: theme.primary, num: 3 },
      { id: "dailylog", label: "Daily Log", color: theme.primary, num: 4 },
      { id: "must", label: "Must", color: theme.must, num: 5 },
      { id: "bad", label: "Bad", color: theme.bad, num: 6 },
      { id: "cool", label: "Cool", color: theme.cool, num: 7 },
      { id: "impossible", label: "Impossible", color: theme.impossible, num: 8 },
      { id: "analytics", label: "Analytics", color: theme.primary },
    ];
    for (const l of store.lists) {
      base.push({ id: `list:${l.id}`, label: l.name, color: theme.custom });
    }
    return base;
  }, [store.lists]);

  const cycleView = useCallback(
    (dir: 1 | -1) => {
      setView((cur) => {
        const i = nav.findIndex((n) => n.id === cur);
        const next = (i + dir + nav.length) % nav.length;
        return nav[next].id;
      });
      setFilter("");
    },
    [nav],
  );

  const notify = useCallback((msg: string | null) => setStatus(msg), []);
  const clearFilter = useCallback(() => setFilter(""), []);

  const close = useCallback(() => setOverlay(null), []);

  const prompt = useCallback<UI["prompt"]>(
    (o) =>
      new Promise((resolve) => {
        setOverlay({
          type: "prompt",
          label: o.label,
          initial: o.initial ?? "",
          placeholder: o.placeholder,
          mask: o.mask,
          resolve: (v) => {
            close();
            resolve(v);
          },
        });
      }),
    [close],
  );

  const form = useCallback<UI["form"]>(
    (o) =>
      new Promise((resolve) => {
        setOverlay({
          type: "form",
          title: o.title,
          fields: o.fields,
          resolve: (v) => {
            close();
            resolve(v);
          },
        });
      }),
    [close],
  );

  const choose = useCallback<UI["choose"]>(
    (o) =>
      new Promise((resolve) => {
        setOverlay({
          type: "choose",
          title: o.title,
          items: o.items,
          resolve: (v) => {
            close();
            resolve(v);
          },
        });
      }),
    [close],
  );

  const confirm = useCallback<UI["confirm"]>(
    (o) =>
      new Promise((resolve) => {
        setOverlay({
          type: "confirm",
          title: o.title,
          message: o.message,
          confirmLabel: o.confirmLabel,
          danger: o.danger,
          resolve: (v) => {
            close();
            resolve(v);
          },
        });
      }),
    [close],
  );

  const openSearch = useCallback(() => setOverlay({ type: "search" }), []);
  const openCommand = useCallback(() => setOverlay({ type: "command" }), []);
  const openFuzzy = useCallback(() => setOverlay({ type: "fuzzy" }), []);
  const openHelp = useCallback(() => setOverlay({ type: "help" }), []);

  const modeLabel = !overlay
    ? "NORMAL"
    : overlay.type === "search"
      ? "SEARCH"
      : overlay.type === "command"
        ? "COMMAND"
        : overlay.type === "prompt" || overlay.type === "form"
          ? "INSERT"
          : overlay.type.toUpperCase();

  const ui: UI = {
    view,
    setView: (v) => {
      setView(v);
      setFilter("");
    },
    nav,
    cycleView,
    filter,
    inputCaptured: overlay !== null,
    modeLabel,
    status,
    notify,
    prompt,
    form,
    choose,
    confirm,
    openSearch,
    openCommand,
    openFuzzy,
    openHelp,
    clearFilter,
  };

  return (
    <Ctx.Provider value={ui}>
      {children}
      {overlay && (
        <OverlayLayer
          overlay={overlay}
          ui={ui}
          setFilter={setFilter}
          close={close}
          onSignOut={onSignOut}
          onQuit={onQuit}
        />
      )}
    </Ctx.Provider>
  );
}

// ---------------- Overlay rendering ----------------

function OverlayLayer({
  overlay,
  ui,
  setFilter,
  close,
  onSignOut,
  onQuit,
}: {
  overlay: Overlay;
  ui: UI;
  setFilter: (v: string) => void;
  close: () => void;
  onSignOut: () => void;
  onQuit: () => void;
}) {
  switch (overlay.type) {
    case "prompt":
      return <PromptOverlay overlay={overlay} />;
    case "form":
      return <FormOverlay overlay={overlay} />;
    case "choose":
      return <ChooseOverlay overlay={overlay} />;
    case "confirm":
      return <ConfirmOverlay overlay={overlay} />;
    case "search":
      return <SearchOverlay filter={ui.filter} setFilter={setFilter} close={close} />;
    case "command":
      return <CommandOverlay ui={ui} close={close} onSignOut={onSignOut} onQuit={onQuit} />;
    case "fuzzy":
      return <FuzzyOverlay ui={ui} close={close} />;
    case "help":
      return <HelpOverlay close={close} />;
  }
}

function Panel({ title, color, children }: { title: string; color?: string; children: ReactNode }) {
  return (
    <Box borderStyle="round" borderColor={color ?? theme.primary} flexDirection="column" paddingX={1}>
      <Text bold color={color ?? theme.primary}>
        {title}
      </Text>
      {children}
    </Box>
  );
}

function PromptOverlay({ overlay }: { overlay: Extract<Overlay, { type: "prompt" }> }) {
  const [value, setValue] = useState(overlay.initial);
  return (
    <Panel title={overlay.label}>
      <Box>
        <Text color={theme.accent}>{"› "}</Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={(v) => overlay.resolve(v.trim() ? v : null)}
          onCancel={() => overlay.resolve(null)}
          placeholder={overlay.placeholder}
          mask={overlay.mask}
        />
      </Box>
      <Text color={theme.inkFaint}>enter save · esc cancel</Text>
    </Panel>
  );
}

function FormOverlay({ overlay }: { overlay: Extract<Overlay, { type: "form" }> }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(overlay.fields.map((f) => [f.name, f.initial ?? ""])),
  );
  const [idx, setIdx] = useState(0);

  const submit = () => overlay.resolve(values);

  // Field navigation lives here; the active field's TextInput ignores ↑↓/Tab.
  useInput((_input, key) => {
    if (key.upArrow) setIdx((i) => Math.max(0, i - 1));
    if (key.downArrow || key.tab) setIdx((i) => Math.min(overlay.fields.length - 1, i + 1));
  });

  return (
    <Panel title={overlay.title}>
      {overlay.fields.map((f, i) => (
        <Box key={f.name}>
          <Box width={14}>
            <Text color={i === idx ? theme.accent : theme.inkSoft}>
              {i === idx ? "› " : "  "}
              {f.label}
            </Text>
          </Box>
          {i === idx ? (
            <TextInput
              value={values[f.name]}
              onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))}
              placeholder={f.placeholder}
              onSubmit={() => {
                if (idx < overlay.fields.length - 1) setIdx(idx + 1);
                else submit();
              }}
              onCancel={() => overlay.resolve(null)}
            />
          ) : (
            <Text color={theme.ink}>
              {values[f.name] || <Text color={theme.inkFaint}>{f.placeholder ?? "—"}</Text>}
            </Text>
          )}
        </Box>
      ))}
      <Text color={theme.inkFaint}>enter next/save · ↑↓/tab field · esc cancel</Text>
    </Panel>
  );
}

function ChooseOverlay({ overlay }: { overlay: Extract<Overlay, { type: "choose" }> }) {
  const [sel, setSel] = useState(0);
  useInput((input, key) => {
    if (key.escape) return overlay.resolve(null);
    if (key.return) return overlay.resolve(overlay.items[sel]?.value ?? null);
    if (key.downArrow || input === "j") setSel((s) => Math.min(overlay.items.length - 1, s + 1));
    if (key.upArrow || input === "k") setSel((s) => Math.max(0, s - 1));
  });
  return (
    <Panel title={overlay.title}>
      {overlay.items.map((it, i) => (
        <Text key={it.value} color={i === sel ? theme.accent : theme.ink}>
          {i === sel ? "❯ " : "  "}
          {it.label}
          {it.hint ? <Text color={theme.inkFaint}>{"  " + it.hint}</Text> : null}
        </Text>
      ))}
      <Text color={theme.inkFaint}>j/k move · enter select · esc cancel</Text>
    </Panel>
  );
}

function ConfirmOverlay({ overlay }: { overlay: Extract<Overlay, { type: "confirm" }> }) {
  useInput((input, key) => {
    if (key.escape || input === "n") return overlay.resolve(false);
    if (key.return || input === "y") return overlay.resolve(true);
  });
  const color = overlay.danger ? theme.warn : theme.primary;
  return (
    <Panel title={overlay.title} color={color}>
      {overlay.message ? <Text color={theme.inkSoft}>{overlay.message}</Text> : null}
      <Text color={theme.inkFaint}>
        <Text color={color}>y</Text> {overlay.confirmLabel ?? "confirm"} · <Text>n/esc</Text> cancel
      </Text>
    </Panel>
  );
}

function SearchOverlay({
  filter,
  setFilter,
  close,
}: {
  filter: string;
  setFilter: (v: string) => void;
  close: () => void;
}) {
  return (
    <Panel title="Search" color={theme.accent}>
      <Box>
        <Text color={theme.accent}>{"/ "}</Text>
        <TextInput
          value={filter}
          onChange={setFilter}
          onSubmit={() => close()}
          onCancel={() => {
            setFilter("");
            close();
          }}
          placeholder="filter this list…"
        />
      </Box>
      <Text color={theme.inkFaint}>enter keep filter · esc clear</Text>
    </Panel>
  );
}

const COMMANDS: { name: string; alias?: string[]; hint: string }[] = [
  { name: "myday", hint: "go to My Day" },
  { name: "important", hint: "go to Important" },
  { name: "planned", hint: "go to Planned" },
  { name: "log", alias: ["dailylog"], hint: "go to Daily Log (log <tab>)" },
  { name: "must", hint: "go to Must" },
  { name: "bad", hint: "go to Bad" },
  { name: "cool", hint: "go to Cool" },
  { name: "impossible", hint: "go to Impossible" },
  { name: "analytics", hint: "go to Analytics" },
  { name: "set", hint: "set limit|weight|sound|height|sex|birthday <v>" },
  { name: "export", hint: "write a backup file" },
  { name: "import", hint: "import <path>" },
  { name: "sync", hint: "sync now" },
  { name: "resetxp", hint: "wipe the XP ledger" },
  { name: "signout", hint: "sign out" },
  { name: "help", hint: "keybindings" },
  { name: "q", alias: ["quit"], hint: "quit GritTUI" },
];

function CommandOverlay({
  ui,
  close,
  onSignOut,
  onQuit,
}: {
  ui: UI;
  close: () => void;
  onSignOut: () => void;
  onQuit: () => void;
}) {
  const store = useStore();
  const [value, setValue] = useState("");

  const run = async (raw: string) => {
    close();
    const [cmd, ...rest] = raw.trim().split(/\s+/);
    const arg = rest.join(" ");
    const c = cmd?.toLowerCase();
    const go = (v: ViewId) => ui.setView(v);
    switch (c) {
      case "myday":
        return go("myday");
      case "important":
        return go("important");
      case "planned":
        return go("planned");
      case "log":
      case "dailylog":
        return go("dailylog");
      case "must":
        return go("must");
      case "bad":
        return go("bad");
      case "cool":
        return go("cool");
      case "impossible":
        return go("impossible");
      case "analytics":
        return go("analytics");
      case "sync":
        ui.notify("Syncing…");
        await store.syncNow();
        return ui.notify("Synced.");
      case "export": {
        const path = await store.exportBackup(arg || undefined);
        return ui.notify(`Backup written: ${path}`);
      }
      case "import": {
        if (!arg) return ui.notify("Usage: import <path>");
        try {
          const n = await store.importBackup(arg);
          return ui.notify(`Restored ${n} rows.`);
        } catch (e) {
          return ui.notify(e instanceof Error ? e.message : "Import failed.");
        }
      }
      case "resetxp":
        await store.resetXp();
        return ui.notify("XP ledger wiped.");
      case "set":
        return runSet(store, ui, rest);
      case "signout":
        return onSignOut();
      case "help":
        return ui.openHelp();
      case "q":
      case "quit":
        return onQuit();
      default:
        return ui.notify(`Unknown command: ${cmd}`);
    }
  };

  const matches = COMMANDS.filter(
    (cmd) =>
      !value ||
      cmd.name.startsWith(value.toLowerCase()) ||
      cmd.alias?.some((a) => a.startsWith(value.toLowerCase())),
  ).slice(0, 8);

  return (
    <Panel title="Command" color={theme.primary}>
      <Box>
        <Text color={theme.primary}>{": "}</Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={(v) => void run(v)}
          onCancel={close}
          placeholder="type a command…"
        />
      </Box>
      {matches.map((m) => (
        <Text key={m.name} color={theme.inkSoft}>
          {"  "}
          <Text color={theme.ink}>{m.name}</Text>
          <Text color={theme.inkFaint}>{"  " + m.hint}</Text>
        </Text>
      ))}
      <Text color={theme.inkFaint}>enter run · esc cancel</Text>
    </Panel>
  );
}

async function runSet(
  store: ReturnType<typeof useStore>,
  ui: UI,
  rest: string[],
): Promise<void> {
  const [key, ...vals] = rest;
  const val = vals.join(" ");
  switch ((key ?? "").toLowerCase()) {
    case "limit":
      await store.setCalorieLimit(Number(val) || 0);
      return ui.notify(`Calorie limit: ${Number(val) || 0}`);
    case "weight":
      if (val === "kg" || val === "lbs") {
        await store.setWeightUnit(val);
        return ui.notify(`Weight unit: ${val}`);
      }
      return ui.notify("Usage: set weight kg|lbs");
    case "sound":
      await store.setSoundsEnabled(val === "on");
      return ui.notify(`Sounds: ${val === "on" ? "on" : "off"}`);
    case "height":
      await store.setProfile({ heightCm: Number(val) || store.settings.heightCm });
      return ui.notify(`Height: ${Number(val)} cm`);
    case "sex":
      if (val === "male" || val === "female") {
        await store.setProfile({ sex: val });
        return ui.notify(`Sex: ${val}`);
      }
      return ui.notify("Usage: set sex male|female");
    case "birthday":
      await store.setProfile({ birthday: val });
      return ui.notify(`Birthday: ${val}`);
    default:
      return ui.notify("set limit|weight|sound|height|sex|birthday <value>");
  }
}

function FuzzyOverlay({ ui, close }: { ui: UI; close: () => void }) {
  const store = useStore();
  const [value, setValue] = useState("");
  const [sel, setSel] = useState(0);

  const items = useMemo(() => {
    const out: { label: string; kind: string; go: () => void }[] = [];
    for (const t of store.tasks) {
      if (t.archived) continue;
      const navTarget: ViewId =
        t.listType === "custom" && t.listId
          ? (`list:${t.listId}` as ViewId)
          : t.listType === "must"
            ? "must"
            : t.listType === "bad"
              ? "bad"
              : t.listType === "cool"
                ? "cool"
                : t.listType === "impossible"
                  ? "impossible"
                  : "myday";
      out.push({ label: t.title, kind: t.listType, go: () => ui.setView(navTarget) });
    }
    for (const l of store.lists)
      out.push({ label: l.name, kind: "list", go: () => ui.setView(`list:${l.id}`) });
    for (const f of store.foods)
      out.push({ label: f.name, kind: "food", go: () => ui.setView("dailylog") });
    return out;
  }, [store.tasks, store.lists, store.foods, ui]);

  const fuse = useMemo(() => new Fuse(items, { keys: ["label"], threshold: 0.4 }), [items]);
  const results = value ? fuse.search(value).map((r) => r.item).slice(0, 10) : items.slice(0, 10);

  useInput((input, key) => {
    if (key.downArrow) setSel((s) => Math.min(results.length - 1, s + 1));
    if (key.upArrow) setSel((s) => Math.max(0, s - 1));
  });

  return (
    <Panel title="Jump to…" color={theme.accent}>
      <Box>
        <Text color={theme.accent}>{"⌕ "}</Text>
        <TextInput
          value={value}
          onChange={(v) => {
            setValue(v);
            setSel(0);
          }}
          onSubmit={() => {
            results[sel]?.go();
            close();
          }}
          onCancel={close}
          placeholder="search tasks, lists, foods…"
        />
      </Box>
      {results.map((r, i) => (
        <Text key={i} color={i === sel ? theme.accent : theme.ink}>
          {i === sel ? "❯ " : "  "}
          {r.label}
          <Text color={theme.inkFaint}>{"  " + r.kind}</Text>
        </Text>
      ))}
      <Text color={theme.inkFaint}>↑↓ move · enter jump · esc cancel</Text>
    </Panel>
  );
}

function HelpOverlay({ close }: { close: () => void }) {
  useInput(() => close());
  const rows: [string, string][] = [
    ["j / k  ↓ ↑", "move selection"],
    ["g / G", "top / bottom"],
    ["Tab / S-Tab", "next / prev view"],
    ["1–8", "jump to a view"],
    ["space / x", "complete / achieve / toggle"],
    ["a", "add a task / log entry"],
    ["s", "add subtask (tasks)"],
    ["enter / o", "expand subtasks / drill in"],
    ["c then c / p", "rename / change XP"],
    ["d then d", "delete (confirm)"],
    ["* / p", "important / pin to My Day"],
    ["! (bad)", "I slipped"],
    ["/", "search/filter this list"],
    ["Ctrl-p", "global jump (tasks/lists/foods)"],
    [":", "command palette"],
    ["?", "this help"],
    [": q", "quit"],
  ];
  return (
    <Panel title="GritTUI — keybindings" color={theme.primary}>
      {rows.map(([k, v]) => (
        <Box key={k}>
          <Box width={16}>
            <Text color={theme.accent}>{k}</Text>
          </Box>
          <Text color={theme.ink}>{v}</Text>
        </Box>
      ))}
      <Text color={theme.inkFaint}>press any key to close</Text>
    </Panel>
  );
}
