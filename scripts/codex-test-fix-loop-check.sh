#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/codex-test-fix-loop-check.sh --checklist PATH --state-dir PATH [--complete-exit-code N]

Exit 0 while work remains.
Exit the configured completion code after all checklist items are checked and the
full Go, Python, Vitest, and Playwright suites pass.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

checklist_path=""
state_dir=""
complete_exit_code="42"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --checklist)
      checklist_path="${2:-}"
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

if [[ -z "${checklist_path}" ]] || [[ -z "${state_dir}" ]]; then
  usage >&2
  exit 1
fi

if [[ ! -f "${checklist_path}" ]]; then
  echo "Checklist not found: ${checklist_path}" >&2
  exit 1
fi

if [[ ! "${complete_exit_code}" =~ ^[0-9]+$ ]] || [[ "${complete_exit_code}" -lt 0 ]] || [[ "${complete_exit_code}" -gt 255 ]]; then
  echo "--complete-exit-code must be an integer between 0 and 255" >&2
  exit 1
fi

mkdir -p "${state_dir}"

status_file="${state_dir}/final-verification-status.txt"
summary_file="${state_dir}/final-verification-summary.md"
failed_flag_file="${state_dir}/final-verification-failed.flag"
log_dir="${state_dir}/final-verification-logs"
mkdir -p "${log_dir}"

timestamp="$(date '+%Y-%m-%d %H:%M:%S %Z')"

if grep -q '^-[[:space:]]\[[[:space:]]\]' "${checklist_path}"; then
  rm -f "${failed_flag_file}"
  printf 'pending\n' > "${status_file}"
  echo "Checklist still has unchecked items."
  exit 0
fi

if [[ -f "${failed_flag_file}" ]]; then
  printf 'failed-awaiting-checklist-update\n' > "${status_file}"
  echo "Waiting for checklist updates after the last full-suite verification failure."
  exit 0
fi

go_log="${log_dir}/go.log"
python_log="${log_dir}/python.log"
vitest_log="${log_dir}/vitest.log"
playwright_log="${log_dir}/playwright.log"

suite_names=()
suite_statuses=()
suite_logs=()
failed_count=0

run_suite() {
  local suite_name="$1"
  local suite_log="$2"
  shift 2

  echo "Running ${suite_name} full-suite verification."
  if (cd "${ROOT_DIR}" && "$@") > "${suite_log}" 2>&1; then
    echo "PASS ${suite_name}"
    suite_names+=("${suite_name}")
    suite_statuses+=("PASS")
    suite_logs+=("${suite_log}")
    return 0
  fi

  echo "FAIL ${suite_name} (see ${suite_log})"
  suite_names+=("${suite_name}")
  suite_statuses+=("FAIL")
  suite_logs+=("${suite_log}")
  failed_count=$((failed_count + 1))
  return 1
}

run_suite "Go" "${go_log}" ./scripts/run_go_tests.sh || true
run_suite "Python" "${python_log}" ./scripts/run_backend_tests.sh || true
run_suite "Vitest" "${vitest_log}" pnpm -C frontend exec vitest run || true
run_suite "Playwright" "${playwright_log}" ./scripts/run-playwright-e2e.sh || true

{
  echo "# Final Verification Summary"
  echo
  printf 'Updated: %s\n' "${timestamp}"
  printf 'Checklist: %s\n' "${checklist_path}"
  echo
  echo "Suites:"
  index=0
  while [[ "${index}" -lt "${#suite_names[@]}" ]]; do
    printf -- '- %s: %s (%s)\n' \
      "${suite_names[${index}]}" \
      "${suite_statuses[${index}]}" \
      "${suite_logs[${index}]}"
    index=$((index + 1))
  done
  echo
  if [[ "${failed_count}" -eq 0 ]]; then
    echo "All full-suite verification commands passed."
  else
    echo "At least one full-suite verification command failed."
    echo "Codex should read the failed logs, set affected checklist items back to [ ], fix them, rerun those scopes, and re-check them."
  fi
} > "${summary_file}"

if [[ "${failed_count}" -eq 0 ]]; then
  rm -f "${failed_flag_file}"
  printf 'passed\n' > "${status_file}"
  echo "All full-suite verification commands passed."
  exit "${complete_exit_code}"
fi

touch "${failed_flag_file}"
printf 'failed\n' > "${status_file}"
echo "Full-suite verification failed."
exit 0
