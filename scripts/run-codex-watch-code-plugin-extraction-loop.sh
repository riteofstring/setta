#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec "${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --name "watch-code-plugin-extraction" \
  --plan "docs/plans/watch-code-plugin-extraction-plan.md" \
  --sentinel "CODEX_LOOP_STOP: WATCH_CODE_PLUGIN_EXTRACTION_COMPLETE" \
  --commit-prefix "codex-watchcodeplugin:" \
  "$@"
