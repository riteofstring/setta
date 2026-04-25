#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec "${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --name "app-subsystem-real-plugin" \
  --plan "docs/plans/app-subsystem-real-plugin-plan.md" \
  --sentinel "CODEX_LOOP_STOP: APP_SUBSYSTEM_REAL_PLUGIN_COMPLETE" \
  --commit-prefix "codex-realplugin:" \
  "$@"
