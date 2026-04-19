#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKTREE_ROOT=$(git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${ROOT_DIR}")
. "${SCRIPT_DIR}/lib/setta_path_flags.sh"
. "${SCRIPT_DIR}/lib/setta_port_selection.sh"
if [[ -n "${HOME:-}" ]]; then
  DEFAULT_SETTA_HOME="${HOME}/.setta-development"
else
  DEFAULT_SETTA_HOME=".setta-development"
fi
DEFAULT_DEV_SETTA_FILES_ROOT="${WORKTREE_ROOT}/setta_files_dev"

INSTANCE_NAME=$(basename "${WORKTREE_ROOT}")
INSTANCE_OFFSET="$(setta_instance_offset "${INSTANCE_NAME}")"
DEFAULT_BACKEND_PORT=$((8000 + INSTANCE_OFFSET))
DEFAULT_FRONTEND_PORT=$((3000 + INSTANCE_OFFSET))
DEFAULT_DEBUG_PORT=$((9222 + INSTANCE_OFFSET))

SETTA_HOST="${SETTA_HOST:-127.0.0.1}"

SETTA_PORT_WAS_SET=0
if [[ -n "${SETTA_PORT:-}" ]]; then
  SETTA_PORT_WAS_SET=1
fi
SETTA_DEV_FRONTEND_PORT_WAS_SET=0
if [[ -n "${SETTA_DEV_FRONTEND_PORT:-}" ]]; then
  SETTA_DEV_FRONTEND_PORT_WAS_SET=1
fi
DEBUG_PORT_WAS_SET=0
if [[ -n "${DEBUG_PORT:-}" ]]; then
  DEBUG_PORT_WAS_SET=1
fi

if [[ "${SETTA_PORT_WAS_SET}" -eq 0 && "${SETTA_DEV_FRONTEND_PORT_WAS_SET}" -eq 0 && "${DEBUG_PORT_WAS_SET}" -eq 0 ]]; then
  # Common case: auto-pick a single free offset so backend/frontend/devtools stay aligned.
  PICKED_OFFSET="$(setta_pick_free_offset "${INSTANCE_OFFSET}" 200 9222 || true)"
  if [[ -z "${PICKED_OFFSET:-}" ]]; then
    echo "Unable to find a free port offset starting at ${INSTANCE_OFFSET}." >&2
    exit 1
  fi
  if [[ "${PICKED_OFFSET}" != "${INSTANCE_OFFSET}" ]]; then
    echo "Default ports are in use; using offset ${PICKED_OFFSET} (backend $((8000 + PICKED_OFFSET)), frontend $((3000 + PICKED_OFFSET)), debug $((9222 + PICKED_OFFSET)))." >&2
    INSTANCE_OFFSET="${PICKED_OFFSET}"
    DEFAULT_BACKEND_PORT=$((8000 + INSTANCE_OFFSET))
    DEFAULT_FRONTEND_PORT=$((3000 + INSTANCE_OFFSET))
    DEFAULT_DEBUG_PORT=$((9222 + INSTANCE_OFFSET))
  fi
fi

if [[ "${SETTA_PORT_WAS_SET}" -eq 0 ]]; then
  SETTA_PORT="$(
    setta_pick_free_port_from \
      "${DEFAULT_BACKEND_PORT}" \
      200 \
      "${SETTA_DEV_FRONTEND_PORT:-}" \
      "${DEBUG_PORT:-}" \
      || true
  )"
  if [[ -z "${SETTA_PORT:-}" ]]; then
    echo "Unable to find a free backend port starting at ${DEFAULT_BACKEND_PORT}." >&2
    exit 1
  fi
fi
if [[ "${SETTA_DEV_FRONTEND_PORT_WAS_SET}" -eq 0 ]]; then
  SETTA_DEV_FRONTEND_PORT="$(
    setta_pick_free_port_from \
      "${DEFAULT_FRONTEND_PORT}" \
      200 \
      "${SETTA_PORT}" \
      "${DEBUG_PORT:-}" \
      || true
  )"
  if [[ -z "${SETTA_DEV_FRONTEND_PORT:-}" ]]; then
    echo "Unable to find a free frontend port starting at ${DEFAULT_FRONTEND_PORT}." >&2
    exit 1
  fi
fi
if [[ "${DEBUG_PORT_WAS_SET}" -eq 0 ]]; then
  DEBUG_PORT="$(
    setta_pick_free_port_from \
      "${DEFAULT_DEBUG_PORT}" \
      200 \
      "${SETTA_PORT}" \
      "${SETTA_DEV_FRONTEND_PORT}" \
      || true
  )"
  if [[ -z "${DEBUG_PORT:-}" ]]; then
    echo "Unable to find a free debug port starting at ${DEFAULT_DEBUG_PORT}." >&2
    exit 1
  fi
fi

RUN_MODE="start"

usage() {
  cat <<'EOF'
Usage: ai.sh [--reload] [--profile name] [--setta-home path] [--setta-files-root path] [--setta-files-location mode] [--runtime-root path]

Starts the backend + frontend plus a CDP-enabled Chrome for Chrome DevTools MCP.
Uses per-worktree ports and dev paths by default:
  SETTA_HOME=~/.setta-development
  SETTA_FILES_ROOT=<worktree>/setta_files_dev

Flags:
  --reload   Use backend reload mode (pnpm startr)
EOF
}

setta_path_flags_init "${DEFAULT_SETTA_HOME}" "${DEFAULT_DEV_SETTA_FILES_ROOT}"
setta_path_flags_seed_from_env

while [[ $# -gt 0 ]]; do
  if setta_path_flags_try_parse "$@"; then
    shift "${SETTA_PATH_FLAGS_CONSUMED}"
    continue
  fi
  case "$1" in
    --reload)
      RUN_MODE="startr"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

setta_path_flags_validate

export SETTA_HOST
export SETTA_PORT
export SETTA_DEV_FRONTEND_PORT
export SETTA_AUTH_COOKIE_NAME="setta_auth_${INSTANCE_NAME}"
export VITE_BACKEND_ORIGIN="http://${SETTA_HOST}:${SETTA_PORT}"
export DEBUG_PORT
export SETTA_NO_OPEN="${SETTA_NO_OPEN:-1}"
# Avoid clobbering repo-root backend.log, which start.sh/reset.sh use.
export SETTA_BACKEND_LOG_FILE="${ROOT_DIR}/chrome_mcp_backend.log"
setta_path_flags_apply_env

missing_dev_requirements=""
append_missing_requirement() {
  local requirement="$1"
  if [[ -n "${missing_dev_requirements}" ]]; then
    missing_dev_requirements="${missing_dev_requirements}, ${requirement}"
  else
    missing_dev_requirements="${requirement}"
  fi
}

if [ ! -d "${ROOT_DIR}/frontend/node_modules" ]; then
  append_missing_requirement "frontend/node_modules"
fi
if [ ! -x "${ROOT_DIR}/.venv/bin/python" ]; then
  append_missing_requirement ".venv/bin/python"
fi
if ! "${ROOT_DIR}/scripts/go.sh" version >/dev/null 2>&1; then
  append_missing_requirement "Go toolchain"
fi
if [[ -n "${missing_dev_requirements}" ]]; then
  echo "Missing dev dependencies (${missing_dev_requirements}). Run ./dev_install.sh first." >&2
  exit 1
fi

if [ "${RUN_MODE}" = "startr" ]; then
  (cd "${ROOT_DIR}/frontend" && pnpm startr) &
else
  (cd "${ROOT_DIR}/frontend" && pnpm start) &
fi
DEV_PID=$!

cleanup() {
  "${ROOT_DIR}/scripts/stop-browser-mcp.sh" --devtools >/dev/null 2>&1 || true
  kill "${DEV_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

"${ROOT_DIR}/scripts/start-browser-mcp.sh" --devtools

wait "${DEV_PID}"
