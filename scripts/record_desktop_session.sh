#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RECORDINGS_DIR="${SETTA_RECORDINGS_DIR:-${ROOT_DIR}/.recordings}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
RECORDING_DIR="${SETTA_RECORDING_DIR:-${RECORDINGS_DIR}/${TIMESTAMP}}"
LOG_FILE="${RECORDING_DIR}/desktop-dev.log"
LATEST_JSON="${RECORDINGS_DIR}/latest.json"

mkdir -p "${RECORDING_DIR}"

json_string() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "${value}"
}

write_latest_pointer() {
  mkdir -p "${RECORDINGS_DIR}"
  local temp_file
  temp_file="$(mktemp "${LATEST_JSON}.tmp.XXXXXX")"
  {
    printf '{\n'
    printf '  "artifactDir": %s,\n' "$(json_string "${RECORDING_DIR}")"
    printf '  "debugPortFile": %s,\n' "$(json_string "${RECORDING_DIR}/debug-port.txt")"
    printf '  "updatedAt": %s\n' "$(json_string "$(date -u +"%Y-%m-%dT%H:%M:%SZ")")"
    printf '}\n'
  } > "${temp_file}"
  mv "${temp_file}" "${LATEST_JSON}"
}

write_latest_pointer

exec > >(tee -a "${LOG_FILE}") 2>&1

export SETTA_RECORDING=1
export SETTA_RECORDING_DIR="${RECORDING_DIR}"
export SETTA_RECORD_INCLUDE_PAYLOADS="${SETTA_RECORD_INCLUDE_PAYLOADS:-1}"
export SETTA_RECORD_SCREENSHOT_INTERVAL_MS="${SETTA_RECORD_SCREENSHOT_INTERVAL_MS:-10000}"

echo "Recording Setta desktop session to ${RECORDING_DIR}"
echo "Latest recording pointer: ${LATEST_JSON}"
echo "Set SETTA_RECORD_INCLUDE_PAYLOADS=0 to omit IPC/backend payload values."
echo "Set SETTA_RECORD_SCREENSHOT_INTERVAL_MS=0 to disable periodic screenshots."

exec "${ROOT_DIR}/scripts/dev_desktop.sh"
