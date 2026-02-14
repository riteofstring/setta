#!/bin/sh

set -e

INSTANCE_NAME=""
if [ "$#" -gt 0 ]; then
  case "$1" in
    -h|--help)
      echo "Usage: $0 [instance-name] [--host host] [--backend-port port] [--frontend-port port] [--mode start|startr|reset] [--profile name] [--setta-home path] [--setta-files-root path] [--setta-files-location mode] [--runtime-root path]" >&2
      echo "If instance-name is omitted, the worktree folder name is used." >&2
      echo "Default dev paths: SETTA_HOME=~/.setta-development and SETTA_FILES_ROOT=<worktree>/dev_setta_files." >&2
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
WORKTREE_ROOT=$(git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${ROOT_DIR}")

if [ -z "${INSTANCE_NAME}" ]; then
  INSTANCE_NAME=$(basename "${WORKTREE_ROOT}")
fi

if [ -n "${HOME:-}" ]; then
  DEFAULT_SETTA_HOME="${HOME}/.setta-development"
else
  DEFAULT_SETTA_HOME=".setta-development"
fi
DEFAULT_DEV_SETTA_FILES_ROOT="${WORKTREE_ROOT}/dev_setta_files"

INSTANCE_KEY="${INSTANCE_NAME}"
case "${INSTANCE_KEY}" in
  setta.*)
    INSTANCE_KEY="${INSTANCE_KEY#setta.}"
    ;;
esac
SUFFIX_SEGMENT="${INSTANCE_KEY}"
case "${SUFFIX_SEGMENT}" in
  *-*) SUFFIX_SEGMENT="${SUFFIX_SEGMENT##*-}" ;;
esac
case "${SUFFIX_SEGMENT}" in
  *_*) SUFFIX_SEGMENT="${SUFFIX_SEGMENT##*_}" ;;
esac
case "${SUFFIX_SEGMENT}" in
  *.*) SUFFIX_SEGMENT="${SUFFIX_SEGMENT##*.}" ;;
esac

# Derive a stable port offset from trailing digits or a single-letter suffix.
INSTANCE_OFFSET="${INSTANCE_KEY##*[!0-9]}"
if [ -z "${INSTANCE_OFFSET}" ] && [ "${#SUFFIX_SEGMENT}" -eq 1 ]; then
  case "${SUFFIX_SEGMENT}" in
    [a-z])
      INSTANCE_OFFSET=$(( $(printf '%d' "'${SUFFIX_SEGMENT}") - 97 ))
      ;;
    [A-Z])
      INSTANCE_OFFSET=$(( $(printf '%d' "'${SUFFIX_SEGMENT}") - 65 ))
      ;;
  esac
fi
if [ -z "${INSTANCE_OFFSET}" ] && [ -n "${INSTANCE_KEY}" ]; then
  if command -v cksum >/dev/null 2>&1; then
    CKSUM_OUTPUT=$(printf "%s" "${INSTANCE_KEY}" | cksum)
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
RUN_MODE="start"
SETTA_PROFILE_OVERRIDE=""
SETTA_HOME_OVERRIDE=""
SETTA_FILES_ROOT_OVERRIDE=""
SETTA_FILES_LOCATION_OVERRIDE=""
SETTA_RUNTIME_ROOT_OVERRIDE=""

EFFECTIVE_SETTA_HOME="${SETTA_HOME:-${DEFAULT_SETTA_HOME}}"
EFFECTIVE_SETTA_FILES_ROOT="${SETTA_FILES_ROOT:-}"
EFFECTIVE_SETTA_FILES_LOCATION="${SETTA_FILES_LOCATION:-}"
if [ -n "${EFFECTIVE_SETTA_FILES_ROOT}" ] && [ -n "${EFFECTIVE_SETTA_FILES_LOCATION}" ]; then
  EFFECTIVE_SETTA_FILES_LOCATION=""
fi
if [ -z "${EFFECTIVE_SETTA_FILES_ROOT}" ] && [ -z "${EFFECTIVE_SETTA_FILES_LOCATION}" ]; then
  EFFECTIVE_SETTA_FILES_ROOT="${DEFAULT_DEV_SETTA_FILES_ROOT}"
fi

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
    --profile)
      SETTA_PROFILE_OVERRIDE="$2"
      shift 2
      ;;
    --setta-home)
      SETTA_HOME_OVERRIDE="$2"
      shift 2
      ;;
    --setta-files-root)
      SETTA_FILES_ROOT_OVERRIDE="$2"
      shift 2
      ;;
    --setta-files-location)
      SETTA_FILES_LOCATION_OVERRIDE="$2"
      shift 2
      ;;
    --runtime-root)
      SETTA_RUNTIME_ROOT_OVERRIDE="$2"
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
if [ -n "${SETTA_HOME_OVERRIDE}" ]; then
  EFFECTIVE_SETTA_HOME="${SETTA_HOME_OVERRIDE}"
fi
export SETTA_HOME="${EFFECTIVE_SETTA_HOME}"

if [ -n "${SETTA_FILES_ROOT_OVERRIDE}" ]; then
  EFFECTIVE_SETTA_FILES_ROOT="${SETTA_FILES_ROOT_OVERRIDE}"
  EFFECTIVE_SETTA_FILES_LOCATION=""
fi
if [ -n "${SETTA_FILES_LOCATION_OVERRIDE}" ]; then
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
fi
if [ -n "${SETTA_RUNTIME_ROOT_OVERRIDE}" ]; then
  export SETTA_RUNTIME_ROOT="${SETTA_RUNTIME_ROOT_OVERRIDE}"
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

cd "${ROOT_DIR}/frontend"

if [ "${RUN_MODE}" = "startr" ]; then
  pnpm startr
elif [ "${RUN_MODE}" = "reset" ]; then
  pnpm reset
else
  pnpm start
fi
