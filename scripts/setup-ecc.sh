#!/usr/bin/env bash
# Installs the ECC Claude Code plugin (affaan-m/ECC) for cloud sessions.
# Paste this file's contents into the cloud environment's "Setup script" setting;
# it runs before Claude Code starts, so ECC's skills, agents, commands and hooks
# load in every new session. Safe to re-run. Never fails the environment setup.

if ! command -v claude >/dev/null 2>&1; then
  echo "setup-ecc: claude CLI not found, skipping ECC install"
  exit 0
fi

for attempt in 1 2 3; do
  claude plugin marketplace add affaan-m/ECC \
    && claude plugin install ecc@ecc --config hooks_enabled=true --config hook_profile=standard \
    && { echo "setup-ecc: ECC installed"; exit 0; }
  sleep $((attempt * 5))
done

echo "setup-ecc: ECC install failed; sessions will start without it"
exit 0
