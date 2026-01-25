#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="${ROOT_DIR}/backend/setta/vendor/node"

OS_NAME="$(uname -s)"
ARCH_NAME="$(uname -m)"

case "${OS_NAME}" in
  Darwin)
    OS_TAG="darwin"
    ;;
  Linux)
    OS_TAG="linux"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    OS_TAG="win"
    ;;
  *)
    echo "Unsupported OS: ${OS_NAME}" >&2
    exit 1
    ;;
 esac

case "${ARCH_NAME}" in
  x86_64|amd64)
    ARCH_TAG="x64"
    ;;
  arm64|aarch64)
    ARCH_TAG="arm64"
    ;;
  *)
    echo "Unsupported architecture: ${ARCH_NAME}" >&2
    exit 1
    ;;
 esac

PLATFORM_TAG="${OS_TAG}-${ARCH_TAG}"
DEST_DIR="${VENDOR_DIR}/${PLATFORM_TAG}"
BIN_NAME="node"
if [[ "${OS_TAG}" == "win" ]]; then
  BIN_NAME="node.exe"
fi

NODE_VERSION="${SETTA_NODE_VERSION:-${NODE_VERSION:-}}"
if [[ -z "${NODE_VERSION}" ]]; then
  VERSION_FILE="${ROOT_DIR}/scripts/node_version.txt"
  if [[ -f "${VERSION_FILE}" ]]; then
    NODE_VERSION="$(tr -d '[:space:]' < "${VERSION_FILE}")"
  fi
fi

if [[ -z "${NODE_VERSION}" ]]; then
  echo "Node version not specified. Set SETTA_NODE_VERSION or add scripts/node_version.txt." >&2
  exit 1
fi

NODE_VERSION="${NODE_VERSION#v}"

if [[ -f "${DEST_DIR}/version.txt" ]] && [[ -f "${DEST_DIR}/${BIN_NAME}" ]]; then
  EXISTING_VERSION="$(tr -d '[:space:]' < "${DEST_DIR}/version.txt")"
  if [[ "${EXISTING_VERSION}" == "${NODE_VERSION}" ]]; then
    echo "Bundled Node ${NODE_VERSION} already present for ${PLATFORM_TAG}."
    exit 0
  fi
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

if [[ "${OS_TAG}" == "win" ]]; then
  ARCHIVE="node-v${NODE_VERSION}-${PLATFORM_TAG}.zip"
else
  ARCHIVE="node-v${NODE_VERSION}-${PLATFORM_TAG}.tar.gz"
fi
URL="https://nodejs.org/dist/v${NODE_VERSION}/${ARCHIVE}"

echo "Downloading Node ${NODE_VERSION} for ${PLATFORM_TAG}..."
curl -fsSL "${URL}" -o "${TMP_DIR}/${ARCHIVE}"

if [[ "${OS_TAG}" == "win" ]]; then
  python - <<PY
import zipfile

zipfile.ZipFile("${TMP_DIR}/${ARCHIVE}").extractall("${TMP_DIR}")
PY
else
  tar -xzf "${TMP_DIR}/${ARCHIVE}" -C "${TMP_DIR}"
fi

SRC_DIR="${TMP_DIR}/node-v${NODE_VERSION}-${PLATFORM_TAG}"
if [[ ! -d "${SRC_DIR}" ]]; then
  echo "Expected Node archive folder not found: ${SRC_DIR}" >&2
  exit 1
fi

if [[ "${OS_TAG}" == "win" ]]; then
  BIN_SRC="${SRC_DIR}/node.exe"
else
  BIN_SRC="${SRC_DIR}/bin/node"
fi

if [[ ! -f "${BIN_SRC}" ]]; then
  echo "Node binary not found at ${BIN_SRC}" >&2
  exit 1
fi

rm -rf "${DEST_DIR}"
mkdir -p "${DEST_DIR}"
cp "${BIN_SRC}" "${DEST_DIR}/${BIN_NAME}"
if [[ "${OS_TAG}" != "win" ]]; then
  chmod +x "${DEST_DIR}/${BIN_NAME}"
fi
if [[ -f "${SRC_DIR}/LICENSE" ]]; then
  cp "${SRC_DIR}/LICENSE" "${DEST_DIR}/LICENSE"
fi

echo "${NODE_VERSION}" > "${DEST_DIR}/version.txt"

printf "Bundled Node %s for %s at %s\n" "${NODE_VERSION}" "${PLATFORM_TAG}" "${DEST_DIR}"
