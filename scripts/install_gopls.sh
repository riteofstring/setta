#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GOPLS_VERSION="${SETTA_GOPLS_VERSION:-}"
VERSION_FILE="${ROOT_DIR}/scripts/gopls_version.txt"

if [[ -z "${GOPLS_VERSION}" ]] && [[ -f "${VERSION_FILE}" ]]; then
  GOPLS_VERSION="$(tr -d '[:space:]' < "${VERSION_FILE}")"
fi

if [[ -z "${GOPLS_VERSION}" ]]; then
  echo "gopls version not specified. Set SETTA_GOPLS_VERSION or add scripts/gopls_version.txt." >&2
  exit 1
fi

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
DEST_DIR="${ROOT_DIR}/.tools/gopls/${PLATFORM_TAG}"
BIN_DIR="${DEST_DIR}/bin"
GOPLS_BIN="${BIN_DIR}/gopls"
if [[ "${OS_TAG}" == "windows" ]]; then
  GOPLS_BIN="${GOPLS_BIN}.exe"
fi

ensure_link() {
  local link_path="$1"
  local target="$2"
  mkdir -p "$(dirname "${link_path}")"
  rm -f "${link_path}"
  ln -s "${target}" "${link_path}"
}

if [[ -f "${DEST_DIR}/version.txt" ]] && [[ -x "${GOPLS_BIN}" ]]; then
  EXISTING_VERSION="$(tr -d '[:space:]' < "${DEST_DIR}/version.txt")"
  if [[ "${EXISTING_VERSION}" == "${GOPLS_VERSION}" ]]; then
    ensure_link "${ROOT_DIR}/.tools/bin/gopls" "../gopls/${PLATFORM_TAG}/bin/gopls"
    if [[ -d "${ROOT_DIR}/.venv/bin" ]]; then
      ensure_link "${ROOT_DIR}/.venv/bin/gopls" "../../.tools/gopls/${PLATFORM_TAG}/bin/gopls"
    fi
    printf "Repo-local gopls %s already present for %s at %s\n" "${GOPLS_VERSION}" "${PLATFORM_TAG}" "${GOPLS_BIN}"
    exit 0
  fi
fi

"${ROOT_DIR}/scripts/go.sh" version >/dev/null 2>&1

mkdir -p "${BIN_DIR}"
echo "Installing gopls ${GOPLS_VERSION} for ${PLATFORM_TAG}..."
GOBIN="${BIN_DIR}" "${ROOT_DIR}/scripts/go.sh" install "golang.org/x/tools/gopls@${GOPLS_VERSION}"

if [[ ! -x "${GOPLS_BIN}" ]]; then
  echo "Expected gopls binary not found after install: ${GOPLS_BIN}" >&2
  exit 1
fi

echo "${GOPLS_VERSION}" > "${DEST_DIR}/version.txt"
ensure_link "${ROOT_DIR}/.tools/bin/gopls" "../gopls/${PLATFORM_TAG}/bin/gopls"
if [[ -d "${ROOT_DIR}/.venv/bin" ]]; then
  ensure_link "${ROOT_DIR}/.venv/bin/gopls" "../../.tools/gopls/${PLATFORM_TAG}/bin/gopls"
fi

printf "Installed repo-local gopls %s for %s at %s\n" "${GOPLS_VERSION}" "${PLATFORM_TAG}" "${GOPLS_BIN}"
printf "Use it via %s\n" "./scripts/gopls.sh"
