#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

node "${ROOT_DIR}/frontend/tests/e2e/acceptance/verify.mjs"

SETTA_ACCEPTANCE=1 "${ROOT_DIR}/scripts/run-playwright-e2e.sh" -- --grep @acceptance
