#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REQUIRED_VERSION="${SETTA_SHELLCHECK_VERSION:-${SHELLCHECK_VERSION:-}}"
VERSION_FILE="${ROOT_DIR}/scripts/shellcheck_version.txt"

if [[ -z "${REQUIRED_VERSION}" ]] && [[ -f "${VERSION_FILE}" ]]; then
  REQUIRED_VERSION="$(tr -d '[:space:]' < "${VERSION_FILE}")"
fi

if [[ -z "${REQUIRED_VERSION}" ]]; then
  echo "ShellCheck version not specified. Set SETTA_SHELLCHECK_VERSION or add scripts/shellcheck_version.txt." >&2
  exit 1
fi

REQUIRED_VERSION="${REQUIRED_VERSION#v}"

case "$(uname -s)" in
  Darwin)
    OS_TAG="darwin"
    ;;
  Linux)
    OS_TAG="linux"
    ;;
  *)
    OS_TAG=""
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
    ARCH_TAG=""
    ;;
esac

LOCAL_SHELLCHECK_BIN=""
if [[ -n "${OS_TAG}" && -n "${ARCH_TAG}" ]]; then
  LOCAL_SHELLCHECK_BIN="${ROOT_DIR}/.tools/shellcheck/${OS_TAG}-${ARCH_TAG}/shellcheck"
fi

version_for_bin() {
  local shellcheck_bin="$1"
  "${shellcheck_bin}" --version 2>/dev/null | awk '/^version:/ {print $2}'
}

pick_shellcheck_bin() {
  if [[ -n "${SETTA_SHELLCHECK_BIN:-}" ]]; then
    if [[ ! -x "${SETTA_SHELLCHECK_BIN}" ]]; then
      echo "SETTA_SHELLCHECK_BIN is not executable: ${SETTA_SHELLCHECK_BIN}" >&2
      exit 1
    fi
    if [[ "$(version_for_bin "${SETTA_SHELLCHECK_BIN}")" == "${REQUIRED_VERSION}" ]]; then
      printf '%s\n' "${SETTA_SHELLCHECK_BIN}"
      return
    fi
    echo "SETTA_SHELLCHECK_BIN does not match required version ${REQUIRED_VERSION}: ${SETTA_SHELLCHECK_BIN}" >&2
    exit 1
  fi

  if [[ -n "${LOCAL_SHELLCHECK_BIN}" && -x "${LOCAL_SHELLCHECK_BIN}" ]]; then
    if [[ "$(version_for_bin "${LOCAL_SHELLCHECK_BIN}")" == "${REQUIRED_VERSION}" ]]; then
      printf '%s\n' "${LOCAL_SHELLCHECK_BIN}"
      return
    fi
  fi

  if command -v shellcheck >/dev/null 2>&1; then
    SYSTEM_SHELLCHECK_BIN="$(command -v shellcheck)"
    if [[ "$(version_for_bin "${SYSTEM_SHELLCHECK_BIN}")" == "${REQUIRED_VERSION}" ]]; then
      printf '%s\n' "${SYSTEM_SHELLCHECK_BIN}"
      return
    fi
  fi

  echo "Required ShellCheck ${REQUIRED_VERSION} is not available." >&2
  echo "Install the repo-local binary with ./scripts/install_shellcheck.sh" >&2
  echo "Or point SETTA_SHELLCHECK_BIN at a matching ShellCheck binary." >&2
  exit 1
}

SHELLCHECK_BIN="$(pick_shellcheck_bin)"

if [[ $# -eq 0 ]]; then
  exec "${SHELLCHECK_BIN}" --version
fi

exec "${SHELLCHECK_BIN}" "$@"
