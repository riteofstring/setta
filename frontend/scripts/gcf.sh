#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
FRONTEND_DIR=$(cd "${SCRIPT_DIR}/.." && pwd)
ROOT_DIR=$(cd "${FRONTEND_DIR}/.." && pwd)

LOG_FILE="${ROOT_DIR}/gcf.log"
: > "${LOG_FILE}"
exec > >(tee -a "${LOG_FILE}") 2>&1

cd "${ROOT_DIR}"
. ./activate.sh
cd "${FRONTEND_DIR}"
pnpm generate
pnpm full-cleanup
pnpm f
