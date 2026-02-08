#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CDP_PORT="$("${ROOT_DIR}/scripts/cdp-port.sh")"
BROWSER_URL="${BROWSER_URL:-http://127.0.0.1:${CDP_PORT}}"

# Note: chrome-devtools-mcp expects `--browserUrl` (camelCase), not `--browser-url`.
exec npx -y chrome-devtools-mcp@latest --browserUrl="${BROWSER_URL}" "$@"
