#!/usr/bin/env bash
set -euo pipefail

if [[ "${SETTA_E2E_TRACE:-}" == "1" ]]; then
  set -x
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_ROOT=$(git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${ROOT_DIR}")

source "${ROOT_DIR}/activate.sh"
if [[ ! -x "${ROOT_DIR}/.venv/bin/python" ]]; then
  echo "Missing ${ROOT_DIR}/.venv/bin/python after sourcing activate.sh." >&2
  exit 1
fi

PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"

# Tests rely on the workspace switcher SSH flow without requiring a real SSH
# server. Prepend a lightweight `ssh` stub (scripts/test/ssh) to PATH so the
# backend can spawn it when needed.
if [[ -x "${ROOT_DIR}/scripts/test/ssh" ]]; then
  export SETTA_SSH_BIN="${ROOT_DIR}/scripts/test/ssh"
  export PATH="${ROOT_DIR}/scripts/test:${PATH}"
fi

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

SETTA_HOST="${SETTA_HOST:-127.0.0.1}"
SETTA_DEV_FRONTEND_HOST="${SETTA_DEV_FRONTEND_HOST:-${SETTA_HOST}}"

pick_free_port() {
  EXCLUDE_PORTS="${1:-}" "${PYTHON_BIN}" - <<'PY'
import os
import socket

raw_exclude = os.environ.get("EXCLUDE_PORTS", "")
exclude = {int(p) for p in raw_exclude.split() if p}

for _ in range(100):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    if port not in exclude:
        print(port)
        raise SystemExit(0)

raise SystemExit("Unable to find a free port.")
PY
}

if [[ -z "${SETTA_PORT:-}" ]]; then
  SETTA_PORT="$(pick_free_port)"
fi

if [[ -z "${SETTA_DEV_FRONTEND_PORT:-}" ]]; then
  SETTA_DEV_FRONTEND_PORT="$(pick_free_port "${SETTA_PORT}")"
fi

SETTA_BACKEND_ORIGIN="${SETTA_BACKEND_ORIGIN:-http://${SETTA_HOST}:${SETTA_PORT}}"
PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://${SETTA_DEV_FRONTEND_HOST}:${SETTA_DEV_FRONTEND_PORT}}"
SETTA_WORKSPACE_ROOT="${SETTA_WORKSPACE_ROOT:-}"
TEMP_WORKSPACE_ROOT=""
if [[ -z "${SETTA_WORKSPACE_ROOT}" ]]; then
  TEMP_WORKSPACE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/setta-e2e-XXXXXX")"
  SETTA_WORKSPACE_ROOT="${TEMP_WORKSPACE_ROOT}"
fi
mkdir -p "${SETTA_WORKSPACE_ROOT}"
export SETTA_WORKSPACE_ROOT
export SETTA_DEV_FRONTEND_HOST
SETTA_HOME="${SETTA_HOME:-}"
TEMP_SETTA_HOME=""
if [[ -z "${SETTA_HOME}" ]]; then
  TEMP_SETTA_HOME="$(mktemp -d "${TMPDIR:-/tmp}/setta-e2e-home-XXXXXX")"
  SETTA_HOME="${TEMP_SETTA_HOME}/.setta"
  mkdir -p "${SETTA_HOME}"
fi
export SETTA_HOME
SETTA_AUTH_COOKIE_NAME="${SETTA_AUTH_COOKIE_NAME:-setta_auth_${INSTANCE_NAME}}"
export SETTA_AUTH_COOKIE_NAME
LOG_DIR="${SETTA_E2E_LOG_DIR:-${TMPDIR:-/tmp}/setta-e2e-logs-${INSTANCE_NAME}-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "${LOG_DIR}"

log() {
  echo "[$(date +"%Y-%m-%d %H:%M:%S")] $*"
}

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  local exit_code=$?
  log "Cleaning up (exit code ${exit_code}). Logs: ${LOG_DIR}"
  set +e
  local self_pgid
  self_pgid="$(ps -o pgid= -p $$ 2>/dev/null | tr -d ' ')"
  kill_process_tree() {
    local pid="$1"
    if [[ -z "${pid}" ]] || ! kill -0 "${pid}" 2>/dev/null; then
      return
    fi
    local children
    children="$(pgrep -P "${pid}" 2>/dev/null || true)"
    if [[ -n "${children}" ]]; then
      for child in ${children}; do
        kill_process_tree "${child}"
      done
    fi
    kill -TERM "${pid}" 2>/dev/null
    sleep 0.3
    if kill -0 "${pid}" 2>/dev/null; then
      kill -KILL "${pid}" 2>/dev/null
    fi
  }
  stop_process_group() {
    local pid="$1"
    local label="$2"
    if [[ -z "${pid}" ]] || ! kill -0 "${pid}" 2>/dev/null; then
      return
    fi
    local pgid
    pgid="$(ps -o pgid= -p "${pid}" 2>/dev/null | tr -d ' ')"
    if [[ -n "${pgid}" ]] && [[ "${pgid}" != "${self_pgid}" ]]; then
      log "Stopping ${label} process group (pgid ${pgid})."
      kill -TERM "-${pgid}" 2>/dev/null
      sleep 0.5
      if kill -0 "${pid}" 2>/dev/null; then
        log "Force stopping ${label} process group (pgid ${pgid})."
        kill -KILL "-${pgid}" 2>/dev/null
      fi
    else
      log "Stopping ${label} process tree (pid ${pid})."
      kill_process_tree "${pid}"
    fi
    wait "${pid}" 2>/dev/null
  }
  stop_process_group "${FRONTEND_PID}" "frontend"
  stop_process_group "${BACKEND_PID}" "backend"
  if [[ -n "${TEMP_WORKSPACE_ROOT}" ]] && [[ -d "${TEMP_WORKSPACE_ROOT}" ]]; then
    log "Removing temp workspace ${TEMP_WORKSPACE_ROOT}."
    rm -rf "${TEMP_WORKSPACE_ROOT}"
  fi
  if [[ -n "${TEMP_SETTA_HOME}" ]] && [[ -d "${TEMP_SETTA_HOME}" ]]; then
    log "Removing temp SETTA_HOME ${TEMP_SETTA_HOME}."
    rm -rf "${TEMP_SETTA_HOME}"
  fi
  exit "${exit_code}"
}

trap cleanup EXIT
trap 'log "Error on line ${LINENO}: ${BASH_COMMAND}"' ERR

seed_workspace() {
  if [[ "${SETTA_E2E_SEED_WORKSPACE:-1}" == "0" ]]; then
    log "Skipping workspace seed (SETTA_E2E_SEED_WORKSPACE=0)."
    return
  fi
  local project_file="${SETTA_WORKSPACE_ROOT}/setta_files/project.json"
  if [[ -f "${project_file}" ]]; then
    log "Workspace already seeded (${project_file} exists)."
    return
  fi
  log "Seeding minimal setta_files into ${SETTA_WORKSPACE_ROOT}."
  (
    cd "${ROOT_DIR}"
    source "./activate.sh"
    SETTA_WORKSPACE_ROOT="${SETTA_WORKSPACE_ROOT}" "${PYTHON_BIN}" - <<'PY'
import os
from pathlib import Path

from tests.utils.manager_fixture import _seed_minimal_setta_files

workspace = Path(os.environ["SETTA_WORKSPACE_ROOT"])
setta_root = workspace / "setta_files"
_seed_minimal_setta_files(setta_root)
PY
  ) >"${LOG_DIR}/seed.log" 2>&1
  log "Seeded workspace. Logs: ${LOG_DIR}/seed.log"
}

if [[ -z "${PLAYWRIGHT_HOST_PLATFORM_OVERRIDE:-}" ]]; then
  if [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
    export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE="mac-arm64"
  fi
fi

start_backend() {
  log "Starting backend at ${SETTA_BACKEND_ORIGIN} (workspace: ${SETTA_WORKSPACE_ROOT})."
  if command -v setsid >/dev/null 2>&1; then
    setsid bash -c "
      cd \"${ROOT_DIR}\" || exit 1
      source \"${ROOT_DIR}/activate.sh\" || exit 1
      cd \"${SETTA_WORKSPACE_ROOT}\" || exit 1
      exec env \
        SETTA_DEV_MODE=\"true\" \
        SETTA_DEV_FRONTEND_PORT=\"${SETTA_DEV_FRONTEND_PORT}\" \
        SETTA_NO_OPEN=1 \
        setta --host \"${SETTA_HOST}\" --port \"${SETTA_PORT}\" --no-open --log-level info
    " >"${LOG_DIR}/backend.log" 2>&1 &
  else
    (
      cd "${ROOT_DIR}"
      if ! source "./activate.sh"; then
        echo "Failed to source ${ROOT_DIR}/activate.sh. Ensure .venv exists in ${ROOT_DIR}." >&2
        exit 1
      fi
      cd "${SETTA_WORKSPACE_ROOT}"
      exec env \
        SETTA_DEV_MODE="true" \
        SETTA_DEV_FRONTEND_PORT="${SETTA_DEV_FRONTEND_PORT}" \
        SETTA_NO_OPEN=1 \
        setta --host "${SETTA_HOST}" --port "${SETTA_PORT}" --no-open --log-level info \
          >"${LOG_DIR}/backend.log" 2>&1
    ) &
  fi
  BACKEND_PID=$!
  log "Backend pid: ${BACKEND_PID}. Logs: ${LOG_DIR}/backend.log"
}

start_frontend() {
  log "Starting frontend at ${PLAYWRIGHT_BASE_URL} (backend origin: ${SETTA_BACKEND_ORIGIN})."
  if command -v setsid >/dev/null 2>&1; then
    setsid bash -c "
      cd \"${ROOT_DIR}/frontend\" || exit 1
      exec env \
        VITE_BACKEND_ORIGIN=\"${SETTA_BACKEND_ORIGIN}\" \
        SETTA_DEV_FRONTEND_PORT=\"${SETTA_DEV_FRONTEND_PORT}\" \
        SETTA_DEV_FRONTEND_HOST=\"${SETTA_DEV_FRONTEND_HOST}\" \
        pnpm exec vite
    " >"${LOG_DIR}/frontend.log" 2>&1 &
  else
    (
      cd "${ROOT_DIR}/frontend"
      exec env \
        VITE_BACKEND_ORIGIN="${SETTA_BACKEND_ORIGIN}" \
        SETTA_DEV_FRONTEND_PORT="${SETTA_DEV_FRONTEND_PORT}" \
        SETTA_DEV_FRONTEND_HOST="${SETTA_DEV_FRONTEND_HOST}" \
        pnpm exec vite >"${LOG_DIR}/frontend.log" 2>&1
    ) &
  fi
  FRONTEND_PID=$!
  log "Frontend pid: ${FRONTEND_PID}. Logs: ${LOG_DIR}/frontend.log"
}

wait_for_url() {
  local url="$1"
  local label="$2"
  local timeout="${3:-60}"
  log "Waiting for ${label} at ${url} (timeout ${timeout}s)."
  "${PYTHON_BIN}" - "${url}" "${label}" "${timeout}" <<'PY'
import sys
import time
import urllib.error
import urllib.request

url = sys.argv[1]
label = sys.argv[2]
timeout = float(sys.argv[3])
deadline = time.monotonic() + timeout

while time.monotonic() < deadline:
    try:
        with urllib.request.urlopen(url, timeout=2) as resp:
            if resp.status < 500:
                sys.exit(0)
    except Exception:
        time.sleep(0.5)

raise SystemExit(f"Timed out waiting for {label} at {url}.")
PY
}

seed_workspace
start_backend
start_frontend

wait_for_url "${PLAYWRIGHT_BASE_URL}" "frontend" 60

log "Minting bootstrap token."
BOOTSTRAP_TOKEN="$(
  cd "${ROOT_DIR}"
  source "./activate.sh"
  "${PYTHON_BIN}" - <<'PY'
import os
import time
from pathlib import Path
from setta.auth.manager import BOOTSTRAP_TOKEN_MANAGER
from setta.sessions.constants import SESSIONS_ROOT_ENV_VAR
from setta.sessions.registry import SessionRegistry
from setta.sessions.utils import resolve_sessions_root

def _resolve_sessions_root() -> Path | None:
    env_root = os.environ.get(SESSIONS_ROOT_ENV_VAR)
    if env_root:
        expanded = os.path.expandvars(os.path.expanduser(env_root))
        return Path(expanded).resolve()
    workspace_root = os.environ.get("SETTA_WORKSPACE_ROOT")
    if not workspace_root:
        return None
    return resolve_sessions_root(workspace_root)

timeout = float(os.environ.get("SETTA_E2E_SESSION_WAIT_SECONDS", "60"))
deadline = time.monotonic() + timeout
last_error: Exception | None = None

while time.monotonic() < deadline:
    try:
        sessions_root = _resolve_sessions_root()
        if sessions_root is None:
            raise RuntimeError(
                "No sessions root available. Set SETTA_WORKSPACE_ROOT or SETTA_SESSIONS_ROOT."
            )
        registry = SessionRegistry(sessions_root=sessions_root)
        workspace_root = os.environ.get("SETTA_WORKSPACE_ROOT")
        sessions = []
        if workspace_root:
            workspace_path = Path(
                os.path.expandvars(os.path.expanduser(workspace_root))
            ).resolve()
            sessions = registry.find_sessions_by_workspace(workspace_path)
            if not sessions:
                sessions = registry.find_sessions_by_workspace(
                    workspace_path, prune_stale=False
                )
        if not sessions:
            sessions = registry.load_sessions(prune_stale=False)
        if sessions:
            latest = max(sessions, key=lambda entry: entry.startedAt)
            secret = registry.load_secret(latest)
            print(BOOTSTRAP_TOKEN_MANAGER.mint(latest.id, secret))
            raise SystemExit(0)
    except Exception as exc:
        last_error = exc
    time.sleep(0.5)

if last_error:
    raise SystemExit(f"Timed out waiting for a backend session: {last_error}")
raise SystemExit("Timed out waiting for a backend session.")
PY
)"

declare -a PLAYWRIGHT_EXTRA_ARGS=()

user_supplied_max_failures=0
for arg in "$@"; do
  case "${arg}" in
    --max-failures|--max-failures=*)
      user_supplied_max_failures=1
      break
      ;;
  esac
done

if [[ "${user_supplied_max_failures}" -eq 0 ]]; then
  max_failures_raw="${SETTA_E2E_MAX_FAILURES:-1}"
  if ! [[ "${max_failures_raw}" =~ ^[0-9]+$ ]]; then
    echo "Invalid SETTA_E2E_MAX_FAILURES: ${max_failures_raw}. Expected a non-negative integer." >&2
    exit 1
  fi
  if [[ "${max_failures_raw}" != "0" ]]; then
    PLAYWRIGHT_EXTRA_ARGS+=(--max-failures "${max_failures_raw}")
  fi
fi

if [[ -n "${SETTA_E2E_TEST_TIMEOUT_SECONDS:-}" ]]; then
  timeout_ms="$(
    "${PYTHON_BIN}" - <<'PY'
import os

raw = os.environ.get("SETTA_E2E_TEST_TIMEOUT_SECONDS", "").strip()
if not raw:
    raise SystemExit(1)
try:
    seconds = float(raw)
except ValueError:
    raise SystemExit(f"Invalid SETTA_E2E_TEST_TIMEOUT_SECONDS: {raw}")
if seconds <= 0:
    raise SystemExit("SETTA_E2E_TEST_TIMEOUT_SECONDS must be positive.")
print(int(seconds * 1000))
PY
  )"
  PLAYWRIGHT_EXTRA_ARGS+=(--timeout "${timeout_ms}")
fi

if [[ -n "${SETTA_E2E_PW_TRACE:-}" ]]; then
  trace_value="${SETTA_E2E_PW_TRACE}"
  if [[ "${trace_value}" == "1" || "${trace_value}" == "true" ]]; then
    trace_value="on"
  fi
  PLAYWRIGHT_EXTRA_ARGS+=(--trace "${trace_value}")
fi

log "Running Playwright tests."
cd "${ROOT_DIR}/frontend"
PLAYWRIGHT_CMD=(pnpm exec playwright test --reporter=line)
if (( ${#PLAYWRIGHT_EXTRA_ARGS[@]} )); then
  PLAYWRIGHT_CMD+=("${PLAYWRIGHT_EXTRA_ARGS[@]}")
fi
PLAYWRIGHT_CMD+=("$@")
PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL}" \
SETTA_BACKEND_ORIGIN="${SETTA_BACKEND_ORIGIN}" \
SETTA_BOOTSTRAP_TOKEN="${BOOTSTRAP_TOKEN}" \
"${PLAYWRIGHT_CMD[@]}"
