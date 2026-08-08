#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export RALPH_PROGRAM_NAME="ralph.sh"

target_script="${SCRIPT_DIR}/scripts/run-codex-supervisor.sh"
forwarded_args=()

for arg in "$@"; do
  case "${arg}" in
    --raw-loop)
      target_script="${SCRIPT_DIR}/scripts/run-codex-loop.sh"
      ;;
    *)
      forwarded_args+=("${arg}")
      ;;
  esac
done

if [[ "${RALPH_RAW_LOOP:-0}" == "1" ]]; then
  target_script="${SCRIPT_DIR}/scripts/run-codex-loop.sh"
fi

exec "${target_script}" "${forwarded_args[@]}"
