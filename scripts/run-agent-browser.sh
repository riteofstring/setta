#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "${SCRIPT_DIR}/.." && pwd)

WORKTREE_ROOT=$(git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${ROOT_DIR}")
INSTANCE_NAME=$(basename "${WORKTREE_ROOT}")

profile_suffix() {
  local root="$1"

  if command -v shasum >/dev/null 2>&1; then
    printf "%s" "$root" | shasum -a 256 | awk '{print substr($1,1,12)}'
    return
  fi

  if command -v md5 >/dev/null 2>&1; then
    printf "%s" "$root" | md5 -q 2>/dev/null | awk '{print substr($1,1,12)}'
    return
  fi

  basename "$root" | tr ' ' '_'
}

PROFILE_SUFFIX="$(profile_suffix "${WORKTREE_ROOT}")"
MCP_RUN_DIR="${WORKTREE_ROOT}/setta_files/run/mcp"
AGENT_BROWSER_SESSION_DEFAULT="setta-${PROFILE_SUFFIX}"
AGENT_BROWSER_SESSION="${AGENT_BROWSER_SESSION:-${AGENT_BROWSER_SESSION_DEFAULT}}"
AGENT_BROWSER_TMPDIR="${AGENT_BROWSER_TMPDIR:-${MCP_RUN_DIR}/agent-browser-tmp}"
AGENT_BROWSER_SOCKET_PATH_LIMIT="${AGENT_BROWSER_SOCKET_PATH_LIMIT:-100}"

resolve_playwright_browsers_path() {
  if [[ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ]]; then
    return
  fi

  local os arch binary_suffix
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "${os}" in
    darwin) os="mac" ;;
    linux) os="linux" ;;
  esac
  arch="$(uname -m)"
  case "${arch}" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
  esac
  binary_suffix="${os}-${arch}"

  local candidates=(
    "${WORKTREE_ROOT}/setta_files/run/playwright-browsers"
    "${HOME}/Library/Caches/ms-playwright"
    "${HOME}/.cache/ms-playwright"
  )
  local candidate pattern
  for candidate in "${candidates[@]}"; do
    if [[ ! -d "${candidate}" ]]; then
      continue
    fi
    pattern="${candidate}/chromium_headless_shell-"*"/chrome-headless-shell-${binary_suffix}/chrome-headless-shell"
    if compgen -G "${pattern}" >/dev/null 2>&1; then
      export PLAYWRIGHT_BROWSERS_PATH="${candidate}"
      return
    fi
  done
}

ensure_short_socket_path() {
  local socket_path="${AGENT_BROWSER_TMPDIR}/agent-browser-${AGENT_BROWSER_SESSION}.sock"
  if [[ "${#socket_path}" -gt "${AGENT_BROWSER_SOCKET_PATH_LIMIT}" ]]; then
    local fallback_dir="${AGENT_BROWSER_TMPDIR_FALLBACK:-/tmp/agent-browser-${PROFILE_SUFFIX}}"
    AGENT_BROWSER_TMPDIR="${fallback_dir}"
  fi
}

ensure_short_socket_path
resolve_playwright_browsers_path
if [[ -z "${PLAYWRIGHT_HOST_PLATFORM_OVERRIDE:-}" ]]; then
  if [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
    export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE="mac-arm64"
  fi
fi
TMPDIR="${AGENT_BROWSER_TMPDIR}"
export AGENT_BROWSER_SESSION
export AGENT_BROWSER_TMPDIR
export TMPDIR
mkdir -p "${MCP_RUN_DIR}" "${TMPDIR}"

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
    CKSUM_OUTPUT=$(printf "%s" "${INSTANCE_SEGMENT}" | cksum)
    CKSUM_VALUE=${CKSUM_OUTPUT%% *}
    if [ -n "${CKSUM_VALUE}" ]; then
      INSTANCE_OFFSET=$(( CKSUM_VALUE % 100 ))
    fi
  fi
fi
INSTANCE_OFFSET="${INSTANCE_OFFSET:-0}"

DEFAULT_FRONTEND_PORT=$((3000 + INSTANCE_OFFSET))
DEFAULT_HOST="${SETTA_DEV_FRONTEND_HOST:-${SETTA_HOST:-127.0.0.1}}"
DEFAULT_PORT="${SETTA_DEV_FRONTEND_PORT:-${DEFAULT_FRONTEND_PORT}}"

usage() {
  cat <<'EOF'
Usage: run-agent-browser.sh [agent-browser args]

If no arguments are provided, this opens the Setta frontend URL inferred from:
  SETTA_DEV_FRONTEND_HOST or SETTA_HOST (default: 127.0.0.1)
  SETTA_DEV_FRONTEND_PORT if set, otherwise the running Vite dev server in this
  worktree, falling back to a port derived from the worktree name.

Override the default with AGENT_BROWSER_URL.
Example:
  AGENT_BROWSER_URL="http://127.0.0.1:3002" scripts/run-agent-browser.sh

TMPDIR is set to setta_files/run/mcp/agent-browser-tmp in the worktree.
Override with AGENT_BROWSER_TMPDIR when needed.
Use --debug to print port detection details.
EOF
}

DEBUG=0
SHOW_HELP=0
PASSTHROUGH_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      SHOW_HELP=1
      shift
      ;;
    --debug)
      DEBUG=1
      shift
      ;;
    --)
      shift
      PASSTHROUGH_ARGS+=("$@")
      break
      ;;
    *)
      PASSTHROUGH_ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ "${SHOW_HELP}" -eq 1 ]]; then
  usage
  exit 0
fi

if ! command -v agent-browser >/dev/null 2>&1; then
  echo "agent-browser not found on PATH. Install with: pnpm add -g agent-browser && agent-browser install" >&2
  exit 1
fi

debug_log() {
  if [[ "${DEBUG}" -eq 1 ]]; then
    echo "$@" >&2
  fi
}

debug_log "AGENT_BROWSER_SESSION=${AGENT_BROWSER_SESSION}"
debug_log "AGENT_BROWSER_TMPDIR=${AGENT_BROWSER_TMPDIR}"
debug_log "TMPDIR=${TMPDIR}"

find_frontend_port() {
  local root="$1"

  if [[ -n "${SETTA_DEV_FRONTEND_PORT:-}" ]]; then
    debug_log "Using SETTA_DEV_FRONTEND_PORT=${SETTA_DEV_FRONTEND_PORT}"
    echo "${SETTA_DEV_FRONTEND_PORT}"
    return 0
  fi

  if ! command -v lsof >/dev/null 2>&1 || ! command -v ps >/dev/null 2>&1; then
    debug_log "Missing lsof or ps; skipping Vite port detection."
    return 1
  fi

  local frontend_root="${root}/frontend"
  local pids
  pids=$(ps -ax -o pid= -o command= | awk '/[v]ite/ {print $1}')
  if [[ -z "${pids}" ]]; then
    debug_log "No Vite processes found."
    return 1
  fi

  local pid
  for pid in ${pids}; do
    local cwd
    cwd=$(lsof -a -p "${pid}" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n1 || true)
    if [[ -z "${cwd}" ]]; then
      continue
    fi
    case "${cwd}" in
      "${frontend_root}"|"${frontend_root}/"*)
        debug_log "Matched Vite PID ${pid} (cwd: ${cwd})"
        ;;
      *)
        continue
        ;;
    esac

    local port
    port=$(lsof -n -P -a -p "${pid}" -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {split($(NF-1), parts, ":"); print parts[length(parts)]; exit}' || true)
    if [[ -n "${port}" ]]; then
      debug_log "Detected Vite port ${port}"
      echo "${port}"
      return 0
    fi
  done

  debug_log "No listening port found for Vite in this worktree."
  return 1
}

DEFAULT_URL="${AGENT_BROWSER_URL:-}"
if [[ -z "${DEFAULT_URL}" ]]; then
  DETECTED_PORT=$(find_frontend_port "${WORKTREE_ROOT}" || true)
  if [[ -z "${DETECTED_PORT}" ]]; then
    DETECTED_PORT="${DEFAULT_PORT}"
    debug_log "Falling back to derived port ${DETECTED_PORT}"
  fi
  DEFAULT_URL="http://${DEFAULT_HOST}:${DETECTED_PORT}"
fi

if [[ ${#PASSTHROUGH_ARGS[@]} -eq 0 ]]; then
  exec agent-browser open "${DEFAULT_URL}"
fi

exec agent-browser "${PASSTHROUGH_ARGS[@]}"
