#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

source "${ROOT_DIR}/scripts/progress.sh"

cd "${ROOT_DIR}"
progress_log "Resetting generated Python type files."
find backend/setta/types/generated/ -name "*.py" \
  -not -name "__init__.py" \
  -not -name "go_shared_constants.py" \
  -not -name "go_shared_types.py" \
  -delete

cd "${ROOT_DIR}/frontend"
progress_run --no-heartbeat "Go-owned frontend bindings generation" bash ./generation/generate_go_frontend_bindings.sh
progress_run --no-heartbeat "Go-owned Python types generation" bash ./generation/generate_go_python_types.sh

cd "${ROOT_DIR}"
progress_run "Python formatting" ./format_code.sh
progress_log "Generation complete."
