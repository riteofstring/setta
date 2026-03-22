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
python -m generation.generate_unions dependency_keys
python -m generation.generate_unions dependency_values
python -m generation.generate_unions chart_settings
python -m generation.generate_unions chat_messages
python -m generation.generate_shared_modifier
python -m generation.generate_impl_field_literals
python -m generation.generate_args_as_typed_dicts
python -m generation.generate_unions unions
python -m generation.generate_unions websocket_unions
bash ./generation/generate_go_frontend_bindings.sh
bash ./generation/generate_go_python_types.sh

cd "${ROOT_DIR}"
./format_code.sh
echo "Done!"
