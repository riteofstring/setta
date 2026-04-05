#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${ROOT_DIR}"
./scripts/go.sh run ./cmd/setta-gen-go-type-registries
./scripts/go.sh run ./cmd/setta-gen-go-route-registries
./scripts/go.sh run ./cmd/setta-gen-frontend-bindings \
  -types-out frontend/src/utils/generatedTypes.ts
bash ./frontend/generation/generate_http_openapi_bindings.sh

cd "${ROOT_DIR}/frontend"
pnpm exec prettier src/utils/generatedTypes.ts --write
