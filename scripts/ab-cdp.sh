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

DEFAULT_DEBUG_PORT=$((9222 + INSTANCE_OFFSET))
DEBUG_PORT="${DEBUG_PORT:-${DEFAULT_DEBUG_PORT}}"
OPEN_BOOTSTRAP="1"
APP_URL="${AGENT_BROWSER_URL:-}"

usage() {
  cat <<'EOF'
Usage: ab-cdp.sh [--port <n>] [--url <url>] [--no-bootstrap] [-- <agent-browser args>]

Starts (or reuses) a CDP-enabled Chrome instance and opens the Setta frontend
via agent-browser --cdp. Intended for running outside the sandbox.
If agent-browser args are provided after --, they run with --cdp injected and
the default open/wait/snapshot flow is skipped.

Environment:
  DEBUG_PORT             CDP port (default: 9222 + worktree offset)
  AGENT_BROWSER_URL      Override frontend URL
  SETTA_HOST             Host for frontend URL (default: 127.0.0.1)
  SETTA_DEV_FRONTEND_PORT  Frontend port (default: 3000 + worktree offset)
EOF
}

PASSTHROUGH_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      DEBUG_PORT="$2"
      shift 2
      ;;
    --url)
      APP_URL="$2"
      shift 2
      ;;
    --no-bootstrap)
      OPEN_BOOTSTRAP="0"
      shift
      ;;
    --)
      shift
      PASSTHROUGH_ARGS=("$@")
      break
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

if [[ -z "${APP_URL}" ]]; then
  HOST="${SETTA_DEV_FRONTEND_HOST:-${SETTA_HOST:-127.0.0.1}}"
  DEFAULT_PORT=$((3000 + INSTANCE_OFFSET))
  PORT="${SETTA_DEV_FRONTEND_PORT:-${DEFAULT_PORT}}"
  APP_URL="http://${HOST}:${PORT}"
fi

if ! command -v agent-browser >/dev/null 2>&1; then
  echo "agent-browser not found on PATH. Install with: pnpm add -g agent-browser && agent-browser install" >&2
  exit 1
fi

wait_for_url() {
  local url="$1"
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

if ! curl -s "http://127.0.0.1:${DEBUG_PORT}/json/version" >/dev/null 2>&1; then
  AGENT_BROWSER_AUTO_START=0 DEBUG_PORT="${DEBUG_PORT}" "${ROOT_DIR}/scripts/start-browser-mcp.sh" --devtools
fi

if [[ ${#PASSTHROUGH_ARGS[@]} -gt 0 ]]; then
  has_cdp_flag=0
  for arg in "${PASSTHROUGH_ARGS[@]}"; do
    if [[ "$arg" == "--cdp" ]]; then
      has_cdp_flag=1
      break
    fi
  done
  if [[ "$has_cdp_flag" -eq 1 ]]; then
    exec agent-browser "${PASSTHROUGH_ARGS[@]}"
  fi
  exec agent-browser "${PASSTHROUGH_ARGS[@]}" --cdp "${DEBUG_PORT}"
fi

if [[ "${OPEN_BOOTSTRAP}" == "1" ]]; then
  if bootstrap_url="$("${ROOT_DIR}/scripts/bootstrap-url.sh" 2>/dev/null)"; then
    bootstrap_base="${bootstrap_url%%#*}"
    if wait_for_url "${bootstrap_base}"; then
      agent-browser open "${bootstrap_url}" --cdp "${DEBUG_PORT}" || true
    else
      echo "Backend did not respond on ${bootstrap_base}." >&2
    fi
  fi
fi

agent-browser open "${APP_URL}" --cdp "${DEBUG_PORT}"
agent-browser wait --text "Overview" --cdp "${DEBUG_PORT}"
agent-browser snapshot -i --cdp "${DEBUG_PORT}"
