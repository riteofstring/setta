#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run_go_tests.sh [go test args...]

Run the repo Go test suite through the pinned repo-local Go toolchain.

Examples:
  ./scripts/run_go_tests.sh
  ./scripts/run_go_tests.sh ./internal/httpapi -run TestRegisterFileBrowserRoutes
EOF
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ "${1-}" == "-h" || "${1-}" == "--help" ]]; then
  usage
  exit 0
fi

cd "${ROOT_DIR}"
if [[ $# -eq 0 ]]; then
  "${ROOT_DIR}/scripts/go.sh" test ./... -count=1
else
  "${ROOT_DIR}/scripts/go.sh" test -count=1 "$@"
fi
