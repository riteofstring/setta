#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RECORDINGS_DIR="${SETTA_RECORDINGS_DIR:-${ROOT_DIR}/.recordings}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
RECORDING_DIR="${SETTA_RECORDING_DIR:-${RECORDINGS_DIR}/${TIMESTAMP}}"
LOG_FILE="${RECORDING_DIR}/desktop-dev.log"

mkdir -p "${RECORDING_DIR}"

exec > >(tee -a "${LOG_FILE}") 2>&1

export SETTA_RECORDING=1
export SETTA_RECORDING_DIR="${RECORDING_DIR}"
export SETTA_RECORD_INCLUDE_PAYLOADS="${SETTA_RECORD_INCLUDE_PAYLOADS:-1}"
export SETTA_RECORD_SCREENSHOT_INTERVAL_MS="${SETTA_RECORD_SCREENSHOT_INTERVAL_MS:-10000}"
export SETTA_WORKFLOW_GRAPH_DEBUG="${SETTA_WORKFLOW_GRAPH_DEBUG:-1}"

echo "Recording Setta desktop session to ${RECORDING_DIR}"
echo "Set SETTA_RECORD_INCLUDE_PAYLOADS=0 to omit IPC/backend payload values."
echo "Set SETTA_RECORD_SCREENSHOT_INTERVAL_MS=0 to disable periodic screenshots."
echo "Set SETTA_WORKFLOW_GRAPH_DEBUG=0 to disable workflow graph performance telemetry."

exec "${ROOT_DIR}/scripts/dev_desktop.sh"
