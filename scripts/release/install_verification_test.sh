#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "install_verification_test.sh: $*" >&2
  exit 1
}

sha256_file() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${path}" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    LC_ALL=C LANG=C shasum -a 256 "${path}" | awk '{print $1}'
  else
    fail "no SHA256 checksum tool available"
  fi
}

detect_os() {
  case "$(uname -s)" in
    Linux) printf 'linux\n' ;;
    *) fail "unsupported test OS: $(uname -s)" ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) printf 'amd64\n' ;;
    aarch64|arm64) printf 'arm64\n' ;;
    *) fail "unsupported test arch: $(uname -m)" ;;
  esac
}

write_fake_minisign() {
  local bin_dir="$1"
  local exit_code="$2"
  cat >"${bin_dir}/minisign" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >"\${SETTA_FAKE_MINISIGN_LOG}"
exit ${exit_code}
EOF
  chmod 0755 "${bin_dir}/minisign"
}

make_release_assets() {
  local release_dir="$1"
  local version="$2"
  local os_name="$3"
  local arch_name="$4"
  local artifact="setta_${version}_${os_name}_${arch_name}"
  local build_dir="${release_dir}/build/${artifact}"
  local archive_path="${release_dir}/${artifact}.tar.gz"

  mkdir -p "${build_dir}"
  cat >"${build_dir}/setta" <<'EOF'
#!/usr/bin/env sh
echo fake setta
EOF
  chmod 0755 "${build_dir}/setta"
  tar -C "${release_dir}/build" -czf "${archive_path}" "${artifact}"
  {
    printf '%s  %s\n' "$(sha256_file "${archive_path}")" "${artifact}.tar.gz"
    printf '%s  %s\n' "$(sha256_file "${build_dir}/setta")" "${artifact}/setta"
  } >"${release_dir}/SHA256SUMS"
  printf 'fake signature\n' >"${release_dir}/SHA256SUMS.minisig"
}

run_installer() {
  local tmp_dir="$1"
  local release_dir="$2"
  local version="$3"
  env \
    HOME="${tmp_dir}/home" \
    PATH="${tmp_dir}/bin:${PATH}" \
    SETTA_FAKE_MINISIGN_LOG="${tmp_dir}/minisign.log" \
    SETTA_INSTALL_BASE_URL="file://${release_dir}" \
    SETTA_INSTALL_DIR="${tmp_dir}/install-bin" \
    SETTA_MINISIGN_PUBLIC_KEY="RWQtestminisignpublickey" \
    SETTA_VERSION="${version}" \
    sh "${repo_root}/scripts/release/install.sh"
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/setta-install-test.XXXXXX")"
cleanup() {
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

version="v-test"
os_name="$(detect_os)"
arch_name="$(detect_arch)"
release_dir="${tmp_dir}/release"
mkdir -p "${release_dir}" "${tmp_dir}/bin" "${tmp_dir}/home"
make_release_assets "${release_dir}" "${version}" "${os_name}" "${arch_name}"

write_fake_minisign "${tmp_dir}/bin" 0
run_installer "${tmp_dir}" "${release_dir}" "${version}" >/dev/null
grep -q -- "-Vm .*SHA256SUMS -P RWQtestminisignpublickey -x .*SHA256SUMS.minisig" "${tmp_dir}/minisign.log" ||
  fail "installer did not verify SHA256SUMS with minisign"
[ -x "${tmp_dir}/install-bin/setta" ] ||
  fail "installer did not install verified binary"

rm -f "${tmp_dir}/install-bin/setta" "${tmp_dir}/minisign.log"
write_fake_minisign "${tmp_dir}/bin" 1
if run_installer "${tmp_dir}" "${release_dir}" "${version}" >/dev/null 2>"${tmp_dir}/failed.err"; then
  fail "installer succeeded with failing minisign"
fi
grep -q "minisign verification failed" "${tmp_dir}/failed.err" ||
  fail "installer failure did not mention minisign verification"

echo "install_verification_test.sh: ok"
