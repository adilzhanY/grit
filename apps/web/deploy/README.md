# Run Grit as a local, offline, keybinding-launched app (Arch + i3)

Grit is local-first: every action writes to IndexedDB immediately, and the sync
layer pushes to Supabase whenever it's reachable. So you can work fully offline —
add tasks, rename a saved food, log focus, anything — and the moment wifi
returns, those changes flow to Supabase and on to mobile and the TUI. This setup
just makes the **page** load instantly and offline, without `npm run dev`.

## What it does

- **`output: "export"`** (in `next.config.ts`) builds a static bundle to
  `apps/web/out/` — no Node server at runtime, far lighter than `next dev`.
- **A service worker** (`public/sw.js`) caches the app shell, so it opens with no
  wifi (and even if the local server is down).
- **A tiny static server** (`scripts/serve-static.mjs`, zero dependencies) serves
  `out/` on `127.0.0.1:4317`, run as a **systemd user service** so it's always up
  and weighs almost nothing.
- **An i3 keybinding** opens it in a chromeless app window.

## Setup (once)

```bash
cd apps/web
./deploy/install.sh
```

This builds the app, installs + starts the `grit-web` user service, and prints
the exact i3 line to add. Then add to `~/.config/i3/config`:

```i3
bindsym $mod+g exec --no-startup-id ~/dev/grit/apps/web/deploy/grit-launch.sh
```

Reload i3 (`$mod+Shift+r`) and press **$mod+g**. First launch must be online once
so the service worker can cache the shell; after that it opens offline.

## Updating after you pull/change code

```bash
cd apps/web && ./deploy/install.sh    # rebuilds and restarts the service
```

The service worker revalidates the shell on the next online open, so you get the
new build automatically.

## Notes / troubleshooting

- **Port:** override with `GRIT_PORT=NNNN ./deploy/install.sh` (and the same env
  for the launcher).
- **Service status:** `systemctl --user status grit-web` ·
  logs: `journalctl --user -u grit-web -f`.
- **Stop autostart:** `systemctl --user disable --now grit-web`.
- **Secrets:** the build inlines `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (from `apps/web/.env`) into the static
  JS. That's expected for a Supabase client app — these are the *publishable*
  keys, guarded by Row-Level Security. Don't put the secret/service key in
  `NEXT_PUBLIC_*`.
- **No browser app mode?** The launcher falls back from Chromium → Chrome →
  Brave → Firefox (new window) → `xdg-open`.
- **Install as a desktop PWA instead:** open the app, then Chromium menu →
  "Install Grit". That creates its own `.desktop` entry you can bind to as well.
