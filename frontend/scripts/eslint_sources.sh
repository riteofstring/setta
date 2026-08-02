#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
FRONTEND_DIR=$(cd "${SCRIPT_DIR}/.." && pwd)
ROOT_DIR=$(cd "${FRONTEND_DIR}/.." && pwd)

# shellcheck source=../../scripts/lib/quality_paths.sh
. "${ROOT_DIR}/scripts/lib/quality_paths.sh"

cd "${FRONTEND_DIR}"

targets=()
while IFS= read -r target; do
  [[ -n "${target}" ]] || continue
  targets+=("${target}")
done < <(quality_collect_frontend_source_dir_args "${ROOT_DIR}")

pnpm exec eslint --ext .js,.jsx,.ts,.tsx --fix -- "${targets[@]}"
