#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "${SCRIPT_DIR}" && pwd)

usage() {
  cat <<'EOF'
Usage: ./gcft.sh [--all]

Options:
  --all            Enable opt-in external agent integration tests.
  -h, --help       Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
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

cd "${ROOT_DIR}"
. ./activate.sh
cd "${ROOT_DIR}/frontend"
pnpm gcft
