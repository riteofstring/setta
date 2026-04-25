#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec "${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --name "app-subsystem-backend-externalization" \
  --plan "docs/plans/app-subsystem-backend-externalization-plan.md" \
  --sentinel "CODEX_LOOP_STOP: APP_SUBSYSTEM_BACKEND_EXTERNALIZATION_COMPLETE" \
  --commit-prefix "codex-apppluginbackend:" \
  "$@"
