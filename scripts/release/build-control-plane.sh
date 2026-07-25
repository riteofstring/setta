#!/bin/sh
set -eu

usage() {
  echo "Usage: ./scripts/release/build-control-plane.sh <absolute-output-directory>" >&2
}

if [ "$#" -ne 1 ]; then
  usage
  exit 2
fi

output_directory=$1
case "${output_directory}" in
  /*) ;;
  *)
    echo "control-plane output directory must be absolute" >&2
    exit 2
    ;;
esac

repo_root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
binary_path="${output_directory}/setta-control-plane-linux-amd64"
checksums_path="${output_directory}/SHA256SUMS"

if [ -e "${binary_path}" ] || [ -e "${checksums_path}" ]; then
  echo "refusing to overwrite an existing control-plane release artifact" >&2
  exit 1
fi

mkdir -p "${output_directory}"
chmod 0700 "${output_directory}"

CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
  "${repo_root}/scripts/go.sh" build \
  -buildvcs=false \
  -trimpath \
  -o "${binary_path}" \
  ./cmd/setta-control-plane
chmod 0700 "${binary_path}"

(
  cd "${output_directory}"
  shasum -a 256 "$(basename -- "${binary_path}")" >"${checksums_path}"
)
chmod 0600 "${checksums_path}"

echo "Built ${binary_path}"
echo "Wrote ${checksums_path}"
