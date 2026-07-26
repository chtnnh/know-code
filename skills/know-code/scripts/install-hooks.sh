#!/usr/bin/env bash
# Thin wrapper: prefer global CLI, else npx.
set -euo pipefail
AGENTS="${1:-}"

if command -v know-code >/dev/null 2>&1; then
  if [[ -n "$AGENTS" ]]; then
    exec know-code init --agents "$AGENTS"
  fi
  exec know-code init
fi

if [[ -n "$AGENTS" ]]; then
  exec npx --yes know-code init --agents "$AGENTS"
fi
exec npx --yes know-code init
