#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROMPT_FILE="${SCRIPT_DIR}/prompts/backend-behavior-parity-matrix-gap-check.txt"

exec "${SCRIPT_DIR}/run-codex-loop.sh" \
  --prompt-file "${PROMPT_FILE}" \
  --workdir "${ROOT_DIR}" \
  "$@"
