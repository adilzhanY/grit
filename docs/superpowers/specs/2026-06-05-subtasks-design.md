# Subtasks — Design

Date: 2026-06-05
Status: Approved

## Summary

Any positive task (must, cool, impossible, custom) can be broken into subtasks.
Subtasks render as a Reddit-thread-style indented list under the parent card,
connected by curved lines, collapsible with an FAQ-style animation. The parent
is done only when all subtasks are done, and the parent's XP is distributed
across its subtasks. Bad tasks are excluded (no checkbox semantics).

## Data model

Embedded array on `Task` — no Dexie schema migration (unindexed field):

```ts
interface Subtask {
  id: string;
  title: string;
  /** When completed. For Must tasks, counts as done only if it's today. */
  doneAt?: number;
  /** XP actually awarded on completion, so undo reverses the exact amount. */
  awardedXp?: number;
}

interface Task {
  // ...existing fields...
  subtasks?: Subtask[];
}
```

Done-ness:

- One-shot tasks (cool, impossible, custom): subtask done iff `doneAt` exists.
- Must tasks: subtask done **today** iff `localDay(doneAt) === today`. Daily
  reset falls out of the comparison — no cleanup job, no per-day rows.

Subtasks are not full tasks: no star, no My Day, no notes. They cannot leak
into Important/My Day views because they are not rows in the `tasks` table.

## XP distribution

The parent's `points` is a fixed budget shared by its subtasks. Once at least
one subtask exists, the parent itself awards **0 extra XP**.

- Share for each *undone* subtask = remaining pool split evenly:
  `pool = points − sum(awardedXp of subtasks done [today, for must])`,
  divided by the undone count, integer remainder distributed to the earliest
  undone subtasks. Examples: 20 XP / 2 subtasks → 10 + 10; 20 / 3 → 7 + 7 + 6;
  1 subtask → full 20.
- The displayed badge on each undone subtask uses the same allocation function
  as the award, so what you see is what you get. Done subtasks display their
  stored `awardedXp`.
- The last subtask to complete always receives exactly the remaining pool, so
  the total awarded always equals the parent's `points` — even if subtasks
  were added or removed mid-flight.
- Completing a subtask appends a ledger entry of the parent's normal type
  (`must_complete` / `cool_achieve` / `impossible_achieve` / `custom_complete`)
  with `delta = share`, `taskId = parent.id`, `meta = "<parent> · <subtask>"`.
- Un-checking a done subtask appends an `adjust` entry with
  `delta = −awardedXp` and clears `doneAt`/`awardedXp`. If the parent was done,
  it is un-completed too (completion record removed / un-archived) with no
  further XP change.

## Parent completion

- Parent is done only when **all** subtasks are done (4 of 5 done → parent
  undone). When the last subtask completes, the parent auto-completes with
  **0 XP**: Must gets its `Completion` row for the day (so streak/“done today”
  logic keeps working); one-shot tasks get `archived: true` + `achievedAt`.
  The completion sound/celebration plays at that moment. The parent then moves
  to the Done/Achieved section exactly like any done task.
- Clicking the parent's check button when subtasks exist is a shortcut: it
  completes all remaining subtasks (awarding their shares), then the parent.
  Un-checking the parent un-checks all subtasks and reverses their XP.

## UI (TaskCard)

- **Add subtask**: small icon button in the existing hover-actions row
  (alongside Star/Sun/Trash). Clicking expands the thread and focuses a
  **smaller text input** rendered below the card, indented and connected to
  the parent by a curved line. A **plus button** sits next to the input;
  Enter or plus adds the subtask and keeps the input focused for rapid entry.
- **Curved connector** (Reddit-thread style): a CSS element with a left border
  and bottom border plus a rounded bottom-left corner, one per subtask row and
  for the input row.
- **Subtask row**: smaller check button, title (line-through when done), its
  +XP share badge, delete button on hover.
- **Chevron**: once ≥1 subtask exists, the parent card shows a chevron button
  with a `done/total` progress count (e.g. `2/5`). Clicking toggles the thread
  with the FAQ-style smooth animation: wrapper with
  `display: grid; grid-template-rows: 0fr ↔ 1fr; transition` and an
  `overflow-hidden` inner — no JS height measuring.
- Parent check button derives its state: filled when all subtasks done; a
  subtle partial indicator (ring) when some are done.
- Adding a subtask auto-expands the thread.

## Code changes

| File | Change |
|---|---|
| `src/lib/types.ts` | `Subtask` interface; `subtasks?: Subtask[]` on `Task` |
| `src/lib/repository.ts` | `addSubtask`, `deleteSubtask`, `toggleSubtask` (share calc, ledger entries, parent auto-complete/uncomplete), shared allocation helper `subtaskShares(task, today)` |
| `src/lib/store.tsx` | expose `addSubtask` / `deleteSubtask` / `toggleSubtask` actions + refresh |
| `src/components/TaskCard.tsx` | chevron + progress, thread rendering, subtask rows, add-input (extracted as a `Subtasks`/thread sub-component) |

## Edge cases

- Deleting an undone subtask: shares recompute from the remaining pool.
- Deleting a done subtask: its awarded XP stays (no clawback); pool recomputes.
- Deleting the last undone subtask while others are done: parent
  auto-completes, and the leftover pool (the deleted subtask's share) is
  awarded with the parent's completion entry — keeping total awarded equal to
  the parent's `points`.
- Deleting the only/last subtask entirely: parent reverts to plain
  single-checkbox behavior with full `points`.
- Task with no subtasks: behaves exactly as today.
- Must rollover: yesterday's `doneAt` no longer counts today; subtasks render
  unchecked and the pool resets to full `points`.

## Testing

Manual verification via the running app (no test framework in repo):
add/complete/uncheck subtasks on a custom task and a Must task, verify XP
ledger deltas sum to parent points, parent auto-complete/uncomplete, daily
reset by faking the day, collapse/expand animation, parent-check shortcut.
