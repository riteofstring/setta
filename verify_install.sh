#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
artifact_helper="${repo_root}/scripts/lib/distribution_artifact_path.sh"

if [[ ! -f "${artifact_helper}" ]]; then
  echo "Missing distribution artifact helper: ${artifact_helper}" >&2
  exit 1
fi

# shellcheck source=/dev/null
. "${artifact_helper}"

cleanup_on_exit() {
  (cd "${repo_root}" && ./cleanup.sh) || true
}

trap cleanup_on_exit EXIT

cd "${repo_root}"
. ./init_env.sh
./build.sh
filepath="$(setta_resolve_single_dist_artifact "${repo_root}/dist" "*.tar.gz" "sdist")"
uv pip install --force-reinstall "$filepath"
