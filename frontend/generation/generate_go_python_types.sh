#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${ROOT_DIR}"
bash ./frontend/generation/generate_go_python_sdk_contracts.sh
bash ./frontend/generation/generate_go_python_shared_types.sh
python backend/scripts/prune_generated_types.py
