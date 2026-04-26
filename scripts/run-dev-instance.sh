#!/bin/sh

set -e

INSTANCE_NAME=""
if [ "$#" -gt 0 ]; then
  case "$1" in
    -h|--help)
      echo "Usage: $0 [instance-name] [--host host] [--backend-port port] [--frontend-port port] [--mode start|startr|reset] [--profile name] [--setta-home path] [--setta-files-root path] [--setta-files-location mode] [--runtime-root path]" >&2
      echo "If instance-name is omitted, the worktree folder name is used." >&2
      echo "Starts the local dev server plus Vite via frontend/package.json." >&2
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
. "${SCRIPT_DIR}/lib/setta_port_selection.sh"

if [ -z "${INSTANCE_NAME}" ]; then
  INSTANCE_NAME=$(basename "${WORKTREE_ROOT}")
fi

if [ -n "${HOME:-}" ]; then
  DEFAULT_SETTA_HOME="${HOME}/.setta-development"
else
  DEFAULT_SETTA_HOME=".setta-development"
fi
DEFAULT_DEV_SETTA_FILES_ROOT="${WORKTREE_ROOT}/setta_files_dev"
INSTANCE_OFFSET="$(setta_instance_offset "${INSTANCE_NAME}")"
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
  PICKED_OFFSET="$(setta_pick_free_offset "${INSTANCE_OFFSET}" || true)"
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
  SETTA_PORT="$(
    setta_pick_free_port_from \
      "${DEFAULT_BACKEND_PORT}" \
      200 \
      "${SETTA_DEV_FRONTEND_PORT:-}" \
      || true
  )"
  if [ -z "${SETTA_PORT:-}" ]; then
    echo "Unable to find a free backend port starting at ${DEFAULT_BACKEND_PORT}." >&2
    exit 1
  fi
fi

if [ "${SETTA_DEV_FRONTEND_PORT_WAS_SET}" -eq 0 ]; then
  SETTA_DEV_FRONTEND_PORT="$(
    setta_pick_free_port_from \
      "${DEFAULT_FRONTEND_PORT}" \
      200 \
      "${SETTA_PORT}" \
      || true
  )"
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

missing_dev_requirements=""
append_missing_requirement() {
  requirement="$1"
  if [ -n "${missing_dev_requirements}" ]; then
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
if [ -n "${missing_dev_requirements}" ]; then
  echo "Missing dev dependencies (${missing_dev_requirements}). Run ./dev_install.sh first." >&2
  exit 1
fi

cd "${ROOT_DIR}/frontend"

if [ "${RUN_MODE}" = "startr" ]; then
  pnpm startr
elif [ "${RUN_MODE}" = "reset" ]; then
  pnpm reset
else
  pnpm start
fi
