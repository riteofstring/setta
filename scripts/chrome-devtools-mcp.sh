#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CDP_PORT=""
BROWSER_URL="${BROWSER_URL:-}"

if [[ -z "${BROWSER_URL}" ]]; then
  CDP_PORT_OUTPUT=""
  if ! CDP_PORT_OUTPUT="$("${ROOT_DIR}/scripts/cdp-port.sh" 2>&1)"; then
    if [[ -n "${CDP_PORT_OUTPUT}" ]]; then
      printf '%s\n' "${CDP_PORT_OUTPUT}" >&2
    fi
    echo "chrome-devtools-mcp could not determine a live browser URL for this worktree." >&2
    echo "Start or restart the worktree devtools Chrome and retry." >&2
    exit 1
  fi
  CDP_PORT="${CDP_PORT_OUTPUT}"
  BROWSER_URL="http://127.0.0.1:${CDP_PORT}"
fi

resolve_python_bin() {
  if command -v python >/dev/null 2>&1; then
    echo "python"
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    echo "python3"
    return 0
  fi
  return 1
}

browser_url_ready() {
  local browser_url="$1"
  local probe_url="${browser_url%/}/json/version"
  local response=""
  local python_bin=""

  if command -v curl >/dev/null 2>&1; then
    response="$(
      curl \
        --silent \
        --show-error \
        --fail \
        --max-time 1 \
        "${probe_url}" 2>/dev/null || true
    )"
    if [[ "${response}" == *"webSocketDebuggerUrl"* ]]; then
      return 0
    fi
  fi

  python_bin="$(resolve_python_bin || true)"
  if [[ -z "${python_bin}" ]]; then
    return 1
  fi

  BROWSER_PROBE_URL="${probe_url}" "${python_bin}" - <<'PY'
import json
import os
import sys
import urllib.request

probe_url = os.environ.get("BROWSER_PROBE_URL", "")
if not probe_url:
    sys.exit(1)

try:
    with urllib.request.urlopen(probe_url, timeout=1) as response:
        payload = json.loads(response.read().decode("utf-8"))
except Exception:
    sys.exit(1)

if payload.get("webSocketDebuggerUrl"):
    sys.exit(0)

sys.exit(1)
PY
}

wait_for_browser_url() {
  local browser_url="$1"
  local timeout_seconds="${CHROME_DEVTOOLS_MCP_CONNECT_TIMEOUT_SECONDS:-5}"
  local start_ts=""
  local elapsed=""

  if [[ "${timeout_seconds}" == "0" ]]; then
    browser_url_ready "${browser_url}"
    return $?
  fi

  start_ts="$(date +%s)"
  while true; do
    if browser_url_ready "${browser_url}"; then
      return 0
    fi

    elapsed="$(( $(date +%s) - start_ts ))"
    if [[ "${elapsed}" -ge "${timeout_seconds}" ]]; then
      return 1
    fi

    sleep 1
  done
}

# Codex MCP transports can be sensitive to unexpected stderr output at startup.
# Keep chrome-devtools-mcp warnings/banners isolated so they can't corrupt MCP IO.
LOG_DIR="${CHROME_DEVTOOLS_MCP_LOG_DIR:-${TMPDIR:-/tmp}/setta-mcp-logs}"
mkdir -p "${LOG_DIR}"
TS="$(date +%Y%m%d-%H%M%S)"
STDERR_LOG="${LOG_DIR}/chrome-devtools-mcp.stderr.${TS}.log"

export CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS="${CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS:-1}"
export NODE_NO_WARNINGS="${NODE_NO_WARNINGS:-1}"

if ! wait_for_browser_url "${BROWSER_URL}"; then
  echo "chrome-devtools-mcp could not reach a live browser at ${BROWSER_URL}." >&2
  echo "Start or restart the worktree devtools Chrome and retry." >&2
  exit 1
fi

# Pin a known-good version to avoid breaking MCP transport on upstream changes.
# Note: chrome-devtools-mcp expects `--browserUrl` (camelCase).
exec npx -y chrome-devtools-mcp@0.17.0 --browserUrl="${BROWSER_URL}" "$@" 2>"${STDERR_LOG}"
