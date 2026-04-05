#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export RALPH_PROGRAM_NAME="ralph-supervise.sh"
exec "${SCRIPT_DIR}/scripts/run-codex-supervisor.sh" "$@"
