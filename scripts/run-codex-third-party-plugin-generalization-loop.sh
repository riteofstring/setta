#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec "${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --name "third-party-plugin-generalization" \
  --plan "docs/plans/third-party-plugin-generalization-plan.md" \
  --sentinel "CODEX_LOOP_STOP: THIRD_PARTY_PLUGIN_GENERALIZATION_COMPLETE" \
  --commit-prefix "codex-pluginplan:" \
  "$@"
