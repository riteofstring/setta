#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${ROOT_DIR}"
./scripts/go.sh run ./cmd/setta-gen-python-shared-types \
  -out backend/setta/types/generated/go_shared_types.py
