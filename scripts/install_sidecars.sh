#!/usr/bin/env bash
set -euo pipefail

SIDECAR_DIR="backend/setta/agentic/external_adapters/sidecars"

if [[ ! -d "${SIDECAR_DIR}" ]]; then
  echo "Sidecar directory not found: ${SIDECAR_DIR}" >&2
  exit 1
fi

echo "Installing external agent sidecar SDK dependencies..."
(
  cd "${SIDECAR_DIR}"
  pnpm install --frozen-lockfile --prefer-offline
)
