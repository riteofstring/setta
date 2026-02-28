#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "${SCRIPT_DIR}/.." && pwd)
resolve_test_cache_root() {
  if [[ -n "${SETTA_TEST_CACHE_DIR:-}" ]]; then
    printf '%s\n' "${SETTA_TEST_CACHE_DIR}"
    return
  fi
  local cache_key=""
  if command -v cksum >/dev/null 2>&1; then
    cache_key="$(printf '%s' "${ROOT_DIR}" | cksum | awk '{print $1}')"
  fi
  if [[ -z "${cache_key}" ]]; then
    cache_key="default"
  fi
  printf '%s/%s\n' "${TMPDIR:-/tmp}/setta-test-cache" "${cache_key}"
}

SETTA_TEST_CACHE_ROOT="$(resolve_test_cache_root)"
PLUGIN_FIXTURE_CACHE_DIR="${SETTA_TEST_CACHE_ROOT}/plugin-fixtures"
PLUGIN_FIXTURE_CACHE_FILE="${PLUGIN_FIXTURE_CACHE_DIR}/backend-test-plugin-fixtures-all.signature"
# shellcheck source=scripts/plugin-fixtures/cache.sh
. "${ROOT_DIR}/scripts/plugin-fixtures/cache.sh"

cd "${ROOT_DIR}"
. ./activate.sh
if [[ -z "${PYTHON_BIN:-}" ]]; then
  resolved_python_bin="$(resolve_plugin_fixture_python_bin || true)"
  if [[ -n "${resolved_python_bin}" ]]; then
    export PYTHON_BIN
    PYTHON_BIN="${resolved_python_bin}"
  fi
fi
if [[ -n "${SETTA_BUILD_PLUGIN_FIXTURES:-}" ]]; then
  SHOULD_BUILD_PLUGIN_FIXTURES="${SETTA_BUILD_PLUGIN_FIXTURES}"
elif should_build_plugin_fixtures_for_targets "${ROOT_DIR}" "pytest" "$@"; then
  SHOULD_BUILD_PLUGIN_FIXTURES="1"
else
  SHOULD_BUILD_PLUGIN_FIXTURES="0"
fi

if [[ "${SHOULD_BUILD_PLUGIN_FIXTURES}" == "1" ]]; then
  build_plugin_fixtures_if_needed "${ROOT_DIR}" "${PLUGIN_FIXTURE_CACHE_FILE}" "build"
else
  echo "Skipping plugin fixture build for selected pytest targets."
fi
pytest -vv -s -ra --durations=20 -o faulthandler_timeout=120 "$@"
