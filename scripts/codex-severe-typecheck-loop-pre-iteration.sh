#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/codex-severe-typecheck-loop-pre-iteration.sh --root-dir PATH --output-dir PATH --state-dir PATH [options]

Refresh the severe typecheck loop state before each Codex iteration, then
validate the previous iteration's cleanliness/progress.

This script:
1. validates the previous iteration via codex-authority-cleanup-loop-check.sh
2. refreshes saved frontend/python/go typecheck outputs
3. rebuilds runtime-break-shortlist.md
4. exits with the configured completion code when the refreshed shortlist is empty

Options:
  --complete-exit-code N    Exit code used when no actionable shortlist findings remain.
  --allow-clean-failures N  Passed through to codex-authority-cleanup-loop-check.sh.
EOF
}

root_dir=""
output_dir=""
state_dir=""
complete_exit_code="42"
allow_clean_failures="3"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root-dir)
      root_dir="${2:-}"
      shift 2
      ;;
    --output-dir)
      output_dir="${2:-}"
      shift 2
      ;;
    --state-dir)
      state_dir="${2:-}"
      shift 2
      ;;
    --complete-exit-code)
      complete_exit_code="${2:-}"
      shift 2
      ;;
    --allow-clean-failures)
      allow_clean_failures="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "${root_dir}" ]] || [[ -z "${output_dir}" ]] || [[ -z "${state_dir}" ]]; then
  usage >&2
  exit 1
fi

if [[ ! -d "${root_dir}" ]]; then
  echo "Root directory not found: ${root_dir}" >&2
  exit 1
fi

if [[ ! "${complete_exit_code}" =~ ^[0-9]+$ ]] || [[ "${complete_exit_code}" -lt 0 ]] || [[ "${complete_exit_code}" -gt 255 ]]; then
  echo "--complete-exit-code must be an integer between 0 and 255" >&2
  exit 1
fi

if [[ ! "${allow_clean_failures}" =~ ^[0-9]+$ ]] || [[ "${allow_clean_failures}" -lt 0 ]]; then
  echo "--allow-clean-failures must be a non-negative integer" >&2
  exit 1
fi

mkdir -p "${state_dir}"

checklist_file="${state_dir}/checklist.md"
severe_type_audit_file="${state_dir}/severe-type-audit.md"
runtime_break_shortlist_file="${state_dir}/runtime-break-shortlist.md"
frontend_typecheck_file="${state_dir}/frontend-typecheck.txt"
python_typecheck_file="${state_dir}/python-typecheck.txt"
go_typecheck_file="${state_dir}/go-typecheck.txt"
status_file="${state_dir}/status.txt"

run_capture() {
  local output_file="$1"
  shift
  local exit_code=""

  set +e
  (
    cd "${root_dir}"
    "$@"
  ) >"${output_file}" 2>&1
  exit_code="$?"
  set -e

  printf '\n[exit_code] %s\n' "${exit_code}" >>"${output_file}"
}

"${root_dir}/scripts/codex-authority-cleanup-loop-check.sh" \
  --root-dir "${root_dir}" \
  --output-dir "${output_dir}" \
  --state-dir "${state_dir}" \
  --complete-exit-code "${complete_exit_code}" \
  --sentinel "CODEX_LOOP_STOP: UNUSED_IN_SEVERE_TYPECHECK_LOOP" \
  --progress-file "${checklist_file}" \
  --progress-file "${severe_type_audit_file}" \
  --progress-file "${runtime_break_shortlist_file}" \
  --allow-clean-failures "${allow_clean_failures}"

run_capture "${frontend_typecheck_file}" ./check_types.sh --frontend
run_capture "${python_typecheck_file}" ./check_types.sh --python
run_capture "${go_typecheck_file}" ./check_types.sh --go

python3 \
  "${root_dir}/scripts/build-runtime-break-shortlist.py" \
  --repo-root "${root_dir}" \
  --frontend-typecheck "${frontend_typecheck_file}" \
  --python-typecheck "${python_typecheck_file}" \
  --go-typecheck "${go_typecheck_file}" \
  --output "${runtime_break_shortlist_file}"

if ! grep -q '^## Tier ' "${runtime_break_shortlist_file}"; then
  printf '%s\n' "complete:no-actionable-runtime-bug-findings" > "${status_file}"
  echo "No actionable runtime-bug findings remain in the refreshed shortlist."
  exit "${complete_exit_code}"
fi

echo "Refreshed typecheck logs and runtime-break shortlist."
