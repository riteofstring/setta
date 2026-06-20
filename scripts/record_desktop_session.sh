#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RECORDINGS_DIR="${SETTA_RECORDINGS_DIR:-${ROOT_DIR}/.recordings}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
RECORDING_DIR="${SETTA_RECORDING_DIR:-${RECORDINGS_DIR}/${TIMESTAMP}}"
LOG_FILE="${RECORDING_DIR}/desktop-dev.log"
ISOLATED_APP_DATA_DIR="${RECORDING_DIR}/app-data"

mkdir -p "${RECORDING_DIR}"

exec > >(tee -a "${LOG_FILE}") 2>&1

export SETTA_RECORDING=1
export SETTA_RECORDING_DIR="${RECORDING_DIR}"
export SETTA_RECORD_INCLUDE_PAYLOADS="${SETTA_RECORD_INCLUDE_PAYLOADS:-1}"
export SETTA_RECORD_SCREENSHOT_INTERVAL_MS="${SETTA_RECORD_SCREENSHOT_INTERVAL_MS:-10000}"
export SETTA_WORKFLOW_GRAPH_DEBUG="${SETTA_WORKFLOW_GRAPH_DEBUG:-1}"

if [[ "${SETTA_RECORD_USE_EXISTING_APP_DATA:-0}" == "1" ]]; then
  export SETTA_APP_DATA_DIR="${SETTA_APP_DATA_DIR:-${HOME}/.setta}"
  APP_DATA_MODE="existing app data"
else
  if [[ -n "${SETTA_APP_DATA_DIR:-}" ]]; then
    echo "Ignoring SETTA_APP_DATA_DIR=${SETTA_APP_DATA_DIR}; set SETTA_RECORD_USE_EXISTING_APP_DATA=1 to opt in."
  fi
  export SETTA_APP_DATA_DIR="${ISOLATED_APP_DATA_DIR}"
  APP_DATA_MODE="isolated recording app data"
fi
mkdir -p "${SETTA_APP_DATA_DIR}"

echo "Recording Setta desktop session to ${RECORDING_DIR}"
echo "App data (${APP_DATA_MODE}): ${SETTA_APP_DATA_DIR}"
echo "SETTA_WORKFLOW_GRAPH_DEBUG=${SETTA_WORKFLOW_GRAPH_DEBUG}"
echo "Graph recording events are written to renderer-events.jsonl as graph_snapshot, graph_interaction, graph_layout_save, and graph_replacement."
echo "Set SETTA_RECORD_INCLUDE_PAYLOADS=0 to omit IPC/backend payload values."
echo "Set SETTA_RECORD_SCREENSHOT_INTERVAL_MS=0 to disable periodic screenshots."
echo "Set SETTA_RECORD_USE_EXISTING_APP_DATA=1 to record against existing app data."

exec "${ROOT_DIR}/scripts/dev_desktop.sh"
