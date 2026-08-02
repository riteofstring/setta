#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
FIXTURE_ROOT="${ROOT_DIR}/tests/fixtures/plugins"

usage() {
  cat <<'USAGE'
Usage: scripts/plugin-fixtures/build.sh [all|<fixture-name>|<fixture-subpath> ...]

Examples:
  scripts/plugin-fixtures/build.sh all
  scripts/plugin-fixtures/build.sh frontend frontend-react
  scripts/plugin-fixtures/build.sh metadata-mismatch-layout
USAGE
}

collect_manifest_roots_under() {
  local dir="$1"
  while IFS= read -r manifest_path; do
    manifest_roots+=("$(dirname "${manifest_path}")")
  done < <(find "${dir}" -name "setta.plugin.json" -type f | sort)
}

build_copy_frontend() {
  local fixture_root="$1"
  local fixture_label="$2"
  local frontend_dir="${fixture_root}/frontend"
  local src_dir="${frontend_dir}/src"
  local dist_dir="${frontend_dir}/dist"
  local entry_src="${src_dir}/index.js"
  local style_src="${src_dir}/index.css"

  if [[ ! -f "${entry_src}" ]]; then
    echo "build: fixture '${fixture_label}' missing source entrypoint: ${entry_src}" >&2
    exit 1
  fi

  mkdir -p "${dist_dir}"
  cp "${entry_src}" "${dist_dir}/index.js"
  if [[ -f "${style_src}" ]]; then
    cp "${style_src}" "${dist_dir}/index.css"
  else
    rm -f "${dist_dir}/index.css"
  fi
  echo "build: fixture '${fixture_label}' copied frontend/src -> frontend/dist"
}

build_vite_frontend() {
  local fixture_root="$1"
  local fixture_label="$2"
  local frontend_dir="${fixture_root}/frontend"

  if [[ ! -f "${frontend_dir}/vite.config.mjs" ]]; then
    echo "build: fixture '${fixture_label}' missing vite config: ${frontend_dir}/vite.config.mjs" >&2
    exit 1
  fi

  pnpm -C "${ROOT_DIR}/frontend" exec vite build --config "${frontend_dir}/vite.config.mjs" >/dev/null
  echo "build: fixture '${fixture_label}' built with Vite"
}

build_fixture_root() {
  local fixture_root="$1"
  local frontend_dir="${fixture_root}/frontend"
  local fixture_label="${fixture_root#${FIXTURE_ROOT}/}"

  if [[ ! -d "${frontend_dir}" ]]; then
    echo "build: fixture '${fixture_label}' has no frontend; skipping"
    return
  fi

  if [[ -f "${frontend_dir}/vite.config.mjs" ]]; then
    build_vite_frontend "${fixture_root}" "${fixture_label}"
    return
  fi

  if [[ -d "${frontend_dir}/src" ]]; then
    build_copy_frontend "${fixture_root}" "${fixture_label}"
    return
  fi

  if [[ -f "${frontend_dir}/dist/index.js" ]]; then
    echo "build: fixture '${fixture_label}' already has prebuilt dist; no source build step configured"
    return
  fi

  echo "build: fixture '${fixture_label}' has frontend assets but no build strategy configured" >&2
  exit 1
}

if [[ $# -gt 0 ]]; then
  for arg in "$@"; do
    if [[ "${arg}" == "-h" || "${arg}" == "--help" ]]; then
      usage
      exit 0
    fi
  done
fi

declare -a manifest_roots

if [[ $# -eq 0 ]]; then
  collect_manifest_roots_under "${FIXTURE_ROOT}"
else
  for selector in "$@"; do
    if [[ "${selector}" == "all" ]]; then
      collect_manifest_roots_under "${FIXTURE_ROOT}"
      continue
    fi

    selector_path="${FIXTURE_ROOT}/${selector}"
    if [[ ! -e "${selector_path}" ]]; then
      echo "build: fixture selector not found: ${selector_path}" >&2
      exit 1
    fi

    if [[ -f "${selector_path}/setta.plugin.json" ]]; then
      manifest_roots+=("${selector_path}")
      continue
    fi

    if [[ -d "${selector_path}" ]]; then
      collect_manifest_roots_under "${selector_path}"
      continue
    fi

    echo "build: invalid fixture selector: ${selector}" >&2
    exit 1
  done
fi

if [[ ${#manifest_roots[@]} -eq 0 ]]; then
  echo "build: no plugin fixtures matched." >&2
  exit 1
fi

declare -a unique_roots
while IFS= read -r root; do
  [[ -z "${root}" ]] && continue
  unique_roots+=("${root}")
done < <(printf '%s\n' "${manifest_roots[@]}" | sort -u)

echo "build: preparing ${#unique_roots[@]} fixture plugin root(s)..."
for fixture_root in "${unique_roots[@]}"; do
  build_fixture_root "${fixture_root}"
done
echo "build: fixture frontend build step complete."
