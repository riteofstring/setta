#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REQUIRED_VERSION="${SETTA_GO_VERSION:-${GO_VERSION:-}}"
VERSION_FILE="${ROOT_DIR}/scripts/go_version.txt"

if [[ -z "${REQUIRED_VERSION}" ]] && [[ -f "${VERSION_FILE}" ]]; then
  REQUIRED_VERSION="$(tr -d '[:space:]' < "${VERSION_FILE}")"
fi

if [[ -z "${REQUIRED_VERSION}" ]]; then
  echo "Go version not specified. Set SETTA_GO_VERSION or add scripts/go_version.txt." >&2
  exit 1
fi

REQUIRED_VERSION="${REQUIRED_VERSION#go}"
REQUIRED_VERSION_TAG="go${REQUIRED_VERSION}"

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

LOCAL_GO_BIN=""
if [[ -n "${OS_TAG}" ]] && [[ -n "${ARCH_TAG}" ]]; then
  LOCAL_GO_BIN="${ROOT_DIR}/.tools/go/${OS_TAG}-${ARCH_TAG}/go/bin/go"
  if [[ "${OS_TAG}" == "windows" ]]; then
    LOCAL_GO_BIN="${LOCAL_GO_BIN}.exe"
  fi
fi

version_for_bin() {
  local go_bin="$1"
  "${go_bin}" version 2>/dev/null | awk '{print $3}'
}

pick_go_bin() {
  if [[ -n "${SETTA_GO_BIN:-}" ]]; then
    if [[ ! -x "${SETTA_GO_BIN}" ]]; then
      echo "SETTA_GO_BIN is not executable: ${SETTA_GO_BIN}" >&2
      exit 1
    fi
    if [[ "$(version_for_bin "${SETTA_GO_BIN}")" == "${REQUIRED_VERSION_TAG}" ]]; then
      printf '%s\n' "${SETTA_GO_BIN}"
      return
    fi
    echo "SETTA_GO_BIN does not match required version ${REQUIRED_VERSION_TAG}: ${SETTA_GO_BIN}" >&2
    exit 1
  fi

  if [[ -n "${LOCAL_GO_BIN}" ]] && [[ -x "${LOCAL_GO_BIN}" ]]; then
    if [[ "$(version_for_bin "${LOCAL_GO_BIN}")" == "${REQUIRED_VERSION_TAG}" ]]; then
      printf '%s\n' "${LOCAL_GO_BIN}"
      return
    fi
  fi

  if command -v go >/dev/null 2>&1; then
    SYSTEM_GO_BIN="$(command -v go)"
    if [[ "$(version_for_bin "${SYSTEM_GO_BIN}")" == "${REQUIRED_VERSION_TAG}" ]]; then
      printf '%s\n' "${SYSTEM_GO_BIN}"
      return
    fi
  fi

  echo "Required Go ${REQUIRED_VERSION_TAG} is not available." >&2
  echo "Install the repo-local toolchain with ./scripts/install_go_toolchain.sh" >&2
  echo "Or point SETTA_GO_BIN at a matching Go binary." >&2
  exit 1
}

GO_BIN="$(pick_go_bin)"
GO_BIN_DIR="$(dirname "${GO_BIN}")"

export PATH="${GO_BIN_DIR}:${PATH}"

if [[ $# -eq 0 ]]; then
  exec "${GO_BIN}" version
fi

exec "${GO_BIN}" "$@"
