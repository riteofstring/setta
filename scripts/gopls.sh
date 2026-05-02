#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REQUIRED_VERSION="${SETTA_GOPLS_VERSION:-}"
VERSION_FILE="${ROOT_DIR}/scripts/gopls_version.txt"

if [[ -z "${REQUIRED_VERSION}" ]] && [[ -f "${VERSION_FILE}" ]]; then
  REQUIRED_VERSION="$(tr -d '[:space:]' < "${VERSION_FILE}")"
fi

if [[ -z "${REQUIRED_VERSION}" ]]; then
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
    OS_TAG=""
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
    ARCH_TAG=""
    ;;
esac

LOCAL_GOPLS_BIN=""
if [[ -n "${OS_TAG}" ]] && [[ -n "${ARCH_TAG}" ]]; then
  LOCAL_GOPLS_BIN="${ROOT_DIR}/.tools/gopls/${OS_TAG}-${ARCH_TAG}/bin/gopls"
  if [[ "${OS_TAG}" == "windows" ]]; then
    LOCAL_GOPLS_BIN="${LOCAL_GOPLS_BIN}.exe"
  fi
fi

version_for_bin() {
  local gopls_bin="$1"
  "${gopls_bin}" version 2>/dev/null | awk '/golang\.org\/x\/tools\/gopls/ {print $2; exit}' || true
}

pick_gopls_bin() {
  if [[ -n "${SETTA_GOPLS_BIN:-}" ]]; then
    if [[ ! -x "${SETTA_GOPLS_BIN}" ]]; then
      echo "SETTA_GOPLS_BIN is not executable: ${SETTA_GOPLS_BIN}" >&2
      exit 1
    fi
    if [[ "$(version_for_bin "${SETTA_GOPLS_BIN}")" == "${REQUIRED_VERSION}" ]]; then
      printf '%s\n' "${SETTA_GOPLS_BIN}"
      return
    fi
    echo "SETTA_GOPLS_BIN does not match required version ${REQUIRED_VERSION}: ${SETTA_GOPLS_BIN}" >&2
    exit 1
  fi

  if [[ -n "${LOCAL_GOPLS_BIN}" ]] && [[ -x "${LOCAL_GOPLS_BIN}" ]]; then
    if [[ "$(version_for_bin "${LOCAL_GOPLS_BIN}")" == "${REQUIRED_VERSION}" ]]; then
      printf '%s\n' "${LOCAL_GOPLS_BIN}"
      return
    fi
  fi

  if command -v gopls >/dev/null 2>&1; then
    SYSTEM_GOPLS_BIN="$(command -v gopls)"
    if [[ "$(version_for_bin "${SYSTEM_GOPLS_BIN}")" == "${REQUIRED_VERSION}" ]]; then
      printf '%s\n' "${SYSTEM_GOPLS_BIN}"
      return
    fi
  fi

  echo "Required gopls ${REQUIRED_VERSION} is not available." >&2
  echo "Install the repo-local binary with ./scripts/install_gopls.sh" >&2
  echo "Or point SETTA_GOPLS_BIN at a matching gopls binary." >&2
  exit 1
}

GOPLS_BIN="$(pick_gopls_bin)"

if [[ $# -eq 0 ]]; then
  exec "${GOPLS_BIN}" version
fi

exec "${GOPLS_BIN}" "$@"
