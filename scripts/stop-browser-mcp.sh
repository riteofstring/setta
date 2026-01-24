#!/usr/bin/env bash
set -euo pipefail

DEBUG_PORT="${DEBUG_PORT:-9222}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

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

PROFILE_SUFFIX="$(profile_suffix "$ROOT_DIR")"
PROFILE_DIR="${PROFILE_DIR:-/tmp/chrome-profile-mcp-${PROFILE_SUFFIX}}"
PLAYWRITER_PROFILE_MODE="${PLAYWRITER_PROFILE_MODE:-shared}"
PLAYWRITER_SHARED_PROFILE_DIR="${PLAYWRITER_SHARED_PROFILE_DIR:-${HOME}/.setta/playwriter-profile}"
MCP_RUN_DIR="${ROOT_DIR}/setta_files/run/mcp"

default_playwriter_profile_dir() {
  echo "/tmp/chrome-profile-playwriter-mcp-${PROFILE_SUFFIX}"
}

resolve_playwriter_profile_dir() {
  if [[ -n "${PLAYWRITER_PROFILE_DIR+x}" ]]; then
    PLAYWRITER_PROFILE_DIR="${PLAYWRITER_PROFILE_DIR:-$(default_playwriter_profile_dir)}"
    return
  fi

  case "${PLAYWRITER_PROFILE_MODE}" in
    shared)
      PLAYWRITER_PROFILE_DIR="${PLAYWRITER_SHARED_PROFILE_DIR}"
      ;;
    isolated)
      PLAYWRITER_PROFILE_DIR="$(default_playwriter_profile_dir)"
      ;;
    *)
      PLAYWRITER_PROFILE_DIR="$(default_playwriter_profile_dir)"
      ;;
  esac
}

resolve_playwriter_profile_dir

TARGET_DEVTOOLS="0"
TARGET_PLAYWRITER="0"
TARGET_AGENT_BROWSER="0"

usage() {
  cat <<'EOF'
Usage: stop-browser-mcp.sh [--playwriter] [--devtools]

Default behavior stops all browser MCP processes.

Environment variables:
  DEBUG_PORT   Remote debugging port (default: 9222)
  PROFILE_DIR  User data dir for the debug instance (default: /tmp/chrome-profile-mcp-<repo>)
  PLAYWRITER_PROFILE_DIR  User data dir for playwriter (default: shared profile; overrides mode)
  PLAYWRITER_PROFILE_MODE  shared|isolated (default: shared)
  PLAYWRITER_SHARED_PROFILE_DIR  Shared profile dir (default: ~/.setta/playwriter-profile)

Flags:
  --playwriter    Stop the playwriter Chrome profile
  --playwriter-shared   Target the shared Playwriter profile
  --playwriter-isolated Target the per-worktree Playwriter profile
  --devtools      Stop the devtools Chrome profile
  --agent-browser Stop the agent-browser daemon
EOF
}

if [[ $# -eq 0 ]]; then
  TARGET_DEVTOOLS="1"
  TARGET_PLAYWRITER="1"
  TARGET_AGENT_BROWSER="1"
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --playwriter)
      TARGET_PLAYWRITER="1"
      shift
      ;;
    --playwriter-shared)
      TARGET_PLAYWRITER="1"
      PLAYWRITER_PROFILE_MODE="shared"
      shift
      ;;
    --playwriter-isolated)
      TARGET_PLAYWRITER="1"
      PLAYWRITER_PROFILE_MODE="isolated"
      shift
      ;;
    --devtools)
      TARGET_DEVTOOLS="1"
      shift
      ;;
    --agent-browser)
      TARGET_AGENT_BROWSER="1"
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
      echo "No devtools Chrome process for this repo."
    fi
  fi
fi

if [[ "$TARGET_PLAYWRITER" == "1" ]]; then
  if ! stop_pid_file "playwriter Chrome" "${MCP_RUN_DIR}/playwriter.pid"; then
    if ! stop_by_profile "playwriter Chrome (profile ${PLAYWRITER_PROFILE_DIR})" "$PLAYWRITER_PROFILE_DIR"; then
      echo "No playwriter Chrome process for this repo."
    fi
  fi
fi

if [[ "$TARGET_AGENT_BROWSER" == "1" ]]; then
  if ! stop_pid_file "agent-browser daemon" "${MCP_RUN_DIR}/agent-browser.pid"; then
    echo "No agent-browser daemon process for this repo."
  fi
fi
