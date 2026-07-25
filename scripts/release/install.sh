#!/bin/sh
set -eu

fail() {
  echo "install.sh: $*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    LC_ALL=C LANG=C shasum -a 256 "$1" | awk '{print $1}'
  else
    fail "no SHA256 checksum tool available (need sha256sum or shasum)"
  fi
}

download_file() {
  source_url="$1"
  output_path="$2"
  curl -fsSL "$source_url" -o "$output_path" ||
    fail "failed to download ${source_url}"
}

checksum_for_name() {
  checksum_file="$1"
  checksum_name="$2"
  awk -v name="$checksum_name" '$2 == name { print $1; found = 1; exit } END { if (!found) exit 1 }' "$checksum_file"
}

verify_checksum() {
  checksum_file="$1"
  checksum_name="$2"
  actual_path="$3"

  expected_checksum="$(checksum_for_name "$checksum_file" "$checksum_name")" ||
    fail "SHA256SUMS does not include ${checksum_name}"
  actual_checksum="$(sha256_file "$actual_path")"
  if [ "$actual_checksum" != "$expected_checksum" ]; then
    fail "checksum mismatch for ${checksum_name}"
  fi
}

detect_os() {
  case "$(uname -s)" in
    Linux)
      printf '%s\n' "linux"
      ;;
    *)
      fail "unsupported OS: $(uname -s) (supported: Linux)"
      ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64)
      printf '%s\n' "amd64"
      ;;
    aarch64|arm64)
      printf '%s\n' "arm64"
      ;;
    *)
      fail "unsupported architecture: $(uname -m) (supported: amd64, arm64)"
      ;;
  esac
}

resolve_latest_version() {
  repo="$1"
  latest_url="https://github.com/${repo}/releases/latest"
  effective_url="$(curl -fsSIL -o /dev/null -w '%{url_effective}' "$latest_url")" ||
    fail "failed to resolve latest release for ${repo}"
  latest_version="${effective_url##*/}"
  if [ -z "$latest_version" ] || [ "$latest_version" = "latest" ]; then
    fail "could not resolve latest release version from ${effective_url}"
  fi
  printf '%s\n' "$latest_version"
}

for command_name in awk chmod cp curl mkdir mktemp mv rm tar uname; do
  need_command "$command_name"
done

[ -n "${HOME:-}" ] || fail "HOME is not set"

repo="${SETTA_INSTALL_REPO:-riteofstring/setta}"
version="${SETTA_VERSION:-latest}"
base_url="${SETTA_INSTALL_BASE_URL:-}"

case "$repo" in
  */*) ;;
  *) fail "SETTA_INSTALL_REPO must use owner/repo form: ${repo}" ;;
esac

if [ -n "$base_url" ]; then
  if [ "$version" = "latest" ]; then
    fail "SETTA_VERSION must be explicit when SETTA_INSTALL_BASE_URL is set"
  fi
  release_base_url="${base_url%/}"
else
  if [ "$version" = "latest" ]; then
    version="$(resolve_latest_version "$repo")"
  fi
  release_base_url="https://github.com/${repo}/releases/download/${version}"
fi

os_name="$(detect_os)"
arch_name="$(detect_arch)"
artifact="setta_${version}_${os_name}_${arch_name}"
archive_name="${artifact}.tar.gz"

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/setta-install.XXXXXX")"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

archive_path="${tmp_dir}/${archive_name}"
checksums_path="${tmp_dir}/SHA256SUMS"
extract_dir="${tmp_dir}/extract"
binary_path="${extract_dir}/${artifact}/setta"
install_dir="${HOME}/.local/bin"
install_path="${install_dir}/setta"
install_tmp="${install_path}.tmp.$$"

mkdir -p "$extract_dir"

echo "Downloading Setta ${version} for ${os_name}/${arch_name}..."
download_file "${release_base_url}/${archive_name}" "$archive_path"
download_file "${release_base_url}/SHA256SUMS" "$checksums_path"

# Binary signing, such as minisign, is intentionally deferred for the PoC.
verify_checksum "$checksums_path" "$archive_name" "$archive_path"

tar -xzf "$archive_path" -C "$extract_dir" ||
  fail "failed to extract ${archive_name}"

[ -f "$binary_path" ] || fail "release archive did not contain ${artifact}/setta"
verify_checksum "$checksums_path" "${artifact}/setta" "$binary_path"

mkdir -p "$install_dir"
cp "$binary_path" "$install_tmp" || fail "failed to copy setta to ${install_tmp}"
chmod 0755 "$install_tmp"
mv "$install_tmp" "$install_path" || fail "failed to install setta to ${install_path}"

echo "Installed setta to ${install_path}"

case ":${PATH:-}:" in
  *":${install_dir}:"*) ;;
  *)
    echo "Warning: ${install_dir} is not on PATH." >&2
    ;;
esac
