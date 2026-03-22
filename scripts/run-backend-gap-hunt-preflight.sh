#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPORT_PATH="${ROOT_DIR}/tmp/backend-gap-hunt-candidates.md"
BACKEND_SUITE_LOG_PATH="${ROOT_DIR}/tmp/backend-gap-hunt-backend-suite.log"
PARITY_MATRIX_CLAIMS_LOG_PATH="${ROOT_DIR}/tmp/backend-gap-hunt-parity-matrix-claims.log"
DEFAULT_PARITY_LOG_PATH="${ROOT_DIR}/tmp/backend-gap-hunt-differential-parity.log"
CORPUS_PARITY_LOG_PATH="${ROOT_DIR}/tmp/backend-gap-hunt-differential-parity-corpus.log"
EMPTY_BACKLOG_EXIT_CODE=10
BACKEND_SUITE_CMD='./scripts/go.sh test ./... -count=1'
PARITY_MATRIX_CLAIMS_CMD='python ./scripts/lint_backend_parity_matrix_claims.py'
DEFAULT_PARITY_CMD='./scripts/run-backend-differential-parity.sh --baseline-ref main'
CORPUS_PARITY_CMD='./scripts/run-backend-differential-parity.sh --baseline-ref main --manifest scripts/backend-differential-parity-corpus-scenarios.yaml'

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
fi

set +e
bash -lc "${PARITY_MATRIX_CLAIMS_CMD}" >"${PARITY_MATRIX_CLAIMS_LOG_PATH}" 2>&1
parity_matrix_claims_exit_code="$?"
set -e

if [[ "${parity_matrix_claims_exit_code}" -ne 0 ]]; then
  {
    printf '\n## Critical Parity Matrix Claim Failures\n\n'
    printf '%s\n' '- `critical_parity_matrix_claims::structured_proof_lint` (area=`critical-parity-matrix-claims`, log=`tmp/backend-gap-hunt-parity-matrix-claims.log`)'
    printf '\n'
    printf 'Run: `%s`\n' "${PARITY_MATRIX_CLAIMS_CMD}"
  } >> "${REPORT_PATH}"
fi

set +e
bash -lc "${DEFAULT_PARITY_CMD}" >"${DEFAULT_PARITY_LOG_PATH}" 2>&1
default_parity_exit_code="$?"
set -e

if [[ "${default_parity_exit_code}" -ne 0 ]]; then
  {
    printf '\n## Critical Differential Parity Failures\n\n'
    printf '%s\n' '- `critical_differential_parity::default_manifest` (area=`critical-differential-parity`, log=`tmp/backend-gap-hunt-differential-parity.log`)'
    printf '\n'
    printf 'Run: `%s`\n' "${DEFAULT_PARITY_CMD}"
  } >> "${REPORT_PATH}"
fi

set +e
bash -lc "${CORPUS_PARITY_CMD}" >"${CORPUS_PARITY_LOG_PATH}" 2>&1
corpus_parity_exit_code="$?"
set -e

if [[ "${corpus_parity_exit_code}" -ne 0 ]]; then
  if [[ "${default_parity_exit_code}" -eq 0 ]]; then
    {
      printf '\n## Critical Differential Parity Failures\n\n'
    } >> "${REPORT_PATH}"
  fi
  {
    printf '%s\n' '- `critical_differential_parity::corpus_manifest` (area=`critical-differential-parity`, log=`tmp/backend-gap-hunt-differential-parity-corpus.log`)'
    printf '\n'
    printf 'Run: `%s`\n' "${CORPUS_PARITY_CMD}"
  } >> "${REPORT_PATH}"
fi

if [[ "${backend_suite_exit_code}" -eq 0 ]]; then
  rm -f "${BACKEND_SUITE_LOG_PATH}"
fi
if [[ "${parity_matrix_claims_exit_code}" -eq 0 ]]; then
  rm -f "${PARITY_MATRIX_CLAIMS_LOG_PATH}"
fi
if [[ "${default_parity_exit_code}" -eq 0 ]]; then
  rm -f "${DEFAULT_PARITY_LOG_PATH}"
fi
if [[ "${corpus_parity_exit_code}" -eq 0 ]]; then
  rm -f "${CORPUS_PARITY_LOG_PATH}"
fi

if [[ "${backend_suite_exit_code}" -ne 0 ]] || [[ "${parity_matrix_claims_exit_code}" -ne 0 ]] || [[ "${default_parity_exit_code}" -ne 0 ]] || [[ "${corpus_parity_exit_code}" -ne 0 ]]; then
  exit 0
fi

if [[ "${miner_exit_code}" -eq "${EMPTY_BACKLOG_EXIT_CODE}" ]]; then
  exit "${EMPTY_BACKLOG_EXIT_CODE}"
fi

exit 0
