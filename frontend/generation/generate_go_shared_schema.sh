#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

source "${ROOT_DIR}/scripts/progress.sh"

cd "${ROOT_DIR}"
progress_run "Non-HTTP shared schema emission" ./scripts/go.sh run ./cmd/setta-gen-go-shared-schema \
  -schema-out frontend/generation/non_http_shared/schema.json \
  -sidecar-out frontend/generation/non_http_shared/sidecar.json \
  -openapi-out frontend/generation/non_http_shared/openapi.json
