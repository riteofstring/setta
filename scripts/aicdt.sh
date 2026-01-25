#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -n "${CHROME_EXTRA_ARGS:-}" ]]; then
  CHROME_EXTRA_ARGS="${CHROME_EXTRA_ARGS} --auto-open-devtools-for-tabs"
else
  CHROME_EXTRA_ARGS="--auto-open-devtools-for-tabs"
fi
export CHROME_EXTRA_ARGS

exec "${ROOT_DIR}/scripts/ai.sh" "$@"
