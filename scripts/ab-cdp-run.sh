#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ $# -eq 0 ]]; then
  echo "Usage: ab-cdp-run.sh <agent-browser args...>" >&2
  exit 1
fi

DEBUG_PORT="${DEBUG_PORT:-$("${ROOT_DIR}/scripts/ab-cdp-port.sh")}"
exec agent-browser "$@" --cdp "${DEBUG_PORT}"
