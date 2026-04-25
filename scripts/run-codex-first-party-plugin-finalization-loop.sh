#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec "${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --name "first-party-plugin-finalization" \
  --plan "docs/plans/first-party-plugin-finalization-plan.md" \
  --sentinel "CODEX_LOOP_STOP: FIRST_PARTY_PLUGIN_FINALIZATION_COMPLETE" \
  --commit-prefix "codex-pluginfinal:" \
  "$@"
