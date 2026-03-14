#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${ROOT_DIR}"
./scripts/go.sh run ./cmd/setta-gen-frontend-bindings \
  -routes-out frontend/src/utils/generatedRoutes.ts \
  -types-out frontend/src/utils/generatedTypes.ts \
  -endpoints-out frontend/src/utils/generatedEndpoints.ts

cd "${ROOT_DIR}/frontend"
pnpm exec prettier src/utils/generatedRoutes.ts src/utils/generatedTypes.ts src/utils/generatedEndpoints.ts --write
