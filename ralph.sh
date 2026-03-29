#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export RALPH_PROGRAM_NAME="ralph.sh"
exec "${SCRIPT_DIR}/scripts/run-codex-loop.sh" "$@"
