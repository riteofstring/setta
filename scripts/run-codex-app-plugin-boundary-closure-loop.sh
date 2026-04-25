#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec "${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --name "app-plugin-boundary-closure" \
  --plan "docs/plans/app-plugin-boundary-closure-plan.md" \
  --sentinel "CODEX_LOOP_STOP: APP_PLUGIN_BOUNDARY_CLOSURE_COMPLETE" \
  --commit-prefix "codex-apppluginboundary:" \
  "$@"
