# Microsoft To-Do Layout + Custom Lists (keeping gamification)

**Date:** 2026-06-03
**Status:** Approved design — ready for implementation plan
**Approach:** A (additive) — leave the gamified `listType` enum and the XP/streak engine
intact; layer custom lists and two universal task flags on top.

## Goal

Reorganize EBOSH's navigation into a Microsoft To-Do style structure and let the user
create their own lists, while keeping the existing gamification (Must / Bad / Cool /
Impossible, XP, streaks, milestones) fully working. Visual design (clay style, tints,
typography) is unchanged — only **placement and structure** change.

### Sidebar order (desktop)

1. **My Day** (Sun icon)
2. **Important** (Star icon)
3. — divider —
4. **Must, Bad, Cool, Impossible** (the gamified group, unchanged icons/colors)
5. — divider —
6. **Custom lists** (user-created), then a **"+ New list"** action
7. Sound toggle pinned to the bottom (unchanged)

Every task — in any list — can be marked **Important** (star) and/or added to **My Day**
(sun).

## Non-goals

- No change to the clay visual design, colors, fonts, or animations.
- No subtasks, due dates, reminders, notes editor, or search (those remain future phases).
- No reordering/drag-and-drop of lists or tasks beyond what exists today.
- No remote sync changes; persistence stays local IndexedDB via Dexie.

## Data model (`src/lib/types.ts`)

### ListType gains a custom member

```ts
export type ListType = "must" | "bad" | "cool" | "impossible" | "custom";
```

### Task: two universal flags + a list pointer

Add to `Task`:

```ts
/** User flagged this task as Important (any list). Drives the Important view. */
important?: boolean;
/** Custom-list membership. Set only when listType === "custom". */
listId?: string;
```

`starredMyDay?: boolean` is **kept by name** (no migration) but its meaning is
**generalized**: it now means "manually pinned to My Day" for **any** task type, not just
Must. The sun button toggles it everywhere.

> Rationale for not renaming: `starredMyDay` is a non-indexed field; renaming would orphan
> the pin on existing/seeded records. Keeping the name is zero-risk. The slightly stale
> name is acceptable; a future cleanup can rename with a Dexie upgrade if desired.

### New entity: custom list

```ts
export interface CustomList {
  id: string;
  name: string;
  order: number;
  createdAt: number;
}
```

### XP for custom tasks

Custom-list tasks are **one-shot to-dos** (complete → archived, like Cool/Impossible), not
recurring habits. Each custom task carries a user-set `points` value (the XP awarded on
completion), **default 15**, editable in the Add-task form. Completing awards `points` and
archives the task; unchecking reverses via an append-only ledger entry (same pattern as
`achieve`/`unachieve`). No streaks, recurrence, or milestones for custom tasks.

`DEFAULT_POINTS` gains `custom: 15`. `LIST_META` gains a `custom` entry
(label "List", icon "ListChecks", blurb left generic — the real label shown is the custom
list's own name, see Views). `LIST_TINT` (`src/lib/tint.ts`) gains a `custom` tint reusing
neutral surface vars (e.g. `--surface` / `--primary`) so custom cards match the clay style.

### Ledger

`LedgerType` gains `"custom_complete"`. Completing a custom task adds a `custom_complete`
entry with `delta = points`; unchecking adds an `adjust` entry with `delta = -points`
(mirrors `uncompleteMust`/`unachieve`).

## Persistence (`src/lib/db.ts`, `src/lib/repository.ts`)

### Dexie schema → version(2)

Add a `lists` table; existing tables (`tasks`, `completions`, `ledger`, `settings`) are
unchanged and carried forward.

```ts
this.version(2).stores({
  tasks: "id, listType, order, archived, listId",
  completions: "id, taskId, date, [taskId+date]",
  ledger: "id, timestamp, type, taskId",
  settings: "id",
  lists: "id, order",
});
```

(`listId` added to the tasks index so a custom list's tasks can be queried directly; it is
additive and safe on upgrade.)

### Repository additions

- `listCustomLists(): Promise<CustomList[]>` — all lists sorted by `order`.
- `addCustomList(name: string): Promise<CustomList>` — `order = current count`, trims name,
  falls back to "Untitled list" if empty.
- `renameCustomList(id, name): Promise<void>`.
- `deleteCustomList(id): Promise<void>` — deletes the list **and** its tasks (and their
  completions), then leaves remaining list orders as-is (gaps are harmless).
- `addTask` input extended with optional `listId` and accepting `listType: "custom"`.
  Custom tasks default `points` to 15 when not provided and set no recurrence/penalty.
- `achieveCustom`/`unachieveCustom` — or generalize the existing `achieve`/`unachieve` to
  emit `custom_complete` when `listType === "custom"`. Generalizing is preferred (one code
  path): `achieve` uses ledger type `custom_complete` for custom, existing types otherwise.

## My Day & Important logic (`src/lib/schedule.ts`)

```ts
/** My Day: due Must tasks OR anything (any list) manually pinned via the sun. */
export function myDayTasks(tasks, day) {
  return tasks.filter(t =>
    !t.archived &&
    ((t.listType === "must" && isMustDue(t, day)) || t.starredMyDay));
}

/** Important: all non-archived tasks flagged important. */
export function importantTasks(tasks) {
  return tasks.filter(t => !t.archived && t.important);
}
```

## State (`src/lib/store.tsx`)

- Load custom lists in `refresh()` (alongside tasks) and expose `lists: CustomList[]`.
- New actions: `addList(name)`, `renameList(id, name)`, `removeList(id)`,
  `toggleImportant(task)`, and rename `toggleStar` → `toggleMyDay` (toggles `starredMyDay`).
- `addTask` already passes through to the repo; custom mode just supplies `listType:
  "custom"`, `listId`, and `points`.

## Routing (`src/lib/ui.tsx`)

`View` becomes:

```ts
export type View =
  | "myday" | "important" | "must" | "bad" | "cool" | "impossible"
  | `list:${string}`;   // custom list by id
```

A `list:<id>` view renders that custom list. Helper `parseListView(view)` returns the id or
null. Default view stays `"myday"`. When a custom list is deleted while active, the view
falls back to `"myday"`.

## Views (`src/components/Views.tsx`)

- **`MyDay`** — unchanged except `myDayTasks` now spans all list types; render each task
  with the appropriate card (`BadCard` for bad, `TaskCard` otherwise).
- **`ImportantList`** (new) — header "Important", lists `importantTasks(tasks)`, same
  card-by-type rendering, empty hint when none.
- **`PositiveList` / `BadList`** — unchanged.
- **`CustomListView`** (new) — header shows the custom list's **name** with a rename
  (inline edit) and delete (confirm) control; an `AddTask listType="custom" listId={id}`;
  then active task cards and an "Achieved" section (custom tasks archive on completion like
  Cool/Impossible).
- `Views` switch resolves `"important"` and `list:<id>` in addition to existing cases.

## Task cards (`src/components/TaskCard.tsx`, `BadCard.tsx`)

Both cards' hover-action cluster gains **two universal buttons** plus the existing Delete:

- **Star** → `toggleImportant(task)`; filled tint when `task.important`.
- **Sun** → `toggleMyDay(task)`; filled tint when `task.starredMyDay`.

This replaces the current Must-only `showStar` star (which previously meant "My Day"). The
`showStar` prop is removed; both buttons show on all cards. `TaskCard` handles custom tasks
by treating them like Cool/Impossible for the complete toggle (achieve/unachieve), showing
the `+points` badge.

## Add-task form (`src/components/AddTask.tsx`)

Add a `"custom"` mode (props gain optional `listId`). Custom mode shows the title field and,
in the expandable options, an **XP reward** number input (default 15) — no weekday picker,
no slip/penalty fields. On submit it calls `addTask({ listType: "custom", listId, title,
points })`.

## Custom-list creation UX (`src/components/Nav.tsx`)

The **"+ New list"** row, when clicked, reveals an inline text input in the sidebar
("Untitled list" placeholder). Enter (or blur with text) calls `addList(name)` and navigates
to the new `list:<id>` view; Escape cancels. An empty submit is ignored (no list created).

## Sidebar rendering (`src/components/Nav.tsx`)

- Render three groups with dividers: smart views (My Day, Important), gamified group (Must,
  Bad, Cool, Impossible), custom group (`lists` mapped to `list:<id>` buttons + New list).
- Active state and clay styling reuse the existing button markup. Custom list buttons use a
  neutral list icon (`ListChecks` or `List`) and the soft ink color.

### Mobile (`Nav.tsx`, `src/app/page.tsx`)

The fixed bottom nav can't hold arbitrary custom lists, so mobile switches to the
Microsoft-To-Do pattern: a **hamburger** button in the existing top `MobileBar` opens a
**slide-in drawer** that renders the *same* sidebar content (all three groups + New list +
sound toggle). Selecting an item closes the drawer. The current bottom nav is removed in
favor of the drawer (the reference screenshot has no bottom bar). Drawer state is local to
the Nav/Shell; it overlays with a scrim and respects safe-area insets.

## Edge cases

- Deleting a custom list while viewing it → view falls back to `"myday"`; its tasks +
  completions are removed.
- A task flagged Important and pinned to My Day appears in both smart views (expected).
- Bad tasks can be Important/My Day; they render as `BadCard` in those views.
- Custom task with `points` 0 is allowed (acts as a pure to-do).
- Day rollover unaffected; `starredMyDay` pins persist until the user unpins (matches
  current behavior).

## Testing

- `myDayTasks` / `importantTasks` unit tests: filters across all list types, archived
  excluded, due-Must auto-inclusion preserved.
- Repository tests: `addCustomList` ordering, `deleteCustomList` cascades to tasks +
  completions, `addTask` custom defaults (points 15), custom complete/uncomplete ledger
  deltas net to zero.
- Dexie v2 upgrade: opening an existing v1 DB preserves tasks and gains an empty `lists`
  table.
- Manual: create a list, add a custom task with custom XP, complete it (XP rises), star a
  Must task → appears in Important, sun a Cool task → appears in My Day, mobile drawer opens
  and navigates.

## File-by-file summary

| File | Change |
|------|--------|
| `src/lib/types.ts` | `ListType` += "custom"; `Task` += `important`, `listId`; `CustomList`; `DEFAULT_POINTS.custom = 15`; `LIST_META.custom`; `LedgerType` += "custom_complete" |
| `src/lib/tint.ts` | `LIST_TINT.custom` neutral tint |
| `src/lib/db.ts` | `lists` table; `version(2)`; `listId` index |
| `src/lib/repository.ts` | custom-list CRUD; `addTask` listId/custom; `achieve`/`unachieve` emit `custom_complete` for custom |
| `src/lib/schedule.ts` | generalize `myDayTasks`; add `importantTasks` |
| `src/lib/store.tsx` | expose `lists`; `addList`/`renameList`/`removeList`; `toggleImportant`; `toggleStar`→`toggleMyDay` |
| `src/lib/ui.tsx` | `View` += "important" and `list:${id}`; `parseListView` |
| `src/components/Nav.tsx` | three groups + dividers; New-list inline input; mobile hamburger + drawer |
| `src/components/Views.tsx` | `ImportantList`, `CustomListView`; switch updates; card-by-type in smart views |
| `src/components/TaskCard.tsx` | universal Star + Sun actions; handle custom tasks |
| `src/components/BadCard.tsx` | add Star + Sun actions |
| `src/components/AddTask.tsx` | custom mode (title + XP reward, default 15) |
| `src/app/page.tsx` | drawer wiring on mobile (Shell) |
| `src/lib/seed.ts` | (optional) seed one example custom list |
