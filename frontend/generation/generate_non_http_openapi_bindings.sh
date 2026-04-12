#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${ROOT_DIR}/frontend"
rm -rf src/openapi/non_http/generated
pnpm exec openapi-ts -f generation/non_http_openapi_ts.config.mjs
pnpm exec prettier generation/non_http_shared/openapi.json src/openapi/non_http/generated --write
