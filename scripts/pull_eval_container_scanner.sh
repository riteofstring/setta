#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
docker_command="${1:-docker}"

if [[ "$#" -gt 1 || -z "${docker_command}" ]]; then
  echo "Usage: ./scripts/pull_eval_container_scanner.sh [docker-cli]" >&2
  exit 2
fi

if command -v python3 >/dev/null 2>&1; then
  python_command="python3"
elif command -v python >/dev/null 2>&1; then
  python_command="python"
else
  echo "python3 or python is required to read the scanner policy." >&2
  exit 1
fi

scanner_image="$(
  "${python_command}" "${repo_root}/scripts/check_eval_container_policy.py" \
    --repo-root "${repo_root}" \
    --print-scanner-image
)"

exec "${docker_command}" pull --platform linux/arm64 "${scanner_image}"
