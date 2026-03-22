#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${ROOT_DIR}"
./scripts/go.sh run ./cmd/setta-gen-python-shared-types \
  -out backend/setta/types/generated/go_shared_types.py
find backend/setta/types/generated/ -name "*.py" \
  -not -name "__init__.py" \
  -not -name "go_shared_types.py" \
  -delete

cd "${ROOT_DIR}/frontend"
export PYTHONPATH="${ROOT_DIR}/backend${PYTHONPATH:+:${PYTHONPATH}}"
bash ./generation/generate_go_frontend_bindings.sh
bash ./generation/generate_go_python_types.sh

cd "${ROOT_DIR}"
./format_code.sh
echo "Done!"
