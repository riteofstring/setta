#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKTREE_ROOT=$(git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${ROOT_DIR}")
INSTANCE_NAME=$(basename "${WORKTREE_ROOT}")

profile_suffix() {
  local root="$1"

  if command -v shasum >/dev/null 2>&1; then
    # shasum is a perl script on macOS and can crash if the caller has an
    # unsupported locale (e.g. LC_ALL=C.UTF-8). Force a safe locale.
    printf "%s" "$root" | LC_ALL=C LANG=C shasum -a 256 | awk '{print substr($1,1,12)}'
    return
  fi

  if command -v md5 >/dev/null 2>&1; then
    printf "%s" "$root" | md5 -q 2>/dev/null | awk '{print substr($1,1,12)}'
    return
  fi

  basename "$root" | tr ' ' '_'
}

PROFILE_SUFFIX="$(profile_suffix "$WORKTREE_ROOT")"
MCP_BASE_DIR="${MCP_BASE_DIR:-${TMPDIR:-/tmp}/setta-mcp}"
DEFAULT_MCP_RUN_DIR="${MCP_BASE_DIR}/${INSTANCE_NAME}-${PROFILE_SUFFIX}"
MCP_RUN_DIR="${MCP_RUN_DIR:-${DEFAULT_MCP_RUN_DIR}}"
PROFILE_DIR="${PROFILE_DIR:-${MCP_RUN_DIR}/devtools-profile}"
LEGACY_PROFILE_DIR="/tmp/chrome-profile-mcp-${PROFILE_SUFFIX}"
TARGET_DEVTOOLS="0"

usage() {
  cat <<'EOF'
Usage: stop-browser-mcp.sh [--devtools]

Default behavior stops the devtools browser MCP process.

Environment variables:
  MCP_RUN_DIR  Base dir for MCP state (default: ${TMPDIR:-/tmp}/setta-mcp/<worktree>)
  PROFILE_DIR  User data dir for the debug instance (default: ${TMPDIR:-/tmp}/setta-mcp/<worktree>/devtools-profile)

Flags:
  --devtools      Stop the devtools Chrome profile
EOF
}

if [[ $# -eq 0 ]]; then
  TARGET_DEVTOOLS="1"
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --devtools)
      TARGET_DEVTOOLS="1"
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

stop_pid_file() {
  local label="$1"
  local pid_file="$2"
  local pid=""

  if [[ ! -f "$pid_file" ]]; then
    return 1
  fi

  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    rm -f "$pid_file"
    return 1
  fi

  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    echo "Stopped ${label} (pid ${pid})."
  else
    echo "${label} not running (pid ${pid})."
  fi

  rm -f "$pid_file"
  return 0
}

stop_by_profile() {
  local label="$1"
  local profile_dir="$2"
  local pids=""

  pids="$(ps -ax -o pid= -o command= | awk -v needle="--user-data-dir=${profile_dir}" 'index($0, needle) {print $1}')"
  if [[ -z "$pids" ]]; then
    return 1
  fi

  kill $pids 2>/dev/null || true
  echo "Stopped ${label}."
  return 0
}

if [[ "$TARGET_DEVTOOLS" == "1" ]]; then
  if ! stop_pid_file "devtools Chrome" "${MCP_RUN_DIR}/devtools.pid"; then
    if ! stop_by_profile "devtools Chrome (profile ${PROFILE_DIR})" "$PROFILE_DIR"; then
      if [[ "$PROFILE_DIR" != "$LEGACY_PROFILE_DIR" ]]; then
        if stop_by_profile "devtools Chrome (profile ${LEGACY_PROFILE_DIR})" "$LEGACY_PROFILE_DIR"; then
          :
        else
          echo "No devtools Chrome process for this repo."
        fi
      else
        echo "No devtools Chrome process for this repo."
      fi
    fi
  fi
fi
