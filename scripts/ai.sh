#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKTREE_ROOT=$(git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${ROOT_DIR}")
if [[ -n "${HOME:-}" ]]; then
  DEFAULT_SETTA_HOME="${HOME}/.setta-development"
else
  DEFAULT_SETTA_HOME=".setta-development"
fi
DEFAULT_DEV_SETTA_FILES_ROOT="${WORKTREE_ROOT}/setta_files_dev"

instance_offset() {
  local instance_name="$1"
  local segment="${instance_name}"
  local suffix=""

  case "${segment}" in
    setta.*)
      segment="${segment#setta.}"
      ;;
  esac

  # Allow explicit numeric suffixes anywhere at the end, e.g. "feature-1" or "worktree12".
  local offset="${segment##*[!0-9]}"
  if [[ -n "${offset}" ]]; then
    echo "$((10#${offset}))"
    return 0
  fi

  # Allow explicit single-letter suffixes when separated by -, _, or .
  suffix="${segment}"
  suffix="${suffix##*-}"
  suffix="${suffix##*_}"
  suffix="${suffix##*.}"
  if [ "${#suffix}" -eq 1 ]; then
    case "${suffix}" in
      [a-z])
        echo $(( $(printf '%d' "'${suffix}") - 97 ))
        return 0
        ;;
      [A-Z])
        echo $(( $(printf '%d' "'${suffix}") - 65 ))
        return 0
        ;;
    esac
  fi

  # Otherwise, hash the full segment (not just the last "-part") to reduce collisions.
  if command -v cksum >/dev/null 2>&1; then
    CKSUM_OUTPUT=$(printf "%s" "${segment}" | cksum)
    CKSUM_VALUE=${CKSUM_OUTPUT%% *}
    if [ -n "${CKSUM_VALUE}" ]; then
      echo $(( CKSUM_VALUE % 100 ))
      return 0
    fi
  fi

  echo 0
}

INSTANCE_NAME=$(basename "${WORKTREE_ROOT}")
INSTANCE_OFFSET="$(instance_offset "${INSTANCE_NAME}")"
DEFAULT_BACKEND_PORT=$((8000 + INSTANCE_OFFSET))
DEFAULT_FRONTEND_PORT=$((3000 + INSTANCE_OFFSET))
DEFAULT_DEBUG_PORT=$((9222 + INSTANCE_OFFSET))

port_in_use() {
  local port="$1"
  if ! command -v lsof >/dev/null 2>&1; then
    return 1
  fi
  lsof -iTCP:"${port}" -sTCP:LISTEN -n >/dev/null 2>&1
}

pick_free_offset() {
  local offset="$1"
  local attempts="${2:-200}"

  for ((i = 0; i <= attempts; i++)); do
    local candidate_offset=$((offset + i))
    local backend_port=$((8000 + candidate_offset))
    local frontend_port=$((3000 + candidate_offset))
    local debug_port=$((9222 + candidate_offset))

    if ! port_in_use "${backend_port}" && ! port_in_use "${frontend_port}" && ! port_in_use "${debug_port}"; then
      echo "${candidate_offset}"
      return 0
    fi
  done

  return 1
}

pick_free_port_from() {
  local port="$1"
  local attempts="${2:-200}"

  for ((i = 0; i <= attempts; i++)); do
    local candidate=$((port + i))
    if ! port_in_use "${candidate}"; then
      echo "${candidate}"
      return 0
    fi
  done

  return 1
}

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
  PICKED_OFFSET="$(pick_free_offset "${INSTANCE_OFFSET}" || true)"
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
  SETTA_PORT="$(pick_free_port_from "${DEFAULT_BACKEND_PORT}" || true)"
  if [[ -z "${SETTA_PORT:-}" ]]; then
    echo "Unable to find a free backend port starting at ${DEFAULT_BACKEND_PORT}." >&2
    exit 1
  fi
fi
if [[ "${SETTA_DEV_FRONTEND_PORT_WAS_SET}" -eq 0 ]]; then
  SETTA_DEV_FRONTEND_PORT="$(pick_free_port_from "${DEFAULT_FRONTEND_PORT}" || true)"
  if [[ -z "${SETTA_DEV_FRONTEND_PORT:-}" ]]; then
    echo "Unable to find a free frontend port starting at ${DEFAULT_FRONTEND_PORT}." >&2
    exit 1
  fi
fi
if [[ "${DEBUG_PORT_WAS_SET}" -eq 0 ]]; then
  DEBUG_PORT="$(pick_free_port_from "${DEFAULT_DEBUG_PORT}" || true)"
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

require_option_value() {
  local flag="$1"
  local arg_count="$2"
  if [[ "${arg_count}" -lt 2 ]]; then
    echo "Missing value for ${flag}" >&2
    exit 1
  fi
}

SETTA_PROFILE_OVERRIDE=""
SETTA_HOME_OVERRIDE=""
SETTA_FILES_ROOT_OVERRIDE=""
SETTA_FILES_LOCATION_OVERRIDE=""
SETTA_RUNTIME_ROOT_OVERRIDE=""
EFFECTIVE_SETTA_HOME="${DEFAULT_SETTA_HOME}"
EFFECTIVE_SETTA_FILES_ROOT="${DEFAULT_DEV_SETTA_FILES_ROOT}"
EFFECTIVE_SETTA_FILES_LOCATION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reload)
      RUN_MODE="startr"
      shift
      ;;
    --profile)
      require_option_value "$1" "$#"
      SETTA_PROFILE_OVERRIDE="$2"
      shift 2
      ;;
    --setta-home)
      require_option_value "$1" "$#"
      SETTA_HOME_OVERRIDE="$2"
      shift 2
      ;;
    --setta-files-root)
      require_option_value "$1" "$#"
      SETTA_FILES_ROOT_OVERRIDE="$2"
      shift 2
      ;;
    --setta-files-location)
      require_option_value "$1" "$#"
      SETTA_FILES_LOCATION_OVERRIDE="$2"
      shift 2
      ;;
    --runtime-root)
      require_option_value "$1" "$#"
      SETTA_RUNTIME_ROOT_OVERRIDE="$2"
      shift 2
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

export SETTA_HOST
export SETTA_PORT
export SETTA_DEV_FRONTEND_PORT
export SETTA_AUTH_COOKIE_NAME="setta_auth_${INSTANCE_NAME}"
export VITE_BACKEND_ORIGIN="http://${SETTA_HOST}:${SETTA_PORT}"
export DEBUG_PORT
export SETTA_NO_OPEN="${SETTA_NO_OPEN:-1}"
# Avoid clobbering repo-root backend.log, which start.sh/reset.sh use.
export SETTA_BACKEND_LOG_FILE="${ROOT_DIR}/chrome_mcp_backend.log"
if [ -n "${SETTA_HOME_OVERRIDE}" ]; then
  EFFECTIVE_SETTA_HOME="${SETTA_HOME_OVERRIDE}"
fi
export SETTA_HOME="${EFFECTIVE_SETTA_HOME}"

if [ -n "${SETTA_FILES_ROOT_OVERRIDE}" ]; then
  EFFECTIVE_SETTA_FILES_ROOT="${SETTA_FILES_ROOT_OVERRIDE}"
  EFFECTIVE_SETTA_FILES_LOCATION=""
elif [ -n "${SETTA_FILES_LOCATION_OVERRIDE}" ]; then
  EFFECTIVE_SETTA_FILES_LOCATION="${SETTA_FILES_LOCATION_OVERRIDE}"
  EFFECTIVE_SETTA_FILES_ROOT=""
fi
if [ -n "${EFFECTIVE_SETTA_FILES_ROOT}" ]; then
  export SETTA_FILES_ROOT="${EFFECTIVE_SETTA_FILES_ROOT}"
  unset SETTA_FILES_LOCATION
else
  unset SETTA_FILES_ROOT
  if [ -n "${EFFECTIVE_SETTA_FILES_LOCATION}" ]; then
    export SETTA_FILES_LOCATION="${EFFECTIVE_SETTA_FILES_LOCATION}"
  else
    unset SETTA_FILES_LOCATION
  fi
fi

if [ -n "${SETTA_PROFILE_OVERRIDE}" ]; then
  export SETTA_PROFILE="${SETTA_PROFILE_OVERRIDE}"
else
  unset SETTA_PROFILE
fi
if [ -n "${SETTA_RUNTIME_ROOT_OVERRIDE}" ]; then
  export SETTA_RUNTIME_ROOT="${SETTA_RUNTIME_ROOT_OVERRIDE}"
else
  unset SETTA_RUNTIME_ROOT
fi

NEEDS_DEV_INSTALL=0
if [ ! -d "${ROOT_DIR}/.venv" ] || [ ! -f "${ROOT_DIR}/.venv/bin/activate" ]; then
  NEEDS_DEV_INSTALL=1
fi
if [ ! -d "${ROOT_DIR}/frontend/node_modules" ]; then
  NEEDS_DEV_INSTALL=1
fi
if [ "${NEEDS_DEV_INSTALL}" -eq 1 ]; then
  echo "Missing dev dependencies; running . ./dev_install.sh" >&2
  (cd "${ROOT_DIR}" && . ./dev_install.sh)
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
