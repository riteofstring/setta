#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

source "${ROOT_DIR}/scripts/progress.sh"

cd "${ROOT_DIR}"
progress_run "HTTP OpenAPI document generation" ./scripts/go.sh run ./cmd/setta-gen-http-openapi \
  -out frontend/generation/http_openapi/openapi.json

cd "${ROOT_DIR}/frontend"
progress_log "Refreshing generated HTTP OpenAPI client directory."
rm -rf src/openapi/http/generated
progress_run "Hey API TypeScript client generation" pnpm exec openapi-ts \
  -i generation/http_openapi/openapi.json \
  -o src/openapi/http/generated
progress_run "HTTP OpenAPI optionality fixups" node ./generation/fix_http_openapi_exact_optional.mjs
progress_run "HTTP OpenAPI artifact formatting" pnpm exec prettier generation/http_openapi/openapi.json src/openapi/http/generated --write
