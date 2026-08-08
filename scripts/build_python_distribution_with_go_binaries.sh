#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./scripts/build_python_distribution_with_go_binaries.sh [--skip-cleanup] [python -m build args...]

Build the current-platform packaged Go binaries under backend/setta/go_bin and
run python -m build for this repo.

Options:
  --skip-cleanup  Preserve existing build inputs/artifacts and skip ./cleanup.sh.
  -h, --help      Show this help message.
USAGE
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cleanup_before_build=1
build_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-cleanup)
      cleanup_before_build=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      build_args+=("$@")
      break
      ;;
    *)
      build_args+=("$1")
      shift
      ;;
  esac
done

cd "${ROOT_DIR}"
if [[ "${cleanup_before_build}" == "1" ]]; then
  ./cleanup.sh
fi
./scripts/build_packaged_go_binaries.sh
if (( ${#build_args[@]} == 0 )); then
  python -m build
else
  python -m build "${build_args[@]}"
fi
