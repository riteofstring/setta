#!/bin/sh

set -e

INSTANCE_NAME=""
if [ "$#" -gt 0 ]; then
  case "$1" in
    -h|--help)
      echo "Usage: $0 [instance-name] [--host host] [--backend-port port] [--frontend-port port] [--mode start|startr|reset] [--profile name] [--setta-home path] [--setta-files-root path] [--setta-files-location mode] [--runtime-root path]" >&2
      echo "If instance-name is omitted, the worktree folder name is used." >&2
      echo "Default dev paths: SETTA_HOME=~/.setta-development and SETTA_FILES_ROOT=<worktree>/setta_files_dev." >&2
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
. "${SCRIPT_DIR}/lib/setta_path_flags.sh"

if [ -z "${INSTANCE_NAME}" ]; then
  INSTANCE_NAME=$(basename "${WORKTREE_ROOT}")
fi

if [ -n "${HOME:-}" ]; then
  DEFAULT_SETTA_HOME="${HOME}/.setta-development"
else
  DEFAULT_SETTA_HOME=".setta-development"
fi
DEFAULT_DEV_SETTA_FILES_ROOT="${WORKTREE_ROOT}/setta_files_dev"

instance_offset() {
  instance_name="$1"
  segment="${instance_name}"
  suffix=""

  case "${segment}" in
    setta.*)
      segment="${segment#setta.}"
      ;;
  esac

  # Allow explicit numeric suffixes anywhere at the end, e.g. "feature-1" or "worktree12".
  offset="${segment##*[!0-9]}"
  if [ -n "${offset}" ]; then
    offset="$(printf "%s" "${offset}" | sed 's/^0*//')"
    if [ -z "${offset}" ]; then
      offset="0"
    fi
    echo "${offset}"
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

port_in_use() {
  port="$1"
  if ! command -v lsof >/dev/null 2>&1; then
    return 1
  fi
  lsof -iTCP:"${port}" -sTCP:LISTEN -n >/dev/null 2>&1
}

pick_free_offset() {
  offset="$1"
  attempts="${2:-200}"
  i=0
  while [ "${i}" -le "${attempts}" ]; do
    candidate_offset=$((offset + i))
    backend_port=$((8000 + candidate_offset))
    frontend_port=$((3000 + candidate_offset))
    if ! port_in_use "${backend_port}" && ! port_in_use "${frontend_port}"; then
      echo "${candidate_offset}"
      return 0
    fi
    i=$((i + 1))
  done
  return 1
}

pick_free_port_from() {
  port="$1"
  attempts="${2:-200}"
  i=0
  while [ "${i}" -le "${attempts}" ]; do
    candidate_port=$((port + i))
    if ! port_in_use "${candidate_port}"; then
      echo "${candidate_port}"
      return 0
    fi
    i=$((i + 1))
  done
  return 1
}

INSTANCE_OFFSET="$(instance_offset "${INSTANCE_NAME}")"
DEFAULT_BACKEND_PORT=$((8000 + INSTANCE_OFFSET))
DEFAULT_FRONTEND_PORT=$((3000 + INSTANCE_OFFSET))

SETTA_HOST="${SETTA_HOST:-127.0.0.1}"
SETTA_PORT="${SETTA_PORT:-}"
SETTA_DEV_FRONTEND_PORT="${SETTA_DEV_FRONTEND_PORT:-}"
SETTA_PORT_WAS_SET=0
if [ -n "${SETTA_PORT}" ]; then
  SETTA_PORT_WAS_SET=1
fi
SETTA_DEV_FRONTEND_PORT_WAS_SET=0
if [ -n "${SETTA_DEV_FRONTEND_PORT}" ]; then
  SETTA_DEV_FRONTEND_PORT_WAS_SET=1
fi
RUN_MODE="start"
setta_path_flags_init "${DEFAULT_SETTA_HOME}" "${DEFAULT_DEV_SETTA_FILES_ROOT}"
setta_path_flags_seed_from_env

while [ "$#" -gt 0 ]; do
  case "$1" in
    --host)
      setta_require_option_value "$1" "$#" "${2-}"
      SETTA_HOST="$2"
      shift 2
      ;;
    --backend-port)
      setta_require_option_value "$1" "$#" "${2-}"
      SETTA_PORT="$2"
      SETTA_PORT_WAS_SET=1
      shift 2
      ;;
    --frontend-port)
      setta_require_option_value "$1" "$#" "${2-}"
      SETTA_DEV_FRONTEND_PORT="$2"
      SETTA_DEV_FRONTEND_PORT_WAS_SET=1
      shift 2
      ;;
    --mode)
      setta_require_option_value "$1" "$#" "${2-}"
      RUN_MODE="$2"
      shift 2
      ;;
    *)
      if setta_path_flags_try_parse "$@"; then
        shift "${SETTA_PATH_FLAGS_CONSUMED}"
      else
        echo "Unknown arg: $1" >&2
        exit 1
      fi
      ;;
  esac
done

setta_path_flags_validate

if [ "${SETTA_PORT_WAS_SET}" -eq 0 ] && [ "${SETTA_DEV_FRONTEND_PORT_WAS_SET}" -eq 0 ]; then
  PICKED_OFFSET="$(pick_free_offset "${INSTANCE_OFFSET}" || true)"
  if [ -z "${PICKED_OFFSET:-}" ]; then
    echo "Unable to find a free backend/frontend port offset starting at ${INSTANCE_OFFSET}." >&2
    exit 1
  fi
  if [ "${PICKED_OFFSET}" != "${INSTANCE_OFFSET}" ]; then
    echo "Default dev ports are in use; using offset ${PICKED_OFFSET} (backend $((8000 + PICKED_OFFSET)), frontend $((3000 + PICKED_OFFSET)))." >&2
    INSTANCE_OFFSET="${PICKED_OFFSET}"
    DEFAULT_BACKEND_PORT=$((8000 + INSTANCE_OFFSET))
    DEFAULT_FRONTEND_PORT=$((3000 + INSTANCE_OFFSET))
  fi
fi

if [ "${SETTA_PORT_WAS_SET}" -eq 0 ]; then
  SETTA_PORT="$(pick_free_port_from "${DEFAULT_BACKEND_PORT}" || true)"
  if [ -z "${SETTA_PORT:-}" ]; then
    echo "Unable to find a free backend port starting at ${DEFAULT_BACKEND_PORT}." >&2
    exit 1
  fi
fi

if [ "${SETTA_DEV_FRONTEND_PORT_WAS_SET}" -eq 0 ]; then
  SETTA_DEV_FRONTEND_PORT="$(pick_free_port_from "${DEFAULT_FRONTEND_PORT}" || true)"
  if [ -z "${SETTA_DEV_FRONTEND_PORT:-}" ]; then
    echo "Unable to find a free frontend port starting at ${DEFAULT_FRONTEND_PORT}." >&2
    exit 1
  fi
fi

export SETTA_HOST
export SETTA_PORT
export SETTA_DEV_FRONTEND_PORT
export SETTA_AUTH_COOKIE_NAME="setta_auth_${INSTANCE_NAME}"
export VITE_BACKEND_ORIGIN="http://${SETTA_HOST}:${SETTA_PORT}"
setta_path_flags_apply_env

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
