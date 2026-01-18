#!/usr/bin/env bash
set -euo pipefail

DEFAULT_HOST="${SETTA_HOST:-127.0.0.1}"
DEFAULT_PORT="${SETTA_DEV_FRONTEND_PORT:-3000}"
DEFAULT_URL="${AGENT_BROWSER_URL:-http://${DEFAULT_HOST}:${DEFAULT_PORT}}"

usage() {
  cat <<'EOF'
Usage: run-agent-browser.sh [agent-browser args]

If no arguments are provided, this opens the Setta frontend URL inferred from:
  SETTA_HOST (default: 127.0.0.1)
  SETTA_DEV_FRONTEND_PORT (default: 3000)

Override the default with AGENT_BROWSER_URL.
Example:
  AGENT_BROWSER_URL="http://127.0.0.1:3002" scripts/run-agent-browser.sh
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if ! command -v agent-browser >/dev/null 2>&1; then
  echo "agent-browser not found on PATH. Install with: pnpm add -g agent-browser && agent-browser install" >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  exec agent-browser open "${DEFAULT_URL}"
fi

exec agent-browser "$@"
