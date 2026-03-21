#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROMPT_FILE="${SCRIPT_DIR}/prompts/backend-behavior-gap-hunt.txt"
FOLLOWUP_PROMPT_FILE="${SCRIPT_DIR}/prompts/backend-behavior-gap-hunt-followup.txt"

exec "${SCRIPT_DIR}/run-codex-loop.sh" \
  --prompt-file "${PROMPT_FILE}" \
  --followup-prompt-file "${FOLLOWUP_PROMPT_FILE}" \
  --pre-session-command "./scripts/run-backend-gap-hunt-candidate-miner.sh" \
  --stop-on-pre-session-exit-code 10 \
  --workdir "${ROOT_DIR}" \
  --iterations 100000 \
  --new-session-every 10 \
  --yolo \
  "$@"
