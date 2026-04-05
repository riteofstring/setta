#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/backend/setta/go_bin"

usage() {
  cat <<'USAGE'
Usage: ./scripts/build_packaged_go_binaries.sh

Build the current-platform packaged Go entrypoint binaries under
backend/setta/go_bin/ for Python distribution packaging.
USAGE
}

if [[ "${1-}" == "-h" || "${1-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 0 ]]; then
  usage >&2
  exit 1
fi

cd "${ROOT_DIR}"
rm -rf "${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}"

go_exe="$("${ROOT_DIR}/scripts/go.sh" env GOEXE)"
go_os="$("${ROOT_DIR}/scripts/go.sh" env GOOS)"
go_arch="$("${ROOT_DIR}/scripts/go.sh" env GOARCH)"

"${ROOT_DIR}/scripts/go.sh" build -o "${OUTPUT_DIR}/setta${go_exe}" ./cmd/setta
"${ROOT_DIR}/scripts/go.sh" build -o "${OUTPUT_DIR}/setta-server${go_exe}" ./cmd/setta-server

echo "Built packaged Go binaries for ${go_os}/${go_arch} in ${OUTPUT_DIR}"
echo "  - ${OUTPUT_DIR}/setta${go_exe}"
echo "  - ${OUTPUT_DIR}/setta-server${go_exe}"
