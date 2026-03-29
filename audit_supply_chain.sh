#!/usr/bin/env bash
set -uo pipefail

usage() {
  cat <<'EOF'
Usage: ./audit_supply_chain.sh [--days N]

Runs dependency security audits for Python, Go, and pnpm-managed packages.

Options:
  --days N   Override the minimum release age used for Python and Go age checks.
  -h, --help Show this help text.
EOF
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
days=""
failure_count=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --days)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing value for --days" >&2
        exit 1
      fi
      days="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [[ -z "${days}" ]] && [[ -f "${repo_root}/supply_chain_policy.env" ]]; then
  # shellcheck source=/dev/null
  . "${repo_root}/supply_chain_policy.env"
  days="${SETTA_MIN_RELEASE_AGE_DAYS:-}"
fi

days="${days:-7}"

if ! [[ "${days}" =~ ^[0-9]+$ ]]; then
  echo "Minimum release age must be a non-negative integer: ${days}" >&2
  exit 1
fi

if command -v python3 >/dev/null 2>&1; then
  python_bin="python3"
elif command -v python >/dev/null 2>&1; then
  python_bin="python"
else
  echo "Python is required to run the release-age checks." >&2
  exit 1
fi

run_step() {
  local label="$1"
  shift

  echo "${label}"
  if "$@"; then
    return 0
  else
    local status=$?
    echo "FAILED (${status}): ${label}" >&2
    failure_count=$((failure_count + 1))
  fi
  return 0
}

python_lockfile_check() {
  local python_policy_output
  if ! python_policy_output="$(
    cd "${repo_root}" && uv lock --check 2>&1
  )"; then
    printf '%s\n' "${python_policy_output}" >&2
    echo "Python lockfile drift check failed: uv.lock is not up to date." >&2
    return 1
  fi
}

python_release_age_audit() {
  (
    cd "${repo_root}"
    "${python_bin}" ./scripts/check_uv_lock_release_age.py --days "${days}" --lockfile ./uv.lock
  )
}

python_vulnerability_audit() {
  (
    cd "${repo_root}"
    uv run \
      --frozen \
      --python "${SETTA_PYTHON_VERSION:-3.13}" \
      --extra source \
      --extra dev \
      pip-audit
  )
}

go_vulnerability_audit() {
  (
    cd "${repo_root}"
    ./scripts/go.sh run golang.org/x/vuln/cmd/govulncheck@v1.1.4 ./...
  )
}

go_release_age_audit() {
  (
    cd "${repo_root}"
    "${python_bin}" ./scripts/check_go_module_release_age.py --days "${days}" --repo-root "${repo_root}"
  )
}

frontend_release_age_audit() {
  (
    cd "${repo_root}"
    "${python_bin}" ./scripts/check_pnpm_lock_release_age.py --days "${days}" --lockfile ./frontend/pnpm-lock.yaml
  )
}

sidecar_release_age_audit() {
  (
    cd "${repo_root}"
    "${python_bin}" ./scripts/check_pnpm_lock_release_age.py --days "${days}" --lockfile ./backend/setta/agentic/external_adapters/sidecars/pnpm-lock.yaml
  )
}

frontend_pnpm_audit() {
  (
    cd "${repo_root}/frontend"
    pnpm audit
  )
}

sidecar_pnpm_audit() {
  (
    cd "${repo_root}/backend/setta/agentic/external_adapters/sidecars"
    pnpm audit
  )
}

run_step "Python lockfile drift check (uv lock --check)..." python_lockfile_check
run_step "Python release-age audit (${days} days)..." python_release_age_audit
run_step "Python vulnerability audit (uv + pip-audit)..." python_vulnerability_audit
run_step "Go vulnerability audit (govulncheck)..." go_vulnerability_audit
run_step "Go module release-age audit (${days} days)..." go_release_age_audit
run_step "Frontend pnpm release-age audit (${days} days)..." frontend_release_age_audit
run_step "Sidecar pnpm release-age audit (${days} days)..." sidecar_release_age_audit
run_step "Frontend pnpm audit..." frontend_pnpm_audit
run_step "Sidecar pnpm audit..." sidecar_pnpm_audit

if [[ "${failure_count}" -gt 0 ]]; then
  echo "Supply-chain audit finished with ${failure_count} failing check(s)." >&2
  exit 1
fi

echo "Supply-chain audit passed."
