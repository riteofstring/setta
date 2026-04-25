#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

source "${ROOT_DIR}/scripts/progress.sh"

cd "${ROOT_DIR}/frontend"
progress_log "Syncing app-subsystem SDK generated inputs from host-owned outputs."

mkdir -p plugin-sdk/app-subsystem/src/generated
cp generation/non_http_shared/sidecar.json \
  plugin-sdk/app-subsystem/src/generated/sidecar.json

rm -rf plugin-sdk/app-subsystem/src/openapi/non_http/generated
mkdir -p plugin-sdk/app-subsystem/src/openapi/non_http/generated
cp -R src/openapi/non_http/generated/. \
  plugin-sdk/app-subsystem/src/openapi/non_http/generated/

cp src/utils/generatedTypes.ts plugin-sdk/app-subsystem/src/generatedTypes.ts
perl -0pi -e 's#\Q../openapi/non_http/generated/types.gen\E#./openapi/non_http/generated/types.gen#g' \
  plugin-sdk/app-subsystem/src/generatedTypes.ts
