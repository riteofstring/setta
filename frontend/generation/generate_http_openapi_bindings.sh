#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${ROOT_DIR}"
./scripts/go.sh run ./cmd/setta-gen-http-openapi \
  -out frontend/generation/http_openapi/openapi.json

cd "${ROOT_DIR}/frontend"
rm -rf src/openapi/http/generated
pnpm exec openapi-ts \
  -i generation/http_openapi/openapi.json \
  -o src/openapi/http/generated
pnpm exec prettier generation/http_openapi/openapi.json src/openapi/http/generated --write
