#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CDP_PORT="$("${ROOT_DIR}/scripts/cdp-port.sh")"
BROWSER_URL="${BROWSER_URL:-http://127.0.0.1:${CDP_PORT}}"

# Codex MCP transports can be sensitive to unexpected stderr output at startup.
# Keep chrome-devtools-mcp warnings/banners isolated so they can't corrupt MCP IO.
LOG_DIR="${CHROME_DEVTOOLS_MCP_LOG_DIR:-${TMPDIR:-/tmp}/setta-mcp-logs}"
mkdir -p "${LOG_DIR}"
TS="$(date +%Y%m%d-%H%M%S)"
STDERR_LOG="${LOG_DIR}/chrome-devtools-mcp.stderr.${TS}.log"

export CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS="${CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS:-1}"
export NODE_NO_WARNINGS="${NODE_NO_WARNINGS:-1}"

# Pin a known-good version to avoid breaking MCP transport on upstream changes.
# Note: chrome-devtools-mcp expects `--browserUrl` (camelCase).
exec npx -y chrome-devtools-mcp@0.17.0 --browserUrl="${BROWSER_URL}" "$@" 2>"${STDERR_LOG}"
