#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKTREE_ROOT=$(git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${ROOT_DIR}")

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

PROFILE_SUFFIX="$(profile_suffix "$WORKTREE_ROOT")"
MCP_RUN_DIR="${WORKTREE_ROOT}/setta_files/run/mcp"
PROFILE_DIR="${PROFILE_DIR:-${MCP_RUN_DIR}/devtools-profile}"
PLAYWRITER_PROFILE_MODE="${PLAYWRITER_PROFILE_MODE:-isolated}"
PLAYWRITER_SHARED_PROFILE_DIR="${PLAYWRITER_SHARED_PROFILE_DIR:-${HOME}/.setta/playwriter-profile}"
LEGACY_PROFILE_DIR="/tmp/chrome-profile-mcp-${PROFILE_SUFFIX}"
LEGACY_PLAYWRITER_PROFILE_DIR="/tmp/chrome-profile-playwriter-mcp-${PROFILE_SUFFIX}"

default_playwriter_profile_dir() {
  echo "${MCP_RUN_DIR}/playwriter-profile"
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

usage() {
  cat <<'EOF'
Usage: stop-browser-mcp.sh [--playwriter] [--devtools]

Default behavior stops all browser MCP processes.

Environment variables:
  PROFILE_DIR  User data dir for the debug instance (default: setta_files/run/mcp/devtools-profile)
  PLAYWRITER_PROFILE_DIR  User data dir for playwriter (default: setta_files/run/mcp/playwriter-profile; overrides mode)
  PLAYWRITER_PROFILE_MODE  shared|isolated (default: isolated)
  PLAYWRITER_SHARED_PROFILE_DIR  Shared profile dir (default: ~/.setta/playwriter-profile)

Flags:
  --playwriter    Stop the playwriter Chrome profile
  --playwriter-shared   Target the shared Playwriter profile
  --playwriter-isolated Target the per-worktree Playwriter profile
  --devtools      Stop the devtools Chrome profile
EOF
}

if [[ $# -eq 0 ]]; then
  TARGET_DEVTOOLS="1"
  TARGET_PLAYWRITER="1"
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

if [[ "$TARGET_PLAYWRITER" == "1" ]]; then
  if ! stop_pid_file "playwriter Chrome" "${MCP_RUN_DIR}/playwriter.pid"; then
    if ! stop_by_profile "playwriter Chrome (profile ${PLAYWRITER_PROFILE_DIR})" "$PLAYWRITER_PROFILE_DIR"; then
      if [[ "$PLAYWRITER_PROFILE_DIR" != "$LEGACY_PLAYWRITER_PROFILE_DIR" ]]; then
        if stop_by_profile "playwriter Chrome (profile ${LEGACY_PLAYWRITER_PROFILE_DIR})" "$LEGACY_PLAYWRITER_PROFILE_DIR"; then
          :
        else
          echo "No playwriter Chrome process for this repo."
        fi
      else
        echo "No playwriter Chrome process for this repo."
      fi
    fi
  fi
fi
