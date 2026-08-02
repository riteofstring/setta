#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

source "${ROOT_DIR}/scripts/progress.sh"

cd "${ROOT_DIR}"
progress_run "Go type registry generation" ./scripts/go.sh run ./cmd/setta-gen-go-type-registries
progress_run "Python SDK contracts generation" ./scripts/go.sh run ./cmd/setta-gen-python-sdk-contracts \
  -out backend/setta/sdk_contracts/generated.py
progress_run "Python listener endpoint client generation" ./scripts/go.sh run ./cmd/setta-gen-python-listener-endpoint-client \
  -out backend/setta/api/listener_endpoint_client.py
progress_run "Python shared constants generation" ./scripts/go.sh run ./cmd/setta-gen-python-shared-constants \
  -out backend/setta/types/generated/go_shared_constants.py
progress_run "Python shared types generation" ./scripts/go.sh run ./cmd/setta-gen-python-shared-types \
  -out backend/setta/types/generated/go_shared_types.py
progress_run "Generated Python type pruning" python backend/scripts/prune_generated_types.py
