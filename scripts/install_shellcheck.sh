#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHELLCHECK_VERSION="${SETTA_SHELLCHECK_VERSION:-${SHELLCHECK_VERSION:-}}"
VERSION_FILE="${ROOT_DIR}/scripts/shellcheck_version.txt"

if [[ -z "${SHELLCHECK_VERSION}" ]] && [[ -f "${VERSION_FILE}" ]]; then
  SHELLCHECK_VERSION="$(tr -d '[:space:]' < "${VERSION_FILE}")"
fi

if [[ -z "${SHELLCHECK_VERSION}" ]]; then
  echo "ShellCheck version not specified. Set SETTA_SHELLCHECK_VERSION or add scripts/shellcheck_version.txt." >&2
  exit 1
fi

SHELLCHECK_VERSION="${SHELLCHECK_VERSION#v}"

case "$(uname -s)" in
  Darwin)
    OS_TAG="darwin"
    ;;
  Linux)
    OS_TAG="linux"
    ;;
  *)
    echo "Unsupported OS for repo-local ShellCheck: $(uname -s)" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  arm64|aarch64)
    ARCH_TAG="aarch64"
    ;;
  x86_64|amd64)
    ARCH_TAG="x86_64"
    ;;
  *)
    echo "Unsupported architecture for repo-local ShellCheck: $(uname -m)" >&2
    exit 1
    ;;
esac

PLATFORM_TAG="${OS_TAG}-${ARCH_TAG}"
ARCHIVE_PLATFORM="${OS_TAG}.${ARCH_TAG}"
DEST_DIR="${ROOT_DIR}/.tools/shellcheck/${PLATFORM_TAG}"
SHELLCHECK_BIN="${DEST_DIR}/shellcheck"

if [[ -f "${DEST_DIR}/version.txt" ]] && [[ -x "${SHELLCHECK_BIN}" ]]; then
  EXISTING_VERSION="$(tr -d '[:space:]' < "${DEST_DIR}/version.txt")"
  if [[ "${EXISTING_VERSION}" == "${SHELLCHECK_VERSION}" ]]; then
    printf "Repo-local ShellCheck %s already present for %s at %s\n" "${SHELLCHECK_VERSION}" "${PLATFORM_TAG}" "${SHELLCHECK_BIN}"
    exit 0
  fi
fi

case "${SHELLCHECK_VERSION}:${ARCHIVE_PLATFORM}" in
  0.11.0:darwin.aarch64)
    EXPECTED_SHA="339b930feb1ea764467013cc1f72d09cd6b869ebf1013296ba9055ab2ffbd26f"
    ;;
  0.11.0:darwin.x86_64)
    EXPECTED_SHA="c2c15e08df0e8fbc374c335b230a7ee958c313fa5714817a59aa59f1aa594f51"
    ;;
  0.11.0:linux.aarch64)
    EXPECTED_SHA="68a8133197a50beb8803f8d42f9908d1af1c5540d4bb05fdfca8c1fa47decefc"
    ;;
  0.11.0:linux.x86_64)
    EXPECTED_SHA="b7af85e41cc99489dcc21d66c6d5f3685138f06d34651e6d34b42ec6d54fe6f6"
    ;;
  *)
    echo "No pinned ShellCheck checksum for ${SHELLCHECK_VERSION} on ${ARCHIVE_PLATFORM}." >&2
    exit 1
    ;;
esac

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

ARCHIVE="shellcheck-v${SHELLCHECK_VERSION}.${ARCHIVE_PLATFORM}.tar.gz"
ARCHIVE_PATH="${TMP_DIR}/${ARCHIVE}"
URL="https://github.com/koalaman/shellcheck/releases/download/v${SHELLCHECK_VERSION}/${ARCHIVE}"

echo "Downloading ShellCheck ${SHELLCHECK_VERSION} for ${PLATFORM_TAG}..."
curl -fsSL "${URL}" -o "${ARCHIVE_PATH}"

if command -v shasum >/dev/null 2>&1; then
  ACTUAL_SHA="$(LC_ALL=C LANG=C shasum -a 256 "${ARCHIVE_PATH}" | awk '{print $1}')"
elif command -v sha256sum >/dev/null 2>&1; then
  ACTUAL_SHA="$(sha256sum "${ARCHIVE_PATH}" | awk '{print $1}')"
else
  echo "No SHA256 checksum tool available (need shasum or sha256sum)." >&2
  exit 1
fi

if [[ "${EXPECTED_SHA}" != "${ACTUAL_SHA}" ]]; then
  echo "Checksum mismatch for ${ARCHIVE}" >&2
  exit 1
fi

tar -xzf "${ARCHIVE_PATH}" -C "${TMP_DIR}"
EXTRACTED_BIN="${TMP_DIR}/shellcheck-v${SHELLCHECK_VERSION}/shellcheck"
if [[ ! -x "${EXTRACTED_BIN}" ]]; then
  echo "Expected ShellCheck binary not found in archive: ${EXTRACTED_BIN}" >&2
  exit 1
fi

rm -rf "${DEST_DIR}"
mkdir -p "${DEST_DIR}"
mv "${EXTRACTED_BIN}" "${SHELLCHECK_BIN}"
chmod +x "${SHELLCHECK_BIN}"
echo "${SHELLCHECK_VERSION}" > "${DEST_DIR}/version.txt"

printf "Installed repo-local ShellCheck %s for %s at %s\n" "${SHELLCHECK_VERSION}" "${PLATFORM_TAG}" "${SHELLCHECK_BIN}"
printf "Use it via %s\n" "./scripts/shellcheck.sh"
