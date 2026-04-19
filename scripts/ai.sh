#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKTREE_ROOT=$(git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${ROOT_DIR}")
. "${SCRIPT_DIR}/lib/setta_path_flags.sh"
. "${SCRIPT_DIR}/lib/setta_port_selection.sh"
. "${SCRIPT_DIR}/lib/node_tooling.sh"
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
BROWSER_MODE=""

usage() {
  cat <<'EOF'
Usage: ai.sh [--reload] [--browser-mode headed|headless] [--profile name] [--setta-home path] [--setta-files-root path] [--setta-files-location mode] [--runtime-root path]

Starts the backend + frontend plus a CDP-enabled Chrome for Chrome DevTools MCP.
Uses per-worktree ports and dev paths by default:
  SETTA_HOME=~/.setta-development
  SETTA_FILES_ROOT=<worktree>/setta_files_dev

Flags:
  --reload               Use backend reload mode (pnpm startr)
  --browser-mode MODE    headed or headless for the devtools browser
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
    --browser-mode)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --browser-mode" >&2
        usage >&2
        exit 1
      fi
      BROWSER_MODE="$2"
      shift 2
      ;;
    --browser-mode=*)
      BROWSER_MODE="${1#*=}"
      if [[ -z "${BROWSER_MODE}" ]]; then
        echo "Missing value for --browser-mode" >&2
        usage >&2
        exit 1
      fi
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

if [[ -n "${BROWSER_MODE}" ]]; then
  case "${BROWSER_MODE}" in
    headed)
      export DEVTOOLS_HEADLESS="0"
      ;;
    headless)
      export DEVTOOLS_HEADLESS="1"
      ;;
    *)
      echo "Invalid value for --browser-mode: ${BROWSER_MODE}. Expected headed or headless." >&2
      exit 1
      ;;
  esac
fi

export SETTA_HOST
export SETTA_PORT
export SETTA_DEV_FRONTEND_PORT
export VITE_BACKEND_ORIGIN="http://${SETTA_HOST}:${SETTA_PORT}"
export DEBUG_PORT
export SETTA_NO_OPEN="${SETTA_NO_OPEN:-1}"
# Avoid clobbering repo-root backend.log, which start.sh/reset.sh use.
export SETTA_BACKEND_LOG_FILE="${ROOT_DIR}/chrome_mcp_backend.log"
setta_path_flags_apply_env

run_pnpm() {
  setta_run_pnpm "${ROOT_DIR}" "$@"
}

resolve_python_bin() {
  if [[ -n "${VIRTUAL_ENV:-}" ]] && [[ -x "${VIRTUAL_ENV}/bin/python" ]]; then
    echo "${VIRTUAL_ENV}/bin/python"
    return 0
  fi
  if [[ -x "${ROOT_DIR}/.venv/bin/python" ]]; then
    echo "${ROOT_DIR}/.venv/bin/python"
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    echo "python3"
    return 0
  fi
  if command -v python >/dev/null 2>&1; then
    echo "python"
    return 0
  fi
  return 1
}

launch_command_in_new_session() {
  if command -v setsid >/dev/null 2>&1; then
    setsid "$@" </dev/null &
    DEV_PID=$!
    return 0
  fi

  local python_bin=""
  python_bin="$(resolve_python_bin || true)"
  if [[ -n "${python_bin}" ]]; then
    "${python_bin}" - "$@" <<'PY' &
import os
import signal
import subprocess
import sys

child = None


def forward_signal(signum, _frame):
    if child is None:
        return
    try:
        os.killpg(child.pid, signum)
    except ProcessLookupError:
        return


os.setsid()
signal.signal(signal.SIGHUP, signal.SIG_IGN)
signal.signal(signal.SIGINT, forward_signal)
signal.signal(signal.SIGTERM, forward_signal)
child = subprocess.Popen(sys.argv[1:], stdin=subprocess.DEVNULL, start_new_session=True)
raise SystemExit(child.wait())
PY
    DEV_PID=$!
    return 0
  fi

  nohup "$@" </dev/null >/dev/null 2>&1 &
  DEV_PID=$!
}

start_dev_runtime() {
  local pnpm_subcommand="start"
  if [[ "${RUN_MODE}" == "startr" ]]; then
    pnpm_subcommand="startr"
  fi

  launch_command_in_new_session \
    env \
    DEV_ROOT_DIR="${ROOT_DIR}" \
    DEV_PNPM_SUBCOMMAND="${pnpm_subcommand}" \
    bash -lc '
      set -euo pipefail
      . "${DEV_ROOT_DIR}/scripts/lib/node_tooling.sh"
      cd "${DEV_ROOT_DIR}/frontend"
      setta_run_pnpm "${DEV_ROOT_DIR}" "${DEV_PNPM_SUBCOMMAND}"
    '
}

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

trap '' HUP
start_dev_runtime

cleanup() {
  "${ROOT_DIR}/scripts/stop-browser-mcp.sh" --devtools >/dev/null 2>&1 || true
  if [[ -n "${DEV_PID:-}" ]]; then
    kill -- -"${DEV_PID}" 2>/dev/null || kill "${DEV_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

browser_mcp_args=(--devtools)
if [[ -n "${BROWSER_MODE}" ]]; then
  browser_mcp_args+=(--browser-mode "${BROWSER_MODE}")
fi
"${ROOT_DIR}/scripts/start-browser-mcp.sh" "${browser_mcp_args[@]}"

wait "${DEV_PID}"
