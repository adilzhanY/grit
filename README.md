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

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · TypeScript · Dexie (IndexedDB) · Web Audio.

## Develop

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint
```

Design spec: `docs/superpowers/specs/2026-05-31-ebosh-phase1-design.md`.

## Roadmap

- **Phase 1 (done):** the dopamine engine — four lists, XP/levels, streaks + milestones, sounds, PWA.
- **Phase 2:** MS-To-Do parity — custom lists, subtasks, due dates/reminders, notes, search.
- **Phase 3:** cloud sync + login, stats dashboard (XP/level/streak charts).
