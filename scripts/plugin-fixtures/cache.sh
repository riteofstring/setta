#!/usr/bin/env bash
set -euo pipefail

compute_plugin_fixture_signature() {
  local root_dir="$1"
  local fixture_file
  local fixture_files=("${root_dir}/scripts/plugin-fixtures/build.sh")
  while IFS= read -r fixture_file; do
    fixture_files+=("${fixture_file}")
  done < <(
    find "${root_dir}/tests/fixtures/plugins" -type f \
      ! -path "*/frontend/dist/*" \
      | sort
  )

  for fixture_file in "${fixture_files[@]}"; do
    printf '%s|' "${fixture_file#${root_dir}/}"
    cksum "${fixture_file}"
  done | cksum | awk '{print $1 ":" $2}'
}

plugin_fixture_frontend_outputs_complete() {
  local root_dir="$1"
  local manifest_path fixture_root frontend_dir
  while IFS= read -r manifest_path; do
    fixture_root="$(dirname "${manifest_path}")"
    frontend_dir="${fixture_root}/frontend"
    if [[ ! -d "${frontend_dir}" ]]; then
      continue
    fi
    if [[ -f "${frontend_dir}/vite.config.mjs" || -d "${frontend_dir}/src" ]]; then
      if [[ ! -f "${frontend_dir}/dist/index.js" ]]; then
        return 1
      fi
    fi
  done < <(find "${root_dir}/tests/fixtures/plugins" -name "setta.plugin.json" -type f | sort)
  return 0
}
