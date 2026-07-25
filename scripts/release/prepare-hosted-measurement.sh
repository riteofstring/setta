#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: ./scripts/release/prepare-hosted-measurement.sh <absolute-output-directory> <version>" >&2
}

fail() {
  echo "prepare-hosted-measurement.sh: $*" >&2
  exit 1
}

sha256_file() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${path}" | awk '{print $1}'
    return
  fi
  command -v shasum >/dev/null 2>&1 || fail "no SHA256 tool is available"
  LC_ALL=C LANG=C shasum -a 256 "${path}" | awk '{print $1}'
}

if [[ $# -ne 2 ]]; then
  usage
  exit 2
fi

output_directory=$1
version=$2
[[ "${output_directory}" == /* ]] || fail "output directory must be absolute"
case "${version}" in
  ""|*[!A-Za-z0-9._-]*) fail "version must contain only letters, digits, dots, underscores, or dashes" ;;
esac
[[ ! -e "${output_directory}" ]] || fail "refusing to overwrite an existing hosted artifact directory"

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_directory}/../.." && pwd)"
minisign_path="$(command -v minisign || true)"
[[ -n "${minisign_path}" ]] || fail "minisign is required"
python_path="$(command -v python3 || true)"
[[ -n "${python_path}" ]] || fail "python3 is required"

control_plane_directory="${output_directory}/control-plane"
runtime_release_directory="${output_directory}/runtime-release"
work_directory="$(mktemp -d "${TMPDIR:-/tmp}/setta-hosted-release.XXXXXX")"
cleanup() {
  rm -rf "${work_directory}"
}
trap cleanup EXIT

mkdir -m 0700 "${output_directory}"
mkdir -m 0700 "${control_plane_directory}" "${runtime_release_directory}"
"${script_directory}/build-control-plane.sh" "${control_plane_directory}"
install -m 0600 "${repo_root}/deploy/hosted-control-plane/Dockerfile" "${control_plane_directory}/Dockerfile"

artifact_name="setta_${version}_linux_amd64"
artifact_directory="${work_directory}/${artifact_name}"
runtime_binary="${artifact_directory}/setta"
archive_path="${runtime_release_directory}/${artifact_name}.tar.gz"
checksums_path="${runtime_release_directory}/SHA256SUMS"
signature_path="${runtime_release_directory}/SHA256SUMS.minisig"
verifier_path="${runtime_release_directory}/setta-release-verify"
manifest_path="${runtime_release_directory}/runtime-release.json"
secret_key_path="${work_directory}/minisign.key"
public_key_path="${work_directory}/minisign.pub"

mkdir -m 0700 "${artifact_directory}"
cd "${repo_root}"
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 "${repo_root}/scripts/go.sh" build \
  -buildvcs=false \
  -trimpath \
  -ldflags "-s -w -buildid= -X main.version=${version}" \
  -o "${runtime_binary}" \
  ./cmd/setta
chmod 0755 "${runtime_binary}"
"${python_path}" "${script_directory}/make-tar-gz.py" "${archive_path}" "${artifact_directory}"

CGO_ENABLED=0 GOOS=linux GOARCH=amd64 "${repo_root}/scripts/go.sh" build \
  -buildvcs=false \
  -trimpath \
  -ldflags "-s -w -buildid=" \
  -o "${verifier_path}" \
  ./cmd/setta-release-verify

printf '%s  %s\n' "$(sha256_file "${archive_path}")" "${artifact_name}.tar.gz" >"${checksums_path}"
printf '%s  %s\n' "$(sha256_file "${runtime_binary}")" "${artifact_name}/setta" >>"${checksums_path}"
"${minisign_path}" -G -W -p "${public_key_path}" -s "${secret_key_path}" >/dev/null
"${minisign_path}" -S -l -s "${secret_key_path}" -m "${checksums_path}" -x "${signature_path}" >/dev/null

public_key="$(sed -n '2p' "${public_key_path}")"
[[ -n "${public_key}" ]] || fail "generated Minisign public key is empty"
"${minisign_path}" -Vm "${checksums_path}" -P "${public_key}" -x "${signature_path}" >/dev/null
verifier_sha256="$(sha256_file "${verifier_path}")"
{
  printf '{\n'
  printf '  "schema_version": 1,\n'
  printf '  "version": "%s",\n' "${version}"
  printf '  "os": "linux",\n'
  printf '  "arch": "amd64",\n'
  printf '  "archive": "%s.tar.gz",\n' "${artifact_name}"
  printf '  "checksums": "SHA256SUMS",\n'
  printf '  "signature": "SHA256SUMS.minisig",\n'
  printf '  "public_key": "%s",\n' "${public_key}"
  printf '  "verifier": "setta-release-verify",\n'
  printf '  "verifier_sha256": "%s"\n' "${verifier_sha256}"
  printf '}\n'
} >"${manifest_path}"

chmod 0600 \
  "${archive_path}" \
  "${checksums_path}" \
  "${signature_path}" \
  "${verifier_path}" \
  "${manifest_path}"

echo "Prepared private hosted artifacts:"
echo "  control plane: ${control_plane_directory}"
echo "  runtime release: ${manifest_path}"
