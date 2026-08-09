#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

. "${ROOT_DIR}/activate.sh"

python "${ROOT_DIR}/scripts/pass_through_constant_aliases/report_candidates.py" "$@"
