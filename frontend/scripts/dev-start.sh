#!/bin/sh

set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
FRONTEND_DIR=$(cd "${SCRIPT_DIR}/.." && pwd)
ROOT_DIR=$(cd "${FRONTEND_DIR}/.." && pwd)

WORKTREE_ROOT=$(git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${ROOT_DIR}")
INSTANCE_NAME=$(basename "${WORKTREE_ROOT}")

INSTANCE_SEGMENT="${INSTANCE_NAME}"
case "${INSTANCE_SEGMENT}" in
  setta.*)
    INSTANCE_SEGMENT="${INSTANCE_SEGMENT#setta.}"
    ;;
esac
case "${INSTANCE_SEGMENT}" in
  *-*)
    INSTANCE_SEGMENT="${INSTANCE_SEGMENT##*-}"
    ;;
esac
case "${INSTANCE_SEGMENT}" in
  *_*)
    INSTANCE_SEGMENT="${INSTANCE_SEGMENT##*_}"
    ;;
esac
case "${INSTANCE_SEGMENT}" in
  *.*)
    INSTANCE_SEGMENT="${INSTANCE_SEGMENT##*.}"
    ;;
esac

INSTANCE_OFFSET="${INSTANCE_SEGMENT##*[!0-9]}"
if [ -z "${INSTANCE_OFFSET}" ] && [ "${#INSTANCE_SEGMENT}" -eq 1 ]; then
  case "${INSTANCE_SEGMENT}" in
    [a-z])
      INSTANCE_OFFSET=$(( $(printf '%d' "'${INSTANCE_SEGMENT}") - 97 ))
      ;;
    [A-Z])
      INSTANCE_OFFSET=$(( $(printf '%d' "'${INSTANCE_SEGMENT}") - 65 ))
      ;;
  esac
fi
if [ -z "${INSTANCE_OFFSET}" ] && [ -n "${INSTANCE_SEGMENT}" ]; then
  if command -v cksum >/dev/null 2>&1; then
    CKSUM_OUTPUT=$(printf "%s" "${INSTANCE_SEGMENT}" | cksum)
    CKSUM_VALUE=${CKSUM_OUTPUT%% *}
    if [ -n "${CKSUM_VALUE}" ]; then
      INSTANCE_OFFSET=$(( CKSUM_VALUE % 100 ))
    fi
  fi
fi
INSTANCE_OFFSET="${INSTANCE_OFFSET:-0}"

DEFAULT_BACKEND_PORT=$((8000 + INSTANCE_OFFSET))
DEFAULT_FRONTEND_PORT=$((3000 + INSTANCE_OFFSET))

SETTA_HOST="${SETTA_HOST:-127.0.0.1}"
SETTA_PORT="${SETTA_PORT:-${DEFAULT_BACKEND_PORT}}"
SETTA_DEV_FRONTEND_PORT="${SETTA_DEV_FRONTEND_PORT:-${DEFAULT_FRONTEND_PORT}}"

export SETTA_HOST
export SETTA_PORT
export SETTA_DEV_FRONTEND_PORT
export SETTA_AUTH_COOKIE_NAME="${SETTA_AUTH_COOKIE_NAME:-setta_auth_${INSTANCE_NAME}}"

if [ -z "${VITE_BACKEND_ORIGIN:-}" ]; then
  export VITE_BACKEND_ORIGIN="http://${SETTA_HOST}:${SETTA_PORT}"
fi

NEEDS_DEV_INSTALL=0
if [ ! -d "${ROOT_DIR}/.venv" ] || [ ! -f "${ROOT_DIR}/.venv/bin/activate" ]; then
  NEEDS_DEV_INSTALL=1
fi
if [ ! -d "${FRONTEND_DIR}/node_modules" ]; then
  NEEDS_DEV_INSTALL=1
fi
if [ "${NEEDS_DEV_INSTALL}" -eq 1 ]; then
  echo "Missing dev dependencies; running . ./dev_install.sh" >&2
  (cd "${ROOT_DIR}" && . ./dev_install.sh)
fi

cd "${FRONTEND_DIR}"

BACKEND_CMD="bash ./backendStart.sh"
if [ "${1:-}" = "--reload" ]; then
  BACKEND_CMD="bash ./backendStart.sh --reload"
elif [ -n "${1:-}" ]; then
  echo "Unknown arg: $1" >&2
  exit 1
fi

concurrently --kill-others "vite" "${BACKEND_CMD}"
