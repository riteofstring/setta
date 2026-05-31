#!/usr/bin/env bash
set -euo pipefail

SETTA_MIN_RELEASE_AGE_DAYS="${SETTA_MIN_RELEASE_AGE_DAYS:-7}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly GOVULNCHECK_VERSION="v1.3.0"

if ! [[ "${SETTA_MIN_RELEASE_AGE_DAYS}" =~ ^[0-9]+$ ]]; then
  echo "Minimum release age must be a non-negative integer: ${SETTA_MIN_RELEASE_AGE_DAYS}" >&2
  exit 1
fi

resolve_python() {
  if command -v python3 >/dev/null 2>&1; then
    printf '%s\n' python3
    return
  fi
  if command -v python >/dev/null 2>&1; then
    printf '%s\n' python
    return
  fi
  echo "python3 or python is required for supply-chain checks." >&2
  exit 1
}

discover_pnpm_projects() {
  find "${repo_root}" \
    \( -path "${repo_root}/.git" -o -path "${repo_root}/.tools" -o -path "*/node_modules" -o -path "*/dist" -o -path "*/build" -o -path "*/out" -o -path "*/coverage" -o -path "*/test-results" -o -path "*/playwright-report" \) -prune \
    -o -name package.json -type f -print \
    | sed "s#^${repo_root}/##; s#/package.json\$##" \
    | LC_ALL=C sort
}

check_go_supply_chain() {
  if [[ ! -f "${repo_root}/go.mod" ]]; then
    return
  fi

  echo "Go module tidy check..."
  "${repo_root}/scripts/go.sh" mod tidy -diff

  echo "Go module release-age check..."
  "${python_bin}" "${repo_root}/scripts/check_go_module_release_age.py" \
    --days "${SETTA_MIN_RELEASE_AGE_DAYS}" \
    --repo-root "${repo_root}"

  echo "Go vulnerability audit..."
  "${repo_root}/scripts/go.sh" run "golang.org/x/vuln/cmd/govulncheck@${GOVULNCHECK_VERSION}" ./...
}

check_pnpm_lock_sync() {
  local project_dir="$1"
  local temp_dir
  local status
  temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/setta-pnpm-lock-check.XXXXXX")"
  cp "${repo_root}/${project_dir}/package.json" "${temp_dir}/package.json"
  cp "${repo_root}/${project_dir}/pnpm-lock.yaml" "${temp_dir}/pnpm-lock.yaml"
  set +e
  pnpm -C "${temp_dir}" install --lockfile-only --frozen-lockfile --ignore-scripts
  status=$?
  set -e
  rm -rf "${temp_dir}"
  return "${status}"
}

check_npmrc_release_age_keys() {
  "${python_bin}" "${repo_root}/scripts/check_npmrc_release_age_keys.py" --repo-root "${repo_root}"
}

check_pnpm_project() {
  local project_dir="$1"
  if [[ ! -f "${repo_root}/${project_dir}/pnpm-lock.yaml" ]]; then
    echo "Missing pnpm lockfile for ${project_dir}." >&2
    return 1
  fi

  echo "Exact direct dependency check (${project_dir})..."
  "${python_bin}" "${repo_root}/scripts/check_package_json_exact_versions.py" \
    "${repo_root}/${project_dir}/package.json"

  echo "pnpm lockfile sync check (${project_dir})..."
  check_pnpm_lock_sync "${project_dir}"

  echo "pnpm release-age check (${project_dir})..."
  "${python_bin}" "${repo_root}/scripts/check_pnpm_lock_release_age.py" \
    --days "${SETTA_MIN_RELEASE_AGE_DAYS}" \
    --lockfile "${repo_root}/${project_dir}/pnpm-lock.yaml"

  echo "pnpm vulnerability audit (${project_dir})..."
  pnpm -C "${repo_root}/${project_dir}" audit --audit-level moderate
}

python_bin="$(resolve_python)"

echo "npmrc release-age key checks..."
check_npmrc_release_age_keys

check_go_supply_chain

found_pnpm_project=0
while IFS= read -r project_dir; do
  [[ -n "${project_dir}" ]] || continue
  found_pnpm_project=1
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm is required for ${project_dir} supply-chain checks." >&2
    exit 1
  fi
  check_pnpm_project "${project_dir}"
done < <(discover_pnpm_projects)

if [[ "${found_pnpm_project}" -eq 0 && ! -f "${repo_root}/go.mod" ]]; then
  echo "No dependency manifests found."
fi
