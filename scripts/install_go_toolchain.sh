#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GO_VERSION="${SETTA_GO_VERSION:-${GO_VERSION:-}}"
VERSION_FILE="${ROOT_DIR}/scripts/go_version.txt"

if [[ -z "${GO_VERSION}" ]] && [[ -f "${VERSION_FILE}" ]]; then
  GO_VERSION="$(tr -d '[:space:]' < "${VERSION_FILE}")"
fi

if [[ -z "${GO_VERSION}" ]]; then
  echo "Go version not specified. Set SETTA_GO_VERSION or add scripts/go_version.txt." >&2
  exit 1
fi

GO_VERSION="${GO_VERSION#go}"

case "$(uname -s)" in
  Darwin)
    OS_TAG="darwin"
    ;;
  Linux)
    OS_TAG="linux"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    OS_TAG="windows"
    ;;
  *)
    echo "Unsupported OS: $(uname -s)" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  x86_64|amd64)
    ARCH_TAG="amd64"
    ;;
  arm64|aarch64)
    ARCH_TAG="arm64"
    ;;
  *)
    echo "Unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

PLATFORM_TAG="${OS_TAG}-${ARCH_TAG}"
DEST_DIR="${ROOT_DIR}/.tools/go/${PLATFORM_TAG}"
GO_ROOT="${DEST_DIR}/go"
GO_BIN="${GO_ROOT}/bin/go"
if [[ "${OS_TAG}" == "windows" ]]; then
  GO_BIN="${GO_BIN}.exe"
fi

if [[ -f "${DEST_DIR}/version.txt" ]] && [[ -x "${GO_BIN}" ]]; then
  EXISTING_VERSION="$(tr -d '[:space:]' < "${DEST_DIR}/version.txt")"
  if [[ "${EXISTING_VERSION}" == "${GO_VERSION}" ]]; then
    printf "Repo-local Go %s already present for %s at %s\n" "${GO_VERSION}" "${PLATFORM_TAG}" "${GO_ROOT}"
    exit 0
  fi
fi

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "Python is required to verify Go release metadata." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

if [[ "${OS_TAG}" == "windows" ]]; then
  ARCHIVE="go${GO_VERSION}.${OS_TAG}-${ARCH_TAG}.zip"
else
  ARCHIVE="go${GO_VERSION}.${OS_TAG}-${ARCH_TAG}.tar.gz"
fi

RELEASES_JSON="${TMP_DIR}/releases.json"
ARCHIVE_PATH="${TMP_DIR}/${ARCHIVE}"
URL="https://go.dev/dl/${ARCHIVE}"

echo "Fetching Go release metadata for ${GO_VERSION}..."
curl -fsSL "https://go.dev/dl/?mode=json&include=all" -o "${RELEASES_JSON}"

EXPECTED_SHA="$("${PYTHON_BIN}" - "${RELEASES_JSON}" "go${GO_VERSION}" "${ARCHIVE}" <<'PY'
import json
import sys

metadata_path, version, filename = sys.argv[1], sys.argv[2], sys.argv[3]
with open(metadata_path, encoding="utf-8") as f:
    releases = json.load(f)
for release in releases:
    if release.get("version") != version:
        continue
    for file_entry in release.get("files", []):
        if file_entry.get("filename") == filename:
            print(file_entry["sha256"])
            raise SystemExit(0)
raise SystemExit(1)
PY
)"

if [[ -z "${EXPECTED_SHA}" ]]; then
  echo "Failed to find checksum for ${ARCHIVE}" >&2
  exit 1
fi

echo "Downloading Go ${GO_VERSION} for ${PLATFORM_TAG}..."
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

if [[ "${OS_TAG}" == "windows" ]]; then
  "${PYTHON_BIN}" - <<PY
import zipfile

zipfile.ZipFile("${ARCHIVE_PATH}").extractall("${TMP_DIR}")
PY
else
  tar -xzf "${ARCHIVE_PATH}" -C "${TMP_DIR}"
fi

if [[ ! -d "${TMP_DIR}/go" ]]; then
  echo "Expected Go archive folder not found: ${TMP_DIR}/go" >&2
  exit 1
fi

rm -rf "${DEST_DIR}"
mkdir -p "${DEST_DIR}"
mv "${TMP_DIR}/go" "${GO_ROOT}"
echo "${GO_VERSION}" > "${DEST_DIR}/version.txt"

if [[ "${OS_TAG}" != "windows" ]]; then
  chmod +x "${GO_ROOT}/bin/go" "${GO_ROOT}/bin/gofmt"
fi

printf "Installed repo-local Go %s for %s at %s\n" "${GO_VERSION}" "${PLATFORM_TAG}" "${GO_ROOT}"
printf "Use it via %s\n" "./scripts/go.sh"
