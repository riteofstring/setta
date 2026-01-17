#!/usr/bin/env bash
set -euo pipefail

DEBUG_PORT="${DEBUG_PORT:-9222}"
PROFILE_DIR="${PROFILE_DIR:-/tmp/chrome-profile-mcp}"
CHROME_BIN="${CHROME_BIN:-}"
FOREGROUND="0"
MODE="playwriter"

usage() {
  cat <<'EOF'
Usage: start-browser-mcp.sh [--devtools] [--foreground]

Default mode starts your normal Chrome for Playwriter (extension-based).
Use --devtools to start a dedicated Chrome/Chromium instance with remote
debugging enabled for chrome-devtools-mcp. This is separate from your main profile.

Environment variables:
  DEBUG_PORT   Remote debugging port (default: 9222)
  PROFILE_DIR  User data dir for the debug instance (default: /tmp/chrome-profile-mcp)
  CHROME_BIN   Path to Chrome/Chromium binary (auto-detected if unset)

Flags:
  --devtools    Start Chrome with remote debugging for chrome-devtools-mcp
  --foreground  Keep the debug browser attached to this terminal (devtools only)
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
  "$CHROME_BIN" about:blank >/dev/null 2>&1 &
  echo "Playwriter mode: open Chrome with the Playwriter extension and click it on a tab to connect."
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
  echo "chrome-devtools-mcp expects: http://127.0.0.1:$DEBUG_PORT"
  echo "To stop the debug browser, quit that Chrome window or kill its process."
fi
