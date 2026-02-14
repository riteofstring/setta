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

# Codex MCP transports can be sensitive to unexpected stderr output at startup.
# Keep chrome-devtools-mcp warnings/banners isolated so they can't corrupt MCP IO.
# Some runners merge stderr into stdout, so always log stderr to a file.
DEFAULT_LOG_DIR="${ROOT_DIR}/setta_files"
mkdir -p "${DEFAULT_LOG_DIR}"
LOG_FILE="${CHROME_DEVTOOLS_MCP_LOG_FILE:-${DEFAULT_LOG_DIR}/chrome_devtools_mcp.log}"

export CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS="${CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS:-1}"
export NODE_NO_WARNINGS="${NODE_NO_WARNINGS:-1}"
export NPM_CONFIG_UPDATE_NOTIFIER="${NPM_CONFIG_UPDATE_NOTIFIER:-false}"

# Pin a known-good version to avoid breaking MCP transport on upstream changes.
# Note: chrome-devtools-mcp expects `--browserUrl` (camelCase).
exec npx -y chrome-devtools-mcp@0.17.0 --browserUrl="${BROWSER_URL}" "$@" \
  2>>"${LOG_FILE}"
