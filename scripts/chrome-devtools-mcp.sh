#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
NODE_VERSION_FILE="${ROOT_DIR}/scripts/node_version.txt"

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

read_required_node_version() {
  if [[ ! -f "${NODE_VERSION_FILE}" ]]; then
    return
  fi

  tr -d '[:space:]' < "${NODE_VERSION_FILE}"
}

version_gte() {
  python3 - "$1" "$2" <<'PY'
import sys


def parse(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in version.lstrip("v").split("."))


current = parse(sys.argv[1])
required = parse(sys.argv[2])
raise SystemExit(0 if current >= required else 1)
PY
}

current_node_version() {
  if ! command -v node >/dev/null 2>&1; then
    return
  fi

  node -p 'process.versions.node' 2>/dev/null || true
}

ensure_compatible_node() {
  required_node_version="$(read_required_node_version)"
  if [[ -z "${required_node_version}" ]]; then
    return
  fi

  installed_node_version="$(current_node_version)"
  if [[ -n "${installed_node_version}" ]] && version_gte "${installed_node_version}" "${required_node_version}"; then
    return
  fi

  if [[ -s "${HOME}/.nvm/nvm.sh" ]]; then
    # Existing devboxes can lag behind the repo pin. Prefer the pinned version
    # from nvm so chrome-devtools-mcp starts without requiring reprovisioning.
    # Keep this silent on stdout because stdout is reserved for MCP transport.
    # shellcheck disable=SC1090
    . "${HOME}/.nvm/nvm.sh"
    nvm use "${required_node_version}" >/dev/null 2>&1 || nvm install "${required_node_version}" >/dev/null 2>&1
    nvm alias default "${required_node_version}" >/dev/null 2>&1 || true
    installed_node_version="$(current_node_version)"
  fi

  if [[ -z "${installed_node_version}" ]]; then
    echo "ERROR: Node is not available on PATH after compatibility bootstrap." >&2
    exit 1
  fi

  if ! version_gte "${installed_node_version}" "${required_node_version}"; then
    echo "ERROR: Node ${installed_node_version} does not satisfy required ${required_node_version} for chrome-devtools-mcp." >&2
    exit 1
  fi
}

if ! ensure_compatible_node >>"${STDERR_LOG}" 2>&1; then
  exit 1
fi

# Pin a known-good version to avoid breaking MCP transport on upstream changes.
# Note: chrome-devtools-mcp expects `--browserUrl` (camelCase).
exec npx -y chrome-devtools-mcp@0.17.0 --browserUrl="${BROWSER_URL}" "$@" 2>"${STDERR_LOG}"
