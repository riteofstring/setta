#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

source "${ROOT_DIR}/scripts/progress.sh"

cd "${ROOT_DIR}/frontend"
progress_log "Refreshing generated non-HTTP OpenAPI client directory."
rm -rf src/openapi/non_http/generated
progress_run "Non-HTTP TypeScript client generation" pnpm exec openapi-ts -f generation/non_http_openapi_ts.config.mjs
progress_run "Non-HTTP OpenAPI artifact formatting" pnpm exec prettier generation/non_http_shared/openapi.json src/openapi/non_http/generated --write
