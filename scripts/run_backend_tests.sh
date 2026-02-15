#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "${SCRIPT_DIR}/.." && pwd)

cd "${ROOT_DIR}"
. ./activate.sh && pytest -vv -s -ra --durations=20 -o faulthandler_timeout=120 "$@"
