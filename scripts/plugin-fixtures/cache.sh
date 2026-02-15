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
    cksum < "${fixture_file}"
  done | cksum | awk '{print $1 ":" $2}'
}

plugin_fixture_frontend_outputs_complete() {
  local root_dir="$1"
  local manifest_path fixture_root
  while IFS= read -r manifest_path; do
    fixture_root="$(dirname "${manifest_path}")"
    local declared_frontend_outputs
    declared_frontend_outputs="$(
      python - "$manifest_path" <<'PY'
import json
import sys
from pathlib import Path

manifest_path = Path(sys.argv[1])
try:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
except Exception:
    sys.exit(1)

frontend = manifest.get("frontend")
if not isinstance(frontend, dict):
    sys.exit(0)

entrypoint = frontend.get("entrypoint")
if isinstance(entrypoint, str) and entrypoint.strip():
    print(entrypoint.strip())

style = frontend.get("style")
if isinstance(style, str) and style.strip():
    print(style.strip())
PY
    )" || return 1
    local output_path
    while IFS= read -r output_path; do
      if [[ -z "${output_path}" ]]; then
        continue
      fi
      if [[ ! -f "${fixture_root}/${output_path}" ]]; then
        return 1
      fi
    done <<EOF
${declared_frontend_outputs}
EOF
  done < <(find "${root_dir}/tests/fixtures/plugins" -name "setta.plugin.json" -type f | sort)
  return 0
}
