#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "${SCRIPT_DIR}/.." && pwd)
PLUGIN_FIXTURE_CACHE_DIR="${ROOT_DIR}/setta_files/.cache"
PLUGIN_FIXTURE_CACHE_FILE="${PLUGIN_FIXTURE_CACHE_DIR}/backend-test-plugin-fixtures-all.signature"
# shellcheck source=scripts/plugin-fixtures/cache.sh
. "${ROOT_DIR}/scripts/plugin-fixtures/cache.sh"

cd "${ROOT_DIR}"
. ./activate.sh
if [[ -z "${PYTHON_BIN:-}" ]]; then
  if command -v python >/dev/null 2>&1; then
    export PYTHON_BIN
    PYTHON_BIN="$(command -v python)"
  elif command -v python3 >/dev/null 2>&1; then
    export PYTHON_BIN
    PYTHON_BIN="$(command -v python3)"
  fi
fi
build_plugin_fixtures_if_needed "${ROOT_DIR}" "${PLUGIN_FIXTURE_CACHE_FILE}" "build"
pytest -vv -s -ra --durations=20 -o faulthandler_timeout=120 "$@"
