# grit 🔥

A gamified habit tracker in the spirit of Microsoft To-Do. Do good, gain XP, level up.
Avoid the bad, or pay for it. Bright-mode bento + claymorphism UI, installable PWA, local-first.

## The loop

- **Must** — daily non-negotiables (+10 XP). Daily or N×/week on chosen weekdays.
- **Bad** — things to quit. Slipping costs XP and resets your clean **streak**; clean-streak
  **milestones** (24h → 5 years) pay bonus XP.
- **Cool** — big personal wins (+100 XP).
- **Impossible** — life milestones (+1000 XP).
- **My Day** — today's due Must tasks + anything you star in.

Levels are a pure function of total XP (base 1500, brutal ×1.3 growth) — they can drop if you
slip. Every XP change is an append-only ledger entry, so XP/level/streaks are always derivable
and ready for cloud sync later.

## Monorepo layout

npm workspaces:

```
grit/
├─ apps/
│  ├─ web/      Next.js app
│  └─ mobile/   Expo / React Native app
├─ packages/
│  └─ core/     @grit/core — shared, platform-agnostic domain logic
│                (types, schedule, daylog, leveling, milestones, localDay)
└─ supabase/    schema.sql — cloud sync tables (run in the Supabase SQL editor)
```

`@grit/core` is pure TypeScript — no DOM, no IndexedDB, no React Native — the brain
both apps share. Web consumes it directly and via thin re-export shims in
`apps/web/src/lib/*`, so existing `@/lib/*` imports keep working. Storage and UI
stay per-app.

## Stack

Web: Next.js 16 (App Router) · React 19 · Tailwind v4 · Dexie (IndexedDB) · Web Audio.
Mobile: Expo · React Native. Cloud sync: Supabase. Shared: TypeScript.

## Develop

```bash
npm install        # installs all workspaces

npm run web        # Next.js dev server (apps/web) → http://localhost:3000
npm run web:build  # production build of the web app
npm run mobile     # Expo dev server (apps/mobile) — heavy install on first run
```

Design spec: `docs/superpowers/specs/2026-05-31-ebosh-phase1-design.md`.

## Roadmap

- **Phase 1 (done):** the dopamine engine — four lists, XP/levels, streaks + milestones, sounds, PWA.
- **Phase 2:** MS-To-Do parity — custom lists, subtasks, due dates/reminders, notes, search.
- **Phase 3:** cloud sync + login, stats dashboard (XP/level/streak charts).
