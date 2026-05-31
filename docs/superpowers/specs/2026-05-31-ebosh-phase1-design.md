# EBOSH — Phase 1 Design (The Dopamine Engine)

**EBOSH** (ебошить — "to work hard") is a gamified habit/task tracker in the spirit of
Microsoft To-Do, built to deliver a real dopamine hit for doing good and a real sting for
doing bad. This spec covers **Phase 1** only.

## Decisions locked with the user

- **Data:** Local-first via IndexedDB, architected sync-ready (repository interface + append-only ledger). Cloud sync is Phase 3.
- **Platform:** Responsive, installable **PWA** (desktop sidebar / mobile bottom nav). **Bright mode only** — no dark mode, no toggle.
- **Sound:** Curated sound pack. Implementation uses Web Audio synthesis now (zero files, instant), with clean seams to drop real audio files into `/public/sounds` later.
- **Aesthetic:** **Bento grid** skeleton + **Claymorphism** skin, with tactile squish-on-press. Single font family **Onest** (via `next/font/google`). Lucide SVG icons (no emoji icons).
- **Leveling curve:** brutal **×1.3** growth, base 1500.
- **De-leveling:** levels CAN drop (current level always reflects current XP).
- **Streak milestones:** enabled, fixed global ladder, per-task reward multiplier + slip penalty.

## Phasing

- **Phase 1 (this spec):** Four special lists, My Day, complete-for-XP with sounds, weekday
  recurrence for Must, bad-task streaks + milestones, XP→Level system, local IndexedDB,
  responsive PWA shell, clay/bento UI.
- **Phase 2:** MS-To-Do parity — custom user lists, subtasks/steps, due dates & reminders,
  notes, important star, search, completed history, themes.
- **Phase 3:** Cloud sync + login; Stats dashboard (XP-over-time, level history, streak charts).

## The four lists

| List | Meaning | On complete / click | Recurrence / time |
|------|---------|---------------------|-------------------|
| **Must** | Daily non-negotiables | +10 XP (per-task tunable) + good sound | Daily or N×/week on chosen weekdays; shows in My Day only on its days |
| **Bad** | Things you must NOT do | "I slipped" → −100 XP (per-task tunable) + bad sound, **streak resets** | No date; tracks clean-time streak + milestones |
| **Cool** | Big personal wins | +100 XP (tunable) + chime, one-shot → archived | One-time achievement |
| **Impossible** | Life milestones | +1000 XP + epic fanfare, one-shot → archived | Hidden by default (own screen) |

**My Day** = today's due Must tasks + anything starred into it.

## The XP / economy system

The four point values form a balanced economy around one unit: **a good day ≈ 100 XP**
(~10 Must tasks × 10).

- Bad slip −100 = erases one good day. Painful, recoverable in a day.
- Cool +100 = one good day in a single tap.
- Impossible +1000 = ~10 days of grind in one tap (a level-jumping payoff).

**Leveling:** one XP pool; level is a *pure function* of total XP (never stored, can't drift).

- `cost(level→level+1) = base * growth^level`, `base = 1500`, `growth = 1.3`.
- Cumulative XP for level L = `base * (growth^L − 1) / (growth − 1)`.
- L1 ≈ 1500 XP (~2 weeks @100/day). Higher levels become rare trophies; de-leveling possible.

**Event sourcing:** every XP change writes one immutable `LedgerEntry`
`{ id, timestamp, taskId?, type, delta, meta }`. **Current XP = sum(delta).** This gives undo,
streak history, future charts, and clean sync merges for free. XP floored at 0 (level 0 bottom).

## Bad-task streak milestones

Global fixed ladder (base XP, scaled by each task's `rewardMultiplier`, default 1.0):

| Clean for | Base XP | Clean for | Base XP |
|-----------|---------|-----------|---------|
| 24 hours | 25 | 6 months | 1,500 |
| 3 days | 50 | 9 months | 2,200 |
| 1 week | 100 | 1 year | 3,500 |
| 2 weeks | 200 | 2 years | 5,000 |
| 1 month | 400 | 3 years | 7,000 |
| 2 months | 600 | **5 years** | **10,000** |
| 3 months | 900 | | |

Per bad task: `slipPenalty` (default 100) and `rewardMultiplier` (default 1.0). Current streak =
`now − lastSlipAt` (or − `createdAt` if never slipped). Slipping resets streak and re-arms all
milestones. Milestones are awarded idempotently (a `streak_milestone` ledger entry per crossing;
the task tracks which milestones are armed/awarded, cleared on slip).

## Data model

- **Task** — `id, listType, title, notes?, points, order, archived, createdAt`; Must adds
  `recurrence {type:'daily'|'weekly', weekdays:number[]}, starredMyDay`; Bad adds
  `slipPenalty, rewardMultiplier, lastSlipAt, awardedMilestoneIds[]`; Cool/Impossible add
  `achievedAt?`.
- **Completion** — `id, taskId, date(YYYY-MM-DD local), completedAt`. Per-occurrence for recurring
  Must tasks; un-complete = delete + reverse ledger entry.
- **LedgerEntry** — XP source of truth (above).
- **Settings** — `levelBase=1500, levelGrowth=1.3, soundsEnabled, ...`.

All access goes through a **repository** interface backed by IndexedDB (Dexie) now; a
remote-backed implementation slots behind the same interface in Phase 3.

## UI / architecture

- **Stack:** Next.js 16 App Router, React 19, Tailwind v4, TypeScript. Onest via `next/font/google`
  on `<body>`. Lucide icons. Sounds via Web Audio.
- **Layout:** Bento CSS grid, varied spans, responsive **4 → 2 → 1** cols, radius ~20px.
- **Clay tokens:** double shadows (`inset` highlight + outer drop), thick soft borders, pastel
  per-list tints, squish `scale(0.95)` on press with spring bounce
  `cubic-bezier(0.34, 1.56, 0.64, 1)`. Respect `prefers-reduced-motion`.
- **Dopamine centerpiece:** persistent **Level + XP progress** hero tile; completing a task flies
  a `+N` into it; **level-up = full-screen celebration + epic fanfare.**
- **Accessibility:** ≥4.5:1 text contrast (dark text on pastels), visible focus rings, 44px touch
  targets, aria-labels on icon buttons.

## Out of scope for Phase 1

Custom user lists, subtasks, due dates/reminders, notes editor, search, themes, cloud sync,
login, stats dashboard. (Phases 2–3.)
