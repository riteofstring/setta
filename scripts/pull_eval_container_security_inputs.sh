#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
docker_command="${1:-docker}"

if [[ "$#" -gt 1 ]]; then
  echo "Usage: ./scripts/pull_eval_container_security_inputs.sh [docker-cli]" >&2
  exit 2
fi

if command -v python3 >/dev/null 2>&1; then
  python_bin="python3"
elif command -v python >/dev/null 2>&1; then
  python_bin="python"
else
  echo "python3 or python is required to read the container policy." >&2
  exit 1
fi

required_images="$(
  "${python_bin}" "${repo_root}/scripts/check_eval_container_policy.py" \
    --repo-root "${repo_root}" \
    --print-required-images
)"

while IFS= read -r image; do
  [[ -n "${image}" ]] || continue
  "${docker_command}" pull --platform linux/arm64 "${image}"
done <<<"${required_images}"
