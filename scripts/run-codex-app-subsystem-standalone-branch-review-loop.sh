#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="${SCRIPT_DIR}/prompts/app-subsystem-standalone-plugin-review.md"

exec "${SCRIPT_DIR}/run-codex-branch-review-loop.sh" \
  --extra-prompt-file "${PROMPT_FILE}" \
  "$@"
