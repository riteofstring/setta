#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

source "${ROOT_DIR}/scripts/progress.sh"

cd "${ROOT_DIR}/frontend"
progress_log "Syncing app-subsystem SDK generated inputs from host-owned outputs."

mkdir -p plugin-sdk/app-subsystem/src/generated
progress_run "Pruning app-subsystem SDK non-HTTP sidecar" node \
  ./generation/prune_app_subsystem_sdk_non_http_sidecar.mjs \
  generation/non_http_shared/sidecar.json \
  plugin-sdk/app-subsystem/src/generated/sidecar.json

rm -rf plugin-sdk/app-subsystem/src/openapi/non_http/generated

mkdir -p plugin-sdk/app-subsystem/generation/http_openapi
progress_run "Pruning app-subsystem SDK HTTP OpenAPI contract" node \
  ./generation/prune_app_subsystem_sdk_openapi.mjs \
  generation/http_openapi/openapi.json \
  plugin-sdk/app-subsystem/generation/http_openapi/openapi.json
rm -rf plugin-sdk/app-subsystem/src/openapi/http/generated
progress_run "App-subsystem SDK HTTP OpenAPI client generation" pnpm exec openapi-ts \
  -i plugin-sdk/app-subsystem/generation/http_openapi/openapi.json \
  -o plugin-sdk/app-subsystem/src/openapi/http/generated
progress_run "App-subsystem SDK HTTP OpenAPI optionality fixups" node \
  ./generation/fix_http_openapi_exact_optional.mjs \
  plugin-sdk/app-subsystem/src/openapi/http/generated
# The upstream @hey-api client implementation is not type-clean under the
# standalone SDK package's strict typecheck. Keep the exception scoped to the
# generated implementation file; generated public types remain checked.
perl -0pi -e 's#\A// This file is auto-generated#// \@ts-nocheck\n// This file is auto-generated#' \
  plugin-sdk/app-subsystem/src/openapi/http/generated/client/client.gen.ts

progress_run "App-subsystem SDK generated input formatting" pnpm exec prettier \
  plugin-sdk/app-subsystem/generation/http_openapi/openapi.json \
  plugin-sdk/app-subsystem/src/openapi/http/generated \
  --write
