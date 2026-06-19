# grit 🔥

A gamified, all-in-one life tracker. One XP economy spans habits, food, steps,
weight and focus: do good and gain XP, slip and pay for it, level up over time.
Built as a personal product across the **web** and **mobile**, sharing a single
TypeScript domain core. This is a demonstration project, not a packaged app.

## The model

- **Must** — daily non-negotiables (+10 XP). Daily or N×/week on chosen weekdays.
- **Bad** — things to quit. Slipping costs XP and resets your clean **streak**;
  clean-streak **milestones** (24h → 5 years) pay bonus XP.
- **Cool** — big personal wins (+100 XP). **Impossible** — life milestones (+1000 XP).
- **My Day** — today's due Must tasks plus anything you star in. Custom lists and
  subtasks sit on top.
- Beyond tasks: a **daily log** for food (calories eaten − burnt = net), steps,
  and weight, plus a **focus** timer — all feeding the same XP/level/streak system.

Levels are a pure function of total XP (base 1500, ×1.3 growth) and can drop if
you slip. Every XP change is an append-only **ledger** entry, so XP, level and
streaks are always derivable — and the ledger doubles as the substrate for
conflict-free cloud sync.

## Architecture

npm workspaces, two apps over one shared brain:

```
grit/
├─ apps/
│  ├─ web/      Next.js app
│  └─ mobile/   Expo / React Native app
├─ packages/
│  └─ core/     @grit/core — platform-agnostic domain logic
└─ supabase/    schema.sql — cloud-sync tables
```

**`@grit/core`** is pure TypeScript — no DOM, no IndexedDB, no React Native. It
holds the rules both apps obey: `types`, `schedule` (weekday recurrence + due
logic), `daylog` (food/steps/weight math), `leveling` (XP→level curve),
`milestones` (streak thresholds), and `day` (local-day boundaries). UI and
storage stay per-app; the decision-making lives here once.

## Web (`apps/web`)

Built on **Next.js 16** (App Router) with **React 19** and **Tailwind v4**, in a
bright-mode bento + claymorphism style. It's an installable **PWA**
(`app/manifest.ts`, icons), so it runs full-screen on a phone like a native app.

- **Storage** — local-first via **Dexie** (IndexedDB). `lib/db.ts` defines the
  tables (tasks, completions, ledger, settings, lists, foods, day logs, focus)
  plus tombstones for delete propagation. `lib/repository.ts` is the typed write
  layer; `lib/store.tsx` exposes it to React through context + `dexie-react-hooks`
  for live queries.
- **Domain** — `lib/*.ts` are thin re-export shims over `@grit/core`, so existing
  `@/lib/...` imports keep working while the logic lives in the shared package.
- **UI** — components for the four lists (`TaskCard`, `BadCard`), `XpHero`,
  `DailyLog`, `Focus*`, `Celebration`, and an analytics dashboard
  (`Analytics`, `MustHeatmap`) drawn with **Recharts**. Feedback sounds use the
  **Web Audio** API (`lib/sounds.ts`).
- **Cloud sync** — `lib/sync.ts` runs a delta push/pull against **Supabase**
  (`@supabase/supabase-js`), last-write-wins per row by `updatedAt`, with
  Row-Level Security scoping every query to the signed-in user. `lib/auth.tsx`
  handles login; `lib/backup.ts` does manual JSON export/import.

## Mobile (`apps/mobile`)

An **Expo / React Native** (RN 0.79, React 19) port that shares the exact same
`@grit/core` rules, so both apps level up identically.

- **Storage** — a single JSON blob in **AsyncStorage** (`lib/db.ts`) rather than
  IndexedDB; the store API mirrors the web's so screens stay parallel.
- **Navigation** — lightweight view-state routing with a custom **bottom navbar**
  and a **FAB** (`BottomNav`, `LogFab`) instead of a router dependency. Screens:
  `Today`, `Planned`, `Habits`, `DailyLog`, `Focus`, `Stats`.
- **Native bits** — icons via `lucide-react-native` + `react-native-svg`, fonts
  via `@expo-google-fonts/onest`, feedback sounds via **expo-audio**, and focus
  reminders via **expo-notifications** / **Notifee**. Theme and sounds are ported
  from the web (`theme.ts`, `lib/sounds.ts`).
- **Cloud sync** — the same Supabase last-write-wins strategy as web
  (`lib/sync.ts`, `lib/auth.tsx`), over a `react-native-url-polyfill` shim.

## Cloud sync

`supabase/schema.sql` defines one table per synced entity, each shaped
`{ user_id, id, data jsonb, updated_at, deleted }`. Both apps push rows changed
since their last cursor, then pull remote rows newer than that, applying the
later side. Tombstones carry deletes across devices; the append-only ledger makes
real conflicts rare, so per-row last-write-wins is enough for the mutable tables.

## Stack at a glance

| | Web | Mobile |
|---|---|---|
| Framework | Next.js 16 · React 19 | Expo · React Native 0.79 · React 19 |
| Styling | Tailwind v4 | StyleSheet + shared theme |
| Storage | Dexie (IndexedDB) | AsyncStorage (JSON blob) |
| Charts | Recharts | custom views |
| Sound | Web Audio | expo-audio |
| Notifications | — (PWA) | expo-notifications · Notifee |
| Shared logic | `@grit/core` (TypeScript) | `@grit/core` (TypeScript) |
| Sync | Supabase (delta LWW) | Supabase (delta LWW) |
