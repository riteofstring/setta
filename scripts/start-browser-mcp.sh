#!/usr/bin/env bash
set -euo pipefail

CHROME_BIN="${CHROME_BIN:-}"
FOREGROUND="0"
MODE="playwriter"
CHROME_EXTRA_ARGS="${CHROME_EXTRA_ARGS:-}"
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
PLAYWRITER_BOOTSTRAP="${PLAYWRITER_BOOTSTRAP:-1}"

default_playwriter_profile_dir() {
  echo "${MCP_RUN_DIR}/playwriter-profile"
}

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
    "${ROOT_DIR}/setta_files/run/playwright-browsers"
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
resolve_playwright_browsers_path
if [[ -z "${PLAYWRIGHT_HOST_PLATFORM_OVERRIDE:-}" ]]; then
  if [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
    export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE="mac-arm64"
  fi
fi

CHROME_ARGS=()
if [[ -n "${CHROME_EXTRA_ARGS}" ]]; then
  # shellcheck disable=SC2206
  CHROME_ARGS=(${CHROME_EXTRA_ARGS})
fi

write_pid() {
  mkdir -p "$MCP_RUN_DIR"
  printf "%s\n" "$2" > "$1"
}

get_bootstrap_url() {
  if ! command -v setta >/dev/null 2>&1; then
    return 1
  fi

  if [[ -f "${ROOT_DIR}/activate.sh" ]]; then
    # Ensure the python env is active for the Setta CLI.
    # shellcheck disable=SC1090
    source "${ROOT_DIR}/activate.sh"
  fi

  local status_payload=""
  status_payload="$(setta status --connect-info --latest --json 2>/dev/null || true)"
  if [[ "$status_payload" != __SETTA_JSON_B64__* ]]; then
    return 1
  fi

  local b64_payload="${status_payload#__SETTA_JSON_B64__}"
  SETTA_STATUS_B64="$b64_payload" python - <<'PY'
import base64
import json
import os
import sys

payload = os.environ.get("SETTA_STATUS_B64", "")
if not payload:
    sys.exit(1)
data = json.loads(base64.b64decode(payload).decode("utf-8"))
url = data.get("bootstrapUrlFragment", "")
if url:
    print(url)
PY
}

usage() {
  cat <<'EOF'
Usage: start-browser-mcp.sh [--playwriter] [--devtools] [--foreground]

Default mode opens a dedicated Chrome profile for Playwriter (extension-based).
Use --playwriter for the same behavior when you want to be explicit.
Use --devtools to start a dedicated Chrome/Chromium instance with remote
debugging enabled for chrome-devtools-mcp. This is separate from your main profile.

Environment variables:
  DEBUG_PORT   Remote debugging port (default: 9222 + worktree offset)
  PROFILE_DIR  User data dir for the debug instance (default: setta_files/run/mcp/devtools-profile)
  PLAYWRITER_PROFILE_DIR  User data dir for playwriter (default: setta_files/run/mcp/playwriter-profile; overrides mode)
  PLAYWRITER_PROFILE_MODE  shared|isolated (default: isolated)
  PLAYWRITER_SHARED_PROFILE_DIR  Shared profile dir (default: ~/.setta/playwriter-profile)
  PLAYWRITER_BOOTSTRAP  Open /__setta__/bootstrap with token when possible (default: 1)
  CHROME_BIN   Path to Chrome/Chromium binary (auto-detected if unset)
  CHROME_EXTRA_ARGS  Extra Chrome flags (space-separated)

Flags:
  --playwriter     Open Chrome for Playwriter
  --playwriter-shared   Use the shared Playwriter profile (default)
  --playwriter-isolated Use a per-worktree Playwriter profile
  --devtools       Start Chrome with remote debugging for chrome-devtools-mcp
  --foreground     Keep the debug browser attached to this terminal (devtools only)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --devtools)
      MODE="devtools"
      shift
      ;;
    --playwriter)
      MODE="playwriter"
      shift
      ;;
    --playwriter-shared)
      MODE="playwriter"
      PLAYWRITER_PROFILE_MODE="shared"
      shift
      ;;
    --playwriter-isolated)
      MODE="playwriter"
      PLAYWRITER_PROFILE_MODE="isolated"
      shift
      ;;
    --foreground)
      FOREGROUND="1"
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

if [[ -z "$CHROME_BIN" ]]; then
  if [[ "${OSTYPE:-}" == "darwin"* ]]; then
    if [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
      CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    elif [[ -x "/Applications/Chromium.app/Contents/MacOS/Chromium" ]]; then
      CHROME_BIN="/Applications/Chromium.app/Contents/MacOS/Chromium"
    fi
  fi

  if [[ -z "$CHROME_BIN" ]]; then
    CHROME_BIN="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
  fi
fi

if [[ -z "$CHROME_BIN" ]]; then
  echo "Could not find Chrome/Chromium. Set CHROME_BIN to the binary path." >&2
  exit 1
fi

if [[ "$MODE" == "playwriter" ]]; then
  if [[ "$FOREGROUND" == "1" ]]; then
    echo "--foreground only applies to --devtools mode." >&2
    exit 1
  fi
  start_url="about:blank"
  if [[ "$PLAYWRITER_BOOTSTRAP" == "1" ]]; then
    start_url="$(get_bootstrap_url || true)"
  fi
  if [[ -z "$start_url" ]]; then
    start_url="about:blank"
  fi
  mkdir -p "$PLAYWRITER_PROFILE_DIR"
  "$CHROME_BIN" \
    --user-data-dir="$PLAYWRITER_PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    "${CHROME_ARGS[@]}" \
    "$start_url" >/dev/null 2>&1 &
  write_pid "${MCP_RUN_DIR}/playwriter.pid" "$!"
  echo "Playwriter mode: install the extension in ${PLAYWRITER_PROFILE_DIR} and click it on a tab to connect."
  echo "Use --devtools when you want chrome-devtools-mcp instead."
  exit 0
fi

if command -v lsof >/dev/null 2>&1; then
  if lsof -iTCP:"$DEBUG_PORT" -sTCP:LISTEN -n >/dev/null 2>&1; then
    echo "Port $DEBUG_PORT is already in use. Set DEBUG_PORT to a free port." >&2
    exit 1
  fi
fi

mkdir -p "$PROFILE_DIR"

echo "Starting Chrome with remote debugging on port $DEBUG_PORT..."
if [[ "$FOREGROUND" == "1" ]]; then
  write_pid "${MCP_RUN_DIR}/devtools.pid" "$$"
  exec "$CHROME_BIN" \
    --remote-debugging-port="$DEBUG_PORT" \
    --user-data-dir="$PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    "${CHROME_ARGS[@]}" \
    about:blank
else
  "$CHROME_BIN" \
    --remote-debugging-port="$DEBUG_PORT" \
    --user-data-dir="$PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    "${CHROME_ARGS[@]}" \
    about:blank >/dev/null 2>&1 &
  write_pid "${MCP_RUN_DIR}/devtools.pid" "$!"
  echo "chrome-devtools-mcp expects: http://127.0.0.1:$DEBUG_PORT"
  echo "To stop the debug browser, quit that Chrome window or kill its process."
fi
