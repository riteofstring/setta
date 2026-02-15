#!/usr/bin/env bash
set -euo pipefail

compute_plugin_fixture_signature() {
  local root_dir="$1"
  local fixture_file
  local fixture_files=(
    "${root_dir}/scripts/plugin-fixtures/build.sh"
    "${root_dir}/frontend/package.json"
    "${root_dir}/frontend/pnpm-lock.yaml"
    "${root_dir}/scripts/node_version.txt"
  )
  while IFS= read -r fixture_file; do
    fixture_files+=("${fixture_file}")
  done < <(
    find "${root_dir}/tests/fixtures/plugins" -type f \
      ! -path "*/frontend/dist/*" \
      | sort
  )

  for fixture_file in "${fixture_files[@]}"; do
    if [[ ! -f "${fixture_file}" ]]; then
      continue
    fi
    printf '%s|' "${fixture_file#${root_dir}/}"
    cksum < "${fixture_file}"
  done | cksum | awk '{print $1 ":" $2}'
}

resolve_plugin_fixture_python_bin() {
  if [[ -n "${PYTHON_BIN:-}" ]]; then
    if [[ -x "${PYTHON_BIN}" ]]; then
      printf '%s\n' "${PYTHON_BIN}"
      return 0
    fi
    if command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
      command -v "${PYTHON_BIN}"
      return 0
    fi
  fi
  if command -v python >/dev/null 2>&1; then
    command -v python
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return 0
  fi
  return 1
}

plugin_fixture_frontend_outputs_complete() {
  local root_dir="$1"
  local manifest_path
  local python_bin
  python_bin="$(resolve_plugin_fixture_python_bin)" || return 1
  local manifests=()
  while IFS= read -r manifest_path; do
    manifests+=("${manifest_path}")
  done < <(
    find "${root_dir}/tests/fixtures/plugins" -name "setta.plugin.json" -type f | sort
  )
  if [[ ${#manifests[@]} -eq 0 ]]; then
    return 0
  fi
  "${python_bin}" - "${manifests[@]}" <<'PY'
import json
import sys
from pathlib import Path

for manifest_arg in sys.argv[1:]:
    manifest_path = Path(manifest_arg)
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        raise SystemExit(1)

    frontend = manifest.get("frontend")
    if not isinstance(frontend, dict):
        continue

    fixture_root = manifest_path.parent
    for key in ("entrypoint", "style"):
        raw_output_path = frontend.get(key)
        if not isinstance(raw_output_path, str):
            continue
        output_path = raw_output_path.strip()
        if output_path == "":
            continue
        resolved_output_path = fixture_root / output_path
        if not resolved_output_path.is_file():
            raise SystemExit(1)
PY
}

build_plugin_fixtures_if_needed() {
  local root_dir="$1"
  local cache_file="$2"
  local log_prefix="${3:-build}"
  local current_signature cached_signature
  current_signature="$(compute_plugin_fixture_signature "${root_dir}")"
  mkdir -p "$(dirname "${cache_file}")"

  if [[ "${SETTA_FORCE_PLUGIN_FIXTURE_BUILD:-0}" == "1" ]]; then
    echo "${log_prefix}: plugin fixtures changed; rebuilding"
    "${root_dir}/scripts/plugin-fixtures/build.sh" all
    printf '%s' "${current_signature}" > "${cache_file}"
    return
  fi

  if [[ -f "${cache_file}" ]]; then
    cached_signature="$(<"${cache_file}")"
  else
    cached_signature=""
  fi

  if [[ "${cached_signature}" == "${current_signature}" ]]; then
    if ! plugin_fixture_frontend_outputs_complete "${root_dir}"; then
      echo "${log_prefix}: plugin fixture outputs missing; rebuilding"
    else
      echo "${log_prefix}: plugin fixtures unchanged; skipping rebuild"
      return
    fi
  else
    echo "${log_prefix}: plugin fixtures changed; rebuilding"
  fi

  "${root_dir}/scripts/plugin-fixtures/build.sh" all
  printf '%s' "${current_signature}" > "${cache_file}"
}
