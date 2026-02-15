#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "${SCRIPT_DIR}/.." && pwd)
PLUGIN_FIXTURE_CACHE_DIR="${ROOT_DIR}/setta_files/.cache"
PLUGIN_FIXTURE_CACHE_FILE="${PLUGIN_FIXTURE_CACHE_DIR}/backend-test-plugin-fixtures-all.signature"

compute_plugin_fixture_signature() {
  local fixture_file
  local fixture_files=("${ROOT_DIR}/scripts/plugin-fixtures/build.sh")
  while IFS= read -r fixture_file; do
    fixture_files+=("${fixture_file}")
  done < <(
    find "${ROOT_DIR}/tests/fixtures/plugins" -type f \
      ! -path "*/frontend/dist/*" \
      | sort
  )

  for fixture_file in "${fixture_files[@]}"; do
    printf '%s|' "${fixture_file#${ROOT_DIR}/}"
    cksum "${fixture_file}"
  done | cksum | awk '{print $1 ":" $2}'
}

build_plugin_fixtures_if_needed() {
  local current_signature cached_signature
  current_signature="$(compute_plugin_fixture_signature)"
  mkdir -p "${PLUGIN_FIXTURE_CACHE_DIR}"

  if [[ "${SETTA_FORCE_PLUGIN_FIXTURE_BUILD:-0}" == "1" ]]; then
    ./scripts/plugin-fixtures/build.sh all
    printf '%s' "${current_signature}" > "${PLUGIN_FIXTURE_CACHE_FILE}"
    return
  fi

  if [[ -f "${PLUGIN_FIXTURE_CACHE_FILE}" ]]; then
    cached_signature="$(<"${PLUGIN_FIXTURE_CACHE_FILE}")"
  else
    cached_signature=""
  fi

  if [[ "${cached_signature}" == "${current_signature}" ]]; then
    echo "build: plugin fixtures unchanged; skipping rebuild"
    return
  fi

  ./scripts/plugin-fixtures/build.sh all
  printf '%s' "${current_signature}" > "${PLUGIN_FIXTURE_CACHE_FILE}"
}

cd "${ROOT_DIR}"
build_plugin_fixtures_if_needed
. ./activate.sh && pytest -vv -s -ra --durations=20 -o faulthandler_timeout=120 "$@"
