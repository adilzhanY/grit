# GritTUI

A keyboard-only terminal client for **Grit**, your gamified life tracker — full
feature parity with the web app, driven entirely with Vim-style keys. No mouse,
ever.

It shares the same brain (`@grit/core`) and the **same Supabase account** as the
web and mobile apps, so your tasks, XP, streaks and logs are the same everywhere.

## Running it

From the repo root:

```bash
npm install          # once
npm run tui          # launch the TUI
```

Or from this folder: `npm start` (watch mode: `npm run dev`).

### As a global `grit` command

```bash
cd apps/tui
npm link             # symlinks `grit` onto your PATH (keeps workspace resolution)
grit                 # run from anywhere
```

> `npm link` is used instead of a global install because the app depends on the
> workspace package `@grit/core`; linking preserves the monorepo's module
> resolution.

## Configuration

GritTUI talks **straight to Supabase** (no local database). It reads the public
URL + publishable key from, in order: `GRIT_SUPABASE_*`, then the web app's
`NEXT_PUBLIC_SUPABASE_*`, then mobile's `EXPO_PUBLIC_SUPABASE_*`. If your
`apps/web/.env` is already filled in, the TUI needs no extra setup. Otherwise
copy `.env.example` to `.env` and fill it in.

The only thing written to disk is your **auth session** (`~/.config/grit/session.json`),
so you stay signed in between launches. All app data lives in the cloud.

Sign in with **email + password** on first launch (OAuth needs a browser, so it
isn't available in the terminal). Create an account with `Ctrl-n`.

## Keybindings

Modes: **NORMAL** (navigate/act) · **INSERT** (typing in a prompt/form) ·
**COMMAND** (`:`) · **SEARCH** (`/`). The status bar always shows the current
mode and the actions available right now. Press `?` for a live cheat-sheet.

### Global
| Key | Action |
| --- | --- |
| `j` / `k`, `↓` / `↑` | move selection |
| `g` / `G` | top / bottom |
| `Ctrl-d` / `Ctrl-u` | half-page down / up |
| `Tab` / `Shift-Tab` | next / previous view |
| `1`–`9` | jump straight to a view |
| `/` | search / filter the current list |
| `Ctrl-p` | global fuzzy jump (tasks, lists, foods) |
| `:` | command palette |
| `?` | help |
| `Ctrl-c` | quit (also `:q`) |

### Tasks (My Day, Important, Must, Cool, Impossible, custom lists)
| Key | Action |
| --- | --- |
| `space` / `x` | complete / achieve / toggle |
| `a` | add a task |
| `s` | add a subtask |
| `enter` / `o` | expand / collapse subtasks |
| `cc` | rename · `cp` change XP |
| `dd` | delete (confirm) |
| `*` | toggle important · `p` pin to My Day |
| `H` (Must) | toggle the completion heatmap |
| `r` / `X` (custom list) | rename list / delete list |

### Bad habits
`!` I slipped · `a` add · `cc` rename · `cp` change penalty · `dd` delete · `*` important.

### Daily Log
`h` / `l` switch tabs (Food · Sleep · Steps · Reading · Focus · Weight) ·
`a` log an entry · `j/k` + `dd` browse/delete history · `q` quick-add a saved
food · `e` edit/remove a saved food. **Focus**: `space` pause/resume · `s` save early · `c` cancel; on the
alarm, `b` start break / `f` finish (focus) or `c` keep going / `f` finish (break).

### Command palette (`:`)
`myday`, `important`, `planned`, `log`, `must`, `bad`, `cool`, `impossible`,
`analytics` · `set limit|weight|sound|height|sex|birthday <value>` ·
`export [path]` · `import <path>` · `sync` · `resetxp` · `signout` · `q`.

## Architecture

- **`src/data/`** — the web app's data layer, ported. `db.ts` is an in-memory
  Dexie-compatible store; `repository.ts` and `sync.ts` are near-verbatim ports,
  so XP/ledger/streak behaviour is identical across all three apps. On launch the
  TUI does a full pull from Supabase, renders from memory, and write-through-syncs
  every change.
- **`src/store/`** — the React store provider (Ink-flavoured: no DOM, no audio).
- **`src/ui/`** — Ink components: layout, the modal overlay system (prompt/form/
  choose/confirm/command/search/fuzzy/help), and one view per surface.

Built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal)
and run with [`tsx`](https://github.com/privatenumber/tsx), so it consumes
`@grit/core`'s raw TypeScript directly — no build step.
