#!/bin/sh

set -e

INSTANCE_NAME=""
if [ "$#" -gt 0 ]; then
  case "$1" in
    -h|--help)
      echo "Usage: $0 [instance-name] [--host host] [--backend-port port] [--frontend-port port] [--mode start|startr]" >&2
      echo "If instance-name is omitted, the worktree folder name is used." >&2
      exit 0
      ;;
    --*)
      ;;
    *)
      INSTANCE_NAME="$1"
      shift
      ;;
  esac
fi

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "${SCRIPT_DIR}/.." && pwd)

if [ -z "${INSTANCE_NAME}" ]; then
  WORKTREE_ROOT=$(git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${ROOT_DIR}")
  INSTANCE_NAME=$(basename "${WORKTREE_ROOT}")
fi

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

# Derive a stable port offset from trailing digits or a single-letter segment.
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
    set -- $(printf "%s" "${INSTANCE_SEGMENT}" | cksum)
    if [ -n "$1" ]; then
      INSTANCE_OFFSET=$(( $1 % 100 ))
    fi
  fi
fi
INSTANCE_OFFSET="${INSTANCE_OFFSET:-0}"

DEFAULT_BACKEND_PORT=$((8000 + INSTANCE_OFFSET))
DEFAULT_FRONTEND_PORT=$((3000 + INSTANCE_OFFSET))

SETTA_HOST="${SETTA_HOST:-127.0.0.1}"
SETTA_PORT="${SETTA_PORT:-${DEFAULT_BACKEND_PORT}}"
SETTA_DEV_FRONTEND_PORT="${SETTA_DEV_FRONTEND_PORT:-${DEFAULT_FRONTEND_PORT}}"
RUN_MODE="start"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --host)
      SETTA_HOST="$2"
      shift 2
      ;;
    --backend-port)
      SETTA_PORT="$2"
      shift 2
      ;;
    --frontend-port)
      SETTA_DEV_FRONTEND_PORT="$2"
      shift 2
      ;;
    --mode)
      RUN_MODE="$2"
      shift 2
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

export SETTA_HOST
export SETTA_PORT
export SETTA_DEV_FRONTEND_PORT
export SETTA_AUTH_COOKIE_NAME="setta_auth_${INSTANCE_NAME}"
export VITE_BACKEND_ORIGIN="http://${SETTA_HOST}:${SETTA_PORT}"

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

cd "${ROOT_DIR}/frontend"

if [ "${RUN_MODE}" = "startr" ]; then
  pnpm startr
else
  pnpm start
fi
