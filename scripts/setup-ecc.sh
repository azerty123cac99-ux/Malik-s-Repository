#!/usr/bin/env bash
# Installs the ECC Claude Code plugin (affaan-m/ECC) for cloud sessions.
# Paste this file's contents into the cloud environment's "Setup script" setting;
# it runs before Claude Code starts, so ECC's skills, agents, commands and hooks
# load in every new session. Safe to re-run. Never fails the environment setup.

if ! command -v claude >/dev/null 2>&1; then
  echo "setup-ecc: claude CLI not found, skipping ECC install"
  exit 0
fi

installed=
for attempt in 1 2 3; do
  claude plugin marketplace add affaan-m/ECC \
    && claude plugin install ecc@ecc --config hooks_enabled=true --config hook_profile=standard \
    && { installed=1; break; }
  sleep $((attempt * 5))
done
[ -n "$installed" ] || { echo "setup-ecc: ECC install failed; sessions will start without it"; exit 0; }

# ECC's chrome-devtools MCP looks for Chrome at /opt/google/chrome and refuses
# to launch as root. Point it at the container's Chromium, headless, unsandboxed.
chromium=/opt/pw-browsers/chromium
if [ -x "$chromium" ]; then
  for f in "$HOME"/.claude/plugins/cache/ecc/ecc/*/.mcp.json; do
    [ -f "$f" ] || continue
    cat > "$f" <<EOF
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--headless", "--isolated",
               "--executablePath=$chromium",
               "--chromeArg=--no-sandbox", "--chromeArg=--disable-setuid-sandbox"]
    }
  }
}
EOF
  done
fi

echo "setup-ecc: ECC installed"
exit 0
