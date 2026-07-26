#!/usr/bin/env bash
# Deprecated: prefer `know-code verify` via action.yml.
set -euo pipefail
exec know-code verify "$@"
