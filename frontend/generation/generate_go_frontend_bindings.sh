#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

source "${ROOT_DIR}/scripts/progress.sh"

cd "${ROOT_DIR}"
progress_run "Go type registry generation" ./scripts/go.sh run ./cmd/setta-gen-go-type-registries
progress_run "Go route registry generation" ./scripts/go.sh run ./cmd/setta-gen-go-route-registries
progress_run --no-heartbeat "Non-HTTP shared schema generation" bash ./frontend/generation/generate_go_shared_schema.sh
progress_run --no-heartbeat "Non-HTTP OpenAPI bindings generation" bash ./frontend/generation/generate_non_http_openapi_bindings.sh
progress_run "Generated frontend types emission" ./scripts/go.sh run ./cmd/setta-gen-frontend-bindings \
  -types-out frontend/src/utils/generatedTypes.ts \
  -tooling-constants-out frontend/generated/toolingConstants.json \
  -watch-code-contract-out plugins/setta-watch-code/frontend/src/generated/watchCodeBackendContract.ts
progress_run --no-heartbeat "HTTP OpenAPI bindings generation" bash ./frontend/generation/generate_http_openapi_bindings.sh

cd "${ROOT_DIR}/frontend"
progress_run "generatedTypes.ts formatting" pnpm exec prettier src/utils/generatedTypes.ts --write
progress_run "Generated frontend tooling constants formatting" pnpm exec prettier generated/toolingConstants.json --write
progress_run "Watch Code generated contract formatting" pnpm exec prettier ../plugins/setta-watch-code/frontend/src/generated/watchCodeBackendContract.ts --write
