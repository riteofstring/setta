#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPORT_PATH="${ROOT_DIR}/tmp/backend-gap-hunt-candidates.md"
BACKEND_SUITE_LOG_PATH="${ROOT_DIR}/tmp/backend-gap-hunt-backend-suite.log"
EMPTY_BACKLOG_EXIT_CODE=10
BACKEND_SUITE_CMD='./scripts/go.sh test ./... -count=1'

source "${ROOT_DIR}/activate.sh"

set +e
"${SCRIPT_DIR}/run-backend-gap-hunt-candidate-miner.sh" --output "${REPORT_PATH}"
miner_exit_code="$?"
set -e

if [[ "${miner_exit_code}" -ne 0 ]] && [[ "${miner_exit_code}" -ne "${EMPTY_BACKLOG_EXIT_CODE}" ]]; then
  exit "${miner_exit_code}"
fi

set +e
bash -lc "${BACKEND_SUITE_CMD}" >"${BACKEND_SUITE_LOG_PATH}" 2>&1
backend_suite_exit_code="$?"
set -e

if [[ "${backend_suite_exit_code}" -ne 0 ]]; then
  {
    printf '\n## Critical Backend Suite Failures\n\n'
    printf '%s\n' '- `critical_backend_suite::go_test_all` (area=`critical-backend-suite`, log=`tmp/backend-gap-hunt-backend-suite.log`)'
    printf '\n'
    printf 'Run: `%s`\n' "${BACKEND_SUITE_CMD}"
  } >> "${REPORT_PATH}"
  exit 0
fi

rm -f "${BACKEND_SUITE_LOG_PATH}"

if [[ "${miner_exit_code}" -eq "${EMPTY_BACKLOG_EXIT_CODE}" ]]; then
  exit "${EMPTY_BACKLOG_EXIT_CODE}"
fi

exit 0
