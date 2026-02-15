#!/usr/bin/env bash
set -uo pipefail

LOG_FILE="tests.log"
: > "${LOG_FILE}"
exec > >(tee -a "${LOG_FILE}") 2>&1

run_backend=1
run_frontend=1
run_playwright=1

usage() {
  cat <<'EOF'
Usage: ./t.sh [--b | --f] [--all]

Options:
  --b              Run backend pytest only.
  --f              Run frontend Vitest + Playwright only.
  --all            Enable opt-in external agent integration tests.
  -h, --help       Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --b)
      run_backend=1
      run_frontend=0
      run_playwright=0
      shift
      ;;
    --f)
      run_backend=0
      run_frontend=1
      run_playwright=1
      shift
      ;;
    --all)
      export SETTA_RUN_EXTERNAL_AGENT_INTEGRATION_TESTS=1
      shift
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
done

status=0

if [[ "${run_backend}" -eq 1 ]]; then
  ./scripts/run_backend_tests.sh || status=1
fi
if [[ "${run_frontend}" -eq 1 ]]; then
  CI=1 pnpm -C frontend test -- --run || status=1
fi
if [[ "${run_playwright}" -eq 1 ]]; then
  ./scripts/run-playwright-e2e.sh || status=1
fi

exit "${status}"
