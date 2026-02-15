#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "${SCRIPT_DIR}/.." && pwd)
PLUGIN_FIXTURE_CACHE_DIR="${ROOT_DIR}/setta_files/.cache"
PLUGIN_FIXTURE_CACHE_FILE="${PLUGIN_FIXTURE_CACHE_DIR}/backend-test-plugin-fixtures-all.signature"
# shellcheck source=scripts/plugin-fixtures/cache.sh
. "${ROOT_DIR}/scripts/plugin-fixtures/cache.sh"

should_build_plugin_fixtures() {
  if [[ -n "${SETTA_BUILD_PLUGIN_FIXTURES:-}" ]]; then
    [[ "${SETTA_BUILD_PLUGIN_FIXTURES}" == "1" ]]
    return
  fi

  local has_positional_target=0
  local has_selector_filter=0
  local arg
  local target_path
  for arg in "$@"; do
    case "${arg}" in
      -k|--keyword|-m|--markers|-k=*|--keyword=*|-m=*|--markers=*)
        has_selector_filter=1
        continue
        ;;
    esac
    if [[ "${arg}" == -* ]]; then
      continue
    fi
    has_positional_target=1
    target_path="${arg%%::*}"
    if [[ "${target_path}" == *plugin* ]]; then
      return 0
    fi
    if [[ -d "${target_path}" ]]; then
      return 0
    fi
    if [[ "${target_path}" != *.py ]]; then
      return 0
    fi
  done

  if [[ "${has_selector_filter}" == "1" ]]; then
    return 0
  fi
  if [[ "${has_positional_target}" == "0" ]]; then
    return 0
  fi
  return 1
}

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
if should_build_plugin_fixtures "$@"; then
  build_plugin_fixtures_if_needed "${ROOT_DIR}" "${PLUGIN_FIXTURE_CACHE_FILE}" "build"
else
  echo "Skipping plugin fixture build for selected pytest targets."
fi
pytest -vv -s -ra --durations=20 -o faulthandler_timeout=120 "$@"
