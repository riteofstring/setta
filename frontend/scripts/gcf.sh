#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
FRONTEND_DIR=$(cd "${SCRIPT_DIR}/.." && pwd)
ROOT_DIR=$(cd "${FRONTEND_DIR}/.." && pwd)

source "${ROOT_DIR}/scripts/progress.sh"

LOG_FILE="${ROOT_DIR}/gcf.log"
: > "${LOG_FILE}"
exec > >(tee -a "${LOG_FILE}") 2>&1

progress_log "Logging gcf output to ${LOG_FILE}."
progress_log "Heartbeat interval: $(progress_interval_seconds)s."

cd "${ROOT_DIR}"
. ./activate.sh
cd "${FRONTEND_DIR}"
progress_run --no-heartbeat "artifact generation" pnpm generate
progress_run "cleanup passes" pnpm full-cleanup

GOROOT="$("${ROOT_DIR}/scripts/go.sh" env GOROOT)"
GO_FILES=()
while IFS= read -r go_file; do
  GO_FILES+=("${ROOT_DIR}/${go_file}")
done < <(cd "${ROOT_DIR}" && rg --files cmd internal -g '*.go')
if (( ${#GO_FILES[@]} > 0 )); then
  progress_log "Formatting ${#GO_FILES[@]} Go files."
  progress_run "Go formatting" "${GOROOT}/bin/gofmt" -w "${GO_FILES[@]}"
fi

progress_run "frontend formatting" pnpm f
progress_log "gcf completed successfully."
