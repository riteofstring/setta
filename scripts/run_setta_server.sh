#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

BIN_DIR="${ROOT_DIR}/.tools/dev-bin"
BIN_NAME="setta-server"
TMP_BIN="${BIN_DIR}/${BIN_NAME}.tmp.$$"
TARGET_BIN="${BIN_DIR}/${BIN_NAME}"

mkdir -p "${BIN_DIR}"
"${ROOT_DIR}/scripts/go.sh" build -o "${TMP_BIN}" ./cmd/setta-server
chmod +x "${TMP_BIN}"
mv "${TMP_BIN}" "${TARGET_BIN}"

exec "${TARGET_BIN}" "$@"
