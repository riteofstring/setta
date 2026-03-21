#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

source "${ROOT_DIR}/activate.sh"

if [[ ! -x "${ROOT_DIR}/.venv/bin/python" ]]; then
  echo "Missing ${ROOT_DIR}/.venv/bin/python after sourcing activate.sh." >&2
  exit 1
fi

exec "${ROOT_DIR}/.venv/bin/python" \
  "${ROOT_DIR}/scripts/backend_gap_hunt_candidates.py" \
  --repo-root "${ROOT_DIR}" \
  "$@"
