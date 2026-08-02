#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

resolve_python() {
  if command -v python3 >/dev/null 2>&1; then
    printf '%s\n' python3
    return
  fi
  if command -v python >/dev/null 2>&1; then
    printf '%s\n' python
    return
  fi
  echo "python3 or python is required for dependency policy checks." >&2
  exit 1
}

load_min_release_age_days() {
  "${python_bin}" "${repo_root}/scripts/read_supply_chain_policy.py" --repo-root "${repo_root}"
}

discover_pnpm_projects() {
  find "${repo_root}" \
    \( -path "${repo_root}/.git" -o -path "${repo_root}/.tools" -o -path "*/node_modules" -o -path "*/dist" -o -path "*/build" \) -prune \
    -o -name package.json -type f -print \
    | sed "s#^${repo_root}/##; s#/package.json\$##" \
    | LC_ALL=C sort
}

python_bin="$(resolve_python)"
min_release_age_days="$(load_min_release_age_days)"
found_dependency_manifest=0

if [[ -f "${repo_root}/go.mod" ]]; then
  found_dependency_manifest=1
  echo "Refreshing Go module metadata..."
  "${repo_root}/scripts/go.sh" mod tidy
  "${python_bin}" "${repo_root}/scripts/check_go_module_release_age.py" \
    --days "${min_release_age_days}" \
    --repo-root "${repo_root}"
fi

while IFS= read -r project_dir; do
  [[ -n "${project_dir}" ]] || continue
  found_dependency_manifest=1
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm is required to update ${project_dir}." >&2
    exit 1
  fi
  echo "Refreshing pnpm lockfile for ${project_dir}..."
  pnpm -C "${repo_root}/${project_dir}" install --lockfile-only
  if [[ -f "${repo_root}/${project_dir}/pnpm-lock.yaml" ]]; then
    "${python_bin}" "${repo_root}/scripts/check_pnpm_lock_release_age.py" \
      --days "${min_release_age_days}" \
      --lockfile "${repo_root}/${project_dir}/pnpm-lock.yaml"
    pnpm -C "${repo_root}/${project_dir}" install --frozen-lockfile
  fi
done < <(discover_pnpm_projects)

if [[ "${found_dependency_manifest}" -eq 0 ]]; then
  echo "No dependency manifests found."
fi
