#!/usr/bin/env bash
# Open Grit in a chromeless app window. Bind this to an i3 key (see README.md).
# Works offline: once the page has been loaded once, the service worker serves
# it from cache, so this still opens the app even with no wifi and no server.
set -euo pipefail

PORT="${GRIT_PORT:-4317}"
URL="http://127.0.0.1:${PORT}"

# Make sure the local static server is up. Prefer the systemd user service;
# fall back to launching the server directly if it isn't installed.
if ! curl -sf -o /dev/null "$URL"; then
  systemctl --user start grit-web.service 2>/dev/null || {
    here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PORT="$PORT" nohup node "$here/../scripts/serve-static.mjs" >/dev/null 2>&1 &
  }
  # Give it a moment to bind (skip the wait if the SW can serve from cache).
  for _ in $(seq 1 20); do curl -sf -o /dev/null "$URL" && break; sleep 0.1; done
fi

# Open in Firefox using the "Warrior" profile. Reuses a running instance,
# opening a new tab; only spawns a window if Firefox isn't already open.
if command -v firefox >/dev/null 2>&1; then
  exec firefox -P Warrior --new-tab "$URL"
fi

# Last resort: whatever handles http.
exec xdg-open "$URL"
