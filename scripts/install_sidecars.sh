#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
. "${SCRIPT_DIR}/lib/node_tooling.sh"

run_pnpm() {
  setta_run_pnpm "${ROOT_DIR}" "$@"
}

SIDECAR_DIR="backend/setta/agentic/external_adapters/sidecars"

if [[ ! -d "${SIDECAR_DIR}" ]]; then
  echo "Sidecar directory not found: ${SIDECAR_DIR}" >&2
  exit 1
fi

echo "Installing external agent sidecar SDK dependencies..."
(
  cd "${SIDECAR_DIR}"
  run_pnpm install --frozen-lockfile --prefer-offline
)
