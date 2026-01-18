#!/usr/bin/env bash
set -euo pipefail

DEBUG_PORT="${DEBUG_PORT:-9222}"
CHROME_BIN="${CHROME_BIN:-}"
FOREGROUND="0"
MODE="playwriter"
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

Flags:
  --playwriter     Open Chrome for Playwriter
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
  mkdir -p "$PLAYWRITER_PROFILE_DIR"
  "$CHROME_BIN" \
    --user-data-dir="$PLAYWRITER_PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    about:blank >/dev/null 2>&1 &
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
