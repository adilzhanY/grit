#!/usr/bin/env bash
# One-shot setup: build the static app and install a systemd *user* service that
# serves it on http://127.0.0.1:4317, starting at login. Then add the i3
# keybinding printed at the end. Re-run after pulling changes to rebuild.
set -euo pipefail

PORT="${GRIT_PORT:-4317}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web="$(cd "$here/.." && pwd)"           # apps/web
node_bin="$(command -v node)"
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

echo "→ Building static export…"
( cd "$web" && npm run build )

chmod +x "$here/grit-launch.sh"

echo "→ Installing systemd user service…"
mkdir -p "$unit_dir"
cat > "$unit_dir/grit-web.service" <<UNIT
[Unit]
Description=Grit web (local static server)
After=default.target

[Service]
Environment=PORT=${PORT}
ExecStart=${node_bin} ${web}/scripts/serve-static.mjs
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now grit-web.service

echo
echo "✓ Grit is serving at http://127.0.0.1:${PORT}"
echo
echo "Add this to ~/.config/i3/config (then reload i3 with \$mod+Shift+r):"
echo
echo "    bindsym \$mod+g exec --no-startup-id ${here}/grit-launch.sh"
echo
echo "Tip: keep it on a workspace with a rule like:"
echo "    for_window [class=\"Grit\"] move to workspace \$ws9"
