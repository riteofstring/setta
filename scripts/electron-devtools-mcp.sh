#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LATEST_RECORDING_POINTER="${ROOT_DIR}/.recordings/latest.json"
PORT_FILE="${SETTA_ELECTRON_CDP_PORT_FILE:-}"
CDP_PORT="${SETTA_ELECTRON_CDP_PORT:-}"

if [[ -z "${CDP_PORT}" ]]; then
  if [[ -z "${PORT_FILE}" ]]; then
    if [[ ! -f "${LATEST_RECORDING_POINTER}" ]]; then
      echo "Electron CDP port was not provided and ${LATEST_RECORDING_POINTER} does not exist." >&2
      echo "Start a recorded desktop session or set SETTA_ELECTRON_CDP_PORT_FILE." >&2
      exit 1
    fi
    PORT_FILE="$(
      node -e '
        const { readFileSync } = require("node:fs");
        const pointer = JSON.parse(readFileSync(process.argv[1], "utf8"));
        if (typeof pointer.debugPortFile !== "string" || pointer.debugPortFile === "") {
          throw new Error("latest recording pointer has no debugPortFile");
        }
        process.stdout.write(pointer.debugPortFile);
      ' "${LATEST_RECORDING_POINTER}"
    )"
  fi
  if [[ ! -f "${PORT_FILE}" ]]; then
    echo "Electron CDP port was not provided and ${PORT_FILE} does not exist." >&2
    echo "Set SETTA_ELECTRON_CDP_PORT or SETTA_ELECTRON_CDP_PORT_FILE." >&2
    exit 1
  fi
  CDP_PORT="$(tr -d '[:space:]' < "${PORT_FILE}")"
fi

if [[ -z "${CDP_PORT}" ]]; then
  echo "Electron CDP port is empty." >&2
  exit 1
fi

BROWSER_URL="${BROWSER_URL:-http://127.0.0.1:${CDP_PORT}}"
LOG_DIR="${CHROME_DEVTOOLS_MCP_LOG_DIR:-${TMPDIR:-/tmp}/setta-mcp-logs}"
mkdir -p "${LOG_DIR}"
TS="$(date +%Y%m%d-%H%M%S)"
STDERR_LOG="${LOG_DIR}/electron-devtools-mcp.stderr.${TS}.log"

export CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS="${CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS:-1}"
export NODE_NO_WARNINGS="${NODE_NO_WARNINGS:-1}"

exec npx -y chrome-devtools-mcp@0.17.0 --browserUrl="${BROWSER_URL}" "$@" 2>"${STDERR_LOG}"
