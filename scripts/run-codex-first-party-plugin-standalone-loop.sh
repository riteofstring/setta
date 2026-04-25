#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec "${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --name "first-party-plugin-standalone" \
  --plan "docs/plans/first-party-plugin-standalone-completion-plan.md" \
  --sentinel "CODEX_LOOP_STOP: FIRST_PARTY_PLUGIN_STANDALONE_COMPLETE" \
  --commit-prefix "codex-pluginstandalone:" \
  "$@"
