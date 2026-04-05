#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE_ROOT=$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${SCRIPT_DIR}")
. "${SCRIPT_DIR}/scripts/lib/setta_path_flags.sh"
if [[ -n "${HOME:-}" ]]; then
  DEFAULT_SETTA_HOME="${HOME}/.setta-development"
else
  DEFAULT_SETTA_HOME=".setta-development"
fi
DEFAULT_DEV_SETTA_FILES_ROOT="${WORKTREE_ROOT}/setta_files_dev"

RESET_ARGS=()
AI_ARGS=()
setta_path_flags_init "${DEFAULT_SETTA_HOME}" "${DEFAULT_DEV_SETTA_FILES_ROOT}"
setta_path_flags_seed_from_env

while [[ $# -gt 0 ]]; do
  if setta_path_flags_try_parse "$@"; then
    if [[ "${SETTA_PATH_FLAGS_CONSUMED}" -eq 1 ]]; then
      RESET_ARGS+=("$1")
      AI_ARGS+=("$1")
    elif [[ "${SETTA_PATH_FLAGS_CONSUMED}" -eq 2 ]]; then
      RESET_ARGS+=("$1" "$2")
      AI_ARGS+=("$1" "$2")
    else
      echo "Internal parser error: unexpected consumed arg count ${SETTA_PATH_FLAGS_CONSUMED}" >&2
      exit 1
    fi
    shift "${SETTA_PATH_FLAGS_CONSUMED}"
    continue
  fi
  case "$1" in
    --force|--yes)
      echo "Unsupported argument for aireset.sh: $1" >&2
      exit 1
      ;;
    *)
      AI_ARGS+=("$1")
      shift
      ;;
  esac
done

setta_path_flags_validate
setta_path_flags_apply_env

if [[ -n "${SETTA_FILES_LOCATION_OVERRIDE}" && -z "${SETTA_FILES_ROOT_OVERRIDE}" ]]; then
  # CLI location arg is passed through in RESET_ARGS/AI_ARGS.
  unset SETTA_FILES_LOCATION
fi

# Ensure aireset is a real restart for the current worktree instead of layering
# a fresh launch on top of an existing browser/session pair.
"${SCRIPT_DIR}/scripts/kill-setta.sh"

RESET_WORKSPACE_ARGS=(--workspace "${WORKTREE_ROOT}")
if (( ${#RESET_ARGS[@]} > 0 )); then
  "${SCRIPT_DIR}/scripts/reset-setta-state.sh" "${RESET_WORKSPACE_ARGS[@]}" "${RESET_ARGS[@]}"
else
  "${SCRIPT_DIR}/scripts/reset-setta-state.sh" "${RESET_WORKSPACE_ARGS[@]}"
fi

if (( ${#AI_ARGS[@]} > 0 )); then
  exec "${SCRIPT_DIR}/ai.sh" "${AI_ARGS[@]}"
fi
exec "${SCRIPT_DIR}/ai.sh"
