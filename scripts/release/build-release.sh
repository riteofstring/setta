#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/release/build-release.sh <version>

Build release archives for the setta CLI with the repo-pinned Go toolchain.

Outputs:
  dist/setta_<version>_linux_amd64.tar.gz
  dist/setta_<version>_linux_arm64.tar.gz
  dist/install.sh
  dist/SHA256SUMS
  dist/SHA256SUMS.minisig
EOF
}

fail() {
  echo "build-release.sh: $*" >&2
  exit 1
}

sha256_file() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${path}" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    LC_ALL=C LANG=C shasum -a 256 "${path}" | awk '{print $1}'
  else
    fail "no SHA256 checksum tool available (need sha256sum or shasum)"
  fi
}

sign_checksums() {
  local checksums_path="$1"
  local signature_path="${checksums_path}.minisig"
  local minisign_args=("-Sm" "${checksums_path}" "-x" "${signature_path}")

  command -v minisign >/dev/null 2>&1 || fail "minisign is required to sign SHA256SUMS"
  rm -f "${signature_path}"
  if [[ -n "${SETTA_MINISIGN_SECRET_KEY_FILE:-}" ]]; then
    minisign_args+=("-s" "${SETTA_MINISIGN_SECRET_KEY_FILE}")
  fi
  minisign "${minisign_args[@]}" ||
    fail "failed to sign SHA256SUMS with minisign"
}

verify_pure_go_sqlite() {
  local deps_path="$1"
  local sqlite_module=""

  sqlite_module="$("${go_bin}" list -m -f '{{.Path}} {{.Version}}' modernc.org/sqlite)" ||
    fail "modernc.org/sqlite is not present in go.mod"

  CGO_ENABLED=0 "${go_bin}" list -deps ./cmd/setta >"${deps_path}" ||
    fail "failed to inspect cmd/setta dependencies with CGO_ENABLED=0"

  if ! grep -qx 'modernc.org/sqlite' "${deps_path}"; then
    fail "cmd/setta does not depend on modernc.org/sqlite; refusing CGO-disabled release build"
  fi
  if grep -qx 'github.com/mattn/go-sqlite3' "${deps_path}"; then
    fail "cmd/setta depends on github.com/mattn/go-sqlite3; CGO-disabled cross-compilation is unsafe"
  fi

  echo "Verified sqlite driver: ${sqlite_module} (CGO_ENABLED=0)."
}

if [[ ${1-} == "-h" || ${1-} == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 1 ]]; then
  usage >&2
  exit 2
fi

version="$1"
case "${version}" in
  ""|*[!A-Za-z0-9._-]*)
    fail "version may only contain letters, digits, dots, underscores, and dashes: ${version}"
    ;;
esac

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
go_bin="${repo_root}/scripts/go.sh"
dist_dir="${repo_root}/dist"
archive_helper="${script_dir}/make-tar-gz.py"

[[ -x "${go_bin}" ]] || fail "pinned Go wrapper is not executable: ${go_bin}"
[[ -f "${archive_helper}" ]] || fail "archive helper is missing: ${archive_helper}"
command -v python3 >/dev/null 2>&1 || fail "python3 is required to create deterministic archives"

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/setta-release.XXXXXX")"
cleanup() {
  rm -rf "${work_dir}"
}
trap cleanup EXIT

cd "${repo_root}"
mkdir -p "${dist_dir}"
checksums_path="${dist_dir}/SHA256SUMS"
checksums_tmp="${work_dir}/SHA256SUMS"
installer_asset_path="${dist_dir}/install.sh"
: >"${checksums_tmp}"

verify_pure_go_sqlite "${work_dir}/setta.deps"

targets=(
  "linux/amd64"
  "linux/arm64"
)

for target in "${targets[@]}"; do
  IFS=/ read -r goos goarch <<<"${target}"
  artifact="setta_${version}_${goos}_${goarch}"
  artifact_dir="${work_dir}/${artifact}"
  binary_path="${artifact_dir}/setta"
  archive_path="${dist_dir}/${artifact}.tar.gz"

  echo "Building ${artifact}..."
  rm -f "${archive_path}"
  mkdir -p "${artifact_dir}"
  CGO_ENABLED=0 GOOS="${goos}" GOARCH="${goarch}" "${go_bin}" build \
    -buildvcs=false \
    -trimpath \
    -ldflags "-s -w -buildid= -X main.version=${version}" \
    -o "${binary_path}" \
    ./cmd/setta
  chmod 0755 "${binary_path}"

  python3 "${archive_helper}" "${archive_path}" "${artifact_dir}"

  printf '%s  %s\n' "$(sha256_file "${archive_path}")" "${artifact}.tar.gz" >>"${checksums_tmp}"
  printf '%s  %s\n' "$(sha256_file "${binary_path}")" "${artifact}/setta" >>"${checksums_tmp}"
done

install -m 0755 "${script_dir}/install.sh" "${installer_asset_path}"
printf '%s  %s\n' "$(sha256_file "${installer_asset_path}")" "install.sh" >>"${checksums_tmp}"

mv "${checksums_tmp}" "${checksums_path}"
sign_checksums "${checksums_path}"

echo "Release artifacts written to ${dist_dir}:"
for target in "${targets[@]}"; do
  IFS=/ read -r goos goarch <<<"${target}"
  echo "  setta_${version}_${goos}_${goarch}.tar.gz"
done
echo "  install.sh"
echo "  SHA256SUMS"
echo "  SHA256SUMS.minisig"
