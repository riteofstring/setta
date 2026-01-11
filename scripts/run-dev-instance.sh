#!/bin/sh

set -e

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <instance-name> [--host host] [--backend-port port] [--frontend-port port] [--mode start|startr]" >&2
  exit 1
fi

INSTANCE_NAME="$1"
shift

# Derive a stable port offset from trailing digits or a single-letter name.
INSTANCE_OFFSET="${INSTANCE_NAME##*[!0-9]}"
if [ -z "${INSTANCE_OFFSET}" ] && [ "${#INSTANCE_NAME}" -eq 1 ]; then
  case "${INSTANCE_NAME}" in
    [a-z])
      INSTANCE_OFFSET=$(( $(printf '%d' "'${INSTANCE_NAME}") - 97 ))
      ;;
    [A-Z])
      INSTANCE_OFFSET=$(( $(printf '%d' "'${INSTANCE_NAME}") - 65 ))
      ;;
  esac
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

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "${SCRIPT_DIR}/.." && pwd)

cd "${ROOT_DIR}/frontend"

if [ "${RUN_MODE}" = "startr" ]; then
  pnpm startr
else
  pnpm start
fi
