#!/usr/bin/env bash
set -euo pipefail

DEBUG_PORT="${DEBUG_PORT:-9222}"
CHROME_BIN="${CHROME_BIN:-}"
FOREGROUND="0"
MODE="playwriter"
AGENT_BROWSER_AUTO_START="${AGENT_BROWSER_AUTO_START:-1}"
AGENT_BROWSER_SESSION="${AGENT_BROWSER_SESSION:-setta}"
AGENT_BROWSER_URL="${AGENT_BROWSER_URL:-http://${SETTA_HOST:-127.0.0.1}:${SETTA_DEV_FRONTEND_PORT:-3000}}"
AGENT_BROWSER_BOOTSTRAP="${AGENT_BROWSER_BOOTSTRAP:-1}"
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
PLAYWRITER_PROFILE_DIR="${PLAYWRITER_PROFILE_DIR:-/tmp/chrome-profile-playwriter-mcp-${PROFILE_SUFFIX}}"
MCP_RUN_DIR="${ROOT_DIR}/setta_files/run/mcp"

write_pid() {
  mkdir -p "$MCP_RUN_DIR"
  printf "%s\n" "$2" > "$1"
}

agent_browser_daemon_path() {
  local root=""

  if command -v npm >/dev/null 2>&1; then
    root="$(npm root -g 2>/dev/null || true)"
    if [[ -n "$root" && -f "${root}/agent-browser/dist/daemon.js" ]]; then
      echo "${root}/agent-browser/dist/daemon.js"
      return 0
    fi
  fi

  if command -v pnpm >/dev/null 2>&1; then
    root="$(pnpm root -g 2>/dev/null || true)"
    if [[ -n "$root" && -f "${root}/agent-browser/dist/daemon.js" ]]; then
      echo "${root}/agent-browser/dist/daemon.js"
      return 0
    fi
  fi

  return 1
}

start_agent_browser() {
  if [[ "$AGENT_BROWSER_AUTO_START" != "1" ]]; then
    return 0
  fi

  if ! command -v agent-browser >/dev/null 2>&1; then
    echo "agent-browser not found on PATH. Install with: pnpm add -g agent-browser && agent-browser install" >&2
    return 0
  fi

  local pid_file="${MCP_RUN_DIR}/agent-browser.pid"
  if [[ -f "$pid_file" ]]; then
    local running_pid=""
    running_pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -z "$running_pid" ]] || ! kill -0 "$running_pid" 2>/dev/null; then
      rm -f "$pid_file"
    fi
  fi

  if [[ ! -f "$pid_file" ]]; then
    local daemon_path=""
    if daemon_path="$(agent_browser_daemon_path)"; then
      if command -v node >/dev/null 2>&1; then
        AGENT_BROWSER_SESSION="$AGENT_BROWSER_SESSION" node "$daemon_path" >/dev/null 2>&1 &
        write_pid "$pid_file" "$!"
        sleep 2
      else
        echo "node is required to start the agent-browser daemon." >&2
      fi
    else
      echo "agent-browser daemon not found. Install with: pnpm add -g agent-browser" >&2
    fi
  fi

  local bootstrap_url=""
  if [[ "$AGENT_BROWSER_BOOTSTRAP" == "1" ]]; then
    bootstrap_url="$(get_bootstrap_url || true)"
  fi

  if [[ -n "$bootstrap_url" ]]; then
    AGENT_BROWSER_SESSION="$AGENT_BROWSER_SESSION" agent-browser open "$bootstrap_url" || true
  fi

  if ! AGENT_BROWSER_SESSION="$AGENT_BROWSER_SESSION" agent-browser open "$AGENT_BROWSER_URL"; then
    echo "agent-browser open failed. You may need to run: agent-browser install" >&2
  fi
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
  DEBUG_PORT   Remote debugging port (default: 9222)
  PROFILE_DIR  User data dir for the debug instance (default: /tmp/chrome-profile-mcp-<repo>)
  PLAYWRITER_PROFILE_DIR  User data dir for playwriter (default: /tmp/chrome-profile-playwriter-mcp-<repo>)
  CHROME_BIN   Path to Chrome/Chromium binary (auto-detected if unset)
  AGENT_BROWSER_AUTO_START  Set to 0 to disable auto-starting agent-browser (default: 1)
  AGENT_BROWSER_SESSION  Session name for agent-browser (default: setta)
  AGENT_BROWSER_URL  URL to open in agent-browser (default: http://127.0.0.1:3000)
  AGENT_BROWSER_BOOTSTRAP  Set to 0 to skip Setta bootstrap token fetch (default: 1)

Flags:
  --playwriter     Open Chrome for Playwriter
  --devtools       Start Chrome with remote debugging for chrome-devtools-mcp
  --foreground     Keep the debug browser attached to this terminal (devtools only)
  --no-agent-browser  Disable auto-starting agent-browser in playwriter mode
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
    --foreground)
      FOREGROUND="1"
      shift
      ;;
    --no-agent-browser)
      AGENT_BROWSER_AUTO_START="0"
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
  mkdir -p "$PLAYWRITER_PROFILE_DIR"
  "$CHROME_BIN" \
    --user-data-dir="$PLAYWRITER_PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    about:blank >/dev/null 2>&1 &
  write_pid "${MCP_RUN_DIR}/playwriter.pid" "$!"
  start_agent_browser
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
    about:blank
else
  "$CHROME_BIN" \
    --remote-debugging-port="$DEBUG_PORT" \
    --user-data-dir="$PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    about:blank >/dev/null 2>&1 &
  write_pid "${MCP_RUN_DIR}/devtools.pid" "$!"
  echo "chrome-devtools-mcp expects: http://127.0.0.1:$DEBUG_PORT"
  echo "To stop the debug browser, quit that Chrome window or kill its process."
fi
