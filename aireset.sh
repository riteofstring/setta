#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE_ROOT=$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${SCRIPT_DIR}")
if [[ -n "${HOME:-}" ]]; then
  DEFAULT_SETTA_HOME="${HOME}/.setta-development"
else
  DEFAULT_SETTA_HOME=".setta-development"
fi
DEFAULT_DEV_SETTA_FILES_ROOT="${WORKTREE_ROOT}/dev_setta_files"

RESET_ARGS=()
AI_ARGS=("$@")
setta_files_root_arg_set=0
setta_files_location_arg_set=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile|--setta-home|--setta-files-root|--setta-files-location|--runtime-root)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for $1" >&2
        exit 1
      fi
      RESET_ARGS+=("$1" "$2")
      if [[ "$1" == "--setta-files-root" ]]; then
        setta_files_root_arg_set=1
      fi
      if [[ "$1" == "--setta-files-location" ]]; then
        setta_files_location_arg_set=1
      fi
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [[ -z "${SETTA_HOME:-}" ]]; then
  export SETTA_HOME="${DEFAULT_SETTA_HOME}"
fi

if [[ -n "${SETTA_FILES_ROOT:-}" && -n "${SETTA_FILES_LOCATION:-}" ]]; then
  unset SETTA_FILES_LOCATION
fi
if [[ "${setta_files_location_arg_set}" -eq 1 ]]; then
  unset SETTA_FILES_ROOT
elif [[ "${setta_files_root_arg_set}" -eq 1 ]]; then
  unset SETTA_FILES_LOCATION
elif [[ -z "${SETTA_FILES_ROOT:-}" && -z "${SETTA_FILES_LOCATION:-}" ]]; then
  export SETTA_FILES_ROOT="${DEFAULT_DEV_SETTA_FILES_ROOT}"
fi

if (( ${#RESET_ARGS[@]} > 0 )); then
  "${SCRIPT_DIR}/scripts/reset-setta-state.sh" "${RESET_ARGS[@]}"
else
  "${SCRIPT_DIR}/scripts/reset-setta-state.sh"
fi

if (( ${#AI_ARGS[@]} > 0 )); then
  exec "${SCRIPT_DIR}/ai.sh" "${AI_ARGS[@]}"
fi
exec "${SCRIPT_DIR}/ai.sh"
