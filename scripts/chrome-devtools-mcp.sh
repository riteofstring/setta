#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Keep stdout clean: in some environments bash locale warnings can leak into
# stdout if stderr is unavailable/merged, and that can break MCP startup.
CDP_PORT="$("${ROOT_DIR}/scripts/cdp-port.sh" 2>/dev/null | tr -dc '0-9')"
if [[ -z "${CDP_PORT}" ]] || ! [[ "${CDP_PORT}" =~ ^[0-9]+$ ]]; then
  CDP_PORT="9222"
fi
BROWSER_URL="${BROWSER_URL:-http://127.0.0.1:${CDP_PORT}}"

# Keep MCP stdio clean. Experimental node warnings can break MCP transports.
#
# Some MCP runners merge stderr into stdout; redirect stderr to a log file so the
# JSON-RPC stream on stdout stays valid.
DEFAULT_LOG_DIR="${ROOT_DIR}/setta_files"
mkdir -p "${DEFAULT_LOG_DIR}"
LOG_FILE="${CHROME_DEVTOOLS_MCP_LOG_FILE:-${DEFAULT_LOG_DIR}/chrome_devtools_mcp.log}"
exec env NODE_NO_WARNINGS=1 NPM_CONFIG_UPDATE_NOTIFIER=false \
  npx -y chrome-devtools-mcp@latest --browser-url="${BROWSER_URL}" "$@" \
  2>>"${LOG_FILE}"
