#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKTREE_ROOT=$(git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${ROOT_DIR}")

instance_offset() {
  local instance_name="$1"
  local segment="${instance_name}"

  case "${segment}" in
    setta.*)
      segment="${segment#setta.}"
      ;;
  esac
  case "${segment}" in
    *-*)
      segment="${segment##*-}"
      ;;
  esac
  case "${segment}" in
    *_*)
      segment="${segment##*_}"
      ;;
  esac
  case "${segment}" in
    *.*)
      segment="${segment##*.}"
      ;;
  esac

  local offset="${segment##*[!0-9]}"
  if [ -z "${offset}" ] && [ "${#segment}" -eq 1 ]; then
    case "${segment}" in
      [a-z])
        offset=$(( $(printf '%d' "'${segment}") - 97 ))
        ;;
      [A-Z])
        offset=$(( $(printf '%d' "'${segment}") - 65 ))
        ;;
    esac
  fi
  if [ -z "${offset}" ] && [ -n "${segment}" ]; then
    if command -v cksum >/dev/null 2>&1; then
      CKSUM_OUTPUT=$(printf "%s" "${segment}" | cksum)
      CKSUM_VALUE=${CKSUM_OUTPUT%% *}
      if [ -n "${CKSUM_VALUE}" ]; then
        offset=$(( CKSUM_VALUE % 100 ))
      fi
    fi
  fi
  echo "${offset:-0}"
}

INSTANCE_NAME=$(basename "${WORKTREE_ROOT}")
INSTANCE_OFFSET="$(instance_offset "${INSTANCE_NAME}")"
DEFAULT_BACKEND_PORT=$((8000 + INSTANCE_OFFSET))
DEFAULT_FRONTEND_PORT=$((3000 + INSTANCE_OFFSET))
DEFAULT_DEBUG_PORT=$((9222 + INSTANCE_OFFSET))

SETTA_HOST="${SETTA_HOST:-127.0.0.1}"
SETTA_PORT="${SETTA_PORT:-${DEFAULT_BACKEND_PORT}}"
SETTA_DEV_FRONTEND_PORT="${SETTA_DEV_FRONTEND_PORT:-${DEFAULT_FRONTEND_PORT}}"
DEBUG_PORT="${DEBUG_PORT:-${DEFAULT_DEBUG_PORT}}"
RUN_MODE="start"
OPEN_APP="1"

usage() {
  cat <<'EOF'
Usage: ai.sh [--reload] [--no-open]

Starts the backend + frontend plus a CDP-enabled Chrome for agent-browser and
Chrome DevTools MCP. Uses per-worktree ports and profiles by default.

Flags:
  --reload   Use backend reload mode (pnpm startr)
  --no-open  Skip the agent-browser bootstrap/open flow
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reload)
      RUN_MODE="startr"
      shift
      ;;
    --no-open)
      OPEN_APP="0"
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

export SETTA_HOST
export SETTA_PORT
export SETTA_DEV_FRONTEND_PORT
export SETTA_AUTH_COOKIE_NAME="setta_auth_${INSTANCE_NAME}"
export VITE_BACKEND_ORIGIN="http://${SETTA_HOST}:${SETTA_PORT}"
export DEBUG_PORT
export SETTA_NO_OPEN="${SETTA_NO_OPEN:-1}"

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
  "${ROOT_DIR}/scripts/stop-browser-mcp.sh" --devtools --agent-browser >/dev/null 2>&1 || true
  kill "${DEV_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

"${ROOT_DIR}/scripts/start-browser-mcp.sh" --devtools

wait_for_frontend() {
  local url="http://${SETTA_HOST}:${SETTA_DEV_FRONTEND_PORT}"
  local attempts=60
  if ! command -v curl >/dev/null 2>&1; then
    return 0
  fi
  while [ "${attempts}" -gt 0 ]; do
    if curl -fs "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
    attempts=$((attempts - 1))
  done
  return 1
}

if [[ "${OPEN_APP}" == "1" ]]; then
  if wait_for_frontend; then
    "${ROOT_DIR}/scripts/ab-cdp.sh" || true
  else
    echo "Frontend did not respond on ${SETTA_HOST}:${SETTA_DEV_FRONTEND_PORT}." >&2
  fi
fi

wait "${DEV_PID}"
